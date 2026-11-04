"use client";

import { useEffect, useState } from "react";
import MenuEditor from "@/src/salon/menu/menu-editor";
import { createClient } from "@/src/lib/supabase/client";
import { useDesk } from "@/src/components/DeskFrame";

export default function MenusPage() {
  const desk = useDesk();
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!desk?.store) return undefined;
    const supabase = createClient();
    let alive = true;
    supabase.from("menu_items").select("*").eq("shop_id", desk.store.id).then(({ data }) => {
      if (alive) setItems(data ?? []);
    });
    return () => { alive = false; };
  }, [desk?.store]);

  if (!desk?.store || !items) return <p className="empty">메뉴를 불러오는 중입니다.</p>;
  const category = { id: "menu", name: "메뉴", kind: "etc", point_earn: false, point_use: false, grade_discount: false, default_duration_min: 60, sort_order: 0 };
  return (
    <MenuEditor
      shopId={desk.store.id}
      shopName={desk.store.name}
      canEdit
      initialCats={[category]}
      initialItems={items.map((item) => ({
        id: item.id,
        category_id: "menu",
        name: item.name,
        price: item.price,
        price_m: null,
        price_l: null,
        duration_min: item.duration_min,
        status: item.status ?? "active",
        sort_order: item.sort_order ?? 0,
      }))}
    />
  );
}
