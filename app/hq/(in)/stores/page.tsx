"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import { getOps } from "@/src/lib/ops";
import StoresTable from "./table";
import type { StoreRow } from "../types";


export default function OpsStores() {
  return <Suspense fallback={<div className="skel" style={{ minHeight: 400 }} />}><Body /></Suspense>;
}

async function BodyImpl() {
  const { supabase } = await getOps();
  const { data } = await supabase.rpc("hq_stores");
  return (
    <>
      <div><p className="crumb">운영 · 매장</p><h1 className="h1">매장 목록</h1></div>
      <StoresTable rows={(data ?? []) as StoreRow[]} />
    </>
  );
}
const Body = asyncComp(BodyImpl);
