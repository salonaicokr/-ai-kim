"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 URL 이미지 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { createClient } from "@/src/lib/supabase/client";
import type { Booking } from "./lib";
import "./record.css";

type SB = ReturnType<typeof createClient>;
type Kind = "before" | "after";
type Rec = { id: string; sent_at: string | null; payment_id: string | null };
type Photo = {
  id: string; kind: Kind; path: string; ai_path: string | null; ai_status: string; ai_engine: string | null; showcase: string; send_to_customer: boolean;
  url?: string; aiUrl?: string;
};
const BUCKET = "treatment-photos";
const METHOD: Record<string, string> = { card: "카드", npay: "N페이", cash: "현금", transfer: "계좌이체", prepaid: "정액권", app: "앱 결제" };

/** 고객 앱 다이어리로 보내기: 시술 내역 · 결제 정보 · 사진만 (메모는 보내지 않음) */
export async function sendRecord(supabase: SB, b: Booking, shopId: string, designerName: string) {
  const { data: pays } = await supabase.from("payments")
    .select("id, paid_amount, method, status, paid_at, payment_items(name, unit_price, qty)")
    .eq("booking_id", b.id).neq("status", "refunded").order("created_at", { ascending: false }).limit(1);
  const pay = (pays ?? [])[0] as { id: string; paid_amount: number; method: string; paid_at: string; payment_items: { name: string; unit_price: number; qty: number }[] } | undefined;
  const snapshot = {
    date: b.start_at, designer: designerName,
    items: pay ? pay.payment_items.map((i) => ({ name: i.name, price: i.unit_price * (i.qty ?? 1) })) : b.items.map((i) => ({ name: i.name, price: i.price })),
    payment: pay ? { amount: pay.paid_amount, method: METHOD[pay.method] ?? pay.method, paid_at: pay.paid_at } : null,
  };
  const rec = await ensureRecord(supabase, b, shopId);
  if (!rec) return "시술 기록을 만들지 못했어요.";
  const { data: rr } = await supabase.from("treatment_records").select("ai_summary").eq("id", rec.id).maybeSingle();
  (snapshot as Record<string, unknown>).summary = (rr as { ai_summary?: string | null } | null)?.ai_summary ?? null;
  const { error } = await supabase.from("treatment_records")
    .update({ service_snapshot: snapshot, payment_id: pay?.id ?? null, sent_at: new Date().toISOString() }).eq("id", rec.id);
  return error ? error.message : null;
}

export async function ensureRecord(supabase: SB, b: Booking, shopId: string): Promise<Rec | null> {
  const { data: got } = await supabase.from("treatment_records").select("id, sent_at, payment_id").eq("booking_id", b.id).maybeSingle();
  if (got) return got as Rec;
  const { data, error } = await supabase.from("treatment_records")
    .insert({ shop_id: shopId, booking_id: b.id, shop_customer_id: b.shop_customer_id, designer_id: b.designer_id,
      customer_name: b.customer?.name ?? null, service_label: b.items.map((i) => i.name).join(" + ") || null })
    .select("id, sent_at, payment_id").single();
  if (error) {
    // 동시에 만들어졌으면 다시 읽기
    const { data: again } = await supabase.from("treatment_records").select("id, sent_at, payment_id").eq("booking_id", b.id).maybeSingle();
    return (again as Rec | null) ?? null;
  }
  return data as Rec;
}

/** 휴대폰 사진(수 MB)을 1600px JPEG 로 줄여서 올림 */
async function shrink(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.86));
}

/**
 * 임시 보정 (Gemini 키 연결 전 · 거절 · 시간 초과 시): 얼굴 쪽(위 · 가운데)을 알아볼 수 없게 가린 사본.
 * 정식 버전: 이미지 생성 AI 로 헤어스타일은 그대로, 얼굴은 완전히 새로운 사람으로 바꿔 생성.
 */
async function aiRetouch(src: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(src);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext("2d")!;
  g.filter = "saturate(1.12) contrast(1.05) brightness(1.04)";
  g.drawImage(bmp, 0, 0);
  // 얼굴 영역: 가운데 위쪽 타원 → 크게 흐리고 모자이크
  const w = c.width, h = c.height;
  const fx = w * 0.5, fy = h * 0.38, rx = w * 0.24, ry = h * 0.2;
  const small = document.createElement("canvas");
  small.width = Math.max(8, Math.round(w / 28)); small.height = Math.max(8, Math.round(h / 28));
  small.getContext("2d")!.drawImage(c, 0, 0, small.width, small.height);
  g.save(); g.beginPath(); g.ellipse(fx, fy, rx, ry, 0, 0, Math.PI * 2); g.clip();
  g.filter = "blur(6px)"; g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, w, h); g.restore();
  g.filter = "none";
  const fs = Math.max(14, Math.round(w / 32));
  g.font = `800 ${fs}px sans-serif`;
  const label = "임시 보정 · AI 연결 전";
  const tw = g.measureText(label).width;
  g.fillStyle = "rgba(19,117,106,.88)"; g.fillRect(w - tw - fs * 1.6, h - fs * 2.4, tw + fs * 1.2, fs * 1.7);
  g.fillStyle = "#fff"; g.fillText(label, w - tw - fs, h - fs * 1.1);
  return await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.88));
}

