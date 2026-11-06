"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CountUp } from "@/src/components/CountUp";
import { WeekChart } from "@/src/components/WeekChart";
import { supabase } from "@/src/lib/browser";
import { previewStaffRows } from "@/src/lib/preview-designers";
import { seoulClock, seoulDateLabel, seoulDayRange } from "@/src/lib/format";

const OPEN = new Set(["requested", "confirmed", "in_service", "completed"]);

function seoulDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function atSeoul(day, time) {
  return new Date(`${day}T${time}:00+09:00`).toISOString();
}

function sampleDay(members) {
  const staffUsers = new Set(members.filter((member) => member.role === "staff").map((member) => member.user_id));
  const people = members.filter((member) => member.role !== "owner" || !staffUsers.has(member.user_id));
  const ids = people.map((member) => member.id);
  const who = (index) => (ids.length ? ids[index % ids.length] : null);
  const day = seoulDay();
  const past = new Date();
  past.setDate(past.getDate() - 42);
  const visit = (id, time, status, name, menu, memberIndex, memo = "") => ({
    id,
    starts_at: atSeoul(day, time),
    ends_at: new Date(new Date(atSeoul(day, time)).getTime() + ({ 클리닉: 50, 커트: 60, 디지털펌: 70, 염색: 60 }[menu] ?? 60) * 60000).toISOString(),
    status,
    source: "phone",
    memo,
    member_id: who(memberIndex),
    customer_id: id,
    customers: { name },
    booking_items: [{ name: menu }],
  });
  return {
    today: [
      visit("sample-1", "10:00", "completed", "최유진", "클리닉", 0),
      visit("sample-2", "11:30", "confirmed", "김서연", "커트", 1),
      visit("sample-3", "14:00", "in_service", "박민지", "디지털펌", 2, "앞머리 포함"),
      visit("sample-4", "16:30", "requested", "이하은", "염색", 0),
      visit("sample-5", "18:30", "confirmed", "정수아", "클리닉", 1),
    ],
    history: [{
      id: "sample-risk",
      starts_at: atSeoul(seoulDay(past), "15:00"),
      customer_id: "sample-risk",
      customers: { name: "오지은" },
      booking_items: [{ store_menus: { revisit_cycle_days: 30 } }],
    }],
    tomorrow: [
      { id: "sample-t1", status: "confirmed", member_id: who(0) },
      { id: "sample-t2", status: "confirmed", member_id: who(1) },
      { id: "sample-t3", status: "requested", member_id: who(2) },
    ],
    paid: [],
  };
}

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

  useEffect(() => {
    if (!storeId) return undefined;
    let alive = true;
    const { start, end } = seoulDayRange();
    Promise.all([
      supabase.from("store_members").select("id, role, display_name, user_id").eq("store_id", storeId),
      supabase.from("bookings").select("id, starts_at, ends_at, status, source, memo, member_id, customer_id, customers(name), booking_items(name, store_menus(revisit_cycle_days))").eq("store_id", storeId).gte("starts_at", start).lt("starts_at", end).order("starts_at"),
      supabase.from("bookings").select("id, starts_at, customer_id, customers(name), booking_items(store_menus(revisit_cycle_days))").eq("store_id", storeId).eq("status", "completed").order("starts_at", { ascending: false }).limit(400),
      supabase.from("external_blocks").select("id, starts_at, source, staff_name, memo").eq("store_id", storeId).gte("starts_at", start).lt("starts_at", end),
      supabase.from("payment_entries").select("booking_id").eq("store_id", storeId).not("booking_id", "is", null),
      supabase.from("bookings").select("id, status, member_id").eq("store_id", storeId).gte("starts_at", end).lt("starts_at", new Date(new Date(end).getTime() + 86400000).toISOString()),
    ]).then(([members, today, history, blocks, pays, tomorrow]) => {
      if (!alive) return;
      const membersData = [...(members.data ?? []), ...previewStaffRows(members.data ?? [])];
      const liveToday = today.error ? [] : (today.data ?? []);
      const sample = liveToday.length ? null : sampleDay(membersData);
      setBoard({
        members: membersData,
        today: sample ? sample.today : liveToday,
        history: sample ? sample.history : (history.data ?? []),
        blocks: blocks.data ?? [],
        tomorrow: sample ? sample.tomorrow : (tomorrow.error ? [] : (tomorrow.data ?? [])),
        paid: sample ? sample.paid : (pays.data ?? []).map((row) => row.booking_id),
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
    const mine = (row) => (member.id === "none" ? !row.member_id : row.member_id === member.id);
    const todayRows = today.filter((row) => mine(row) && OPEN.has(row.status));
    const done = todayRows.filter((row) => row.status === "completed").length;
    const tomorrowCount = (board?.tomorrow ?? []).filter((row) => mine(row) && OPEN.has(row.status)).length;
    return {
      id: member.id,
      name: member.display_name || "담당",
      total: todayRows.length,
      done,
      left: todayRows.length - done,
      tomorrow: tomorrowCount,
    };
  });
  const sumAll = lanes.reduce((sum, lane) => sum + lane.total, 0);
  const doneAll = lanes.reduce((sum, lane) => sum + lane.done, 0);

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
      <div className="today-kpis">
        {[
          ["오늘 예약", open.length, ""],
          ["접수 대기", requested.length, "wait"],
          ["시술 중", live.length, "live"],
          ["결제 승인 대기", unpaid.length, "pay"],
        ].map(([label, count, toneName], index) => (
          <motion.article
            key={label}
            className={toneName ? `today-kpi ${toneName}` : "today-kpi"}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 * index, ease: [0.22, 1, 0.36, 1] }}
          >
            <span>{label}</span>
            <strong><CountUp value={count} suffix="건" /></strong>
          </motion.article>
        ))}
      </div>
      <WeekChart storeId={storeId} />
      <div className="today-grid">
        <div className="lane-board">
          <div className="lane-head">
            <b>직원별 예약 현황</b>
            <div className="legend">
              <i className="on">완료 {doneAll}</i><i>미완료 {sumAll - doneAll}</i>
            </div>
          </div>
          <div className="staff-list">
            {lanes.map((lane) => (
              <div key={lane.id} className="staff-row">
                <div className="staff-top">
                  <h3>{lane.name}</h3>
                  <span className="staff-next">내일 <b>{lane.tomorrow}건</b></span>
                </div>
                <div className="staff-today">
                  <div className="staff-count"><i>오늘 예약</i><b>{lane.total}건</b></div>
                  <div className="staff-stat done"><i>완료</i><b>{lane.done}</b></div>
                  <div className="staff-stat left"><i>미완료</i><b>{lane.left}</b></div>
                </div>
                <div className="staff-bar" aria-hidden="true">
                  <span style={{ width: lane.total ? `${Math.round((lane.done / lane.total) * 100)}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="side-stack">
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
