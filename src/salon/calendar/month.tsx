"use client";

import { kindOf } from "@/src/lib/menu";
import { ACTIVE, WEEK, addDays, dowOf, hhmm, minsOfDay, ymdOfIso, type Booking } from "./lib";

/** 월 보기: 날짜 칸마다 예약 수 + 앞 3건 (월요일 시작) */
export default function MonthView({ month, today, sel, bookings, onPick }: {
  month: string; today: string; sel: string; bookings: Booking[]; onPick: (ymd: string) => void;
}) {
  const first = month;
  const lead = (dowOf(first) + 6) % 7;
  const start = addDays(first, -lead);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const byDay = new Map<string, Booking[]>();
  bookings.filter((b) => ACTIVE.includes(b.status)).forEach((b) => {
    const k = ymdOfIso(b.start_at);
    byDay.set(k, [...(byDay.get(k) ?? []), b]);
  });
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="month">
      {order.map((d) => <div key={d} className={`mh${d === 0 ? " sun" : d === 6 ? " sat" : ""}`}>{WEEK[d]}</div>)}
      {days.map((d) => {
        const list = (byDay.get(d) ?? []).sort((a, b) => a.start_at.localeCompare(b.start_at));
        const out = d.slice(0, 7) !== month.slice(0, 7);
        const w = dowOf(d);
        return (
          <button key={d} type="button" className={`mc${out ? " out" : ""}${d === today ? " today" : ""}${d === sel ? " on" : ""}`} onClick={() => onPick(d)}>
            <span className={`n${w === 0 ? " sun" : w === 6 ? " sat" : ""}`}>{Number(d.slice(8))}</span>
            {list.length > 0 && <span className="mcount">{list.length}건</span>}
            <span className="mitems">
              {list.slice(0, 3).map((b) => (
                <span key={b.id} className="mi" style={{ ["--k" as string]: kindOf(b.items[0]?.kind ?? "etc").color }}>
                  <span className="tnum">{hhmm(minsOfDay(b.start_at))}</span> {b.customer?.name ?? ""}
                </span>
              ))}
              {list.length > 3 && <span className="more">+{list.length - 3}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
