"use client";

import { useEffect, useState } from "react";
import MenuEditor from "@/src/salon/menu/menu-editor";
import { createClient } from "@/src/lib/supabase/client";
import { KINDS } from "@/src/lib/menu";
import { useDesk } from "@/src/components/DeskFrame";

const kindGuess = (name = "") => {
  if (name.includes("열펌") || name.includes("매직")) return "heat_perm";
  if (name.includes("펌")) return "perm";
  if (name.includes("염색") || name.includes("탈색")) return "color";
  if (name.includes("클리닉")) return "clinic";
  if (name.includes("드라이")) return "dry";
  if (name.includes("컷") || name.includes("커트")) return "cut";
  return "etc";
};

export default function MenusPage() {
  const desk = useDesk();
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!desk?.store) return undefined;
    const supabase = createClient();
    let alive = true;
    (async () => {
      const [cats, items, shop] = await Promise.all([
        supabase.from("menu_categories").select("*").eq("shop_id", desk.store.id).order("sort_order"),
        supabase.from("menu_items").select("*").eq("shop_id", desk.store.id).order("sort_order"),
        supabase.from("shops").select("length_mode").eq("id", desk.store.id).single(),
      ]);
      let catRows = cats.data ?? [];
      let rows = items.data ?? [];
      if (catRows.some((cat) => cat.id === "menu")) {
        await supabase.from("menu_categories").delete().eq("id", "menu");
        catRows = catRows.filter((cat) => cat.id !== "menu");
      }
      // 분류 없이 만들어진 기존 메뉴는 이름으로 종류(컷 · 펌 · 염색…)를 추정해 분류를 만들어 묶어요
      const orphans = rows.filter((row) => !catRows.some((cat) => cat.id === row.category_id));
      if (orphans.length) {
        const groups = new Map();
        for (const row of orphans) {
          const kind = kindGuess(row.name);
          groups.set(kind, [...(groups.get(kind) ?? []), row.id]);
        }
        for (const [kind, ids] of groups) {
          const id = `auto-${kind}`;
          if (!catRows.some((cat) => cat.id === id)) {
            const made = { id, shop_id: desk.store.id, name: KINDS.find((k) => k.value === kind)?.label ?? "기타", kind, point_earn: false, point_use: false, grade_discount: false, default_duration_min: 60, sort_order: catRows.length };
            await supabase.from("menu_categories").insert(made);
            catRows = [...catRows, made];
          }
          await supabase.from("menu_items").update({ category_id: id }).in("id", ids);
        }
        rows = rows.map((row) => (orphans.includes(row) ? { ...row, category_id: `auto-${kindGuess(row.name)}` } : row));
      }
      if (alive) setState({ cats: catRows, items: rows, lengthMode: shop.data?.length_mode ?? "item" });
    })();
    return () => { alive = false; };
  }, [desk?.store]);

  if (!desk?.store || !state) return <p className="empty">메뉴를 불러오는 중입니다.</p>;
  return (
    <MenuEditor
        shopId={desk.store.id}
        shopName={desk.store.name}
        canEdit
        initialCats={state.cats}
        initialItems={state.items.map((item) => ({
          id: item.id,
          category_id: item.category_id ?? "menu",
          name: item.name,
          price: item.price,
          price_m: item.price_m ?? null,
          price_l: item.price_l ?? null,
          duration_min: item.duration_min,
          status: item.status ?? "active",
          sort_order: item.sort_order ?? 0,
        }))}
        lengthMode={state.lengthMode}
      />
  );
}
