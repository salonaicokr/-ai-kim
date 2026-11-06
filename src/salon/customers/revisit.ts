/** 재방문 주기: 마지막 시술 종류의 권장 주기로 계산한 '다음 방문 적기' 기준 상태 (S-16: R 표기 대신 문구) */
export type RState = { label: string; cls: "later" | "soon" | "due" | "lapsed"; days: number };
const DAY = 86_400_000;
const span = (d: number) => (d >= 14 ? `${Math.round(d / 7)}주` : `${d}일`);
export function revisitState(due: string | null, now: number | null): RState | null {
  if (!due || now == null) return null;
  const days = Math.round((new Date(due).getTime() - now) / DAY); // + 남은 일수, − 지난 일수
  if (days > 3) return { label: `방문 적기 ${span(days)} 전`, cls: "later", days };
  if (days >= 1) return { label: `방문 적기 ${days}일 전`, cls: "soon", days };
  if (days >= -4) return { label: days === 0 ? "오늘 방문 적기" : `적기 ${-days}일 지남`, cls: "due", days };
  return { label: `적기 ${span(-days)} 지남 · 이탈 위기`, cls: "lapsed", days };
}
/** 재방문 알림 순서: 적기 3일 전 첫 안내 · 적기 당일 · 적기 4일 뒤 마지막 안내 (고객이 '이미 예약했어요' 하면 종료) — 계산은 그대로 */
export function revisitSchedule(due: string | null) {
  if (!due) return [];
  const d = new Date(due).getTime();
  const md = (t: number) => { const x = new Date(t); return `${x.getMonth() + 1}/${x.getDate()}`; };
  return [{ k: "방문 3일 전 안내", t: "", at: md(d - 3 * DAY) }, { k: "방문 적기", t: "권장일", at: md(d) }, { k: "적기 4일 뒤", t: "마지막 안내", at: md(d + 4 * DAY) }];
}
