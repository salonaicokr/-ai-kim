"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { won } from "@/src/lib/format";

export default function SettlementPage() {
  const desk = useDesk();
  const [sum, setSum] = useState({ paid: 0, refund: 0 });

  useEffect(() => {
    if (!desk?.store) return;
    supabase.from("payment_entries").select("amount_krw, entry_type").eq("store_id", desk.store.id).then(({ data }) => {
      const next = { paid: 0, refund: 0 };
      for (const row of data ?? []) {
        if (row.entry_type === "paid") next.paid += row.amount_krw;
        else next.refund += row.amount_krw;
      }
      setSum(next);
    });
  }, [desk?.store]);

  if (!desk?.store) return null;
  return (
    <>
      <header className="page-head">
        <div>
          <h1>정산</h1>
          <p>카드사 정산은 2차입니다. 아래 숫자는 매장이 직접 적은 금액입니다.</p>
        </div>
      </header>
      <div className="kpi-grid">
        <article className="kpi"><span>수납</span><strong>{won(sum.paid)}</strong></article>
        <article className="kpi"><span>환불</span><strong>{won(sum.refund)}</strong></article>
        <article className="kpi"><span>차감 후</span><strong>{won(sum.paid - sum.refund)}</strong></article>
        <article className="kpi"><span>현장 수기</span><strong>사용 중</strong><p>결제창 승인과 자동 환불은 아직 없습니다.</p></article>
      </div>
    </>
  );
}
