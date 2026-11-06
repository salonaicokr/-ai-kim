// @ts-nocheck
import type { Metadata } from "next";
import { Suspense } from "react";
import { getShopContext } from "@/src/lib/session";
import type { MenuKind } from "@/src/lib/menu";
import Calendar, { type Designer, type MenuOpt } from "./calendar";
import { minsOfDay, ymdOf } from "./lib";

export const metadata: Metadata = { title: "예약 캘린더" };

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="skel" style={{ minHeight: 640 }} />}>
      <CalendarLoader />
    </Suspense>
  );
}

async function CalendarLoader() {
  const { supabase, shop, member, perms } = await getShopContext();
  const [mem, menu] = await Promise.all([
    // 테스트 버전: 초대만 하고 아직 수락 전인 디자이너도 바로 캘린더에 보이게
    supabase.from("shop_members").select("id, display_name, title, role, is_designer, sort_order")
      .eq("shop_id", shop.id).in("status", ["active", "invited"]).order("sort_order").order("created_at"),
    supabase.from("menu_items").select("id, name, price, price_m, price_l, duration_min, status, sort_order, menu_categories(name, kind, default_duration_min, sort_order)")
      .eq("shop_id", shop.id).eq("status", "active").order("sort_order"),
  ]);
  const designers: Designer[] = (mem.data ?? [])
    .filter((m) => m.is_designer || m.role === "owner")
    .map((m) => ({ id: m.id, name: m.display_name, title: m.title }));
  type Cat = { name: string; kind: MenuKind; default_duration_min: number; sort_order: number };
  const menus: MenuOpt[] = (menu.data ?? []).map((m) => {
    const c = m.menu_categories as unknown as Cat;
    return { id: m.id, name: m.name, price: m.price, priceM: m.price_m, priceL: m.price_l, minutes: m.duration_min ?? c.default_duration_min, cat: c.name, kind: c.kind, catOrder: c.sort_order };
  }).sort((a, b) => a.catOrder - b.catOrder);

  // 로그인 정보를 읽은 뒤(요청 시점)라 현재 시각을 써도 돼요
  const now = new Date();
  return (
    <Calendar
      today={ymdOf(now)}
      nowMin={minsOfDay(now.toISOString())}
      shopId={shop.id}
      myMemberId={member.id}
      shopName={shop.name}
      designers={designers}
      menus={menus}
      canViewAll={perms.bk_view === "all"}
      canEditAll={perms.bk_edit === "all"}
      canEditOwn={perms.bk_edit === "own"}
      payPerm={(perms.pay ?? "none") as "none" | "own" | "all"}
      refundPerm={(perms.refund ?? "none") as "none" | "own" | "all"}
      recPerm={(perms.rec ?? "none") as "none" | "own" | "all"}
    />
  );
}
