"use client";

import { useState } from "react";
import type { createClient } from "@/src/lib/supabase/client";
import { DAY_KO, WEEK_ORDER, toHm, toMin, type Holiday, type HoursRow } from "@/src/lib/hours";

type SB = ReturnType<typeof createClient>;
type Conflict = { id: string; start: string; end: string; customer: string | null; designer: string | null };

/** 00:00 ~ 24:00, 10분 단위 */
const TIMES = Array.from({ length: 145 }, (_, i) => toHm(i * 10));
const DEFAULT: Omit<HoursRow, "weekday"> = { is_closed: false, open_time: "10:00", close_time: "21:00", break_start: null, break_end: null };
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * 설정 › 영업시간 (S-07): 요일별 영업 · 휴무, 오픈 · 마감(10분), 브레이크, 임시휴무.
 * 저장하면 캘린더에서 영업시간 밖은 회색으로 막히고, 서버도 그 시간 예약을 거부해요. 이미 있는 예약은 지우지 않고 경고만.
 */
export default function HoursEditor({ supabase, shopId, initial, holidays: initHol }: { supabase: SB; shopId: string; initial: HoursRow[]; holidays: Holiday[] }) {
  const [rows, setRows] = useState<HoursRow[]>(() => WEEK_ORDER.map((d) => {
    const r = initial.find((x) => x.weekday === d);
    return r ? { ...r, open_time: hm(r.open_time), close_time: hm(r.close_time), break_start: hm(r.break_start) || null, break_end: hm(r.break_end) || null } : { weekday: d, ...DEFAULT };
  }));
  const [hol, setHol] = useState<Holiday[]>(initHol);
  const [nh, setNh] = useState({ start: "", end: "", reason: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [conf, setConf] = useState<Conflict[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (d: number, p: Partial<HoursRow>) => setRows((rs) => rs.map((r) => (r.weekday === d ? { ...r, ...p } : r)));

  async function checkConflicts() {
    const { data } = await supabase.rpc("hours_conflicts", { p_shop: shopId });
    setConf((data ?? []) as Conflict[]);
  }

  async function save() {
    for (const r of rows) {
      if (r.is_closed) continue;
      if (r.open_time === r.close_time) return setMsg({ ok: false, t: `${DAY_KO[r.weekday]}요일 오픈과 마감이 같아요. 24시간 영업은 00:00 ~ 24:00 으로 정해주세요.` });
      if (r.break_start && r.break_end && r.break_start === r.break_end) return setMsg({ ok: false, t: `${DAY_KO[r.weekday]}요일 브레이크 시간을 확인해주세요.` });
    }
    setBusy(true);
    const { error } = await supabase.from("shop_business_hours").upsert(rows.map((r) => ({
      shop_id: shopId, weekday: r.weekday, is_closed: r.is_closed,
      open_time: r.is_closed ? null : r.open_time, close_time: r.is_closed ? null : r.close_time,
      break_start: r.is_closed ? null : r.break_start, break_end: r.is_closed ? null : r.break_end, updated_at: new Date().toISOString(),
    })));
    setBusy(false);
    if (error) return setMsg({ ok: false, t: `저장하지 못했어요: ${error.message}` });
    setMsg({ ok: true, t: "영업시간을 저장했어요. 예약 캘린더에서 영업시간 밖은 회색으로 막혀요." });
    checkConflicts();
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!nh.start) return;
    const end = nh.end && nh.end >= nh.start ? nh.end : nh.start;
    const { data, error } = await supabase.from("shop_holidays").insert({ shop_id: shopId, start_date: nh.start, end_date: end, reason: nh.reason.trim() || null }).select("id, start_date, end_date, reason").single();
    if (error) return setMsg({ ok: false, t: `임시휴무를 저장하지 못했어요: ${error.message}` });
    setHol((h) => [...h, data as Holiday].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setNh({ start: "", end: "", reason: "" });
    setMsg({ ok: true, t: "임시휴무를 등록했어요. 그날은 예약을 받을 수 없어요." });
    checkConflicts();
  }
  async function delHoliday(h: Holiday) {
    const { error } = await supabase.from("shop_holidays").delete().eq("id", h.id);
    if (error) return setMsg({ ok: false, t: error.message });
    setHol((x) => x.filter((y) => y.id !== h.id));
  }

  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return (
    <section className="card st-card st-hours" id="hours">
      <h2 className="st-h">영업시간</h2>
      <p className="sm">요일별로 정하면 예약 캘린더에서 영업시간 밖은 <b>회색으로 막히고</b> 예약을 넣을 수 없어요. 마감이 오픈보다 이르면 다음 날 새벽까지 영업하는 걸로 계산해요.</p>
      <div className="hr-rows">
        {rows.map((r) => (
          <div key={r.weekday} className={`hr-row${r.is_closed ? " closed" : ""}`}>
            <b className={`hr-day${r.weekday === 0 ? " sun" : r.weekday === 6 ? " sat" : ""}`}>{DAY_KO[r.weekday]}</b>
            <label className="hr-sw">
              <input type="checkbox" checked={!r.is_closed} onChange={(e) => set(r.weekday, e.target.checked ? { is_closed: false, open_time: r.open_time ?? "10:00", close_time: r.close_time ?? "21:00" } : { is_closed: true })} />
              <span>{r.is_closed ? "휴무" : "영업"}</span>
            </label>
            {!r.is_closed && (
              <div className="hr-times">
                <select aria-label={`${DAY_KO[r.weekday]} 오픈`} className="input" value={r.open_time ?? ""} onChange={(e) => set(r.weekday, { open_time: e.target.value })}>
                  {TIMES.slice(0, 144).map((t) => <option key={t}>{t}</option>)}
                </select>
                <span>~</span>
                <select aria-label={`${DAY_KO[r.weekday]} 마감`} className="input" value={r.close_time ?? ""} onChange={(e) => set(r.weekday, { close_time: e.target.value })}>
                  {TIMES.map((t) => <option key={t} value={t}>{t}{r.open_time && toMin(t) <= toMin(r.open_time) && t !== "24:00" ? " (다음 날)" : ""}</option>)}
                </select>
                {r.break_start ? (
                  <span className="hr-break">
                    <span className="sm">브레이크</span>
                    <select aria-label={`${DAY_KO[r.weekday]} 브레이크 시작`} className="input" value={r.break_start} onChange={(e) => set(r.weekday, { break_start: e.target.value })}>{TIMES.slice(0, 144).map((t) => <option key={t}>{t}</option>)}</select>
                    <span>~</span>
                    <select aria-label={`${DAY_KO[r.weekday]} 브레이크 끝`} className="input" value={r.break_end ?? ""} onChange={(e) => set(r.weekday, { break_end: e.target.value })}>{TIMES.slice(1).map((t) => <option key={t}>{t}</option>)}</select>
                    <button type="button" className="btn ghost sm-btn" onClick={() => set(r.weekday, { break_start: null, break_end: null })} aria-label="브레이크 빼기">✕</button>
                  </span>
                ) : (
                  <button type="button" className="btn ghost sm-btn" onClick={() => set(r.weekday, { break_start: "14:00", break_end: "15:00" })}>+ 점심 · 브레이크</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="row hr-acts">
        <button type="button" className="btn ghost sm-btn" onClick={() => { const m = rows.find((r) => r.weekday === 1)!; setRows((rs) => rs.map((r) => (r.weekday === 1 ? r : { ...m, weekday: r.weekday }))); }}>월요일과 똑같이</button>
        <span className="sp" />
        <button type="button" className="btn pri" disabled={busy} onClick={save}>{busy ? "저장 중…" : "영업시간 저장"}</button>
      </div>

      <h3 className="st-sub">임시휴무</h3>
      <form className="hr-hol" onSubmit={addHoliday}>
        <label className="field"><span className="lbl">시작일</span><input className="input" type="date" required value={nh.start} onChange={(e) => setNh({ ...nh, start: e.target.value })} /></label>
        <label className="field"><span className="lbl">종료일 (하루면 비워두기)</span><input className="input" type="date" min={nh.start} value={nh.end} onChange={(e) => setNh({ ...nh, end: e.target.value })} /></label>
        <label className="field grow"><span className="lbl">사유</span><input className="input" maxLength={60} placeholder="예: 매장 리모델링" value={nh.reason} onChange={(e) => setNh({ ...nh, reason: e.target.value })} /></label>
        <button className="btn" type="submit">휴무 추가</button>
      </form>
      {hol.length > 0 && (
        <ul className="list hr-hlist">
          {hol.map((h) => (
            <li key={h.id}><b>{md(h.start_date)}{h.end_date !== h.start_date ? ` ~ ${md(h.end_date)}` : ""}</b><span className="sm">{h.reason ?? "임시휴무"}</span><span className="sp" />
              <button type="button" className="btn ghost sm-btn" onClick={() => delHoliday(h)}>삭제</button></li>
          ))}
        </ul>
      )}

      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
      {conf && conf.length > 0 && (
        <div className="msg note hr-warn" role="alert">
          <b>영업시간 밖에 남은 예약 {conf.length}건</b> — 지우지 않았어요. 고객과 시간을 다시 맞춰주세요.
          <ul>{conf.slice(0, 8).map((c) => <li key={c.id}>{when(c.start)} · {c.customer ?? "고객"} · {c.designer ?? ""}</li>)}</ul>
          {conf.length > 8 && <span className="sm">외 {conf.length - 8}건</span>}
        </div>
      )}
    </section>
  );
}
