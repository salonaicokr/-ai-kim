// @ts-nocheck
import type { NaverStatus } from "@/src/lib/naver";
export type StoreRow = {
  id: string; name: string; owner: string | null; industries: string[]; type: "solo" | "shop" | "multi";
  brand: string | null; branches: number; created: string; status: "pending" | "active" | "suspended"; plan: string; members: number;
  /** 매장코드 IC01-S0042 (승인 때 발급) · 가입 추천 코드 · 현재 주담당 영업코드 */
  code: string | null; referral: string | null; rep: string | null;
  /** 과금 상태 (운영 상태와 별개) */ billing: BillingState;
  /** 네이버 플레이스 연결: none 미입력 · skipped 나중에 · entered 입력됨 · verified 확인됨 */ naver?: NaverStatus;
};
export type BillingState = "normal" | "grace" | "restricted" | "blocked" | "terminated";
export const BILLING_KO: Record<BillingState, string> = { normal: "정상", grace: "유예", restricted: "제한", blocked: "차단", terminated: "해지" };
export const STATUS_KO: Record<string, string> = { pending: "승인 대기", active: "운영중", suspended: "정지" };
export const TYPE_KO: Record<string, string> = { solo: "1인샵", shop: "매장", multi: "다매장" };
export const IND_KO: Record<string, string> = { hair: "헤어", nail: "네일" };
export const ymd = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));
