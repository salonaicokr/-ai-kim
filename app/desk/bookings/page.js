"use client";

import { useEffect, useState } from "react";
import Calendar from "@/src/salon/calendar/calendar";
import { createClient } from "@/src/lib/supabase/client";
import { useDesk } from "@/src/components/DeskFrame";

export default function BookingsPage() {
  const desk = useDesk();
  const [ready, setReady] = useState(null);

  useEffect(() => {
    if (!desk?.store) return undefined;
    const supabase = createClient();
    let alive = true;
    Promise.all([
      supabase.from("shop_members").select("*").eq("shop_id", desk.store.id),
      supabase.from("menu_items").select("*").eq("shop_id", desk.store.id),
    ]).then(([members, menus]) => {
      if (!alive) return;
      const designers = (members.data ?? [])
        .filter((member) => member.is_designer || member.role === "owner")
        .map((member) => ({ id: member.id, name: member.display_name, title: member.title || "" }));
      const menuOpts = (menus.data ?? []).map((menu) => ({
        id: menu.id,
        name: menu.name,
        price: menu.price,
        priceM: null,
        priceL: null,
        minutes: menu.duration_min || menu.menu_categories?.default_duration_min || 60,
        cat: menu.menu_categories?.name ?? "메뉴",
        kind: menu.menu_categories?.kind ?? "etc",
        catOrder: menu.sort_order ?? 0,
      }));
      const now = new Date();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
      const nowMin = Number(parts.find((part) => part.type === "hour").value) * 60 + Number(parts.find((part) => part.type === "minute").value);
      setReady({
        shopId: desk.store.id,
        designers: designers.length ? designers : [{ id: "none", name: "담당", title: "" }],
        menus: menuOpts,
        today,
        nowMin,
      });
    });
    return () => { alive = false; };
  }, [desk?.store]);

  if (!desk?.store || !ready) return <p className="empty">캘린더를 불러오는 중입니다.</p>;
  return (
    <Calendar
      shopId={ready.shopId}
      shopName={desk.store.name}
      myMemberId={ready.designers[0].id}
      designers={ready.designers}
      menus={ready.menus}
      canViewAll
      canEditAll
      canEditOwn
      payPerm="all"
      refundPerm="all"
      recPerm="none"
      today={ready.today}
      nowMin={ready.nowMin}
    />
  );
}