/** 샘플(/samples/…)은 앱에 들어있는 그림, 나머지는 비공개 버킷 서명 URL */
export async function photoUrls(supabase: SB, paths: string[]) {
  const map = new Map<string, string>();
  paths.filter((p) => p.startsWith("/")).forEach((p) => map.set(p, p));
  const priv = paths.filter((p) => !p.startsWith("/"));
  if (priv.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(priv, 3600);
    (data ?? []).forEach((s) => { if (s.path && s.signedUrl) map.set(s.path, s.signedUrl); });
  }
  return map;
}

const emit = (name: string, bookingId: string, extra: Record<string, unknown> = {}) =>
  window.dispatchEvent(new CustomEvent(name, { detail: { bookingId, ...extra } }));

/** 카메라 열기 (버튼을 누른 그 순간에 불러야 휴대폰에서 카메라가 떠요) */
export function openCamera(onFiles: (files: File[]) => void) {
  const i = document.createElement("input");
  i.type = "file"; i.accept = "image/*"; i.multiple = true;
  i.setAttribute("capture", "environment");
  i.style.display = "none";
  i.onchange = () => { const list = Array.from(i.files ?? []); i.remove(); if (list.length) onFiles(list); };
  document.body.appendChild(i);
  i.click();
}

/**
 * AI 보정본 만들기: 서버(/api/ai-retouch)가 Gemini 로 얼굴만 다른 사람으로 바꿈.
 * Gemini 키가 아직 없거나 · 거절 · 시간 초과면 임시 모자이크로 대신 만들고 ai_engine = 'temp' 로 표시.
 * 반환: 'gemini' | 'temp' | null(실패)
 */
