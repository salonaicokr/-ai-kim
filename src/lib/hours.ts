/** 영업시간 · 임시휴무 (S-07). 서버 판정(app_private.within_hours)과 같은 규칙을 화면에서도 씀 */
export type HoursRow = { weekday: number; is_closed: boolean; open_time: string | null; close_time: string | null; break_start: string | null; break_end: string | null };
export type Holiday = { id: string; start_date: string; end_date: string; reason: string | null };

/** 월요일부터 보여줌 (값은 0=일 ~ 6=토) */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export const toMin = (t: string | null) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
export const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const dowOf = (ymd: string) => new Date(`${ymd}T12:00:00+09:00`).getUTCDay();
const prevYmd = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00+09:00`) - 86_400_000).toISOString().slice(0, 10);

/** 그날 영업하는 구간 [시작분, 끝분) 목록 (0~1440, 전날 자정 넘김 포함) */
export function openRanges(ymd: string, hours: HoursRow[], holidays: Holiday[]): [number, number][] | null {
  if (hours.length === 0) return null; // 영업시간 미설정 → 제한 없음
  if (holidays.some((h) => h.start_date <= ymd && h.end_date >= ymd)) return [];
  const out: [number, number][] = [];
  const cut = (a: number, b: number, h: HoursRow, shift: number) => {
    // 브레이크 빼기 (shift: 전날 행이면 -1440)
    if (!h.break_start || !h.break_end) { out.push([a, b]); return; }
    let bs = toMin(h.break_start) + shift, be = toMin(h.break_end) + shift;
    if (toMin(h.break_start) < toMin(h.open_time)) { bs += 1440; be += 1440; }
    if (be <= bs) be += 1440;
    if (bs > a) out.push([a, Math.min(b, bs)]);
    if (be < b) out.push([Math.max(a, be), b]);
  };
  const today = hours.find((h) => h.weekday === dowOf(ymd));
  if (today && !today.is_closed) {
    const o = toMin(today.open_time), c = toMin(today.close_time);
    cut(o, c <= o ? 1440 : Math.min(c, 1440), today, 0);
  }
  const prev = hours.find((h) => h.weekday === dowOf(prevYmd(ymd)));
  if (prev && !prev.is_closed && toMin(prev.close_time) <= toMin(prev.open_time) && !holidays.some((h) => h.start_date <= prevYmd(ymd) && h.end_date >= prevYmd(ymd))) {
    cut(0, toMin(prev.close_time), prev, -1440);
  }
  return out.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
}

/** 그날 막힌 구간 (회색 블록) = 영업 구간의 나머지 */
export function closedRanges(ymd: string, hours: HoursRow[], holidays: Holiday[]): [number, number][] {
  const open = openRanges(ymd, hours, holidays);
  if (open == null) return [];
  const out: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of open) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < 1440) out.push([cur, 1440]);
  return out;
}

export const isHoliday = (ymd: string, holidays: Holiday[]) => holidays.find((h) => h.start_date <= ymd && h.end_date >= ymd) ?? null;
export const overlapsClosed = (s: number, e: number, closed: [number, number][]) => closed.some(([a, b]) => s < b && e > a);

/** 서버 에러 → 화면 문구 */
export const hoursError = (msg: string) => (msg.includes("OUT_OF_BUSINESS_HOURS") ? "영업시간 밖이거나 휴무일이라 예약할 수 없어요. 설정 › 영업시간을 확인해주세요." : msg);

/** 그날 휴무인지 (정기휴무 요일 · 임시휴무). 영업시간 미설정이면 false */
export const isDayOff = (ymd: string, hours: HoursRow[], holidays: Holiday[]) => { const r = openRanges(ymd, hours, holidays); return r != null && r.length === 0; };
/** 휴무 이름: 임시휴무(사유) / 정기휴무 */
export const offLabel = (ymd: string, holidays: Holiday[]) => { const h = isHoliday(ymd, holidays); return h ? `임시휴무${h.reason ? ` · ${h.reason}` : ""}` : "정기휴무"; };

/**
 * 캘린더에 보여줄 시간 범위 [시작시, 끝시] — 설정한 영업시간만 (S-07 보완).
 * 보이는 날들의 영업 구간을 합치고, 모두 휴무면 주간 영업시간 전체. 영업시간 미설정이면 null.
 */
export function hoursWindow(days: string[], hours: HoursRow[], holidays: Holiday[]): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const d of days) for (const [a, b] of openRanges(d, hours, holidays) ?? []) { lo = Math.min(lo, a); hi = Math.max(hi, b); }
  if (lo === Infinity) for (const h of hours) {
    if (h.is_closed || !h.open_time || !h.close_time) continue;
    const o = toMin(h.open_time), c = toMin(h.close_time);
    lo = Math.min(lo, o); hi = Math.max(hi, c <= o ? 1440 : c);
  }
  if (lo === Infinity) return null;
  return [Math.floor(lo / 60), Math.max(Math.floor(lo / 60) + 1, Math.ceil(hi / 60))];
}

/** 예약 가능한 시작 시각 목록 (영업 구간 안, step 분 단위). 영업시간 미설정이면 null */
export function openSlots(ymd: string, hours: HoursRow[], holidays: Holiday[], step = 10): number[] | null {
  const r = openRanges(ymd, hours, holidays);
  if (r == null) return null;
  const out: number[] = [];
  for (const [a, b] of r) for (let t = Math.ceil(a / step) * step; t < b; t += step) out.push(t);
  return out;
}

/** 지금 이후 첫 예약 가능 시각 (최대 2주 앞까지) */
export function nextOpenSlot(ymd: string, fromMin: number, hours: HoursRow[], holidays: Holiday[], addDays: (d: string, n: number) => string, step = 10): { date: string; start: number } | null {
  for (let i = 0; i < 14; i++) {
    const d = addDays(ymd, i);
    const s = openSlots(d, hours, holidays, step);
    if (s == null) return null;
    const t = s.find((x) => i > 0 || x >= fromMin);
    if (t != null) return { date: d, start: t };
  }
  return null;
}
