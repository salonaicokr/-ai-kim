"use client";

import { useEffect, useState } from "react";
import { hoursError, hoursWindow, isDayOff, offLabel, openSlots, type Holiday, type HoursRow } from "@/src/lib/hours";
import type { createClient } from "@/src/lib/supabase/client";
import { kindOf } from "@/src/lib/menu";
import {
  END_H, SNAP, addDays, START_H, STATUS, durLabel, hhmm, kstAt, mdLabel, minsOfDay, ymdOf, ymdOfIso,
  type Booking, type Designer, type MenuOpt, type Status,
} from "./lib";
import TreatmentRecord, { openCamera, uploadPhotos } from "./record";
import Consult from "./consult";
import StylePhotos from "./style-photos";

type SB = ReturnType<typeof createClient>;
const TIMES = Array.from({ length: ((END_H - START_H + 2) * 60) / SNAP + 1 }, (_, i) => (START_H - 1) * 60 + i * SNAP);
const DURS = [10, 20, 30, 40, 50, 60, 90, 120, 150, 180, 210, 240, 300, 360];

/** 메뉴 고르기 (분류 탭 + 목록) */
function MenuPicker({ menus, picked, setPicked }: { menus: MenuOpt[]; picked: string[]; setPicked: (v: string[]) => void }) {
  const cats = [...new Set(menus.map((m) => m.cat))];
  const [open, setOpen] = useState<string | null>(cats[0] ?? null);
  const total = picked.reduce((a, id) => a + (menus.find((m) => m.id === id)?.price ?? 0), 0);
  return (
    <div className="field">
      <span className="lbl">메뉴 {picked.length > 0 && <>· {picked.length}개 · {total.toLocaleString()}원</>}</span>
      {picked.length > 0 && (
        <div className="picked">
          {picked.map((id) => {
            const m = menus.find((x) => x.id === id);
            return m ? <button key={id} type="button" className="pk-chip" style={{ ["--k" as string]: kindOf(m.kind).color }} onClick={() => setPicked(picked.filter((x) => x !== id))}>{m.name} ×</button> : null;
          })}
        </div>
      )}
      <div className="cats2">
        {cats.map((c) => (
          <button key={c} type="button" className={`chip${open === c ? " on" : ""}`} onClick={() => setOpen(c)}>{c}</button>
        ))}
      </div>
      <div className="mlist">
        {menus.filter((m) => m.cat === open).map((m) => {
          const on = picked.includes(m.id);
          return (
            <button key={m.id} type="button" className={`mopt${on ? " on" : ""}`} style={{ ["--k" as string]: kindOf(m.kind).color }}
              onClick={() => setPicked(on ? picked.filter((x) => x !== m.id) : [...picked, m.id])}>
              <span>{m.name}</span><span className="sm tnum">{m.price.toLocaleString()} · {durLabel(m.minutes)}</span>
            </button>
          );
        })}
        {menus.length === 0 && <p className="sm">등록된 시술 메뉴가 없어요. 시술메뉴 화면에서 먼저 등록해주세요.</p>}
      </div>
    </div>
  );
}

type HoursP = { hours: HoursRow[]; holidays: Holiday[] };

