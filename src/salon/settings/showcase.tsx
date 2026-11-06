"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 URL · 샘플 이미지 */

import { useCallback, useEffect, useState } from "react";
import type { createClient } from "@/src/lib/supabase/client";
import { photoUrls } from "../calendar/record";

type SB = ReturnType<typeof createClient>;
type Photo = { id: string; kind: "before" | "after"; path: string; ai_path: string | null; ai_engine: string | null; showcase: string; showcase_channels: string[]; url?: string; aiUrl?: string };
type Rec = {
  id: string; customer_name: string | null; service_label: string | null; is_sample: boolean; created_at: string;
  shop_members: { display_name: string } | null; treatment_photos: Photo[];
};
type Grace = { id: string; ai_path: string; title: string | null; channels: string[]; remove_after: string; url?: string };
const CH: { v: string; label: string; soon?: boolean }[] = [{ v: "app", label: "SALONAI 앱 매장 페이지" }, { v: "naver", label: "네이버 플레이스", soon: true }];
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/**
 * 설정 › AI 보정본 보관함: 시술 시작(비포) · 시술 완료(애프터)에서 찍은 사진이 고객명과 함께 자동으로 모임.
 * ‘사용하기’ → 우리 앱 · 네이버 플레이스에 매장 시술사진으로 게시 (얼굴은 AI 가 새로 만든 사람이라 고객 노출 없음)
 */
