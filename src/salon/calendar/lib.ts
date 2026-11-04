import type { MenuKind } from "@/src/lib/menu";

export type Status = "requested" | "confirmed" | "in_service" | "completed" | "cancelled_customer" | "cancelled_shop" | "no_show" | "blocked";
export type BookingItem = { menu_item_id: string | null; name: string; price: number; kind: MenuKind };
export type Booking = {
  id: string; designer_id: string; start_at: string; end_at: string; status: Status; source: string; memo: string | null;
  shop_customer_id: string | null; customer_request: string | null; created_at?: string;
  items: BookingItem[];
  customer?: { name: string | null; phone: string | null };
  survey?: SurveyLite | null;
};
/** 사전 문진 요약 (캘린더 배지용) · level: safety 필수 안전 확인 / cost 시간 · 가격에 영향 / pref 스타일 취향 */
export type Flag = { level: "safety" | "cost" | "pref"; label: string };
export type SurveyLite = { id: string; status: "sent" | "answered"; flags: Flag[] };
export type Designer = { id: string; name: string; title: string };
export type MenuOpt = { id: string; name: string; price: number; priceM?: number | null; priceL?: number | null; minutes: number; cat: string; kind: MenuKind; catOrder: number };

export const START_H = 10, END_H = 21, SNAP = 10;
export const TZ = "Asia/Seoul";
export const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export const ymdOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
export const kstDate = (ymd: string, hh = 0, mm = 0) =>
  new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`);
export const kstAt = (ymd: string, min: number) => kstDate(ymd, Math.floor(min / 60), min % 60);
export const minsOfDay = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  return (Number(p.find((x) => x.type === "hour")!.value) % 24) * 60 + Number(p.find((x) => x.type === "minute")!.value);
};
export const ymdOfIso = (iso: string) => ymdOf(new Date(iso));
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const durLabel = (m: number) => (m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}`);
export const addDays = (ymd: string, n: number) => ymdOf(new Date(kstDate(ymd, 12).getTime() + n * 86_400_000));
export const dowOf = (ymd: string) => kstDate(ymd, 12).getUTCDay();
export const mdLabel = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8))}`;
/** 월요일 시작 주 */
export const weekStart = (ymd: string) => addDays(ymd, -((dowOf(ymd) + 6) % 7));
export const monthStart = (ymd: string) => `${ymd.slice(0, 8)}01`;
export const addMonths = (ymd: string, n: number) => {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
export const snap = (m: number) => Math.round(m / SNAP) * SNAP;

export const STATUS: Record<Status, { label: string; cls: string; on: boolean }> = {
  confirmed: { label: "예약중", cls: "st-ok", on: true },
  requested: { label: "예약대기", cls: "st-req", on: true },
  in_service: { label: "시술중", cls: "st-in", on: true },
  completed: { label: "방문완료", cls: "st-done", on: true },
  blocked: { label: "수동 블록", cls: "st-block", on: true },
  cancelled_customer: { label: "고객취소", cls: "st-cancel", on: false },
  cancelled_shop: { label: "매장취소", cls: "st-cancel", on: false },
  no_show: { label: "노쇼", cls: "st-cancel", on: false },
};
export const FILTERS: Status[] = ["confirmed", "requested", "in_service", "completed", "blocked", "cancelled_customer", "no_show"];
export const ACTIVE: Status[] = ["requested", "confirmed", "in_service", "completed"];
export const CLOSED: Status[] = ["completed", "cancelled_customer", "cancelled_shop", "no_show"];

export const BOOKING_SELECT =
  "id, designer_id, start_at, end_at, status, source, memo, customer_request, shop_customer_id, created_at, booking_items(menu_item_id, name, price, menu_items(menu_categories(kind))), pre_surveys(id, status, flags)";

type RawItem = { menu_item_id: string | null; name: string; price: number; menu_items: { menu_categories: { kind: MenuKind } | null } | null };
export function normalize(rows: unknown[]): Booking[] {
  return (rows as (Booking & { booking_items?: RawItem[]; pre_surveys?: SurveyLite[] | SurveyLite | null })[]).map(({ pre_surveys: ps, ...b }) => ({
    ...b,
    survey: (Array.isArray(ps) ? ps[0] : ps) ?? null,
    items: (b.booking_items ?? []).map((i) => ({ menu_item_id: i.menu_item_id, name: i.name, price: i.price, kind: i.menu_items?.menu_categories?.kind ?? "etc" })),
  }));
}