/** 날짜 · 시작 · 소요시간. 영업시간을 정했으면 그날 영업 구간의 시각만 고를 수 있어요 (휴무일은 안내) */
function TimeFields({ date, setDate, start, setStart, dur, setDur, autoNote, hours, holidays, lenient }: {
  date: string; setDate: (v: string) => void; start: number; setStart: (v: number) => void; dur: number; setDur: (v: number) => void; autoNote?: boolean;
  /** lenient: 수동 블록처럼 영업시간 밖도 허용 */ lenient?: boolean;
} & HoursP) {
  const slots = lenient ? null : openSlots(date, hours, holidays, SNAP);
  const off = !lenient && isDayOff(date, hours, holidays);
  const outside = slots != null && !off && !slots.includes(start);
  const opts = slots ?? TIMES;
  // 날짜를 바꾸면 그날 첫 영업 시각으로 맞춤
  const pickDate = (v: string) => {
    setDate(v);
    const s = lenient ? null : openSlots(v, hours, holidays, SNAP);
    if (s && s.length && !s.includes(start)) setStart(s[0]);
  };
  return (
    <>
      <div className="two">
        <label className="field"><span className="lbl">날짜</span>
          <input id="f-date" type="date" className="input" value={date} onChange={(e) => e.target.value && pickDate(e.target.value)} /></label>
        <label className="field"><span className="lbl">시작 (10분 단위)
            {/* S-12 보조: 지금 시각으로 (빈 칸을 눌러 들어오면 그 칸 시각이 기본) */}
            <button type="button" className="now-btn" onClick={(e) => { e.preventDefault(); const n = new Date(); setDate(ymdOf(n)); setStart(Math.ceil(minsOfDay(n.toISOString()) / SNAP) * SNAP); }}>지금</button></span>
          <select id="f-start" className="input" value={start} disabled={off} onChange={(e) => setStart(Number(e.target.value))}>
            {[...new Set([...opts, start])].sort((a, b) => a - b).map((t) => <option key={t} value={t}>{hhmm(t)}{slots && !off && !slots.includes(t) ? " (영업시간 외)" : ""}</option>)}
          </select></label>
      </div>
      {off && <p className="msg err" role="alert">{mdLabel(date)}은 {offLabel(date, holidays).split(" · ")[0]}이에요. 다른 날짜를 골라주세요.</p>}
      {outside && <p className="msg err" role="alert">{hhmm(start)}은 영업시간이 아니에요. 영업시간 안의 시각을 골라주세요.</p>}
      <label className="field"><span className="lbl">소요시간 {autoNote && "· 메뉴 기준 자동"}</span>
        <select id="f-dur" className="input" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
          {[...new Set([...DURS, dur])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{durLabel(m)} ({hhmm(start)}–{hhmm(start + m)})</option>)}
        </select></label>
    </>
  );
}

