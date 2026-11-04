"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/client";
import { kindOf } from "@/src/lib/menu";
import { ACTIVE, BOOKING_SELECT, STATUS, hhmm, mdLabel, minsOfDay, normalize, ymdOfIso, type Booking } from "../calendar/lib";
import { CUST_SELECT } from "./select";
import { RiskBadges } from "../calendar/consult";
import type { Flag } from "../calendar/lib";
import { revisitSchedule, revisitState } from "./revisit";
import "./customers.css";

export type Cust = {
  id: string; name: string; phone: string | null; grade_id: string | null; points: number; memo: string | null;
  visit_count: number; first_visit_at: string | null; last_visit_at: string | null; created_at: string;
  assigned_designer_id: string | null; prepaid_balance: number;
  marketing_agree: boolean | null; marketing_basis: string | null; revisit_due_at: string | null; survey_flags: Flag[] | null; survey_pending: boolean;
};
type Ledger = { id: string; kind: "charge" | "use" | "refund" | "adjust"; amount: number; pay_method: string | null; memo: string | null; created_at: string };
const LEDGER_LABEL: Record<Ledger["kind"], string> = { charge: "충전", use: "사용", refund: "환불 복원", adjust: "조정" };
const PAY_LABEL: Record<string, string> = { card: "카드", npay: "N페이", cash: "현금", transfer: "계좌이체" };
const won = (n: number) => `${n.toLocaleString()}원`;
type Props = {
  shopId: string; myMemberId: string; initial: Cust[]; designers: { id: string; name: string }[];
  canAdd: boolean; canEditAll: boolean; canEditOwn: boolean; seeAll: boolean; fullPhone: boolean; canCharge: boolean;
};
type Filter = "all" | "soon" | "lapsed" | "caution" | "consent" | "first" | "none" | "prepaid" | "mine";
const FILTERS: { key: Filter; label: string; hint: string }[] = [
  { key: "all", label: "전체", hint: "" },
  { key: "soon", label: "재방문 임박", hint: "다음 방문 적기 3일 전 ~ 4일 지남" },
  { key: "lapsed", label: "이탈 위기", hint: "적기를 5일 넘게 지남 (R+5)" },
  { key: "caution", label: "문진 주의", hint: "최근 문진에 필수 안전 확인 항목이 있음" },
  { key: "consent", label: "동의 미확인", hint: "마케팅 수신 동의를 아직 확인 못 한 고객 · 광고성 발송 제외" },
  { key: "first", label: "첫 방문 1회", hint: "재방문 유도 대상" },
  { key: "none", label: "방문 전", hint: "예약만 있음" },
  { key: "prepaid", label: "정액권 보유", hint: "잔액이 남은 고객" },
  { key: "mine", label: "내 담당", hint: "담당 디자이너가 나인 고객" },
];
const DAY = 86_400_000;
const ago = (iso: string | null) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  return d <= 0 ? "오늘" : d < 7 ? `${d}일 전` : d < 60 ? `${Math.floor(d / 7)}주 전` : `${Math.floor(d / 30)}개월 전`;
};

