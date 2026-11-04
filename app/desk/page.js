"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { TodayBoard } from "@/src/components/TodayBoard";
import { categoryLabel, dbErrorMessage, seoulDateLabel } from "@/src/lib/format";

const cards = [
  ["menus", "메뉴·소요시간", "업종 템플릿을 매장 가격으로 맞춥니다.", "/desk/settings/menus", "메뉴 보기"],
  ["hours", "영업시간", "기본값은 매일 10:00–20:00입니다.", "/desk/settings#hours", "시간 보기"],
  ["staff", "담당자 초대", "디자이너는 이 코드로 들어옵니다.", "/desk/settings#invite", "초대 링크"],
  ["import_done", "고객 데이터 이전", "이름과 휴대폰 열을 가진 CSV를 올립니다.", "/desk/customers", "고객 화면"],
  ["notices", "알림 문구", "예약, 기록, 케어 문구를 확인합니다.", "/desk/settings#notices", "문구 보기"],
  ["payment_deferred", "결제 방식", "1차는 매장에서 직접 적습니다. 결제 승인은 2차입니다.", "/desk/payments", "수납 적기"],
];

export default function DeskHome() {
  const desk = useDesk();
  const [counts, setCounts] = useState({ blocks: 0, customers: 0, payments: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!desk?.store) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    Promise.all([
      supabase.from("external_blocks").select("id", { count: "exact", head: true }).eq("store_id", desk.store.id).gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("store_id", desk.store.id),
      supabase.from("payment_entries").select("id", { count: "exact", head: true }).eq("store_id", desk.store.id),
    ]).then(([blocks, customers, payments]) => {
      setCounts({
        blocks: blocks.count ?? 0,
        customers: customers.count ?? 0,
        payments: payments.count ?? 0,
      });
    });
  }, [desk?.store]);

  if (!desk?.store) return null;
  const setup = desk.setup ?? {};
  const done = cards.filter(([key]) => setup[key]).length;

  async function deferPayment() {
    setError("");
    const { error: updateError } = await supabase.from("store_setup").update({ payment_deferred: true }).eq("store_id", desk.store.id);
    if (updateError) setError(dbErrorMessage(updateError));
    else desk.refresh();
  }

  if (desk.store.status === "approved") {
    return <TodayBoard categoryLabel={categoryLabel[desk.store.category] ?? "헤어"} storeId={desk.store.id} />;
  }

  return (
    <>
      {desk.store.status !== "approved" ? (
        <section className="banner">
          <b>가입 신청이 접수됐어요</b>
          서류 확인이 끝나면 알림으로 알려 드립니다. 기다리는 동안 메뉴와 영업시간을 맞춰 두세요.
        </section>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <section className="card">
        <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
          <b>시작 준비</b>
          <span>{done} / {cards.length} 완료</span>
        </div>
        <div className="progress" aria-hidden="true"><span style={{ width: `${(done / cards.length) * 100}%` }} /></div>
        <div className="setup-grid">
          {cards.map(([key, title, body, href, action]) => (
            <article key={key} className="setup-card">
              <div className="row">
                <h3>{title}</h3>
                <span className="pill">{setup[key] ? "완료" : key === "payment_deferred" ? "2차 예정" : "남음"}</span>
              </div>
              <p>{body}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Link className="btn small" href={href}>{action}</Link>
                {key === "payment_deferred" && !setup[key] ? (
                  <button className="btn small" type="button" onClick={deferPayment}>나중에</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 style={{ margin: "22px 0 8px" }}>오늘 매장 현황 · {seoulDateLabel()}</h2>
        <div className="kpi-grid">
          <article className="kpi"><span>오늘 외부 블록</span><strong>{counts.blocks}건</strong></article>
          <article className="kpi"><span>등록 고객</span><strong>{counts.customers}명</strong></article>
          <article className="kpi"><span>시술 중</span><strong>0건</strong></article>
          <article className="kpi"><span>수기 매출 건수</span><strong>{counts.payments}건</strong></article>
        </div>
        <p className="lede">예약 요청과 시술 기록은 아직 없습니다. 네이버 예약은 시간만 막아 둡니다.</p>
      </section>
    </>
  );
}
