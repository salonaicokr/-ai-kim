"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import { getOps } from "@/src/lib/ops";
import BillingEditor, { type BillingConfig } from "./billing";
import PolicyEditor, { type Rule } from "./policy";


export default function OpsSettings() {
  return <Suspense fallback={<div className="skel" style={{ minHeight: 400 }} />}><Body /></Suspense>;
}

async function BodyImpl() {
  const { supabase, me } = await getOps();
  const [cfg, rules] = await Promise.all([
    me?.can.billing ? supabase.rpc("hq_billing_config") : Promise.resolve({ data: null }),
    me?.can.settle ? supabase.rpc("hq_commission_rules") : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <div><p className="crumb">운영 · 요금 · 정책</p><h1 className="h1">요금표 · 인센티브 정책</h1>
        <p className="sm">지금 금액은 모두 임시값이에요. 여기서 바꾸면 다음 청구부터 적용되고, 바꾼 내용은 아래 이력에 남아요.</p></div>
      {cfg.data ? <BillingEditor initial={cfg.data as BillingConfig} /> : <section className="card"><p className="sm">요금표는 재무 · 마스터 역할만 볼 수 있어요.</p></section>}
      {rules.data ? <PolicyEditor initial={rules.data as Rule[]} canEdit={!!me?.can.admin} /> : null}
    </>
  );
}
const Body = asyncComp(BodyImpl);
