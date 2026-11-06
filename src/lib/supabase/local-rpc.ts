"use client";
// @ts-nocheck

import { supabase as raw } from "@/src/lib/browser";
import { kv, localRows, patchOverlay, saveLocalRows, uid } from "./local-db";
import { hqState, shopBilling } from "./hq-backend";

const ALL_PERMS = {
  bk_view: "all", bk_edit: "all", bk_ok: "all", cust: "all", phone: "all", rec: "all", msg: "all",
  pay: "all", refund: "all", sales: "all", settle: "all", export: "all", menu: "all", invite: "all", report: "all", perm: "all", settings: "all",
};

type Handler = (args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> | { data: unknown; error: { message: string } | null };
const ok = (data: unknown = null) => ({ data, error: null });

export const RPC: Record<string, Handler> = {
  my_permissions: () => ok(ALL_PERMS),
  hours_conflicts: () => ok([]),
  set_length_mode: (a) => { patchOverlay("shops", String(a.p_shop), { length_mode: a.p_mode }); return ok(); },
  set_branch_manager: (a) => {
    const id = String(a.p_member);
    const rows = localRows("shop_members");
    if (rows.some((r) => r.id === id)) saveLocalRows("shop_members", rows.map((r) => (r.role === "branch_manager" && r.id !== id ? { ...r, role: "designer" } : r.id === id ? { ...r, role: "branch_manager" } : r)));
    else patchOverlay("shop_members", id, { role: "branch_manager" });
    return ok();
  },
  grace_take_down: () => ok(),
  demo_fill_survey: () => ok(),
  demo_approve: async (a) => { await raw.from("stores").update({ status: "approved" }).eq("id", a.p_shop); return ok(); },
  check_referral_code: (a) => {
    // 본사에 등록된 영업사원이 있으면 그 코드만 인정해요 (아직 하나도 없으면 형식만 확인)
    const reps = hqState().reps.filter((r) => r.active);
    return ok(reps.length === 0 || reps.some((r) => r.code === String(a.p_code ?? "").toUpperCase()));
  },
  store_home_summary: (a) => {
    // 본사 화면(/hq)에서 정한 요금제 · 부가서비스 상태를 그대로 보여줌
    const b = shopBilling(String(a.p_shop ?? ""));
    const planFee = Number(b.plan?.monthly_fee ?? 0);
    const addonFee = b.addons.filter((x) => x.status === "active").reduce((n, x) => n + Number(x.fee), 0);
    return ok({
      admin: true,
      app: { sent: 0, read: 0 },
      bill: { estimate: true, plan: b.plan?.name ?? "스탠다드", plan_fee: planFee, addon_fee: addonFee, msg_fee: 0, total: planFee + addonFee, next: null, state: b.state },
      addons: b.addons.map((x) => ({ code: x.code, name: x.name, fee: x.fee, status: x.status === "none" ? (x.available ? "none" : "preparing") : x.status })),
    });
  },
};
export async function localRpc(name: string, args: Record<string, unknown>) {
  const handler = RPC[name];
  if (!handler) return { data: null, error: { message: "이 동작은 아직 연결되지 않았습니다." } };
  try {
    return await handler(args);
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "처리하지 못했어요." } };
  }
}

export { kv, uid };
