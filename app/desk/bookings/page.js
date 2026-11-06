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
      supabase.from("shop_business_hours").select("weekday, is_closed, open_time, close_time, break_start, break_end").eq("shop_id", desk.store.id),
      supabase.from("shop_holidays").select("id, start_date, end_date, reason").eq("shop_id", desk.store.id),
      supabase.from("shops").select("length_mode").eq("id", desk.store.id).single(),
      supabase.from("menu_categories").select("*").eq("shop_id", desk.store.id),
    ]).then(([members, menus, hours, holidays, shop, cats]) => {
      const catById = new Map((cats.data ?? []).map((cat) => [cat.id, cat]));
      const extMode = shop.data?.length_mode === "extension";
      if (!alive) return;
      const staffUsers = new Set((members.data ?? []).filter((member) => member.role === "designer" && member.user_id).map((member) => member.user_id));
      const designers = (members.data ?? [])
        .filter((member) => (member.is_designer || member.role === "owner") && !(member.role === "owner" && staffUsers.has(member.user_id)))
        .map((member) => ({ id: member.id, name: member.display_name, title: member.title || "" }));
      const menuOpts = (menus.data ?? []).filter((menu) => menu.status !== "paused").map((menu) => {
        const cat = catById.get(menu.category_id);
        const fallback = menu.menu_categories;
        return {
          id: menu.id,
          name: menu.name,
          price: menu.price,
          priceM: extMode ? null : menu.price_m ?? null,
          priceL: extMode ? null : menu.price_l ?? null,
          minutes: menu.duration_min || cat?.default_duration_min || fallback?.default_duration_min || 60,
          // 시술 분류(컷 · 염색…)에 맞는 색으로 캘린더에 표시 · 분류가 없으면 이름으로 추정
          cat: cat?.name ?? fallback?.name ?? "메뉴",
          kind: cat && cat.id !== "menu" ? cat.kind : fallback?.kind ?? "etc",
          catOrder: cat?.sort_order ?? menu.sort_order ?? 0,
        };
      });
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
        hours: hours.data ?? [],
        holidays: holidays.data ?? [],
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
      hours={ready.hours}
      holidays={ready.holidays}
    />
  );
}