export default function Showcase({ supabase, shopId }: { supabase: SB; shopId: string }) {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [tab, setTab] = useState<"all" | "used">("all");
  const [orig, setOrig] = useState<string | null>(null); // 원본 비교 보기 중인 기록
  const [pick, setPick] = useState<Rec | null>(null);
  const [chs, setChs] = useState<string[]>(["app"]);
  const [msg, setMsg] = useState<string | null>(null);
  const [grace, setGrace] = useState<Grace[]>([]);

  const loadGrace = useCallback(async () => {
    const { data } = await supabase.from("showcase_grace").select("id, ai_path, title, channels, remove_after").eq("shop_id", shopId).is("resolved_at", null).order("remove_after");
    const list = (data ?? []) as Grace[];
    const map = await photoUrls(supabase, list.map((g) => g.ai_path));
    list.forEach((g) => { g.url = map.get(g.ai_path); });
    setGrace(list);
  }, [supabase, shopId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadGrace(); }, [loadGrace]);
  async function takeDown(g: Grace) {
    const { error } = await supabase.rpc("grace_take_down", { p_id: g.id });
    setMsg(error ? error.message : "사진을 내렸어요.");
    loadGrace();
  }

  const load = useCallback(async () => {
    const { data } = await supabase.from("treatment_records")
      .select("id, customer_name, service_label, is_sample, created_at, shop_members(display_name), treatment_photos(id, kind, path, ai_path, ai_engine, showcase, showcase_channels)")
      .eq("shop_id", shopId).order("created_at", { ascending: false }).limit(60);
    const list = ((data ?? []) as unknown as Rec[]).filter((r) => r.treatment_photos?.some((p) => p.ai_path));
    const map = await photoUrls(supabase, list.flatMap((r) => r.treatment_photos.flatMap((p) => [p.path, p.ai_path].filter(Boolean) as string[])));
    list.forEach((r) => r.treatment_photos.forEach((p) => { p.url = map.get(p.path); p.aiUrl = p.ai_path ? map.get(p.ai_path) : undefined; }));
    setRecs(list);
  }, [supabase, shopId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const used = (r: Rec) => r.treatment_photos.some((p) => p.showcase === "published");
  async function publish(r: Rec, on: boolean, channels: string[] = []) {
    const ids = r.treatment_photos.filter((p) => p.ai_path).map((p) => p.id);
    const { error } = await supabase.from("treatment_photos").update({ showcase: on ? "published" : "none", showcase_channels: on ? channels : [] }).in("id", ids);
    setMsg(error ? error.message : on ? `${r.customer_name ?? "고객"} 님 비포 · 애프터를 ${channels.map((c) => CH.find((x) => x.v === c)?.label).join(" · ")}에 사용해요.` : "사용을 멈췄어요.");
    setPick(null);
    await load();
  }

  const shown = (recs ?? []).filter((r) => (tab === "used" ? used(r) : true));
  const side = (r: Rec, k: "before" | "after") => r.treatment_photos.find((p) => p.kind === k && p.ai_path);

  return (
    <section className="card st-card st-show" id="ai">
      <h2 className="st-h">AI 보정본 보관함 <span className="pill p-teal">고객별 비포 · 애프터</span></h2>
      <p className="sm"><b>시술 시작</b>에서 찍은 비포, <b>시술 완료</b>에서 찍은 애프터가 고객명과 함께 자동으로 모여요. 얼굴은 AI가 새 사람으로 바꾼 사진이라 고객이 드러나지 않아요. <b>사용하기</b>를 누르면 네이버 · 우리 앱 매장 시술사진으로 보여요.</p>
      <div className="st-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "all"} className={`chip${tab === "all" ? " on" : ""}`} onClick={() => setTab("all")}>전체 <b>{recs?.length ?? 0}</b></button>
        <button type="button" role="tab" aria-selected={tab === "used"} className={`chip${tab === "used" ? " on" : ""}`} onClick={() => setTab("used")}>사용 중 <b>{(recs ?? []).filter(used).length}</b></button>
      </div>
      {msg && <p className="msg ok" role="status">{msg}</p>}
      {grace.length > 0 && (
        <div className="msg err" role="alert" id="showcase-grace" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>매장에 게시 중인 사진 중 고객이 삭제한 사진이 {grace.length}장 있어요</b>
          <span>사진을 교체해 주세요. 기한이 지나면 자동으로 삭제돼요.</span>
          {grace.map((g) => (
            <div key={g.id} className="row" style={{ gap: 10, alignItems: "center" }}>
              {g.url && <img src={g.url} alt="" style={{ width: 56, height: 72, objectFit: "cover", borderRadius: 8 }} />}
              <span style={{ flex: 1 }}><b>{g.title ?? "시술 사진"}</b><br />{g.channels.map((c) => CH.find((x) => x.v === c)?.label ?? c).join(" · ") || "게시 중"} · {md(g.remove_after)}까지</span>
              <button type="button" className="btn ghost sm-btn" onClick={() => takeDown(g)}>지금 내리기</button>
            </div>
          ))}
        </div>
      )}
      {recs == null ? <p className="sm">불러오는 중…</p> : shown.length === 0 ? (
        <p className="st-empty sm">{tab === "all" ? "아직 사진이 없어요. 예약에서 시술 시작 · 시술 완료를 누르면 카메라가 열려요." : "아직 사용 중인 사진이 없어요."}</p>
      ) : (
        <div className="st-recs">
          {shown.map((r) => {
            const showOrig = orig === r.id;
            return (
              <article key={r.id} className={`st-rec${used(r) ? " used" : ""}`}>
                <header>
                  <div className="st-who">
                    <b>{r.customer_name ?? "고객"}</b>
                    {r.is_sample && <span className="pill soon">샘플</span>}
                    {used(r) && <span className="pill p-teal">사용 중</span>}
                    {r.treatment_photos.some((p) => p.ai_engine === "temp") && <span className="pill st-tmp" title="Gemini 키 연결 전이라 얼굴만 가린 임시본">임시 보정</span>}
                  </div>
                  <span className="sm">{md(r.created_at)} · {r.shop_members?.display_name ?? ""}{r.service_label ? ` · ${r.service_label}` : ""}</span>
                </header>
                <div className="st-pair">
                  {(["before", "after"] as const).map((k) => {
                    const p = side(r, k);
                    return (
                      <figure key={k}>
                        {p ? <img src={(showOrig ? p.url : p.aiUrl) ?? ""} alt={`${k === "before" ? "비포" : "애프터"} ${showOrig ? "원본" : "AI 보정본"}`} /> : <span className="st-none sm">{k === "before" ? "비포" : "애프터"} 사진 없음</span>}
                        <figcaption>{k === "before" ? "비포" : "애프터"}</figcaption>
                      </figure>
                    );
                  })}
                  <span className="st-arrow" aria-hidden>→</span>
                </div>
                {used(r) && <p className="sm st-chs">{[...new Set(r.treatment_photos.flatMap((p) => p.showcase_channels))].map((c) => CH.find((x) => x.v === c)?.label ?? c).join(" · ")}</p>}
                <div className="row st-rec-acts">
                  {used(r)
                    ? <button type="button" className="btn ghost sm-btn" onClick={() => publish(r, false)}>사용 중지</button>
                    : <button type="button" className="btn pri sm-btn" onClick={() => { setPick(r); setChs(["app"]); }}>사용하기</button>}
                  <button type="button" className="btn ghost sm-btn" onClick={() => setOrig(showOrig ? null : r.id)}>{showOrig ? "AI 보정본 보기" : "원본과 비교"}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pick && (
        <div className="st-modal" role="dialog" aria-modal="true" aria-label="시술 사진 사용하기" onClick={() => setPick(null)}>
          <div className="st-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="st-h">{pick.customer_name ?? "고객"} 님 비포 · 애프터, 어디에 보여줄까요?</h3>
            <div className="st-pair small">
              {(["before", "after"] as const).map((k) => { const p = side(pick, k); return p ? <figure key={k}><img src={p.aiUrl ?? ""} alt="" /><figcaption>{k === "before" ? "비포" : "애프터"}</figcaption></figure> : null; })}
            </div>
            {CH.map((c) => (
              <label key={c.v} className="st-ch">
                <input type="checkbox" checked={chs.includes(c.v)} onChange={(e) => setChs((v) => (e.target.checked ? [...v, c.v] : v.filter((x) => x !== c.v)))} />
                <span>{c.label}</span>{c.soon && <span className="pill soon">정식 연결 필요</span>}
              </label>
            ))}
            <p className="sm">네이버 플레이스 게시는 네이버 연동 후 자동으로 올라가요. 지금은 ‘게시 예정’으로 저장돼요.</p>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn ghost" onClick={() => setPick(null)}>취소</button>
              <button type="button" className="btn pri" disabled={chs.length === 0} onClick={() => publish(pick, true, chs)}>사용하기</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
