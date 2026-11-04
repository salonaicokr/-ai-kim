"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/browser";
import { bookingStatusLabel, dbErrorMessage, seoulClock, seoulDateLabel, seoulDayRange } from "@/src/lib/format";

const OPEN = new Set(["requested", "confirmed", "in_service", "completed"]);

function tone(row) {
  if (row.status === "blocked") return "block";
  if (row.source === "naver") return "naver";
  if (row.status === "completed") return "done";
  if (row.status === "in_service") return "doing";
  if (row.status === "requested") return "ask";
  if (row.status === "confirmed") return "hold";
  return "plain";
}

export function TodayBoard({ categoryLabel, storeId }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!storeId) return undefined;
    let alive = true;
    const { start, end } = seoulDayRange();
    Promise.all([
      supabase.from("store_members").select("id, role, display_name, user_id").eq("store_id", storeId),
      supabase.from("bookings").select("id, starts_at, status, source, memo, member_id, customer_id, customers(name), booking_items(name, store_menus(revisit_cycle_days))").eq("store_id", storeId).gte("starts_at", start).lt("starts_at", end).order("starts_at"),
      supabase.from("bookings").select("id, starts_at, customer_id, customers(name), booking_items(store_menus(revisit_cycle_days))").eq("store_id", storeId).eq("status", "completed").order("starts_at", { ascending: false }).limit(400),
      supabase.from("external_blocks").select("id, starts_at, source, staff_name, memo").eq("store_id", storeId).gte("starts_at", start).lt("starts_at", end),
      supabase.from("payment_entries").select("booking_id").eq("store_id", storeId).not("booking_id", "is", null),
    ]).then(([members, today, history, blocks, pays]) => {
      if (!alive) return;
      const failed = members.error || today.error || history.error || blocks.error || pays.error;
      if (failed) {
        setError(dbErrorMessage(failed));
        setBoard({ members: members.data ?? [], today: [], history: [], blocks: blocks.data ?? [], paid: [] });
        return;
      }
      setBoard({
        members: members.data ?? [],
        today: today.data ?? [],
        history: history.data ?? [],
        blocks: blocks.data ?? [],
        paid: (pays.data ?? []).map((row) => row.booking_id),
      });
    });
    return () => {
      alive = false;
    };
  }, [storeId]);

  const today = board?.today ?? [];
  const paid = new Set(board?.paid ?? []);
  const open = today.filter((row) => OPEN.has(row.status));
  const requested = today.filter((row) => row.status === "requested");
  const live = today.filter((row) => row.status === "in_service");
  const unpaid = today.filter((row) => row.status === "completed" && !paid.has(row.id));
  const naverCount = today.filter((row) => row.source === "naver").length + (board?.blocks ?? []).filter((row) => row.source === "naver").length;

  const seen = new Set();
  const risks = [];
  for (const row of board?.history ?? []) {
    if (!row.customer_id || seen.has(row.customer_id)) continue;
    seen.add(row.customer_id);
    const cycle = row.booking_items?.map((item) => item.store_menus?.revisit_cycle_days).find(Boolean);
    if (!cycle) continue;
    const due = new Date(row.starts_at).getTime() + (Number(cycle) + 5) * 86400000;
    if (due < Date.now()) risks.push({ name: row.customers?.name || "고객", at: row.starts_at });
  }

  const staffUsers = new Set((board?.members ?? []).filter((member) => member.role === "staff").map((member) => member.user_id));
  const people = (board?.members ?? []).filter((member) => member.role !== "owner" || !staffUsers.has(member.user_id));
  const lanes = (people.length ? people : [{ id: "none", display_name: "담당 없음" }]).map((member) => {
    const slots = today
      .filter((row) => (member.id === "none" ? !row.member_id : row.member_id === member.id))
      .map((row) => ({
        id: row.id,
        title: row.status === "blocked" ? (row.memo || "시간 막음") : `${row.customers?.name || "고객"}${row.booking_items?.length ? ` · ${row.booking_items.map((item) => item.name).join("+")}` : ""}`,
        meta: `${seoulClock(row.starts_at)} ${bookingStatusLabel[row.status] || ""}`,
        tone: tone(row),
      }));
    const blocks = (board?.blocks ?? [])
      .filter((row) => member.display_name && row.staff_name === member.display_name)
      .map((row) => ({ id: row.id, title: row.memo || "외부 예약", meta: `${seoulClock(row.starts_at)} 시간 막음`, tone: "block" }));
    return { id: member.id, name: member.display_name, slots: [...slots, ...blocks] };
  });

  const brief = [];
  requested.forEach((row) => brief.push(`${seoulClock(row.starts_at)} ${row.customers?.name || "고객"} 예약 요청`));
  live.forEach((row) => brief.push(`${seoulClock(row.starts_at)} ${row.customers?.name || "고객"}${row.memo ? ` ${row.memo}` : " 시술 중"}`));
  if (risks.length) brief.push(`이탈 위기 ${risks.length}명은 재방문 시점이 지났습니다`);
  const lines = brief.slice(0, 3);
  if (!lines.length) lines.push("오늘 표시할 항목이 없습니다.");

  return (
    <section className="today">
      <div className="today-head">
        <div>
          <h2>오늘 매장 현황</h2>
          <p>대시보드 · 원장 · {categoryLabel}</p>
        </div>
        <div className="chips">
          <span className="chip naver">네이버 {naverCount}</span>
          <span className="chip req">예약 요청 {requested.length}</span>
          <span className="chip warn">이탈 위기 {risks.length}</span>
          <span className="chip box">보관함 0</span>
        </div>
      </div>
      <div className="ai-bar">
        <span className="ai-mark">AI</span>
        <div className="ai-copy">
          <b>오늘의 AI 브리핑</b>
          <ol>{lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ol>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="today-kpis">
        <article className="today-kpi"><span>오늘 예약</span><strong>{open.length}건</strong></article>
        <article className="today-kpi wait"><span>접수 대기</span><strong>{requested.length}건</strong></article>
        <article className="today-kpi live"><span>시술 중</span><strong>{live.length}건</strong></article>
        <article className="today-kpi pay"><span>결제 승인 대기</span><strong>{unpaid.length}건</strong></article>
      </div>
      <div className="today-grid">
        <div className="lane-board">
          <div className="lane-head">
            <b>디자이너별 타임라인</b>
            <div className="legend">
              <i>완료</i><i className="on">시술중</i><i>접수</i><i className="nv">네이버</i><i>수동 블록</i>
            </div>
          </div>
          <div className="lanes">
            {lanes.map((lane) => (
              <div key={lane.id} className="lane">
                <h3>{lane.name}</h3>
                {lane.slots.length ? lane.slots.map((slot) => (
                  <article key={slot.id} className={`slot ${slot.tone}`}>
                    <b>{slot.title}</b>
                    <span>{slot.meta}</span>
                  </article>
                )) : <p className="empty">오늘 예약이 없습니다.</p>}
              </div>
            ))}
          </div>
        </div>
        <aside className="side-stack">
          <section className="side-card">
            <h3>사후관리 보관함 <i className="count-dot">0</i></h3>
            <p>사진 기록은 담당자 확인 뒤에 고객에게 갑니다.</p>
          </section>
          <section className="side-card">
            <h3>재방문 이탈 위기 (R+5) <i className="count-dot warn">{risks.length}</i></h3>
            {risks.length ? risks.slice(0, 4).map((risk) => (
              <p key={`${risk.name}-${risk.at}`}>{risk.name} · 마지막 방문 {seoulDateLabel(new Date(risk.at))}</p>
            )) : <p>해당 고객이 없습니다.</p>}
          </section>
          <div className="side-actions">
            <Link href="/desk/bookings">외부 예약 막기</Link>
            <Link href="/desk/bookings">현장 등록</Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