// ---------- 새 예약 ----------
export function NewBooking({ supabase, shopId, designers, menus, hours, holidays, init, onClose, onSaved }: {
  supabase: SB; shopId: string; designers: Designer[]; menus: MenuOpt[]; hours: HoursRow[]; holidays: Holiday[];
  init: { designer: string; date: string; start: number; customer?: { id: string; name: string }; blocked?: boolean }; onClose: () => void; onSaved: (msg: string, date: string) => void;
}) {
  const [blocked, setBlocked] = useState(init.blocked ?? false);
  // 영업시간이 끝난 뒤라 '지금'에 열 수 없어 다음 영업일로 열렸으면 이유를 알려줌 (S-20)
  const [openedAhead] = useState(() => (init.date !== ymdOf(new Date()) ? { date: init.date, start: init.start } : null));
  const fixed = init.customer ?? null;
  const [name, setName] = useState(fixed?.name ?? "");
  const [phone, setPhone] = useState("");
  const [designer, setDesigner] = useState(designers.some((d) => d.id === init.designer) ? init.designer : designers[0]?.id);
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(init.start);
  const [picked, setPicked] = useState<string[]>([]);
  const [manualDur, setManualDur] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [endDate, setEndDate] = useState(init.date);
  const autoDur = picked.reduce((a, id) => a + (menus.find((m) => m.id === id)?.minutes ?? 0), 0);
  const dur = manualDur ?? (autoDur || 60);
  // 종일 블록 = 그날 영업시간 전체 (미설정이면 기본 10~21시)
  const winOf = (d: string) => { const w = hoursWindow([d], hours, holidays) ?? [START_H, END_H]; return [w[0] * 60, w[1] * 60] as const; };
  const [dayStart, dayEnd] = winOf(date);
  const offDay = !blocked && isDayOff(date, hours, holidays);

  /** 종일 블록(휴무 · 휴가): 영업 시작 ~ 마감, 끝 날짜까지 하루씩 */
  async function saveAllDay() {
    const last = endDate < date ? date : endDate;
    const days: string[] = [];
    for (let d = date; d <= last && days.length < 31; d = addDays(d, 1)) days.push(d);
    for (const d of days) {
      if (isDayOff(d, hours, holidays)) continue; // 이미 휴무인 날은 건너뜀
      const [ds, de] = winOf(d);
      const st = kstAt(d, ds);
      const { error } = await supabase.rpc("create_booking", {
        p_shop: shopId, p_designer: designer, p_start: st.toISOString(), p_end: kstAt(d, de).toISOString(),
        p_customer_name: "", p_customer_phone: "", p_items: [], p_memo: memo || "휴무 (종일)", p_source: "manual", p_blocked: true, p_customer_id: null,
      });
      if (error) return hoursError(error.message);
    }
    onSaved(days.length > 1 ? `${mdLabel(date)}–${mdLabel(last)} ${days.length}일 종일 막았어요` : `${mdLabel(date)} 종일 막았어요`, date);
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!designer) return;
    if (!blocked && !name.trim()) { setErr("고객 이름을 입력해주세요."); return; }
    setBusy(true); setErr(null);
    if (blocked && allDay) { const m = await saveAllDay(); setBusy(false); if (m) setErr(m); return; }
    const st = kstAt(date, start);
    const { error } = await supabase.rpc("create_booking", {
      p_shop: shopId, p_designer: designer, p_start: st.toISOString(), p_end: new Date(st.getTime() + dur * 60_000).toISOString(),
      p_customer_name: name, p_customer_phone: phone, p_items: picked.map((id) => ({ menu_item_id: id })),
      p_memo: memo || (blocked ? "수동 블록" : null), p_source: "manual", p_blocked: blocked,
      p_customer_id: !blocked && fixed ? fixed.id : null,
    });
    setBusy(false);
    if (error) { setErr(hoursError(error.message)); return; }
    onSaved(blocked ? `${mdLabel(date)} ${hhmm(start)}–${hhmm(start + dur)} 시간을 막았어요` : `${name} 님 예약을 등록했어요 · ${mdLabel(date)} ${hhmm(start)}`, date);
  }

  return (
    <form className="card panel" onSubmit={save}>
      <div className="row"><h2 className="h2">{blocked ? "시간 막기" : "예약 등록"}</h2><span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={onClose}>닫기</button></div>
      <div className="seg2">
        <button type="button" className={!blocked ? "on" : ""} onClick={() => setBlocked(false)}>손님 예약</button>
        <button type="button" className={blocked ? "on" : ""} onClick={() => setBlocked(true)}>수동 블록 (전화 · 휴식)</button>
      </div>
      {!blocked && fixed && (
        <p className="msg ok">고객: <b>{fixed.name}</b> (고객 카드에서 연결)</p>
      )}
      {!blocked && !fixed && (
        <div className="two">
          <label className="field"><span className="lbl">고객 이름</span><input id="bk-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="홍길동" /></label>
          <label className="field"><span className="lbl">휴대폰</span><input id="bk-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="010-0000-0000" /></label>
        </div>
      )}
      <label className="field"><span className="lbl">담당</span>
        <select id="bk-designer" className="input" value={designer} onChange={(e) => setDesigner(e.target.value)} disabled={designers.length < 2}>
          {designers.map((d) => <option key={d.id} value={d.id}>{d.name} {d.title}</option>)}
        </select></label>
      {blocked && (
        <div className="field"><span className="lbl">막을 시간</span>
          <div className="seg2">
            <button type="button" className={!allDay ? "on" : ""} onClick={() => setAllDay(false)}>시간 지정</button>
            <button type="button" className={allDay ? "on" : ""} onClick={() => { setAllDay(true); if (endDate < date) setEndDate(date); }}>종일 (휴무 · 휴가)</button>
          </div></div>
      )}
      {blocked && allDay ? (
        <>
          <div className="two">
            <label className="field"><span className="lbl">시작 날짜</span>
              <input id="f-date" type="date" className="input" value={date} onChange={(e) => { if (!e.target.value) return; setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} /></label>
            <label className="field"><span className="lbl">끝 날짜 (하루면 그대로)</span>
              <input id="f-end" type="date" className="input" min={date} value={endDate} onChange={(e) => e.target.value && setEndDate(e.target.value)} /></label>
          </div>
          <p className="sm">영업시간 {hhmm(dayStart)}–{hhmm(dayEnd)} 전체를 막아요{endDate > date ? ` · ${Math.round((kstAt(endDate, 0).getTime() - kstAt(date, 0).getTime()) / 86_400_000) + 1}일` : ""}.</p>
        </>
      ) : (
        <>
          <TimeFields date={date} setDate={setDate} start={start} setStart={setStart} dur={dur} setDur={setManualDur} autoNote={manualDur == null && autoDur > 0} hours={hours} holidays={holidays} lenient={blocked} />
          {openedAhead && date === openedAhead.date && !blocked && (
            <p className="msg ok" role="status">
              지금은 영업시간이 아니어서 <b>{mdLabel(openedAhead.date)} {hhmm(openedAhead.start)}</b>(으)로 열었어요. 날짜·시각을 바꾸거나 <b>지금</b>을 눌러 현재 시각으로 옮길 수 있어요.
            </p>
          )}
        </>
      )}
      {!blocked && <MenuPicker menus={menus} picked={picked} setPicked={(v) => { setManualDur(null); setPicked(v); }} />}
      <label className="field"><span className="lbl">{blocked ? "사유" : "메모 (선택)"}</span>
        <input id="bk-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={60} placeholder={blocked ? (allDay ? "휴가 · 정기 휴무 · 교육" : "전화 예약 · 점심 · 개인 일정") : "요청 사항"} /></label>
      {err && <p className="msg err">{err}</p>}
      <button className="btn pri" type="submit" disabled={busy || offDay}>{busy ? "저장 중…" : blocked ? (allDay ? "종일 막기" : "시간 막기") : "예약 등록"}</button>
    </form>
  );
}

