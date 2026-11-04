"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { won } from "@/src/lib/format";

export default function SettlementPage() {
  const desk = useDesk();
  const [rows, setRows] = useState([]);
  const [monthOnly, setMonthOnly] = useState(true);

  useEffect(() => {
    if (!desk?.store) return;
    supabase.from("payment_entries").select("amount_krw, entry_type, created_at").eq("store_id", desk.store.id).then(({ data }) => {
      setRows(data ?? []);
    });
  }, [desk?.store]);

  const monthKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date());
  const visible = rows.filter((row) => !monthOnly || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date(row.created_at)) === monthKey);
  const sum = visible.reduce((total, row) => {
    if (row.entry_type === "paid") total.paid += row.amount_krw;
    else total.refund += row.amount_krw;
    return total;
  }, { paid: 0, refund: 0 });

  if (!desk?.store) return null;
  return (
    <>
      <header className="page-head">
        <div>
          <h1>정산</h1>
          <p>카드사 정산은 2차입니다. 아래 숫자는 매장이 직접 적은 금액입니다.</p>
        </div>
        <button className="btn" type="button" onClick={() => setMonthOnly((value) => !value)}>{monthOnly ? "이번 달" : "전체"}</button>
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
