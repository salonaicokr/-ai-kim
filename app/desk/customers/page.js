"use client";

import { useEffect, useState } from "react";
import Customers from "@/src/salon/customers/customers";
import { createClient } from "@/src/lib/supabase/client";
import { useDesk } from "@/src/components/DeskFrame";

export default function CustomersPage() {
  const desk = useDesk();
  const [ready, setReady] = useState(null);

  useEffect(() => {
    if (!desk?.store) return undefined;
    const supabase = createClient();
    let alive = true;
    Promise.all([
      supabase.from("v_shop_customers").select("*").eq("shop_id", desk.store.id).order("name"),
      supabase.from("shop_members").select("*").eq("shop_id", desk.store.id),
      supabase.from("shops").select("inflow_sources").eq("id", desk.store.id).single(),
    ]).then(([customers, members, shop]) => {
      if (!alive) return;
      setReady({
        customers: customers.data ?? [],
        inflows: shop.data?.inflow_sources ?? ["네이버", "인스타", "지인소개", "지나가다", "기타"],
        designers: (members.data ?? []).filter((member) => member.is_designer || member.role === "owner").map((member) => ({ id: member.id, name: member.display_name })),
      });
    });
    return () => { alive = false; };
  }, [desk?.store]);

  if (!desk?.store || !ready) return <p className="empty">고객을 불러오는 중입니다.</p>;
  const me = ready.designers[0]?.id ?? "none";
  return (
    <Customers
      shopId={desk.store.id}
      myMemberId={me}
      initial={ready.customers}
      designers={ready.designers}
      inflows={ready.inflows}
      canAdd
      canEditAll
      canEditOwn
      seeAll
      fullPhone
      canCharge={false}
    />
  );
}
