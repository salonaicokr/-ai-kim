/** 네이버 플레이스 주소에서 플레이스 번호 뽑기 (map.naver.com/p/entry/place/123 · m.place.naver.com/hairshop/123 · place.naver.com/restaurant/123 · ?id=123) */
export function parsePlaceId(input: string): string | null {
  const s = input.trim();
  if (/^\d{5,15}$/.test(s)) return s;
  if (/booking\.naver\.com/i.test(s)) return null; // 예약 페이지 번호는 플레이스 번호가 아님
  const m = /(?:\/place\/|place\.naver\.com\/[a-z]+\/|[?&](?:id|placeId)=)(\d{5,15})/i.exec(s) ?? /naver\.com\/[^?#]*?\/(\d{5,15})(?:[/?#]|$)/i.exec(s);
  return m ? m[1] : null;
}
export const isShortNaver = (s: string) => /^https?:\/\/naver\.me\//i.test(s.trim());
export const isNaverUrl = (s: string) => /^https?:\/\/([a-z0-9-]+\.)*(naver\.com|naver\.me)\//i.test(s.trim()) || /^\d{5,15}$/.test(s.trim());
export type NaverStatus = "none" | "skipped" | "entered" | "verified";
export const NAVER_KO: Record<NaverStatus, string> = { none: "미입력", skipped: "나중에", entered: "입력됨 · 확인 전", verified: "확인됨" };
