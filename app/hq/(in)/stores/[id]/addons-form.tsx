"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";

export type ShopAddons = {
  plan: string; plans: { code: string; name: string; fee: number }[];
  addons: { code: string; name: string; fee: number; available: boolean; status: "active" | "preparing" | "none" }[];
};
const ST = { active: "사용 중", preparing: "준비 중", none: "미신청" } as const;
const won = (n: number) => n.toLocaleString("ko-KR");

/** 매장 요금제 (재무 · 마스터) + 부가서비스 사용 상태 (CS · 마스터). 매장 홈 ‘부가서비스 신청현황’ · 이용료(예상)에 바로 반영 */
export default function AddonsForm({ shopId, data, canPlan, canAddon }: { shopId: string; data: ShopAddons; canPlan: boolean; canAddon: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = data.plans.find((p) => p.code === data.plan);
  const total = (plan?.fee ?? 0) + data.addons.filter((a) => a.status === "active").reduce((s, a) => s + a.fee, 0);

  async function call(fn: "hq_set_shop_plan" | "hq_set_shop_addon", args: Record<string, string>, done: string) {
    setBusy(true); setMsg(null);
    const { error } = await createOpsBrowserClient().rpc(fn, { p_shop: shopId, ...args });
    setBusy(false);
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: done }); window.dispatchEvent(new Event("salonai:refresh"));
  }

  return (
    <div className="ops-addons">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="sm">요금제</span>
        {canPlan ? (
          <select className="input sm-sel" value={data.plan} disabled={busy} aria-label="요금제"
            onChange={(e) => call("hq_set_shop_plan", { p_plan: e.target.value }, "요금제를 바꿨어요.")}>
            {data.plans.map((p) => <option key={p.code} value={p.code}>{p.name} · 월 {won(p.fee)}원</option>)}
          </select>
        ) : <b>{plan?.name ?? data.plan}</b>}
        <span className="sp" /><span className="sm">이번 달 예상 이용료 <b>{won(total)}원</b> (문자 제외)</span>
      </div>
      <table className="ops-table ops-sett" style={{ marginTop: 10, minWidth: 0 }}>
        <thead><tr><th>부가서비스</th><th>월액</th><th>상태</th></tr></thead>
        <tbody>{data.addons.map((a) => (
          <tr key={a.code}>
            <th scope="row">{a.name}{!a.available && <span className="pill p-gray" style={{ marginLeft: 6 }}>판매 안 함</span>}</th>
            <td>{won(a.fee)}원</td>
            <td>{canAddon ? (
              <select className="input sm-sel" value={a.status} disabled={busy} aria-label={`${a.name} 상태`}
                onChange={(e) => call("hq_set_shop_addon", { p_code: a.code, p_status: e.target.value }, `${a.name}: ${ST[e.target.value as keyof typeof ST]}`)}>
                {(Object.keys(ST) as (keyof typeof ST)[]).map((k) => <option key={k} value={k}>{ST[k]}</option>)}
              </select>
            ) : ST[a.status]}</td>
          </tr>
        ))}</tbody>
      </table>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
    </div>
  );
}