export default function Customers({ shopId, myMemberId, initial, designers, canAdd, canEditAll, canEditOwn, seeAll, fullPhone, canCharge }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selId, setSelId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  // 날짜 계산은 브라우저에서만 (서버 미리 그리기와 어긋나지 않게)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(Date.now()), []);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("v_shop_customers")
      .select(CUST_SELECT)
      .eq("shop_id", shopId).order("last_visit_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000);
    setList((data ?? []) as Cust[]);
  }, [supabase, shopId]);

  const term = q.trim().replace(/-/g, "");
  const match = (c: Cust) => !term || c.name.includes(term) || (c.phone ?? "").replace(/-/g, "").includes(term);
  const test = (c: Cust, f: Filter) => {
    if (f === "all") return true;
    if (f === "prepaid") return c.prepaid_balance > 0;
    if (f === "mine") return c.assigned_designer_id === myMemberId;
    if (f === "caution") return (c.survey_flags ?? []).some((x) => x.level === "safety");
    if (f === "consent") return c.marketing_agree == null;
    if (now == null) return false;
    const r = revisitState(c.revisit_due_at, now);
    if (f === "soon") return r?.cls === "soon" || r?.cls === "due";
    if (f === "lapsed") return r?.cls === "lapsed";
    if (f === "first") return c.visit_count === 1;
    return c.visit_count === 0;
  };
  const shown = list.filter((c) => match(c) && test(c, filter));
  const count = (f: Filter) => list.filter((c) => test(c, f)).length;
  const sel = list.find((c) => c.id === selId) ?? null;

  return (
    <div className="cu-page">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div>
          <p className="crumb">고객 · {seeAll ? "매장 전체 고객" : "내가 담당한 고객"}</p>
          <h1 className="h1">고객</h1>
        </div>
        <span className="sp" />
        {canAdd && <button className="btn pri" type="button" onClick={() => { setAdding(true); setSelId(null); }}>+ 고객 등록</button>}
      </div>
      {!fullPhone && <p className="sm note">전화번호는 가운데 자리를 가려서 보여요. 전체 번호는 원장님이 권한을 준 구성원만 볼 수 있어요.</p>}
      {msg && <p className={`msg ${msg.kind}`} role="status">{msg.text}</p>}

      <div className="cu-tools">
        <input className="input cu-search" type="search" placeholder="이름 또는 전화번호 뒷자리" value={q} onChange={(e) => setQ(e.target.value)} aria-label="고객 검색" />
        <div className="cu-filters" role="tablist" aria-label="고객 묶음">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`chip${filter === f.key ? " on" : ""}`} onClick={() => setFilter(f.key)} title={f.hint}>
              {f.label} <b>{count(f.key)}</b>
            </button>
          ))}
        </div>
      </div>

      <div className={`cu-body${sel || adding ? " has-side" : ""}`}>
        <div className="card cu-list">
          <table className="ct">
            <thead><tr><th>고객</th><th>전화번호</th><th>담당</th><th className="num">방문</th><th>최근 방문</th><th>다음 재방문</th><th>주의 · 취향</th><th className="num">정액권</th><th>마케팅 수신</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={9} className="empty">{q ? `‘${q}’ 에 맞는 고객이 없어요.` : "아직 고객이 없어요. 예약을 등록하면 고객 카드가 자동으로 만들어져요."}</td></tr>}
              {shown.map((c) => (
                <tr key={c.id} className={c.id === selId ? "on" : ""} onClick={() => { setSelId(c.id); setAdding(false); }} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") { setSelId(c.id); setAdding(false); } }}>
                  <td className="c-name"><span className="nm-in"><b>{c.name}</b>{c.visit_count === 1 && <span className="pill tag-first">첫 방문</span>}{c.prepaid_balance > 0 && <span className="pill tag-pre">정액권 {won(c.prepaid_balance)}</span>}</span></td>
                  <td className="tnum c-phone">{c.phone ?? "—"}</td>
                  <td className="c-des">{designers.find((d) => d.id === c.assigned_designer_id)?.name ?? <span className="muted">—</span>}</td>
                  <td className="num tnum c-visit">{c.visit_count}회</td>
                  <td className="c-last">{now == null ? "" : ago(c.last_visit_at)}</td>
                  <td className="c-rv">{(() => { const r = revisitState(c.revisit_due_at, now); return r ? <span className={`rv rv-${r.cls}`}>{r.label}</span> : <span className="muted">—</span>; })()}</td>
                  <td className="c-flag"><RiskBadges flags={c.survey_flags} pending={c.survey_pending} max={2} small /></td>
                  <td className="num tnum c-pre">{c.prepaid_balance > 0 ? <b>{won(c.prepaid_balance)}</b> : <span className="muted">—</span>}</td>
                  <td className="c-mk sm">{c.marketing_agree == null ? <span className="mk-q">미확인</span> : c.marketing_agree ? "동의" : <span className="muted">거부</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {adding ? (
          <AddCustomer supabase={supabase} shopId={shopId} designers={designers} myMemberId={myMemberId} onClose={() => setAdding(false)}
            onSaved={async (name) => { setAdding(false); setMsg({ kind: "ok", text: `${name} 님 고객 카드를 만들었어요.` }); await reload(); }} />
        ) : sel ? (
          <CustomerCard key={sel.id} supabase={supabase} c={sel} designers={designers} canEdit={canEditAll || canEditOwn} fullPhone={fullPhone} canCharge={canCharge} shopId={shopId}
            onClose={() => setSelId(null)}
            onCharged={async (text) => { setMsg({ kind: "ok", text }); await reload(); }}
            onSaved={(patch, text) => { setList((l) => l.map((x) => (x.id === sel.id ? { ...x, ...patch } : x))); setMsg({ kind: "ok", text }); }}
            onError={(text) => setMsg({ kind: "err", text })} />
        ) : null}
      </div>
    </div>
  );
}

function CustomerCard({ supabase, shopId, c, designers, canEdit, fullPhone, canCharge, onClose, onSaved, onCharged, onError }: {
  supabase: ReturnType<typeof createClient>; shopId: string; c: Cust; designers: { id: string; name: string }[]; canEdit: boolean; fullPhone: boolean; canCharge: boolean;
  onClose: () => void; onSaved: (patch: Partial<Cust>, text: string) => void; onCharged: (text: string) => void; onError: (text: string) => void;
}) {
  const [ledger, setLedger] = useState<Ledger[] | null>(null);
  const [sv, setSv] = useState<{ summary: { safety?: { k: string; v: string; note?: string }[]; style?: { k: string; v: string }[] }; flags: Flag[]; answered_at: string } | null>(null);
  const [recs, setRecs] = useState<Record<string, { id: string; shared: boolean; sent_at: string | null }>>({});
  useEffect(() => {
    let alive = true;
    supabase.from("pre_surveys").select("summary, flags, answered_at").eq("shop_customer_id", c.id).eq("status", "answered").order("answered_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (alive) setSv(((data ?? [])[0] as typeof sv) ?? null); });
    supabase.from("treatment_records").select("id, booking_id, shared, sent_at").eq("shop_customer_id", c.id)
      .then(({ data }) => { if (alive) setRecs(Object.fromEntries(((data ?? []) as { id: string; booking_id: string; shared: boolean; sent_at: string | null }[]).map((r) => [r.booking_id, r]))); });
    return () => { alive = false; };
  }, [supabase, c.id]);
  async function toggleShare(bookingId: string) {
    const r = recs[bookingId]; if (!r) return;
    const { error } = await supabase.from("treatment_records").update({ shared: !r.shared }).eq("id", r.id);
    if (error) { onError(error.message); return; }
    setRecs((m) => ({ ...m, [bookingId]: { ...r, shared: !r.shared } }));
    onSaved({}, `고객 앱 다이어리에서 ${!r.shared ? "보이게" : "숨기게"} 했어요.`);
  }
  async function setConsent(v: string) {
    const agree = v === "" ? null : v === "yes";
    const basis = agree == null ? null : agree ? "매장 확인" : "수신 거부";
    const { error } = await supabase.from("shop_customers").update({ marketing_agree: agree, marketing_basis: basis, marketing_at: new Date().toISOString() }).eq("id", c.id);
    if (error) onError(error.message); else onSaved({ marketing_agree: agree, marketing_basis: basis }, `${c.name} 님 마케팅 수신을 ‘${agree == null ? "미확인" : agree ? "동의" : "거부"}’로 바꿨어요.`);
  }
  const [charging, setCharging] = useState(false);
  const [amt, setAmt] = useState("");
  const [payBy, setPayBy] = useState("card");
  const [cmemo, setCmemo] = useState("");
  const [busy, setBusy] = useState(false);
  const loadLedger = useCallback(async () => {
    const { data } = await supabase.from("prepaid_ledger").select("id, kind, amount, pay_method, memo, created_at")
      .eq("shop_customer_id", c.id).order("created_at", { ascending: false }).limit(30);
    setLedger((data ?? []) as Ledger[]);
  }, [supabase, c.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadLedger(); }, [loadLedger]);

  async function setDesigner(id: string) {
    const v = id || null;
    const { error } = await supabase.from("shop_customers").update({ assigned_designer_id: v }).eq("id", c.id);
    if (error) onError(`담당 디자이너 저장 실패: ${error.message}`);
    else onSaved({ assigned_designer_id: v }, `${c.name} 님 담당 디자이너를 ${designers.find((d) => d.id === v)?.name ?? "없음"}(으)로 정했어요.`);
  }
  async function charge(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amt.replace(/[^0-9]/g, ""));
    if (!n) return;
    setBusy(true);
    const { error } = await supabase.from("prepaid_ledger").insert({ shop_id: shopId, shop_customer_id: c.id, kind: "charge", amount: n, pay_method: payBy, memo: cmemo.trim() || null });
    setBusy(false);
    if (error) { onError(`정액권 충전 실패: ${error.message}`); return; }
    setCharging(false); setAmt(""); setCmemo("");
    await loadLedger();
    onCharged(`${c.name} 님 정액권 ${won(n)} 충전했어요.`);
  }
  const [hist, setHist] = useState<Booking[] | null>(null);
  const [memo, setMemo] = useState(c.memo ?? "");
  const [nowIso, setNowIso] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.from("bookings").select(BOOKING_SELECT).eq("shop_customer_id", c.id).order("start_at", { ascending: false }).limit(50)
      .then(({ data }) => { if (alive) { setHist(normalize(data ?? [])); setNowIso(new Date().toISOString()); } });
    return () => { alive = false; };
  }, [supabase, c.id]);

  async function saveMemo() {
    if ((c.memo ?? "") === memo.trim()) return;
    const { error } = await supabase.from("shop_customers").update({ memo: memo.trim() || null }).eq("id", c.id);
    if (error) onError(`메모 저장 실패: ${error.message}`); else onSaved({ memo: memo.trim() || null }, `${c.name} 님 메모를 저장했어요.`);
  }

  const dn = (id: string) => designers.find((d) => d.id === id)?.name ?? "";
  const upcoming = (hist ?? []).filter((b) => nowIso && b.start_at >= nowIso && ACTIVE.includes(b.status) && b.status !== "completed").reverse();
  const past = (hist ?? []).filter((b) => !upcoming.includes(b));
  const spent = past.filter((b) => b.status === "completed").reduce((a, b) => a + b.items.reduce((x, i) => x + i.price, 0), 0);
  const favDesigner = (() => {
    const m = new Map<string, number>();
    past.filter((b) => b.status === "completed").forEach((b) => m.set(b.designer_id, (m.get(b.designer_id) ?? 0) + 1));
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? dn(top[0]) : "—";
  })();
  const telHref = fullPhone && c.phone ? `tel:${c.phone.replace(/[^0-9]/g, "")}` : null;
  const nowMs = nowIso ? new Date(nowIso).getTime() : null;

  return (
    <aside className="card cu-card" aria-label={`${c.name} 고객 카드`}>
      <div className="row"><h2 className="h2">{c.name}</h2><span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={onClose}>닫기</button></div>
      <p className="tnum phone">{c.phone ?? "번호 없음"} {telHref && <a className="sm" href={telHref}>전화</a>}</p>
      <label className="field des-field"><span className="lbl">담당 디자이너</span>
        <select id="cu-des" className="input" value={c.assigned_designer_id ?? ""} disabled={!canEdit} onChange={(e) => setDesigner(e.target.value)}>
          <option value="">지정 안 함</option>
          {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <div className={`prepaid${c.prepaid_balance > 0 ? " has" : ""}`}>
        <div className="row">
          <div className="pp-l"><span className="lbl">정액권 잔액</span><b className="tnum">{won(c.prepaid_balance)}</b></div>
          <span className="sp" />
          {canCharge && !charging && <button type="button" className="btn sm-btn" onClick={() => setCharging(true)}>+ 충전</button>}
        </div>
        {charging && (
          <form className="pp-form" onSubmit={charge}>
            <div className="chips">{[100000, 200000, 300000, 500000].map((v) => <button key={v} type="button" className={`chip${Number(amt) === v ? " on" : ""}`} onClick={() => setAmt(String(v))}>{v / 10000}만원</button>)}</div>
            <input id="pp-amt" className="input tnum" inputMode="numeric" placeholder="충전 금액 (원)" value={amt ? Number(amt.replace(/[^0-9]/g, "") || 0).toLocaleString() : ""} onChange={(e) => setAmt(e.target.value.replace(/[^0-9]/g, ""))} />
            <div className="chips">{Object.entries(PAY_LABEL).map(([k, l]) => <button key={k} type="button" className={`chip${payBy === k ? " on" : ""}`} onClick={() => setPayBy(k)}>{l}</button>)}</div>
            <input className="input" placeholder="메모 (예: 30만원 결제 시 33만원 적립)" value={cmemo} onChange={(e) => setCmemo(e.target.value)} maxLength={100} />
            <div className="row"><button className="btn pri" type="submit" disabled={busy || !Number(amt)}>{busy ? "저장 중…" : `${won(Number(amt) || 0)} 충전`}</button><button type="button" className="btn ghost" onClick={() => setCharging(false)}>취소</button></div>
          </form>
        )}
        {ledger && ledger.length > 0 && (
          <ul className="pp-log">
            {ledger.slice(0, 6).map((l) => (
              <li key={l.id}><span className="sm tnum">{l.created_at.slice(5, 10).replace("-", ".")}</span><span>{LEDGER_LABEL[l.kind]}{l.pay_method && l.kind === "charge" ? ` · ${PAY_LABEL[l.pay_method] ?? l.pay_method}` : ""}{l.memo ? ` · ${l.memo}` : ""}</span><b className={`tnum ${l.amount < 0 ? "neg" : "pos"}`}>{l.amount > 0 ? "+" : ""}{l.amount.toLocaleString()}</b></li>
            ))}
          </ul>
        )}
      </div>
      {(sv || c.survey_pending) && (
        <div className="cu-sv">
          <div className="row"><span className="lbl">안전 · 취향 요약 (사전 문진)</span><span className="sp" />{sv && <span className="sm">{sv.answered_at.slice(5, 10).replace("-", "/")} 문진</span>}</div>
          <RiskBadges flags={sv?.flags} pending={c.survey_pending} max={4} small />
          {sv?.summary.safety?.map((r) => <p key={r.k} className="sm cu-sv-s"><b>{r.k}</b> {r.v}{r.note ? ` (${r.note})` : ""}</p>)}
          {sv?.summary.style?.map((r) => <p key={r.k} className="sm cu-sv-p"><b>{r.k}</b> {r.v}</p>)}
        </div>
      )}
      {(() => { const r = revisitState(c.revisit_due_at, nowMs); const sch = revisitSchedule(c.revisit_due_at); return r ? (
        <div className="cu-rv">
          <div className="row"><span className="lbl">재방문 알림</span><span className="sp" /><span className={`rv rv-${r.cls}`}>{r.label}</span></div>
          <div className="cu-sch">{sch.map((x) => <span key={x.k}><b>{x.k}</b> {x.t} <span className="tnum">{x.at}</span></span>)}</div>
          <p className="sm">고객이 알림에서 ‘이미 예약했어요’를 누르면 자동으로 끝나요 · 자동 발송은 <span className="pill soon">정식 연결 필요</span></p>
          {r.cls === "lapsed" && telHref && <a className="btn sm-btn" href={`sms:${c.phone?.replace(/[^0-9]/g, "")}?&body=${encodeURIComponent(`${c.name}님, 지난 시술 후 관리 시기가 됐어요. 편하실 때 예약 도와드릴게요 :)`)}`}>재방문 안내 문자</a>}
        </div>
      ) : null; })()}
      <label className="field"><span className="lbl">마케팅 수신 동의 {c.marketing_basis ? <span className="sm">· 근거: {c.marketing_basis}</span> : null}</span>
        <select id="cu-mk" className="input" value={c.marketing_agree == null ? "" : c.marketing_agree ? "yes" : "no"} disabled={!canEdit} onChange={(e) => setConsent(e.target.value)}>
          <option value="">미확인 (광고성 발송 제외)</option><option value="yes">동의</option><option value="no">거부</option>
        </select></label>
      <div className="kpis">
        <div><span className="lbl">방문</span><b className="tnum">{c.visit_count}회</b></div>
        <div><span className="lbl">누적 시술</span><b className="tnum">{spent.toLocaleString()}원</b></div>
        <div><span className="lbl">포인트</span><b className="tnum">{c.points.toLocaleString()}</b></div>
        <div><span className="lbl">자주 찾는 디자이너</span><b>{favDesigner}</b></div>
      </div>
      <label className="field"><span className="lbl">고객 메모 (시술 취향 · 주의사항)</span>
        <textarea id="cu-memo" className="input memo" rows={3} value={memo} disabled={!canEdit} maxLength={300}
          placeholder="예: 두피 민감 · 펌 약 약하게 · 앞머리 눈썹 위" onChange={(e) => setMemo(e.target.value)} onBlur={saveMemo} />
      </label>
      <Link className="btn pri" href={`/calendar?c=${c.id}&n=${encodeURIComponent(c.name)}`}>이 고객으로 예약 잡기</Link>

      <h3 className="sub">다가오는 예약 {upcoming.length > 0 && <span className="pill st-ok">{upcoming.length}</span>}</h3>
      <ul className="hist">
        {hist == null && <li className="sm">불러오는 중…</li>}
        {hist && upcoming.length === 0 && <li className="sm">잡힌 예약이 없어요.</li>}
        {upcoming.map((b) => <HistRow key={b.id} b={b} dn={dn} />)}
      </ul>
      <h3 className="sub">방문 이력</h3>
      <ul className="hist">
        {hist && past.length === 0 && <li className="sm">아직 방문 기록이 없어요.</li>}
        {past.map((b) => <HistRow key={b.id} b={b} dn={dn} rec={recs[b.id]} onShare={canEdit ? () => toggleShare(b.id) : undefined} />)}
      </ul>
    </aside>
  );
}

