/** 재방문 주기(R): 마지막 시술 종류의 권장 주기로 계산한 '다음 방문 적기' 기준 상태 */
export type RState = { label: string; cls: "later" | "soon" | "due" | "lapsed"; days: number };
const DAY = 86_400_000;
export function revisitState(due: string | null, now: number | null): RState | null {
  if (!due || now == null) return null;
  const days = Math.round((new Date(due).getTime() - now) / DAY); // + 남은 일수, − 지난 일수
  if (days > 3) return { label: days >= 14 ? `R · ${Math.round(days / 7)}주 후` : `R · ${days}일 후`, cls: "later", days };
  if (days >= 1) return { label: `R-${days} · ${days}일 후`, cls: "soon", days };
  if (days >= -4) return { label: days === 0 ? "R · 오늘 적기" : `R+${-days} · 적기 지남`, cls: "due", days };
  return { label: -days >= 14 ? `R+${Math.round(-days / 7)}주 · 이탈 위기` : `R+${-days} · 이탈 위기`, cls: "lapsed", days };
}
/** 재방문 알림 스케줄: R-3 첫 알림 · R 권장일 · R+4 마지막 안내 (고객이 '이미 예약했어요' 하면 종료) */
export function revisitSchedule(due: string | null) {
  if (!due) return [];
  const d = new Date(due).getTime();
  const md = (t: number) => { const x = new Date(t); return `${x.getMonth() + 1}/${x.getDate()}`; };
  return [{ k: "R-3", t: "첫 알림", at: md(d - 3 * DAY) }, { k: "R", t: "권장 방문일", at: md(d) }, { k: "R+4", t: "마지막 안내", at: md(d + 4 * DAY) }];
}
