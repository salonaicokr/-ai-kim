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
  birth_month?: number | null; birth_day?: number | null; birth_year?: number | null; inflow_source?: string | null; privacy_agreed_at?: string | null;
  /** 최근 방문완료 예약의 시술 담당 */ last_designer_id?: string | null;
  /** 매장별 고객번호 (1부터) — 화면은 No.0017 */ customer_no?: number | null;
};
type Consent = { id: string; type: "privacy" | "marketing"; agreed: boolean; channels: string[]; source: string; agreed_at: string };
const SRC_KO: Record<string, string> = { desk: "매장 데스크", app: "고객 앱", signup: "가입", import: "이전 자료" };
const CH_KO: Record<string, string> = { sms: "SMS", alimtalk: "알림톡" };
type Ledger = { id: string; kind: "charge" | "use" | "refund" | "adjust"; amount: number; pay_method: string | null; memo: string | null; created_at: string };
const LEDGER_LABEL: Record<Ledger["kind"], string> = { charge: "충전", use: "사용", refund: "환불 복원", adjust: "조정" };
const PAY_LABEL: Record<string, string> = { card: "카드", npay: "N페이", cash: "현금", transfer: "계좌이체" };
const noFmt = (n: number) => String(n).padStart(4, "0");
const won = (n: number | null | undefined) => `${(n ?? 0).toLocaleString()}원`;
type Props = {
  shopId: string; myMemberId: string; initial: Cust[]; designers: { id: string; name: string }[]; inflows: string[];
  canAdd: boolean; canEditAll: boolean; canEditOwn: boolean; seeAll: boolean; fullPhone: boolean; canCharge: boolean;
};
type Filter = "all" | "soon" | "lapsed" | "caution" | "consent" | "first" | "none" | "prepaid" | "mine";
const FILTERS: { key: Filter; label: string; hint: string }[] = [
  { key: "all", label: "전체", hint: "" },
  { key: "soon", label: "재방문 임박", hint: "기준: 다음 방문 적기 3일 전부터 적기 4일 지남까지" },
  { key: "lapsed", label: "이탈 위기", hint: "기준: 다음 방문 적기를 5일 넘게 지남" },
  { key: "caution", label: "문진 주의", hint: "최근 문진에 필수 안전 확인 항목이 있음" },
  { key: "consent", label: "동의 미확인", hint: "마케팅 수신 동의를 아직 확인 못 한 고객 · 광고성 발송 제외" },
  { key: "first", label: "첫 방문 1회", hint: "재방문 유도 대상" },
  { key: "none", label: "방문 전", hint: "예약만 있음" },
  { key: "prepaid", label: "정액권 보유", hint: "잔액이 남은 고객" },
  { key: "mine", label: "내 담당", hint: "담당 디자이너가 나인 고객" },
];
const DAY = 86_400_000;