function HistRow({ b, dn, rec, onShare }: { b: Booking; dn: (id: string) => string; rec?: { shared: boolean; sent_at: string | null }; onShare?: () => void }) {
  const k = kindOf(b.items[0]?.kind ?? "etc");
  return (
    <li className="hist-li">
      <Link href={`/calendar?b=${b.id}`} style={{ ["--k" as string]: k.color }}>
        <span className="d tnum">{mdLabel(ymdOfIso(b.start_at))}<small>{hhmm(minsOfDay(b.start_at))}</small></span>
        <span className="m"><b>{b.items.map((i) => i.name).join(" + ") || "메뉴 미정"}</b><span className="sm">{dn(b.designer_id)} · {b.items.reduce((a, i) => a + i.price, 0).toLocaleString()}원</span></span>
        <span className={`pill ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
      </Link>
      {rec && (
        <button type="button" className={`share${rec.shared ? " on" : ""}`} onClick={onShare} disabled={!onShare} title="고객 앱 다이어리 공개 여부">
          {rec.shared ? (rec.sent_at ? "공유됨" : "공유 예정") : "비공개"}
        </button>
      )}
    </li>
  );
}

function AddCustomer({ supabase, shopId, designers, myMemberId, onClose, onSaved }: {
  supabase: ReturnType<typeof createClient>; shopId: string; designers: { id: string; name: string }[]; myMemberId: string; onClose: () => void; onSaved: (name: string) => void;
}) {
  const [des, setDes] = useState(designers.some((d) => d.id === myMemberId) ? myMemberId : "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("이름을 입력해주세요."); return; }
    const digits = phone.replace(/[^0-9]/g, "");
    const formatted = digits.length >= 10 ? digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3") : digits || null;
    setBusy(true); setErr(null);
    // 디자이너는 아직 담당 예약이 없는 고객을 다시 읽을 수 없어서, 저장만 하고 목록을 새로 불러와요
    const { error } = await supabase.from("shop_customers").insert({ shop_id: shopId, name: name.trim(), phone: formatted, memo: memo.trim() || null, assigned_designer_id: des || null });
    setBusy(false);
    if (error) { setErr(error.code === "23505" ? "이미 등록된 전화번호예요. 검색해서 찾아보세요." : error.message); return; }
    onSaved(name.trim());
  }
  return (
    <form className="card cu-card" onSubmit={save}>
      <div className="row"><h2 className="h2">고객 등록</h2><span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={onClose}>닫기</button></div>
      <label className="field"><span className="lbl">이름</span><input id="nc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="홍길동" /></label>
      <label className="field"><span className="lbl">휴대폰</span><input id="nc-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="010-0000-0000" /></label>
      <label className="field"><span className="lbl">담당 디자이너</span>
        <select id="nc-des" className="input" value={des} onChange={(e) => setDes(e.target.value)}>
          <option value="">지정 안 함</option>
          {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select></label>
      <label className="field"><span className="lbl">메모 (선택)</span><textarea id="nc-memo" className="input memo" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} /></label>
      {err && <p className="msg err">{err}</p>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "저장 중…" : "고객 카드 만들기"}</button>
    </form>
  );
}
