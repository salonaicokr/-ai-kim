"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { createClient } from "@/src/lib/supabase/client";
import type { Booking, Flag } from "./lib";
import "./consult.css";

type SB = ReturnType<typeof createClient>;
type Answer = { q: string; type?: string; a: string };
type Survey = {
  id: string; status: "sent" | "answered"; topic: string | null; answers: Answer[]; flags: Flag[];
  summary: { safety?: { k: string; v: string; note?: string }[]; style?: { k: string; v: string }[] };
  guides: { flag: string; text: string }[]; sent_at: string | null; answered_at: string | null; is_sample: boolean;
};
type Log = { id: string; kind: "allergy_notice" | "guide_applied"; detail: string | null; created_at: string; shop_members: { display_name: string } | null };

export const LEVEL: Record<Flag["level"], { cls: string; label: string }> = {
  safety: { cls: "rk-s", label: "필수 안전 확인" },
  cost: { cls: "rk-c", label: "시간 · 가격에 영향" },
  pref: { cls: "rk-p", label: "스타일 취향" },
};
const hm = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/** 위험 배지: 모양(◆ ● ■)과 색을 함께 써서 색을 구분하기 어려워도 알 수 있게 */
export function RiskBadges({ flags, pending, max = 3, small = false }: { flags?: Flag[] | null; pending?: boolean; max?: number; small?: boolean }) {
  const list = [...(flags ?? [])].sort((a, b) => ["safety", "cost", "pref"].indexOf(a.level) - ["safety", "cost", "pref"].indexOf(b.level));
  if (!list.length && !pending) return null;
  return (
    <span className={`rk-row${small ? " sm" : ""}`}>
      {pending && <span className="rk rk-g">문진 미회신</span>}
      {list.slice(0, max).map((f) => <span key={f.label} className={`rk ${LEVEL[f.level].cls}`} title={LEVEL[f.level].label}>{f.label}</span>)}
      {list.length > max && <span className="rk rk-more">+{list.length - max}</span>}
    </span>
  );
}

