"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getOps } from "@/src/lib/ops";
import Settlement, { type View, type RunRow } from "./settlement";


/** 2단계: 매장 영업매출 월 마감 → 0.1% 인센티브 계산 → 확정 → 지급완료 · 엑셀 */
export default function SettlementPage() {
  const m = useSearchParams().get("m") ?? undefined;
  return <Suspense fallback={<div className="skel" style={{ minHeight: 300 }} />}><Body m={m} /></Suspense>;
}

const prevMonth = () => {
  const now = new Date(Date.now() + 9 * 3600e3);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
};

async function BodyImpl({ m }: { m?: string }) {
  const { supabase, me } = await getOps();
  const period = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : prevMonth();
  const [v, runs] = await Promise.all([
    supabase.rpc("hq_settlement_view", { p_period: period }),
    supabase.rpc("hq_settlement_runs"),
  ]);
  return (
    <>
      <div><p className="crumb">운영 · 정산</p><h1 className="h1">인센티브 정산</h1>
        <p className="sm">매장 영업매출(구독료 제외 · 실결제 + 정액권 판매 − 환불)의 0.1%를 담당 영업사원에게 배정 비율대로 나눠요.
          매월 말일이 지나면 마감(계산) → 확인 후 확정 → 지급하면 지급완료. 확정한 달은 금액을 바꿀 수 없어요.</p></div>
      <Settlement key={period} period={period} initial={(v.data ?? { period, status: null }) as View} runs={(runs.data ?? []) as RunRow[]} canPay={!!me?.can.payout} />
    </>
  );
}
const Body = asyncComp(BodyImpl);
