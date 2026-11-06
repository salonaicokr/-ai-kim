"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import { getOps } from "@/src/lib/ops";
import RepsEditor from "./reps";
import type { Overview } from "../types";


export default function RepsPage() {
  return <Suspense fallback={<div className="skel" style={{ minHeight: 400 }} />}><Body /></Suspense>;
}
async function BodyImpl() {
  const { supabase } = await getOps();
  const { data } = await supabase.rpc("hq_sales_overview");
  return (
    <>
      <div><p className="crumb">운영 · 영업 · 영업사원</p><h1 className="h1">영업사원 등록 · 영업코드</h1>
        <p className="sm">영업코드는 <b>이 화면에서만</b> 태어나요. 등록하면 한 번 자동 발급되고, 바꾸거나 다시 발급할 수 없어요. 매장에는 코드를 ‘선택’만 해요.</p></div>
      <RepsEditor initial={(data ?? { orgs: [], reps: [] }) as Overview} />
    </>
  );
}
const Body = asyncComp(BodyImpl);
