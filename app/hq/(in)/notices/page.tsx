"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import { getOps } from "@/src/lib/ops";
import Notices, { type Notice } from "./notices";


/** 본사 공지: 모든 매장 홈 ‘본사 공지사항’에 나가요 (쓰기 = 마스터 · CS) */
export default function NoticesPage() {
  return <Suspense fallback={<div className="skel" style={{ minHeight: 300 }} />}><Body /></Suspense>;
}

async function BodyImpl() {
  const { supabase, me } = await getOps();
  const { data } = await supabase.from("hq_notices").select("id, no, title, body, important, published_at").order("published_at", { ascending: false }).limit(200);
  return (
    <>
      <div><p className="crumb">운영 · 공지</p><h1 className="h1">본사 공지</h1>
        <p className="sm">여기 쓴 공지는 모든 매장 ERP 홈 ‘본사 공지사항’과 공지 목록에 바로 보여요. 중요 공지는 맨 위에 [중요]로 고정돼요.</p></div>
      <Notices initial={(data ?? []) as Notice[]} canEdit={!!me?.can.store} />
    </>
  );
}
const Body = asyncComp(BodyImpl);