function CustomerAlerts({ shopId, designers }: { shopId: string; designers: { id: string; name: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [lapsed, setLapsed] = useState<{ id: string; name: string; phone: string | null; last_designer_id: string | null }[] | null>(null);
  const [surveys, setSurveys] = useState<{ id: string; booking_id: string; bookings: { start_at: string } | null; shop_customers: { name: string } | null }[] | null>(null);

  useEffect(() => {
    let alive = true;
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const start = new Date(`${ymd}T00:00:00+09:00`);
    const lapsedBefore = new Date(start.getTime() - 5 * DAY).toISOString();
    Promise.all([
      supabase.from("v_shop_customers").select("id, name, phone, last_visit_at, revisit_due_at, last_designer_id").eq("shop_id", shopId).lt("revisit_due_at", lapsedBefore).order("revisit_due_at").limit(3),
      supabase.from("pre_surveys").select("id, booking_id, bookings!inner(start_at, status, designer_id), shop_customers(name)").eq("shop_id", shopId).eq("status", "sent").gte("bookings.start_at", start.toISOString()).limit(3),
    ]).then(([lap, sv]) => {
      if (!alive) return;
      setLapsed((lap.data ?? []) as { id: string; name: string; phone: string | null; last_designer_id: string | null }[]);
      setSurveys((sv.data ?? []) as { id: string; booking_id: string; bookings: { start_at: string } | null; shop_customers: { name: string } | null }[]);
    });
    return () => { alive = false; };
  }, [shopId, supabase]);

  if (!lapsed || !surveys) return <div className="cu-alerts" aria-hidden><div className="cu-alert skel" /><div className="cu-alert skel" /></div>;
  return (
    <div className="cu-alerts">
      <section className="cu-alert" aria-label="재방문 이탈 위기">
        <div className="cu-alert-h"><b>재방문 이탈 위기</b><span>{lapsed.length}</span></div>
        {lapsed.length === 0 ? <p>적기를 5일 넘긴 고객이 없어요.</p> : (
          <ul>{lapsed.map((c) => {
            const digits = (c.phone ?? "").replace(/[^0-9]/g, "");
            const canSms = digits.length >= 10 && !(c.phone ?? "").includes("*");
            return (
              <li key={c.id}>
                <b>{c.name}</b>
                <span>{designers.find((d) => d.id === c.last_designer_id)?.name ?? ""}</span>
                {canSms ? <a href={`sms:${digits}?&body=${encodeURIComponent(`${c.name}님, 지난 시술 후 관리 시기가 됐어요. 편하실 때 예약 도와드릴게요 :)`)}`}>연락</a> : null}
              </li>
            );
          })}</ul>
        )}
      </section>
      <section className="cu-alert" aria-label="사전 문진 미회신">
        <div className="cu-alert-h"><b>사전 문진 미회신</b><span>{surveys.length}</span></div>
        {surveys.length === 0 ? <p>미회신 문진이 없어요.</p> : (
          <ul>{surveys.map((r) => (
            <li key={r.id}>
              <Link href={`/desk/bookings?b=${r.booking_id}`}>
                <b>{r.bookings ? `${r.bookings.start_at.slice(5, 10).replace("-", "/")} ${hhmm(minsOfDay(r.bookings.start_at))} ` : ""}{r.shop_customers?.name ?? "고객"}</b>
                <span>문진 다시 보내기</span>
              </Link>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}

const ago = (iso: string | null) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  return d <= 0 ? "오늘" : d < 7 ? `${d}일 전` : d < 60 ? `${Math.floor(d / 7)}주 전` : `${Math.floor(d / 30)}개월 전`;
};

export default function Customers({ shopId, myMemberId, initial, designers, inflows, canAdd, canEditAll, canEditOwn, seeAll, fullPhone, canCharge }: Props) {
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
  // 고객번호(No.17 · 0017)로도 찾기
  const noTerm = term.replace(/^no\.?/i, "");
  const match = (c: Cust) => !term || c.name.includes(term) || (c.phone ?? "").replace(/-/g, "").includes(term)
    || (/^\d{1,6}$/.test(noTerm) && c.customer_no === Number(noTerm));
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
      <CustomerAlerts shopId={shopId} designers={designers} />
      {!fullPhone && <p className="sm note">전화번호는 가운데 자리를 가려서 보여요. 전체 번호는 원장님이 권한을 준 구성원만 볼 수 있어요.</p>}
      {msg && <p className={`msg ${msg.kind}`} role="status">{msg.text}</p>}

      <div className="cu-tools">
        <input className="input cu-search" type="search" placeholder="이름 · 전화번호 뒷자리 · 고객번호" value={q} onChange={(e) => setQ(e.target.value)} aria-label="고객 검색" />
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
            <thead><tr><th>고객</th><th>전화번호</th><th>담당</th><th className="num">방문</th><th>최근 방문</th><th>주의 · 취향</th><th className="num">정액권</th><th>마케팅 수신</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={8} className="empty">{q ? `‘${q}’ 에 맞는 고객이 없어요.` : "아직 고객이 없어요. 예약을 등록하면 고객 카드가 자동으로 만들어져요."}</td></tr>}
              {shown.map((c) => (
                <tr key={c.id} className={c.id === selId ? "on" : ""} onClick={() => { setSelId(c.id); setAdding(false); }} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") { setSelId(c.id); setAdding(false); } }}>
                  <td className="c-name"><span className="nm-in">{c.customer_no != null && <span className="sm muted cno">No.{noFmt(c.customer_no)}</span>}<b>{c.name}</b>{c.visit_count === 1 && <span className="pill tag-first">첫 방문</span>}{c.prepaid_balance > 0 && <span className="pill tag-pre">정액권 {won(c.prepaid_balance)}</span>}</span></td>
                  <td className="tnum c-phone">{c.phone ?? "—"}</td>
                  <td className="c-des">{designers.find((d) => d.id === c.assigned_designer_id)?.name ?? <span className="muted">—</span>}</td>
                  <td className="num tnum c-visit">{c.visit_count}회</td>
                  <td className="c-last">{now == null ? "" : ago(c.last_visit_at)}{c.last_designer_id && <span className="sm muted"> · {designers.find((d) => d.id === c.last_designer_id)?.name ?? ""}</span>}</td>
                  <td className="c-flag"><RiskBadges flags={c.survey_flags} pending={c.survey_pending} max={2} small /></td>
                  <td className="num tnum c-pre">{c.prepaid_balance > 0 ? <b>{won(c.prepaid_balance)}</b> : <span className="muted">—</span>}</td>
                  <td className="c-mk sm">{c.marketing_agree == null ? <span className="mk-q">미확인</span> : c.marketing_agree ? "동의" : <span className="muted">거부</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {adding ? (
          <AddCustomer supabase={supabase} shopId={shopId} designers={designers} myMemberId={myMemberId} inflows={inflows} onClose={() => setAdding(false)}
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
  const [consents, setConsents] = useState<Consent[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from("customer_consents").select("id, type, agreed, channels, source, agreed_at").eq("shop_customer_id", c.id).order("agreed_at", { ascending: false })
      .then(({ data }) => { if (alive) setConsents((data ?? []) as Consent[]); });
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
      <div className="row"><h2 className="h2">{c.name}</h2>{c.customer_no != null && <span className="sm muted" style={{ marginLeft: 8 }}>고객번호 No.{noFmt(c.customer_no)}</span>}<span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={onClose}>닫기</button></div>
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
      <dl className="cu-facts">
        <div><dt>생일</dt><dd>{c.birth_month ? `${c.birth_year ? `${c.birth_year}년 ` : ""}${c.birth_month}월 ${c.birth_day ?? ""}일` : <span className="muted">—</span>}</dd></div>
        <div><dt>유입경로</dt><dd>{c.inflow_source ?? <span className="muted">—</span>}</dd></div>
        <div><dt>개인정보 동의</dt><dd>{c.privacy_agreed_at ? new Date(c.privacy_agreed_at).toLocaleDateString("ko-KR") : <span className="mk-q">동의 미확인</span>}</dd></div>
      </dl>
      {consents && consents.length > 0 && (
        <details className="cu-consents"><summary className="sm">동의 이력 {consents.length}건</summary>
          <ul>{consents.map((x) => <li key={x.id} className="sm">
            {new Date(x.agreed_at).toLocaleString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {x.type === "privacy" ? "개인정보 수집 · 이용" : "마케팅 수신"} {x.agreed ? "동의" : "거부"}
            {(x.channels ?? []).length > 0 && ` (${(x.channels ?? []).map((ch) => CH_KO[ch] ?? ch).join(" · ")})`} · {SRC_KO[x.source] ?? x.source}</li>)}</ul>
        </details>
      )}
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
      <Link className="btn pri" href={`/desk/bookings?c=${c.id}&n=${encodeURIComponent(c.name)}`}>이 고객으로 예약 잡기</Link>

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
      <Link href={`/desk/bookings?b=${b.id}`} style={{ ["--k" as string]: k.color }}>
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

const PRIVACY_TEXT = "수집 항목: 이름, 휴대폰 번호, 생일(선택), 시술 · 결제 기록, 시술 사진, 사전 문진 답변\n이용 목적: 예약 · 시술 관리, 결제, 고객 응대, 재방문 안내\n보관 기간: 마지막 방문 후 3년 (고객 요청 시 즉시 삭제)\n동의를 거부할 수 있으나, 거부하면 고객 카드를 만들 수 없어요.";
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const THIS_YEAR = 2026;
const YEARS = Array.from({ length: 90 }, (_, i) => THIS_YEAR - 10 - i);

/** S-13 고객 등록: 필수 개인정보 동의 · 선택 마케팅(SMS · 알림톡) · 생일 · 유입경로. 동의 시각 · 경로(데스크)를 이력으로 남김 */
function AddCustomer({ supabase, shopId, designers, myMemberId, inflows, onClose, onSaved }: {
  supabase: ReturnType<typeof createClient>; shopId: string; designers: { id: string; name: string }[]; myMemberId: string; inflows: string[]; onClose: () => void; onSaved: (name: string) => void;
}) {
  const [des, setDes] = useState(designers.some((d) => d.id === myMemberId) ? myMemberId : "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [bm, setBm] = useState(""); const [bd, setBd] = useState(""); const [by, setBy] = useState("");
  const [inflow, setInflow] = useState(""); const [inflowEtc, setInflowEtc] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [mk, setMk] = useState(false);
  const [ch, setCh] = useState<string[]>(["sms", "alimtalk"]);
  const [showText, setShowText] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("이름을 입력해주세요."); return; }
    if (!privacy) { setErr("[필수] 개인정보 수집 · 이용 동의에 체크해야 고객 카드를 만들 수 있어요. 고객에게 내용을 안내하고 동의를 받아주세요."); return; }
    if ((bm && !bd) || (!bm && bd)) { setErr("생일은 월과 일을 함께 골라주세요."); return; }
    if (mk && ch.length === 0) { setErr("마케팅 수신 채널(SMS · 알림톡)을 하나 이상 골라주세요."); return; }
    const digits = phone.replace(/[^0-9]/g, "");
    const formatted = digits.length >= 10 ? digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3") : digits || null;
    const src = inflow === "기타" && inflowEtc.trim() ? inflowEtc.trim() : inflow || null;
    setBusy(true); setErr(null);
    // 디자이너는 아직 담당 예약이 없는 고객을 다시 읽을 수 없어서, id 를 먼저 정해 저장 → 동의 이력도 같은 id 로
    const id = crypto.randomUUID();
    const { error } = await supabase.from("shop_customers").insert({
      id, shop_id: shopId, name: name.trim(), phone: formatted, memo: memo.trim() || null, assigned_designer_id: des || null,
      birth_month: bm ? Number(bm) : null, birth_day: bd ? Number(bd) : null, birth_year: by ? Number(by) : null, inflow_source: src,
      marketing_agree: mk, marketing_basis: mk ? `매장 등록 동의 (${ch.map((x) => CH_KO[x]).join(" · ")})` : "매장 등록 시 미동의", marketing_at: new Date().toISOString(),
    });
    if (error) { setBusy(false); setErr(error.code === "23505" ? "이미 등록된 전화번호예요. 검색해서 찾아보세요." : error.message); return; }
    const { error: e2 } = await supabase.from("customer_consents").insert([
      { shop_id: shopId, shop_customer_id: id, type: "privacy", agreed: true, source: "desk" },
      { shop_id: shopId, shop_customer_id: id, type: "marketing", agreed: mk, channels: mk ? ch : [], source: "desk" },
    ]);
    setBusy(false);
    if (e2) { setErr(`고객 카드는 만들었지만 동의 이력을 남기지 못했어요: ${e2.message}`); return; }
    onSaved(name.trim());
  }
  return (
    <form className="card cu-card" onSubmit={save}>
      <div className="row"><h2 className="h2">고객 등록</h2><span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={onClose}>닫기</button></div>
      <label className="field"><span className="lbl">이름</span><input id="nc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="홍길동" /></label>
      <label className="field"><span className="lbl">휴대폰</span><input id="nc-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="010-0000-0000" /></label>
      <div className="field"><span className="lbl">생일 (선택 · 연도는 몰라도 돼요)</span>
        <div className="nc-birth">
          <select aria-label="생일 월" className="input" value={bm} onChange={(e) => setBm(e.target.value)}><option value="">월</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}</select>
          <select aria-label="생일 일" className="input" value={bd} onChange={(e) => setBd(e.target.value)}><option value="">일</option>{DAYS.map((d) => <option key={d} value={d}>{d}일</option>)}</select>
          <select aria-label="생일 연도" className="input" value={by} onChange={(e) => setBy(e.target.value)}><option value="">연도 (선택)</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </div></div>
      <div className="field"><span className="lbl">유입경로</span>
        <div className="nc-chips">{inflows.map((x) => <button key={x} type="button" className={`chip${inflow === x ? " on" : ""}`} onClick={() => setInflow(inflow === x ? "" : x)}>{x}</button>)}</div>
        {inflow === "기타" && <input className="input" placeholder="어떻게 알고 오셨나요? (선택)" maxLength={30} value={inflowEtc} onChange={(e) => setInflowEtc(e.target.value)} />}
      </div>
      <label className="field"><span className="lbl">담당 디자이너</span>
        <select id="nc-des" className="input" value={des} onChange={(e) => setDes(e.target.value)}>
          <option value="">지정 안 함</option>
          {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select></label>
      <label className="field"><span className="lbl">메모 (선택)</span><textarea id="nc-memo" className="input memo" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} /></label>

      <div className="nc-consent">
        <label className={`nc-ck${!privacy && err?.includes("필수") ? " need" : ""}`}>
          <input id="nc-privacy" type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <span><b className="req">[필수]</b> 개인정보 수집 · 이용 동의</span>
          <button type="button" className="nc-more" onClick={(e) => { e.preventDefault(); setShowText((v) => !v); }}>{showText ? "접기" : "전문 보기"}</button>
        </label>
        {showText && <pre className="nc-text">{PRIVACY_TEXT}</pre>}
        <label className="nc-ck">
          <input id="nc-mk" type="checkbox" checked={mk} onChange={(e) => setMk(e.target.checked)} />
          <span><b className="opt">[선택]</b> 마케팅 정보 수신 동의 <span className="sm">이벤트 · 할인 안내</span></span>
        </label>
        {mk && (
          <div className="nc-ch">
            {(["sms", "alimtalk"] as const).map((x) => (
              <label key={x}><input type="checkbox" checked={ch.includes(x)} onChange={(e) => setCh((v) => (e.target.checked ? [...v, x] : v.filter((y) => y !== x)))} /> {CH_KO[x]}</label>
            ))}
          </div>
        )}
        <p className="sm">동의한 날짜 · 시간과 경로(매장 데스크)가 이력으로 남아요. 마케팅 발송은 정식 버전에서 연결돼요.</p>
      </div>
      {err && <p className="msg err" role="alert">{err}</p>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "저장 중…" : "고객 카드 만들기"}</button>
    </form>
  );
}