// ---------- 예약 조정 (승인 대기 확정 전 · 예약 변경) ----------
export function EditBooking({ supabase, b, designers, menus, hours, holidays, confirming, onClose, onSaved }: {
  supabase: SB; b: Booking; designers: Designer[]; menus: MenuOpt[]; hours: HoursRow[]; holidays: Holiday[]; confirming: boolean;
  onClose: () => void; onSaved: (msg: string, date: string) => void;
}) {
  const s0 = minsOfDay(b.start_at), e0 = minsOfDay(b.end_at);
  const [date, setDate] = useState(ymdOfIso(b.start_at));
  const [start, setStart] = useState(s0);
  const [dur, setDur] = useState(e0 - s0);
  const [designer, setDesigner] = useState(b.designer_id);
  const origIds = b.items.map((i) => i.menu_item_id).filter(Boolean) as string[];
  const [picked, setPicked] = useState<string[]>(origIds);
  const [memo, setMemo] = useState(b.memo ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const menusChanged = picked.join() !== origIds.join();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const st = kstAt(date, start);
    const patch: Record<string, unknown> = {
      start_at: st.toISOString(), end_at: new Date(st.getTime() + dur * 60_000).toISOString(),
      designer_id: designer, memo: memo.trim() || null,
    };
    if (confirming) patch.status = "confirmed";
    const { error } = await supabase.from("bookings").update(patch).eq("id", b.id);
    if (!error && menusChanged) {
      await supabase.from("booking_items").delete().eq("booking_id", b.id);
      const rows = picked.map((id) => menus.find((m) => m.id === id)).filter(Boolean)
        .map((m) => ({ booking_id: b.id, menu_item_id: m!.id, name: m!.name, price: m!.price, duration_min: m!.minutes }));
      if (rows.length) await supabase.from("booking_items").insert(rows);
    }
    setBusy(false);
    if (error) { setErr(hoursError(error.message)); return; }
    onSaved(`${b.customer?.name ?? "예약"} · ${confirming ? "확정했어요" : "변경했어요"} (${mdLabel(date)} ${hhmm(start)}–${hhmm(start + dur)})`, date);
  }

  return (
    <form className="card panel" onSubmit={save}>
      <div className="row">
        <span className={`pill ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
        <span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={onClose}>닫기</button>
      </div>
      <h2 className="h2">{confirming ? "확정 전 조정" : "예약 변경"} · {b.customer?.name ?? "고객"}</h2>
      {confirming && <p className="sm">요청 그대로 확정하거나, 시간 · 담당 · 메뉴를 고친 뒤 확정하세요.</p>}
      {b.customer_request && <p className="msg req">고객 요청: {b.customer_request}</p>}
      <label className="field"><span className="lbl">담당</span>
        <select id="e-designer" className="input" value={designer} onChange={(e) => setDesigner(e.target.value)}>
          {designers.map((d) => <option key={d.id} value={d.id}>{d.name} {d.title}</option>)}
        </select></label>
      <TimeFields date={date} setDate={setDate} start={start} setStart={setStart} dur={dur} setDur={setDur} hours={hours} holidays={holidays} lenient={b.status === "blocked"} />
      <MenuPicker menus={menus} picked={picked} setPicked={(v) => {
        setPicked(v);
        const auto = v.reduce((a, id) => a + (menus.find((m) => m.id === id)?.minutes ?? 0), 0);
        if (auto) setDur(auto);
      }} />
      <label className="field"><span className="lbl">메모</span>
        <input id="e-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={60} /></label>
      {err && <p className="msg err">{err}</p>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? "저장 중…" : confirming ? "이 내용으로 예약 확정" : "변경 저장"}</button>
    </form>
  );
}

// ---------- 예약 상세 ----------
type Pay = { id: string; paid_amount: number; calculated_total: number; method: string; status: string; is_overridden: boolean; override_reason: string | null; refunded_amount: number; payment_items: { name: string; unit_price: number }[] };
const METHOD_LABEL: Record<string, string> = { card: "카드", npay: "N페이", cash: "현금", transfer: "계좌이체", prepaid: "정액권", app: "앱 결제" };

export function Detail({ supabase, shopId, shopName, myMemberId, b, designers, editable, canPay, canRefund, canRecord, onClose, onStatus, onEdit, onCheckout, onChanged }: {
  supabase: SB; shopId: string; shopName: string; myMemberId: string; b: Booking; designers: Designer[]; editable: boolean; canPay: boolean; canRefund: boolean; canRecord: boolean;
  onClose: () => void; onStatus: (s: Status) => void; onEdit: (confirming: boolean) => void; onCheckout: () => void; onChanged: (msg: string) => void;
}) {
  const [pay, setPay] = useState<Pay | null | undefined>(undefined);
  const [askRefund, setAskRefund] = useState(false);
  const [claim, setClaim] = useState<{ id: string; amount: number; created_at: string } | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from("payment_requests").select("id, amount, created_at").eq("booking_id", b.id).eq("status", "requested").maybeSingle()
      .then(({ data }) => { if (alive) setClaim((data as typeof claim) ?? null); });
    return () => { alive = false; };
  }, [supabase, b.id, b.status]);
  async function cancelClaim() {
    if (!claim) return;
    const { error } = await supabase.from("payment_requests").update({ status: "cancelled" }).eq("id", claim.id);
    if (error) { onChanged(hoursError(error.message)); return; }
    setClaim(null); onChanged("앱 청구를 취소했어요");
  }
  useEffect(() => {
    let alive = true;
    supabase.from("payments").select("id, paid_amount, calculated_total, method, status, is_overridden, override_reason, refunded_amount, payment_items(name, unit_price)")
      .eq("booking_id", b.id).order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (alive) setPay(((data ?? [])[0] as Pay | undefined) ?? null); });
    return () => { alive = false; };
  }, [supabase, b.id, b.status]);
  async function refund() {
    if (!pay) return;
    const { error } = await supabase.from("payments").update({ status: "refunded", refunded_amount: pay.paid_amount }).eq("id", pay.id);
    setAskRefund(false);
    if (error) { onChanged(`환불 실패: ${error.message}`); return; }
    setPay({ ...pay, status: "refunded", refunded_amount: pay.paid_amount });
    onChanged(`${pay.paid_amount.toLocaleString()}원 환불 처리했어요`);
  }
  const unpaid = pay === null || pay?.status === "refunded";
  const s = minsOfDay(b.start_at), e = minsOfDay(b.end_at);
  const total = b.items.reduce((a, i) => a + i.price, 0);
  // 시술 시작 → 비포 카메라 · 시술 완료 → 애프터 카메라 (버튼을 누른 순간에 열어야 휴대폰에서 카메라가 떠요)
  const shoot = (kind: "before" | "after") => {
    if (canRecord && b.shop_customer_id) openCamera((files) => uploadPhotos(supabase, shopId, b, kind, files));
  };
  const acts: { label: string; run: () => void; tone?: "pri" | "warn" }[] = [];
  if (b.status === "requested") acts.push({ label: "예약 확정…", run: () => onEdit(true), tone: "pri" }, { label: "예약 거절", run: () => onStatus("cancelled_shop"), tone: "warn" });
  if (b.status === "confirmed") acts.push({ label: "시술 시작", run: () => { shoot("before"); onStatus("in_service"); }, tone: "pri" }, { label: "예약 변경", run: () => onEdit(false) }, { label: "노쇼", run: () => onStatus("no_show"), tone: "warn" }, { label: "고객 취소", run: () => onStatus("cancelled_customer"), tone: "warn" });
  if (b.status === "confirmed" && canPay) acts.splice(1, 0, { label: "완료 · 결제", run: () => { shoot("after"); onCheckout(); } });
  const cam = canRecord && b.shop_customer_id;
  if (b.status === "in_service") acts.push(...(canPay ? [{ label: "시술 완료 · 결제", run: () => { shoot("after"); onCheckout(); }, tone: "pri" as const }] : []), { label: canPay ? "결제 없이 완료" : "시술 완료", run: () => { shoot("after"); onStatus("completed"); }, tone: canPay ? undefined : ("pri" as const) }, { label: "시간 변경", run: () => onEdit(false) });
  if (b.status === "completed" && canPay && pay === null) acts.push({ label: "결제 등록", run: onCheckout, tone: "pri" });
  if (b.status === "blocked") acts.push({ label: "시간 변경", run: () => onEdit(false) }, { label: "블록 해제", run: () => onStatus("cancelled_shop"), tone: "warn" });
  if (["cancelled_customer", "cancelled_shop", "no_show"].includes(b.status)) acts.push({ label: "예약 되살리기", run: () => onStatus("confirmed") });

  return (
    <div className="card panel">
      <div className="row"><span className={`pill ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>{b.source === "naver" && <span className="pill p-naver">네이버</span>}<span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={onClose}>닫기</button></div>
      <h2 className="h2">{b.status === "blocked" ? (b.memo ?? "수동 블록") : b.customer?.name ?? "고객"}</h2>
      {b.customer?.phone && <p className="sm tnum">{b.customer.phone}</p>}
      <dl className="dl">
        <div><dt>시간</dt><dd className="tnum">{mdLabel(ymdOfIso(b.start_at))} {hhmm(s)}–{hhmm(e)} · {durLabel(e - s)}</dd></div>
        <div><dt>담당</dt><dd>{designers.find((d) => d.id === b.designer_id)?.name ?? "-"}{b.designer_requested === false && <span className="sm"> · 고객 지정 없음 (임시 배정 · 다른 분이 시술하면 결제 때 바꿔요)</span>}</dd></div>
        {b.status === "requested" && b.source === "app" && b.respond_by && <div><dt>확정 기한</dt><dd className="tnum">{hhmm(new Date(b.respond_by).getHours() * 60 + new Date(b.respond_by).getMinutes())}까지 · 지나면 자동 취소돼요</dd></div>}
        {b.items.length > 0 && <div><dt>메뉴</dt><dd>{b.items.map((i, k) => <span key={k} className="mi-row"><span className="sw" style={{ background: kindOf(i.kind).color }} />{i.name} <span className="sm tnum">{i.price.toLocaleString()}원</span></span>)}</dd></div>}
        {total > 0 && <div><dt>예상 금액</dt><dd className="b tnum">{total.toLocaleString()}원</dd></div>}
        {b.customer_request && <div><dt>요청</dt><dd>{b.customer_request}</dd></div>}
        {b.memo && b.status !== "blocked" && <div><dt>메모</dt><dd>{b.memo}</dd></div>}
      </dl>
      {editable && acts.length > 0 && (
        <div className="acts">
          {acts.map((a) => <button key={a.label} type="button" className={`btn ${a.tone === "pri" ? "pri" : "ghost"}${a.tone === "warn" ? " warn" : ""}`} onClick={a.run}>{a.label}</button>)}
        </div>
      )}
      {editable && cam && (b.status === "confirmed" || b.status === "in_service") && (
        <p className="cam-hint sm">📷 {b.status === "confirmed" ? "시술 시작을 누르면 비포 사진 카메라가 열려요" : "시술 완료를 누르면 애프터 사진 카메라가 열려요"} · 찍은 사진은 AI 보정본으로 설정 보관함에 자동 저장</p>
      )}
      {pay && (
        <div className={`paybox${pay.status === "refunded" ? " refunded" : ""}`}>
          <div className="row"><b>결제 {pay.status === "refunded" ? "· 환불됨" : "완료"}</b><span className="sp" /><b className="tnum">{pay.paid_amount.toLocaleString()}원</b></div>
          <p className="sm">{METHOD_LABEL[pay.method] ?? pay.method} · {pay.payment_items.map((i) => i.name).join(" + ")}</p>
          {pay.is_overridden && <p className="sm">계산 {pay.calculated_total.toLocaleString()}원 → 수정 사유: {pay.override_reason}</p>}
          {canRefund && pay.status !== "refunded" && (askRefund ? (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="sm">{pay.paid_amount.toLocaleString()}원 전액 환불할까요?</span>
              <button type="button" className="btn ghost sm-btn" onClick={() => setAskRefund(false)}>취소</button>
              <button type="button" className="btn sm-btn warn" onClick={refund}>환불</button>
            </div>
          ) : (
            <button type="button" className="btn ghost sm-btn warn" onClick={() => setAskRefund(true)}>환불 · 결제 취소</button>
          ))}
        </div>
      )}
      {claim && (
        <div className="paybox claim">
          <div className="row"><b>고객 앱 청구 · 승인 대기</b><span className="sp" /><b className="tnum">{claim.amount.toLocaleString()}원</b></div>
          <p className="sm">고객이 앱에서 내역을 확인하고 원클릭 승인하면 결제 · 방문완료로 바뀌어요</p>
          {canPay && <button type="button" className="btn ghost sm-btn warn" onClick={cancelClaim}>청구 취소</button>}
        </div>
      )}
      {b.status === "completed" && unpaid && pay !== undefined && <p className="sm">아직 결제가 등록되지 않았어요.</p>}
      {b.shop_customer_id && ["requested", "confirmed", "in_service", "completed"].includes(b.status) && (
        <StylePhotos key={`sp-${b.id}`} supabase={supabase} bookingId={b.id} />
      )}
      {b.shop_customer_id && ["requested", "confirmed", "in_service", "completed"].includes(b.status) && (
        <Consult key={`cs-${b.id}`} supabase={supabase} shopId={shopId} shopName={shopName} b={b} myMemberId={myMemberId} canEdit={editable} />
      )}
      {b.shop_customer_id && ["confirmed", "in_service", "completed"].includes(b.status) && (
        <TreatmentRecord key={b.id + b.status} supabase={supabase} shopId={shopId} b={b} designerName={designers.find((d) => d.id === b.designer_id)?.name ?? ""} canRecord={canRecord} />
      )}
    </div>
  );
}