/** 예약 상세 안의 상담 요약 칸 (짧게) + 펼치면 큰 상담 요약 패널 */
export default function Consult({ supabase, shopId, b, myMemberId, canEdit, shopName }: {
  supabase: SB; shopId: string; b: Booking; myMemberId: string; canEdit: boolean; shopName: string;
}) {
  const [sv, setSv] = useState<Survey | null | undefined>(undefined);
  const [prev, setPrev] = useState<Survey | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("pre_surveys").select("id, status, topic, answers, flags, summary, guides, sent_at, answered_at, is_sample").eq("booking_id", b.id).maybeSingle();
    setSv((data as Survey | null) ?? null);
    if (b.shop_customer_id) {
      const { data: p } = await supabase.from("pre_surveys").select("id, status, topic, answers, flags, summary, guides, sent_at, answered_at, is_sample")
        .eq("shop_customer_id", b.shop_customer_id).eq("status", "answered").neq("id", (data as Survey | null)?.id ?? "00000000-0000-0000-0000-000000000000")
        .order("answered_at", { ascending: false }).limit(1);
      setPrev(((p ?? [])[0] as Survey | undefined) ?? null);
    }
    const { data: l } = await supabase.from("consult_logs").select("id, kind, detail, created_at, shop_members(display_name)").eq("booking_id", b.id).order("created_at");
    setLogs((l ?? []) as unknown as Log[]);
  }, [supabase, b.id, b.shop_customer_id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!b.shop_customer_id || sv === undefined) return null;

  const surveyLink = (id: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/c/survey/${id}`;
  async function send() {
    setBusy(true); setMsg(null);
    let id = sv?.id;
    if (!id) {
      const { data, error } = await supabase.from("pre_surveys").insert({ shop_id: shopId, booking_id: b.id, shop_customer_id: b.shop_customer_id, topic: "사전 문진", status: "sent" }).select("id").single();
      if (error) { setBusy(false); setMsg(error.message); return; }
      id = (data as { id: string }).id;
    } else {
      await supabase.from("pre_surveys").update({ sent_at: new Date().toISOString() }).eq("id", id);
    }
    setBusy(false);
    const phone = (b.customer?.phone ?? "").replace(/[^0-9]/g, "");
    const body = `[${shopName}] ${b.customer?.name ?? "고객"}님, 시술 전 몇 가지만 알려주세요 (약 2분).\n${surveyLink(id)}`;
    if (phone && !phone.includes("*")) window.location.href = `sms:${phone}?&body=${encodeURIComponent(body)}`;
    else { try { await navigator.clipboard.writeText(body); } catch { /* 무시 */ } }
    setMsg(phone && !phone.includes("*") ? "문자 앱을 열었어요. 정식 버전에서는 알림톡으로 자동 발송돼요." : "문진 링크를 복사했어요. 정식 버전에서는 알림톡으로 자동 발송돼요.");
    await load();
  }
  async function demoFill() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("demo_fill_survey", { p_booking: b.id });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    window.dispatchEvent(new CustomEvent("calendar:reload"));
    await load();
  }
  async function log(kind: Log["kind"], detail: string) {
    const { error } = await supabase.from("consult_logs").insert({ shop_id: shopId, booking_id: b.id, survey_id: sv?.id ?? null, kind, detail, member_id: myMemberId });
    if (error) { setMsg(error.message); return; }
    await load();
  }

  const notice = logs.find((l) => l.kind === "allergy_notice");
  const applied = new Set(logs.filter((l) => l.kind === "guide_applied").map((l) => l.detail));
  const safety = sv?.flags.some((f) => f.level === "safety");
  const diffs = (() => {
    if (!sv || !prev) return [];
    const pm = new Map(prev.answers.map((a) => [a.q, a.a]));
    return sv.answers.filter((a) => pm.has(a.q)).map((a) => ({ q: a.q, before: pm.get(a.q)!, now: a.a, same: pm.get(a.q) === a.a }));
  })();

  // ---- 짧은 칸 (예약 상세 안) ----
  const box = (
    <section className={`cs-box${safety ? " danger" : ""}`} aria-label="사전 문진 · 상담 요약">
      <div className="cs-h">
        <h3>사전 문진</h3>
        {sv?.status === "answered" && <span className="sm">{sv.answered_at ? `${hm(sv.answered_at)} 회신` : ""}{sv.is_sample ? " · 샘플" : ""}</span>}
      </div>
      {!sv && (
        <>
          <p className="sm">아직 문진을 보내지 않았어요. 시술 전 알레르기 · 최근 시술을 미리 받아두면 상담이 빨라져요.</p>
          {canEdit && <div className="cs-acts"><button type="button" className="btn sm-btn" disabled={busy} onClick={send}>문진 보내기</button><button type="button" className="btn ghost sm-btn" disabled={busy} onClick={demoFill}>샘플 답변 받기 (테스트)</button></div>}
        </>
      )}
      {sv?.status === "sent" && (
        <>
          <p className="sm"><span className="rk rk-g">문진 미회신</span> {sv.sent_at ? `${hm(sv.sent_at)} 보냄` : ""}</p>
          {canEdit && <div className="cs-acts"><button type="button" className="btn sm-btn" disabled={busy} onClick={send}>링크 다시 보내기</button><button type="button" className="btn ghost sm-btn" disabled={busy} onClick={demoFill}>샘플 답변 받기 (테스트)</button></div>}
        </>
      )}
      {sv?.status === "answered" && (
        <>
          {sv.flags.length ? <RiskBadges flags={sv.flags} max={4} /> : <p className="sm"><span className="rk rk-g">특이사항 없음</span></p>}
          {notice && <p className="cs-ok sm">✓ 알레르기 위험 안내 완료 · {hm(notice.created_at)} · {notice.shop_members?.display_name ?? ""}</p>}
          <button type="button" className="btn pri sm-btn" onClick={() => setOpen(true)}>상담 요약 보기</button>
        </>
      )}
      {msg && <p className="msg ok sm">{msg}</p>}
    </section>
  );

  // ---- 큰 상담 요약 패널 ----
  const drawer = open && sv?.status === "answered" && createPortal(
    <div className="cs-back" role="dialog" aria-modal="true" aria-label="상담 요약" onClick={() => setOpen(false)}>
      <aside className="cs-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cs-top">
          <div>
            <p className="cs-k">상담 직전 10초 · {sv.topic ?? "사전 문진"}{sv.is_sample ? " · 테스트 샘플" : ""}</p>
            <h2>{b.customer?.name ?? "고객"} 님</h2>
            <p className="sm">{b.items.map((i) => i.name).join(" + ") || "메뉴 미정"}</p>
          </div>
          <button type="button" className="x" aria-label="닫기" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="cs-legend sm"><span className="rk rk-s">필수 안전 확인</span><span className="rk rk-c">시간 · 가격에 영향</span><span className="rk rk-p">스타일 취향</span></div>

        {(sv.summary.safety?.length ?? 0) > 0 && (
          <div className="cs-sec safety">
            <h3>안전 &amp; 시술 주의사항</h3>
            {sv.summary.safety!.map((r) => <div key={r.k} className="cs-row"><span>{r.k}</span><b>{r.v}{r.note && <em> ({r.note})</em>}</b></div>)}
          </div>
        )}
        {(sv.summary.style?.length ?? 0) > 0 && (
          <div className="cs-sec style">
            <h3>스타일 &amp; 라이프스타일</h3>
            {sv.summary.style!.map((r) => <div key={r.k} className="cs-row"><span>{r.k}</span><b>{r.v}</b></div>)}
          </div>
        )}

        {sv.guides.length > 0 && (
          <div className="cs-sec">
            <h3>AI 시술 가이드 <span className="sm">참고용 · 최종 판단은 디자이너</span></h3>
            {sv.guides.map((g) => (
              <div key={g.text} className="cs-guide">
                <RiskBadges flags={sv.flags.filter((f) => f.label === g.flag)} small />
                <b>추천: {g.text}</b>
                {applied.has(g.text) ? <span className="cs-ok sm">✓ 상담에 반영함</span> : <button type="button" className="btn sm-btn" onClick={() => log("guide_applied", g.text)}>상담에 반영</button>}
              </div>
            ))}
          </div>
        )}

        {diffs.length > 0 && (
          <div className="cs-sec">
            <h3>지난 방문과 비교 <span className="sm">{prev?.answered_at ? `${hm(prev.answered_at).split(" ")[0]} 문진 대비` : ""}</span></h3>
            {diffs.map((d) => (
              <div key={d.q} className="cs-diff"><span className={`cs-tag${d.same ? "" : " ch"}`}>{d.same ? "동일" : "변경"}</span><div><span className="sm">{d.q}</span><b>{d.same ? d.now : `${d.before} → ${d.now}`}</b></div></div>
            ))}
          </div>
        )}

        <div className="cs-sec">
          <h3>문진 원본 ({sv.answers.length}문항)</h3>
          {(showAll ? sv.answers : sv.answers.slice(0, 3)).map((a, i) => (
            <div key={a.q} className="cs-q"><span className="sm">Q{i + 1} {a.q}{a.type ? ` (${a.type})` : ""}</span><b>{a.a}</b></div>
          ))}
          {sv.answers.length > 3 && <button type="button" className="cs-more" onClick={() => setShowAll((v) => !v)}>{showAll ? "접기" : `나머지 ${sv.answers.length - 3}문항 펼치기 ›`}</button>}
        </div>

        <div className="cs-foot">
          {safety ? (notice
            ? <p className="cs-done">✓ 알레르기 위험 안내 완료 · {hm(notice.created_at)} · {notice.shop_members?.display_name}<span className="sm">구두 안내 기록이 남아 부작용 문의와 분쟁에 대비해요</span></p>
            : <button type="button" className="btn pri big" onClick={() => log("allergy_notice", sv.flags.filter((f) => f.level === "safety").map((f) => f.label).join(", "))}>알레르기 위험 안내 완료</button>)
            : <p className="sm">안전 확인이 필요한 항목은 없어요.</p>}
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>상담 시작</button>
        </div>
      </aside>
    </div>,
    document.body,
  );

  return <>{box}{drawer}</>;
}
