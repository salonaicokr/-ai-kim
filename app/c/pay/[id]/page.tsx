"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { msgOf, rpc, when, won } from "@/src/lib/customer/api";
import { Loading, Page, Top, useGuard } from "../../ui";

/** 결제 확인: 매장이 보낸 청구 내역을 보고 승인 (베타: 결제 완료 상태만 기록, 실제 카드 결제는 연결 전) */
export default function PayConfirm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const g = useGuard();
  const [r, setR] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!g.ready) return;
    rpc("c_payments").then((d) => setR((d.requests ?? []).find((x: any) => x.id === id) ?? null)).catch((e) => { setErr(msgOf(e)); setR(null); });
  }, [g.ready, id]);

  async function approve() {
    setBusy(true); setErr(null);
    try { const res = await rpc("c_approve_payment", { p_id: id }); router.replace(`/c/receipt/${res.booking}`); } catch (e) { setErr(msgOf(e)); setBusy(false); }
  }
  if (!g.ready || r === undefined) return <main className="cpage"><Top back="/c/pay" /><Loading /></main>;
  if (!r) return <main className="cpage"><Top back="/c/pay" /><p className="cmsg err">{err ?? "이미 처리됐거나 취소된 결제 요청이에요"}</p></main>;
  const lines = r.lines ?? [];
  return (
    <Page tabbed={false}>
      <Top back="/c/pay" title="결제 확인" />
      <h1 className="ch1">{won(r.amount)}</h1>
      <p className="cmt">{r.store}{r.designer ? ` · ${r.designer}` : ""} · {when(r.start)}</p>
      <div className="ccard">
        <b>시술 내역</b>
        {lines.map((l: any, i: number) => <div key={i} className="crow"><span>{l.name}</span><span className="csp" /><b>{won(l.unit_price ?? l.price ?? 0)}</b></div>)}
        <hr style={{ border: 0, borderTop: "1px solid var(--ln)", width: "100%" }} />
        <div className="crow"><span className="cmt">시술 합계</span><span className="csp" /><span>{won(r.subtotal)}</span></div>
        {r.subtotal > r.amount && <div className="crow"><span className="cmt">포인트 · 예치금 차감</span><span className="csp" /><span>-{won(r.subtotal - r.amount)}</span></div>}
        <div className="crow"><b>결제 금액</b><span className="csp" /><b style={{ color: "var(--a)" }}>{won(r.amount)}</b></div>
      </div>
      <p className="ctest">베타 안내 · 지금은 ‘결제 완료’만 기록돼요. 실제 카드 결제(PG)는 연결 후 제공돼요.</p>
      {err && <p className="cmsg err" role="alert">{err}</p>}
      <div className="cfoot"><button type="button" className="cbtn pri" disabled={busy} onClick={approve}>{busy ? "처리 중…" : `${won(r.amount)} 결제 완료하기`}</button></div>
    </Page>
  );
}
