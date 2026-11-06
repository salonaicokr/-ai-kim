"use client";
// @ts-nocheck

import { supabase as raw } from "@/src/lib/browser";
import { dbErrorMessage, inviteCode } from "@/src/lib/format";
import { createClient } from "@/src/lib/supabase/client";
import { setReferral } from "@/src/lib/supabase/hq-backend";
import { resolveNaverPlace } from "@/src/lib/naver-resolve";
import { validRepCode } from "@/src/lib/sales-code";

export type SignupInput = {
  shopType: "solo" | "shop" | "multi";
  industry: "hair" | "nail";
  ownerName: string;
  ownerPhone: string;
  shopName: string;
  address: string;
  postcode: string;
  addressDetail: string;
  shopPhone: string;
  bizNo: string;
  expectedDesigners: number;
  ownerDoesService: boolean;
  referralCode?: string;
  naverUrl?: string;
  naverLogin?: string;
  naverLater?: boolean;
};

const digits = (s: string) => s.replace(/[^0-9]/g, "");

/**
 * 가입 신청 · 매장 추가: 로그인한 원장 계정에 새 매장(승인 대기)을 만들고 원장 · 업종 기본 메뉴 · 영업시간을 넣어요.
 * (사진 서류는 보관소가 연결되기 전이라 파일 이름만 남겨요)
 */
export async function submitSignup(input: SignupInput): Promise<{ shopId?: string; error?: string }> {
  if (!input.shopName.trim()) return { error: "매장 이름을 입력해주세요." };
  if (input.address.trim() && !input.addressDetail.trim()) return { error: "상세주소(층 · 호수)를 입력해주세요." };
  if (!input.ownerName.trim()) return { error: "대표자(원장님) 이름을 입력해주세요." };
  if (digits(input.ownerPhone).length < 10) return { error: "휴대폰 번호를 확인해주세요." };
  const biz = digits(input.bizNo);
  if (biz && biz.length !== 10) return { error: "사업자등록번호는 숫자 10자리예요." };

  const { data: auth } = await raw.auth.getSession();
  const user = auth.session?.user;
  if (!user) return { error: "로그인이 풀렸어요. 다시 로그인해주세요." };

  const ref = (input.referralCode ?? "").trim().toUpperCase();
  if (ref) {
    if (!validRepCode(ref)) return { error: "추천 코드를 확인해주세요. 예) IC01-0217-T" };
    const { data: ok } = await createClient().rpc("check_referral_code", { p_code: ref });
    if (!ok) return { error: "없는 추천 코드예요. 영업 담당자에게 코드를 다시 확인해주세요." };
  }

  const nv = input.naverLater ? { url: "", id: null } : await resolveNaverPlace(input.naverUrl ?? "");
  if (nv.error) return { error: nv.error };

  let store = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const inserted = await raw.from("stores").insert({
      owner_id: user.id,
      form: input.shopType,
      category: input.industry,
      name: input.shopName.trim(),
      address: [input.address.trim(), input.addressDetail.trim()].filter(Boolean).join(" "),
      designer_count: input.shopType === "solo" ? 1 : Math.max(1, Math.min(200, input.expectedDesigners || 1)),
      owner_also_designs: input.shopType === "solo" || input.ownerDoesService,
      phone: input.shopPhone || input.ownerPhone,
      biz_name: input.shopName.trim(),
      representative: input.ownerName.trim(),
      biz_number: biz || "",
      status: "pending",
      invite_code: inviteCode(),
    }).select("*").single();
    if (!inserted.error) { store = inserted.data; break; }
    lastError = inserted.error;
    if (!/invite_code|duplicate/i.test(inserted.error.message)) break;
  }
  if (!store) return { error: `가입 신청을 저장하지 못했어요: ${dbErrorMessage(lastError)}` };

  const members = [{ store_id: store.id, user_id: user.id, role: "owner", display_name: input.ownerName.trim() }];
  if (input.shopType === "solo" || input.ownerDoesService) members.push({ store_id: store.id, user_id: user.id, role: "staff", display_name: input.ownerName.trim() });
  await raw.from("store_members").insert(members);

  const { data: templates } = await raw.from("menu_templates").select("id, name, duration_min, price_krw, revisit_cycle_days, sort_order").eq("category_id", input.industry).order("sort_order");
  if (templates?.length) {
    await raw.from("store_menus").insert(templates.map((item) => ({
      store_id: store.id, template_id: item.id, name: item.name, duration_min: item.duration_min, price_krw: item.price_krw, revisit_cycle_days: item.revisit_cycle_days, sort_order: item.sort_order,
    })));
  }
  await raw.from("store_setup").insert({ store_id: store.id });

  // 클라우드 매장 표에 없는 칸(우편번호 · 네이버 플레이스)은 이 브라우저에 덧붙여 저장
  const { patchOverlay } = await import("@/src/lib/supabase/local-db");
  patchOverlay("shops", store.id, {
    postcode: input.postcode.trim() || null, address_detail: input.addressDetail.trim() || null, length_mode: input.industry === "hair" ? "extension" : "item",
    naver_place_url: nv.url || null, naver_place_id: nv.id, naver_login_id: input.naverLater ? null : (input.naverLogin ?? "").trim().slice(0, 60) || null,
    naver_status: input.naverLater ? "skipped" : nv.url ? "entered" : "none",
  });
  if (ref) setReferral(store.id, ref);
  try { localStorage.setItem("salonai_shop", store.id); } catch { /* 저장 불가 */ }
  return { shopId: store.id };
}

/** 서류 사진 경로: 보관소가 연결되기 전이라 저장할 것이 없어요 */
export async function saveDocPaths(_shopId?: string, _paths?: unknown) { /* 연결 전 */ }
