"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import { getOps } from "@/src/lib/ops";
import OrgsEditor from "./orgs";
import type { Overview } from "../types";


export default function OrgsPage() {
  return <Suspense fallback={<div className="skel" style={{ minHeight: 400 }} />}><Body /></Suspense>;
}
async function BodyImpl() {
  const { supabase } = await getOps();
  const [{ data }, { data: regions }] = await Promise.all([supabase.rpc("hq_sales_overview"), supabase.rpc("hq_regions")]);
  return (
    <>
      <div><p className="crumb">운영 · 영업 · 영업조직</p><h1 className="h1">영업조직</h1>
        <p className="sm">본부 · 지사 · 영업소 · 에이전시를 트리로 관리해요. 지역명만 한글로 쓰면 영업소 코드(예 인천 → IC01)가 자동으로 붙고, 문을 닫으면 지우지 않고 비활성으로 남겨요.</p></div>
      <OrgsEditor initial={(data ?? { orgs: [], reps: [] }) as Overview} regions={(regions ?? []) as { name: string; prefix: string; orgs: number }[]} />
    </>
  );
}
const Body = asyncComp(BodyImpl);
