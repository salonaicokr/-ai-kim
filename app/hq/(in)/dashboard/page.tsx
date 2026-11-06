"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import Link from "next/link";
import { getOps } from "@/src/lib/ops";
import { STATUS_KO, TYPE_KO, ymd, type StoreRow } from "../types";


export default function OpsDashboard() {
  return <Suspense fallback={<div className="skel" style={{ minHeight: 320 }} />}><Body /></Suspense>;
}

async function BodyImpl() {
  const { supabase } = await getOps();
  const { data } = await supabase.rpc("hq_stores");
  const rows = (data ?? []) as StoreRow[];
  const by = (s: string) => rows.filter((r) => r.status === s);
  const pending = by("pending");
  return (
    <>
      <div><p className="crumb">운영 · 대시보드</p><h1 className="h1">전체 매장 현황</h1></div>
      <section className="grid g4">
        <div className="card kpi"><p className="lbl">전체 매장</p><p className="big">{rows.length}</p></div>
        <Link href="/hq/stores?status=pending" className="card kpi amb"><p className="lbl">승인 대기</p><p className="big">{pending.length}</p></Link>
        <Link href="/hq/stores?status=active" className="card kpi teal"><p className="lbl">운영중</p><p className="big">{by("active").length}</p></Link>
        <Link href="/hq/stores?status=suspended" className="card kpi red"><p className="lbl">정지</p><p className="big">{by("suspended").length}</p></Link>
      </section>
      <section className="card">
        <div className="row"><h2 className="b">승인 대기 매장</h2><span className="sp" /><Link className="sm" href="/hq/stores?status=pending">전체 보기 →</Link></div>
        {pending.length === 0 ? <p className="sm" style={{ marginTop: 8 }}>승인 대기 중인 매장이 없어요.</p> : (
          <ul className="list" style={{ marginTop: 8 }}>
            {pending.slice(0, 8).map((r) => (
              <li key={r.id}>
                <Link href={`/hq/stores/${r.id}`} className="b">{r.name}</Link>
                <span className="sm">{r.owner ?? "-"} · {TYPE_KO[r.type]} · {ymd(r.created)} 신청</span>
                <span className="sp" /><span className="pill p-amb">{STATUS_KO[r.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
const Body = asyncComp(BodyImpl);
