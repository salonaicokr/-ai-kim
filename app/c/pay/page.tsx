"use client";
// @ts-nocheck

import Link from "next/link";
import { useEffect, useState } from "react";
import { msgOf, rpc, when, whenLong, won } from "@/src/lib/customer/api";
import { Loading, Page, Pill, Top, useGuard } from "../ui";

const METHOD: Record<string, string> = { cash: "현금", card_terminal: "카드", naver_pay: "N페이", transfer: "계좌이체", other: "앱 결제" };

export default function Pay() {
  const g = useGuard();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (g.ready) rpc("c_payments").then(setD).catch((e) => setErr(msgOf(e))); }, [g.ready]);
  if (!g.ready || (!d && !err)) return <main className="cpage"><Top back="/c/my" title="결제" /><Loading /></main>;
  const total = (d?.paid ?? []).reduce((a: number, p: any) => a + (p.type === "paid" ? p.amount : -p.amount), 0);
  return (
    <Page tabbed={false}>
      <Top back="/c/my" title="결제" />
      {err && <p className="cmsg err" role="alert">{err}</p>}
      <section className="clist">
        <h2 className="ch2">결제 요청</h2>
        {d?.requests?.length ? d.requests.map((r: any) => (
          <Link key={r.id} href={`/c/pay/${r.id}`} className="citem" style={{ borderColor: "var(--a)" }}>
            <div className="cstack"><b>{r.store}</b><span className="cmt">{r.designer ? `${r.designer} · ` : ""}{when(r.start)}</span><span className="cmt">{(r.lines ?? []).map((l: any) => l.name).join(" + ")}</span></div>
            <div style={{ alignSelf: "center", textAlign: "right" }}><b style={{ fontSize: 18 }}>{won(r.amount)}</b><br /><Pill>결제하기</Pill></div>
          </Link>
        )) : <p className="cmt">기다리는 결제 요청이 없어요.</p>}
      </section>
      <section className="clist">
        <div className="csec"><h2>결제 내역</h2><span className="csp" /><span className="cmt">합계 {won(total)}</span></div>
        {d?.paid?.length ? d.paid.map((p: any) => (
          <Link key={p.id} href={`/c/receipt/${p.booking_id}`} className="citem">
            <div className="cstack"><b>{p.store}</b><span className="cmt">{p.service}</span><span className="cmt">{METHOD[p.method] ?? p.method} · {whenLong(p.paid_at)}</span></div>
            <b style={{ alignSelf: "center" }}>{p.type === "paid" ? "" : "-"}{won(p.amount)}</b>
          </Link>
        )) : <p className="cmt">결제 내역이 아직 없어요.</p>}
      </section>
    </Page>
  );
}
