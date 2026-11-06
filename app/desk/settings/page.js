"use client";

import { useEffect, useState } from "react";
import Settings from "@/src/salon/settings/settings";
import { createClient } from "@/src/lib/supabase/client";
import { useDesk } from "@/src/components/DeskFrame";
import CustomerInvite from "@/src/salon/settings/customer-invite";

export default function SettingsPage() {
  const desk = useDesk();
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!desk?.store) return undefined;
    const supabase = createClient();
    const shopId = desk.store.id;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    let alive = true;
    Promise.all([
      supabase.from("shop_members").select("*").eq("shop_id", shopId).neq("status", "left").order("created_at"),
      supabase.from("shops").select("name, phone, postcode, address, address_detail, inflow_sources, naver_place_url, naver_place_id, naver_login_id, naver_status").eq("id", shopId).single(),
      supabase.from("shop_business_hours").select("weekday, is_closed, open_time, close_time, break_start, break_end").eq("shop_id", shopId),
      supabase.from("shop_holidays").select("id, start_date, end_date, reason").eq("shop_id", shopId).gte("end_date", today).order("start_date"),
      supabase.from("shop_events").select("id, event_date, title").eq("shop_id", shopId).gte("event_date", today).order("event_date").limit(60),
      supabase.from("member_offs").select("id, member_id, off_date, kind, memo").eq("shop_id", shopId).gte("off_date", today).order("off_date").limit(100),
    ]).then(([members, info, hours, holidays, events, offs]) => {
      if (alive) setState({ members: members.data ?? [], info: info.data, hours: hours.data ?? [], holidays: holidays.data ?? [], events: events.data ?? [], offs: offs.data ?? [] });
    });
    return () => { alive = false; };
  }, [desk?.store]);

  if (!desk?.store || !state) return <p className="empty">설정을 불러오는 중입니다.</p>;
  const store = desk.store;
  const industries = store.category ? [store.category] : [];
  const staffUsers = new Set(state.members.filter((member) => member.role === "designer" && member.user_id).map((member) => member.user_id));
  const people = state.members.filter((member) => !(member.role === "owner" && staffUsers.has(member.user_id)));
  const admins = people
    .filter((member) => member.role === "owner" || member.role === "branch_manager" || member.permissions?.settings === "all")
    .map((member) => ({ id: member.id, name: member.display_name, title: member.title || "", owner: member.role === "owner" }));
  const info = state.info ?? { name: store.name, phone: null, postcode: null, address: null, address_detail: null };
  return (
    <>
    <CustomerInvite shopId={store.id} shopName={store.name} />
    <Settings
      shopId={store.id}
      shopName={store.name}
      shopType={store.form}
      shopStatus={store.status === "approved" ? "active" : store.status}
      industries={industries}
      isOwner
      admins={admins}
      canPerm
      info={info}
      hours={state.hours}
      holidays={state.holidays}
      naver={{
        naver_place_url: info.naver_place_url ?? null,
        naver_place_id: info.naver_place_id ?? null,
        naver_login_id: info.naver_login_id ?? null,
        naver_status: info.naver_status ?? "none",
      }}
      members={people.filter((member) => member.status === "active").map((member) => ({ id: member.id, name: member.display_name }))}
      events={state.events}
      offs={state.offs}
    />
    </>
  );
}
