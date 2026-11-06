"use client";

import { useEffect, useState } from "react";
import MembersEditor from "@/src/salon/members/members-editor";
import { createClient } from "@/src/lib/supabase/client";
import { useDesk } from "@/src/components/DeskFrame";

export default function MembersPage() {
  const desk = useDesk();
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!desk?.store) return undefined;
    const supabase = createClient();
    let alive = true;
    Promise.all([
      supabase.from("shop_members").select("*").eq("shop_id", desk.store.id).neq("status", "left").order("sort_order").order("created_at"),
      supabase.from("audit_logs").select("id, action, target_id, before, after, created_at").eq("shop_id", desk.store.id)
        .eq("target_table", "shop_members").order("created_at", { ascending: false }).limit(30),
    ]).then(([members, logs]) => {
      if (alive) setState({ members: members.data ?? [], logs: logs.data ?? [] });
    });
    return () => { alive = false; };
  }, [desk?.store]);

  if (!desk?.store || !state) return <p className="empty">구성원을 불러오는 중입니다.</p>;
  const me = state.members.find((member) => member.role === "owner") ?? state.members[0];
  return (
    <MembersEditor
        branchOf={null}
        shopId={desk.store.id}
        shopName={desk.store.name}
        myId={me?.id ?? ""}
        isOwner
        isMaster
        canPerm
        canInvite
        initialMembers={state.members}
        logs={state.logs}
      />
  );
}
