// @ts-nocheck
import { supabase as raw } from "@/src/lib/browser";
import { createClient } from "@/src/lib/supabase/client";
import { RedirectSignal } from "@/src/lib/compat";

export type Perm = "none" | "own" | "all";
export type Permissions = Record<string, Perm>;
export const SHOP_COOKIE = "salonai_shop";

const ALL: Permissions = {
  bk_view: "all", bk_edit: "all", bk_ok: "all", cust: "all", phone: "all", rec: "all", msg: "all",
  pay: "all", refund: "all", sales: "all", settle: "all", export: "all", menu: "all", invite: "all", report: "all", perm: "all", settings: "all",
};

const shopOf = (s) => ({
  id: s.id, name: s.name, status: s.status === "approved" ? "active" : s.status, industries: [s.category], shop_type: s.form,
});

/** 로그인한 원장 + 지금 보고 있는 매장 + 내 권한 (서버 쿠키 대신 브라우저 로그인 · localStorage 로 매장 선택) */
export async function getShopContext() {
  const supabase = createClient();
  const { data: auth } = await raw.auth.getSession();
  const user = auth.session?.user;
  if (!user) throw new RedirectSignal("/login");
  const { data: stores } = await raw.from("stores").select("*").eq("owner_id", user.id).order("created_at");
  if (!stores?.length) throw new RedirectSignal("/signup");
  let picked = null;
  try { picked = localStorage.getItem(SHOP_COOKIE); } catch { /* 저장 불가 환경 */ }
  const store = stores.find((s) => s.id === picked) ?? stores[0];
  const { data: members } = await raw.from("store_members").select("*").eq("store_id", store.id).eq("user_id", user.id);
  const mine = members?.find((m) => m.role === "owner") ?? members?.[0];
  const member = {
    id: mine?.id ?? user.id, shop_id: store.id, role: "owner", title: "원장", display_name: mine?.display_name ?? "원장",
    created_at: store.created_at, shops: shopOf(store),
  };
  return {
    supabase,
    user,
    member,
    shop: shopOf(store),
    shops: stores.map((s) => ({ id: s.id, name: s.name, status: s.status === "approved" ? "active" : s.status, role: "owner" })),
    perms: ALL,
    brand: null,
  };
}