export async function makeAi(supabase: SB, photo: { id: string; path: string }, src?: Blob): Promise<"gemini" | "temp" | null> {
  try {
    const r = await fetch("/api/ai-retouch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoId: photo.id }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; fallback?: string };
    if (j.ok) return "gemini";
  } catch { /* 서버 연결 실패 → 임시 처리 */ }
  try {
    let blob = src;
    if (!blob) {
      const map = await photoUrls(supabase, [photo.path]);
      blob = await (await fetch(map.get(photo.path)!)).blob();
    }
    const out = await aiRetouch(blob);
    const aiPath = photo.path.replace(/\.[a-z]+$/i, "") + "-ai.jpg";
    const up = await supabase.storage.from(BUCKET).upload(aiPath, out, { contentType: "image/jpeg", upsert: true });
    if (up.error) return null;
    await supabase.from("treatment_photos").update({ ai_path: aiPath, ai_status: "done", ai_engine: "temp" }).eq("id", photo.id);
    return "temp";
  } catch { return null; }
}

/** 사진 올리기 → AI 보정본 자동 생성 → 설정 › AI 보정본 보관함에 자동으로 모임 */
export async function uploadPhotos(supabase: SB, shopId: string, b: Booking, kind: Kind, files: File[]) {
  emit("trec:busy", b.id, { kind });
  let err: string | null = null;
  let engine: "gemini" | "temp" | null = null;
  const r = await ensureRecord(supabase, b, shopId);
  if (!r) err = "시술 기록을 만들지 못했어요. 시술 기록 권한을 확인해주세요.";
  else {
    for (const f of files.slice(0, 6)) {
      const blob = await shrink(f);
      const path = `${shopId}/${b.id}/${kind}-${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) { err = `사진 올리기 실패: ${up.error.message}`; break; }
      const { data: row } = await supabase.from("treatment_photos").insert({
        shop_id: shopId, record_id: r.id, designer_id: b.designer_id, shop_customer_id: b.shop_customer_id, kind, path,
      }).select("id, path").single();
      if (row) engine = (await makeAi(supabase, row as { id: string; path: string }, blob)) ?? engine;
    }
  }
  emit("trec:changed", b.id, { kind, error: err, count: files.length, engine });
  return err;
}

export default function TreatmentRecord({ supabase, shopId, b, designerName, canRecord, compact = false }: {
  supabase: SB; shopId: string; b: Booking; designerName: string; canRecord: boolean; compact?: boolean;
}) {
  const [rec, setRec] = useState<Rec | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [view, setView] = useState<Photo | null>(null);
  const [upKind, setUpKind] = useState<Kind | null>(null);
  const [removed, setRemoved] = useState(false);

  const load = useCallback(async () => {
    const { data: bk } = await supabase.from("bookings").select("customer_record_deleted_at").eq("id", b.id).maybeSingle();
    setRemoved(!!(bk as { customer_record_deleted_at: string | null } | null)?.customer_record_deleted_at);
    const { data: r } = await supabase.from("treatment_records").select("id, sent_at, payment_id").eq("booking_id", b.id).maybeSingle();
    setRec((r as Rec | null) ?? null);
    if (!r) { setPhotos([]); return; }
    const { data } = await supabase.from("treatment_photos")
      .select("id, kind, path, ai_path, ai_status, ai_engine, showcase, send_to_customer").eq("record_id", (r as Rec).id).order("created_at");
    const list = (data ?? []) as Photo[];
    const map = await photoUrls(supabase, list.flatMap((p) => [p.path, p.ai_path].filter(Boolean) as string[]));
    list.forEach((p) => { p.url = map.get(p.path); p.aiUrl = p.ai_path ? map.get(p.ai_path) : undefined; });
    setPhotos(list);
  }, [supabase, b.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  // 시술 시작 · 완료 버튼에서 찍은 사진도 바로 반영
  useEffect(() => {
    const onBusy = (e: Event) => { const d = (e as CustomEvent).detail; if (d.bookingId === b.id) { setUpKind(d.kind); setMsg(null); } };
    const onDone = (e: Event) => {
      const d = (e as CustomEvent).detail; if (d.bookingId !== b.id) return;
      setUpKind(null);
      setMsg(d.error ? { kind: "err", text: d.error } : { kind: "ok", text: `${d.kind === "before" ? "비포" : "애프터"} 사진 ${d.count}장 저장 · ${d.engine === "gemini" ? "AI가 다른 인물로 보정해서" : "AI(Gemini) 연결 전이라 임시 모자이크로"} 설정 › AI 보정본 보관함에 모았어요.` });
      load();
    };
    window.addEventListener("trec:busy", onBusy); window.addEventListener("trec:changed", onDone);
    return () => { window.removeEventListener("trec:busy", onBusy); window.removeEventListener("trec:changed", onDone); };
  }, [b.id, load]);

  async function retouch(p: Photo) {
    setBusy(p.id); setMsg(null);
    const e = await makeAi(supabase, p);
    setMsg(e === "gemini" ? { kind: "ok", text: "AI가 다른 인물로 다시 보정했어요." } : e === "temp" ? { kind: "ok", text: "AI(Gemini) 연결 전이라 임시 모자이크로 만들었어요." } : { kind: "err", text: "AI 보정에 실패했어요. 잠시 후 다시 해주세요." });
    setBusy(null);
    await load();
  }

  async function remove(p: Photo) {
    await supabase.storage.from(BUCKET).remove([p.path, ...(p.ai_path ? [p.ai_path] : [])]);
    await supabase.from("treatment_photos").delete().eq("id", p.id);
    setView(null);
    await load();
  }

  async function send() {
    setBusy("send"); setMsg(null);
    const err = await sendRecord(supabase, b, shopId, designerName);
    setBusy(null);
    if (err) { setMsg({ kind: "err", text: `보내기 실패: ${err}` }); return; }
    setMsg({ kind: "ok", text: `${b.customer?.name ?? "고객"} 님 앱 다이어리로 시술 내역 · 결제 정보 · 사진 ${photos.filter((p) => p.send_to_customer).length}장을 보냈어요.` });
    await load();
  }

  if (!b.shop_customer_id) return null;
  if (removed) return (
    <section className={`trec${compact ? " compact" : ""}`} aria-label="고객 기록">
      <div className="trec-h"><h3>고객 기록 · 비포 / 애프터</h3><span className="pill p-gray">고객이 삭제함</span></div>
      <p className="trec-note sm">고객이 앱에서 이 시술 기록과 사진을 삭제해 볼 수 없어요. 예약 · 결제 내역은 그대로예요.</p>
    </section>
  );
  const col = (k: Kind) => photos.filter((p) => p.kind === k);
  const sentAt = rec?.sent_at ? new Date(rec.sent_at) : null;

  return (
    <section className={`trec${compact ? " compact" : ""}`} aria-label="고객 기록">
      <div className="trec-h">
        <h3>고객 기록 · 비포 / 애프터</h3>
        {sentAt && <span className="pill p-teal">고객 앱 전송됨 {sentAt.getMonth() + 1}/{sentAt.getDate()} {String(sentAt.getHours()).padStart(2, "0")}:{String(sentAt.getMinutes()).padStart(2, "0")}</span>}
      </div>
      <p className="trec-note sm"><b>시술 시작</b>을 누르면 비포, <b>시술 완료</b>를 누르면 애프터 촬영 카메라가 열려요. 찍은 사진은 AI 보정본으로 <b>설정 › AI 보정본 보관함</b>에 자동으로 모여요. 고객 앱에는 시술 내역 · 결제 정보 · 사진만 가요 (메모 제외).</p>

      <div className="trec-cols">
        {(["before", "after"] as Kind[]).map((k) => (
          <div key={k} className="trec-col">
            <span className="lbl">{k === "before" ? "비포 (시술 전)" : "애프터 (시술 후)"}</span>
            <div className="trec-grid">
              {col(k).map((p) => (
                <button key={p.id} type="button" className="trec-ph" onClick={() => setView(p)} aria-label={`${k === "before" ? "비포" : "애프터"} 사진 크게 보기`}>
                  {p.url ? <img src={p.aiUrl ?? p.url} alt="" /> : <span className="sm">…</span>}
                  {p.ai_status === "done" && <span className={`tag ai${p.ai_engine === "temp" ? " tmp" : ""}`}>{p.ai_engine === "temp" ? "임시" : "AI"}</span>}
                  {p.showcase === "published" && <span className="tag sc">게시중</span>}
                </button>
              ))}
              {canRecord && (
                <button type="button" className="trec-add" disabled={upKind != null} onClick={() => openCamera((files) => uploadPhotos(supabase, shopId, b, k, files))}>
                  <b>＋</b><span className="sm">{upKind === k ? "저장 · AI 보정 중…" : "촬영 · 사진"}</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {compact && canRecord && (
        <p className="trec-guide sm">📷 촬영 가이드 <b>정면 · 측면 · 뒷면</b> 3장 권장 (애프터 {col("after").length}/3장) · 촬영은 나중에 해도 돼요 — 예약 상세 › 고객 기록에서 언제든 추가할 수 있어요</p>
      )}
      {msg && <p className={`msg ${msg.kind}`} role="status">{msg.text}</p>}
      {canRecord && !compact && (
        <div className="trec-acts">
          <button type="button" className="btn pri" disabled={busy != null} onClick={send}>{busy === "send" ? "보내는 중…" : sentAt ? "고객에게 다시 보내기" : "고객에게 전송하기"}</button>
          <span className="sm">고객이 앱에 가입하면 다이어리에 쌓여요 · 문자 링크 전송은 <span className="pill soon">정식 연결 필요</span></span>
        </div>
      )}

      {view && createPortal(
        <div className="trec-view" role="dialog" aria-modal="true" aria-label="시술 사진" onClick={() => setView(null)}>
          <div className="trec-box" onClick={(e) => e.stopPropagation()}>
            <div className="row"><b>{view.kind === "before" ? "비포" : "애프터"} 사진</b><span className="sp" /><button type="button" className="x" aria-label="닫기" onClick={() => setView(null)}>×</button></div>
            <div className={`trec-pair${view.aiUrl ? " two" : ""}`}>
              <figure><img src={view.url} alt="원본" /><figcaption className="sm">원본 · 매장과 고객만 봐요</figcaption></figure>
              {view.aiUrl && <figure><img src={view.aiUrl} alt="AI 보정본" /><figcaption className="sm">{view.ai_engine === "temp" ? "임시 보정본 · Gemini 연결 전이라 얼굴만 가림" : "AI 보정본 · 얼굴을 다른 인물로 바꾼 게시용"}</figcaption></figure>}
            </div>
            {canRecord && (
              <div className="trec-acts">
                {view.ai_status !== "done"
                  ? <button type="button" className="btn pri" disabled={busy === view.id} onClick={async () => { await retouch(view); setView(null); }}>{busy === view.id ? "AI 보정 중…" : "AI 보정 (새 얼굴로 변형)"}</button>
                  : <button type="button" className="btn" disabled={busy === view.id} onClick={async () => { await retouch(view); setView(null); }}>AI 보정 다시 하기</button>}
                <span className="sm">AI 보정본은 설정 › AI 보정본 보관함에서 네이버 · 앱에 사용할 수 있어요.</span>
                <span className="sp" />
                <button type="button" className="btn ghost warn" onClick={() => remove(view)}>사진 삭제</button>
              </div>
            )}
            <p className="sm">AI 보정은 Google Gemini가 <b>헤어 · 옷 · 배경은 그대로, 얼굴만 다른 인물로</b> 바꿔요. {view.ai_engine === "temp" ? <>지금은 Gemini 키가 연결되기 전이라 얼굴만 가린 임시본이에요. 키를 연결한 뒤 ‘AI 보정 다시 하기’를 누르면 바뀌어요. <span className="pill soon">키 연결 필요</span></> : null}</p>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
