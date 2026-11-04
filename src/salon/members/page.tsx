import type { Metadata } from "next";
import { Suspense } from "react";
import { getShopContext } from "@/src/lib/session";
import MembersEditor, { type Member, type Log } from "./members-editor";

export const metadata: Metadata = { title: "구성원 · 권한" };

export default function MembersPage() {
  return (
    <Suspense fallback={<div className="skel" style={{ minHeight: 480 }} />}>
      <MembersLoader />
    </Suspense>
  );
}

async function MembersLoader() {
  const { supabase, shop, member, perms } = await getShopContext();
  const isOwner = member.role === "owner";
  const [members, logs] = await Promise.all([
    supabase.from("shop_members")
      .select("id, user_id, display_name, role, title, permissions, status, is_designer, invite_code, invited_phone, sort_order")
      .eq("shop_id", shop.id).neq("status", "left").order("sort_order").order("created_at"),
    isOwner || perms.perm === "all"
      ? supabase.from("audit_logs").select("id, action, target_id, before, after, created_at").eq("shop_id", shop.id)
          .eq("target_table", "shop_members").order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] }),
  ]);
  return (
    <MembersEditor
      shopId={shop.id}
      shopName={shop.name}
      myId={member.id}
      isOwner={isOwner}
      canPerm={perms.perm === "all"}
      canInvite={perms.invite === "all"}
      initialMembers={(members.data ?? []) as Member[]}
      logs={(logs.data ?? []) as Log[]}
    />
  );
}
