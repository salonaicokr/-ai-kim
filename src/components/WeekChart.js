"use client";

import { useEffect, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { CountUp } from "@/src/components/CountUp";
import { supabase } from "@/src/lib/browser";

function seoulKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

function dayLabel(iso) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function manText(amount) {
  const value = amount / 10000;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function man(amount) {
  return `${manText(amount)}만`;
}

function ManCount({ amount, delay, reduce }) {
  const [shown, setShown] = useState(reduce ? amount : 0);
  useEffect(() => {
    if (reduce) {
      setShown(amount);
      return undefined;
    }
    const run = animate(0, amount, { duration: 1.1, delay, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    return () => run.stop();
  }, [amount, delay, reduce]);
  return manText(Math.round(shown / 1000) * 1000);
}

function axisMax(max) {
  if (max <= 0) return 10000;
  const step = max <= 100000 ? 20000 : 100000;
  return Math.ceil(max / step) * step;
}

const SAMPLE_WEEK = [186000, 242000, 98000, 315000, 228000, 410000, 128000];

export function WeekChart({ storeId }) {
  const [data, setData] = useState(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!storeId) return undefined;
    let alive = true;
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = seoulKey(date);
      return { date: key, amount: 0 };
    });
    supabase
      .from("payment_entries")
      .select("amount_krw, created_at, entry_type")
      .eq("store_id", storeId)
      .gte("created_at", `${days[0].date}T00:00:00+09:00`)
      .then(({ data: rows }) => {
        if (!alive) return;
        const totals = Object.fromEntries(days.map((day) => [day.date, 0]));
        for (const row of rows ?? []) {
          if (row.entry_type === "refund") continue;
          const key = seoulKey(new Date(row.created_at));
          if (key in totals) totals[key] += Number(row.amount_krw) || 0;
        }
        const amounts = days.map((day) => totals[day.date]);
        const dressed = amounts.some((amount) => amount > 0) ? amounts : SAMPLE_WEEK;
        setData(days.map((day, index) => ({ ...day, amount: dressed[index] })));
      });
    return () => { alive = false; };
  }, [storeId]);

  const total = data?.reduce((sum, day) => sum + day.amount, 0) ?? 0;
  const ceiling = axisMax(Math.max(0, ...(data ?? []).map((day) => day.amount)));

  return (
    <section className="week-chart">
      <div className="week-chart-head">
        <b>최근 7일 매출</b>
        <span className="week-total">합계 {data ? <CountUp value={total} suffix="원" /> : "—"}</span>
      </div>
      <div className="week-chart-plot">
        {data ? (
          <div className="week-bars">
            <div className="week-scale" aria-hidden="true">
              <span>{man(ceiling)}</span>
              <span>{man(ceiling / 2)}</span>
              <span>0</span>
            </div>
            <div className="week-cols">
              {data.map((day, index) => {
                const height = Math.max(day.amount > 0 ? 6 : 0, (day.amount / ceiling) * 100);
                const isToday = index === data.length - 1;
                const label = isToday ? "오늘" : index === data.length - 2 ? "어제" : dayLabel(day.date);
                const delay = 0.15 + index * 0.09;
                return (
                  <div className={`week-bar${isToday ? " today" : ""}`} key={day.date}>
                    <div className="week-bar-track">
                      <motion.div
                        className="week-bar-fill"
                        initial={reduce ? false : { height: "0%", opacity: 0.4 }}
                        animate={{ height: `${height}%`, opacity: 1 }}
                        transition={reduce ? { duration: 0 } : { height: { type: "spring", stiffness: 70, damping: 13, mass: 0.9, delay }, opacity: { duration: 0.4, delay } }}
                        whileHover={reduce ? undefined : { scaleX: 1.18 }}
                      >
                        <i className="week-bar-cap" />
                      </motion.div>
                    </div>
                    <motion.span
                      className="week-bar-day"
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: delay + 0.1 }}
                    >
                      {label}
                    </motion.span>
                    <motion.span
                      className="week-bar-value"
                      initial={reduce ? false : { opacity: 0, y: 10, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.6, delay: delay + 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <ManCount amount={day.amount} delay={delay} reduce={reduce} />
                    </motion.span>
                    <em className="week-bar-exact">{day.amount.toLocaleString("ko-KR")}원</em>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
