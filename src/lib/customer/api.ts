"use client";
// @ts-nocheck

import { createClient } from "@supabase/supabase-js";

/**
 * 고객 앱(/c)은 매장 앱과 같은 Supabase 프로젝트를 쓰고, 고객 데이터는 c_* 함수로만 읽고 써요.
 * 로그인 저장 위치(storageKey)를 매장 앱과 분리해서, 같은 브라우저에서 매장 · 고객 계정을 동시에 써도 서로 로그아웃되지 않아요.
 */
export const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { storageKey: "salonai-customer-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function rpc<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message || "잠시 후 다시 시도해주세요");
  return data as T;
}

export const msgOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "잠시 후 다시 시도해주세요");

export const won = (n: number | null | undefined) => `${Number(n ?? 0).toLocaleString()}원`;
export const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const hm = (iso: string) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export function when(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${KO_DOW[d.getDay()]}) ${hm(iso)}`;
}
export function whenLong(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} (${KO_DOW[d.getDay()]}) ${hm(iso)}`;
}
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 예약 상태 → 고객에게 보여줄 말 */
export const STATUS_KO: Record<string, string> = {
  requested: "매장 확인 중", confirmed: "예약 확정", in_service: "시술 중", completed: "시술 완료",
  cancelled_customer: "예약 취소", cancelled_shop: "매장 취소", no_show: "노쇼",
};
export const STATUS_TONE: Record<string, string> = {
  requested: "", confirmed: "teal", in_service: "teal", completed: "gray", cancelled_customer: "gray", cancelled_shop: "gray", no_show: "gray",
};
export const ACTIVE = ["requested", "confirmed", "in_service"];

/** 메뉴 이름 → 시술 종류 */
export function kindOfName(name = "") {
  if (/열펌|매직/.test(name)) return "열펌";
  if (/펌/.test(name)) return "펌";
  if (/염색|탈색|컬러/.test(name)) return "염색";
  if (/클리닉|케어/.test(name)) return "클리닉";
  if (/컷|커트/.test(name)) return "컷";
  if (/드라이/.test(name)) return "드라이";
  return "기타";
}
export const KINDS = ["컷", "펌", "열펌", "염색", "클리닉", "드라이", "기타"];

/** 비공개 사진 서명 주소 (1시간) */
export async function signed(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return map;
  const { data } = await sb.storage.from(bucket).createSignedUrls(list, 3600);
  (data ?? []).forEach((x) => { if (x.path && x.signedUrl) map.set(x.path, x.signedUrl); });
  return map;
}

/** 휴대폰 사진(수 MB)을 1600px JPEG 로 줄임 */
export async function shrinkImage(file: Blob, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.86));
}

export const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
export function fmtPhone(s: string) {
  const d = digits(s).slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

export { daysSince } from "./care";
