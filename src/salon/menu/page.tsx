import type { Metadata } from "next";
import { Suspense } from "react";
import { getShopContext } from "@/src/lib/session";
import type { Category, Item } from "@/src/lib/menu";
import MenuEditor from "./menu-editor";

export const metadata: Metadata = { title: "시술 메뉴" };

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="skel" style={{ minHeight: 480 }} />}>
      <MenuLoader />
    </Suspense>
  );
}

async function MenuLoader() {
  const { supabase, shop, perms } = await getShopContext();
  const [cats, items] = await Promise.all([
    supabase.from("menu_categories").select("id, name, kind, point_earn, point_use, grade_discount, default_duration_min, sort_order").eq("shop_id", shop.id).order("sort_order"),
    supabase.from("menu_items").select("id, category_id, name, price, price_m, price_l, duration_min, status, sort_order").eq("shop_id", shop.id).order("sort_order"),
  ]);
  return (
    <MenuEditor
      shopId={shop.id}
      shopName={shop.name}
      canEdit={perms.menu === "all"}
      initialCats={(cats.data ?? []) as Category[]}
      initialItems={(items.data ?? []) as Item[]}
    />
  );
}
