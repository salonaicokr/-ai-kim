"use client";
// @ts-nocheck

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { msgOf, rpc, whenLong, won } from "@/src/lib/customer/api";
import { Loading, Page, Top, useGuard } from "../../ui";

const METHOD: Record<string, string> = { cash: "현금", card_terminal: "카드", naver_pay: "N페이", transfer: "계좌이체", other: "앱 결제" };

/** 영수증 (예약 하나에 대한 결제 내역) */
export default function Receipt() {
  const { id } = useParams<{ id: string }>();
  const g = useGuard();
  const [b, setB] = useState<any>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (g.ready) rpc("c_booking_detail", { p_id: id }).then(setB).catch((e) => { setErr(msgOf(e)); setB(null); }); }, [g.ready, id]);
  if (!g.ready || b === undefined) return <main className="cpage"><Top back={`/c/booking/${id}`} /><Loading /></main>;
  if (!b) return <main className="cpage"><Top back="/c/pay" /><p className="cmsg err">{err ?? "내역을 찾지 못했어요"}</p></main>;
  const paid = b.payments.filter((p: any) => p.type === "paid").reduce((a: number, p: any) => a + p.amount, 0);
  const refunded = b.payments.filter((p: any) => p.type !== "paid").reduce((a: number, p: any) => a + p.amount, 0);
  return (
    <Page tabbed={false}>
      <Top back={`/c/booking/${id}`} title="영수증" />
      <div className="ccard" style={{ gap: 12 }}>
        <div style={{ textAlign: "center" }}><b style={{ fontSize: 18 }}>{b.store.name}</b><br /><span className="cmt">{b.store.address ?? ""}{b.store.phone ? ` · ${b.store.phone}` : ""}</span></div>
        <hr style={{ border: 0, borderTop: "1px dashed var(--bd)", width: "100%" }} />
        <dl className="cdl">
          <dt>일시</dt><dd>{whenLong(b.start)}</dd>
          {b.designer && <><dt>담당</dt><dd>{b.designer.name}</dd></>}
        </dl>
        {b.items.map((i: any, k: number) => <div key={k} className="crow"><span>{i.name}</span><span className="csp" /><span>{won(i.price)}</span></div>)}
        <hr style={{ border: 0, borderTop: "1px dashed var(--bd)", width: "100%" }} />
        {b.payments.map((p: any) => <div key={p.id} className="crow"><span>{p.type === "paid" ? "결제" : "환불"} · {METHOD[p.method] ?? p.method}</span><span className="csp" /><span>{p.type === "paid" ? "" : "-"}{won(p.amount)}</span></div>)}
        <div className="crow"><b>실 결제 금액</b><span className="csp" /><b style={{ fontSize: 20 }}>{won(paid - refunded)}</b></div>
        {b.payments[0] && <span className="cmt" style={{ textAlign: "center" }}>{whenLong(b.payments[0].paid_at)}</span>}
      </div>
      <Link href="/c/pay" className="cbtn">결제 내역으로</Link>
    </Page>
  );
}
