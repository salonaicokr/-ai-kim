"use client";

import { useEffect, useState } from "react";
import MembersEditor from "@/src/salon/members/members-editor";
import { createClient } from "@/src/lib/supabase/client";
import { useDesk } from "@/src/components/DeskFrame";

export default function MembersPage() {
  const desk = useDesk();
  const [members, setMembers] = useState(null);

  useEffect(() => {
    if (!desk?.store) return undefined;
    const supabase = createClient();
    let alive = true;
    supabase.from("shop_members").select("*").eq("shop_id", desk.store.id).then(({ data }) => {
      if (alive) setMembers(data ?? []);
    });
    return () => { alive = false; };
  }, [desk?.store]);

  if (!desk?.store || !members) return <p className="empty">구성원을 불러오는 중입니다.</p>;
  const me = members.find((member) => member.role === "owner") ?? members[0];
  return (
    <MembersEditor
      shopId={desk.store.id}
      shopName={desk.store.name}
      myId={me?.id ?? ""}
      isOwner
      canPerm
      canInvite
      initialMembers={members}
      logs={[]}
    />
  );
}
