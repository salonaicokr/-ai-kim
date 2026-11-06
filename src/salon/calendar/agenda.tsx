"use client";

import { kindOf } from "@/src/lib/menu";
import { durLabel, hhmm, STATUS, type Booking } from "./lib";

type Item = { b: Booking; s: number; e: number; tag?: string };

type Props = {
  items: Item[];
  selectedId: string | null;
  onSelect: (b: Booking) => void;
  onEmpty: (min: number) => void;
};

export function Clock() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.6V8.2l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function clock(min: number) {
  const hour = Math.floor(min / 60);
  return { hour: hour % 12 || 12, ap: hour < 12 ? "AM" : "PM" };
}

const FACES = ["#e7b7a8", "#d7b48a", "#c9b7a2", "#e4c2b0"];

export function Face({ name }: { name: string }) {
  const index = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const skin = FACES[index % FACES.length];
  const hair = ["#3a2a24", "#6b3a2a", "#2c241c", "#8a5a32"][index % 4];
  return (
    <svg className="ag-face" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#f4efe9" />
      <path d={index % 2 ? "M6 18c2-10 26-12 30-2 1 8-2 8-4 6-4-6-18-6-22 0-2 2-5 1-4-4z" : "M5 20c1-12 29-14 32 0-2 4-4 2-6-2-5-6-16-6-21 1-2 3-4 4-5 1z"} fill={hair} />
      <circle cx="20" cy="23" r="9" fill={skin} />
      <circle cx="16.5" cy="22.5" r="1" fill="#3a3030" />
      <circle cx="23.5" cy="22.5" r="1" fill="#3a3030" />
      <path d="M17.5 26.5c1.4 1.2 3.6 1.2 5 0" fill="none" stroke="#a56b62" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export default function Agenda({ items, selectedId, onSelect, onEmpty }: Props) {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const rows: ({ kind: "book"; item: Item } | { kind: "gap"; at: number; mins: number })[] = [];
  sorted.forEach((item, index) => {
    const prev = sorted[index - 1];
    if (prev && item.s - prev.e >= 90) rows.push({ kind: "gap", at: prev.e, mins: item.s - prev.e });
    rows.push({ kind: "book", item });
  });

  if (!rows.length) {
    return (
      <div className="look-sheet">
        <div className="tl-row">
          <div className="tl-hour"><b>11</b><i>AM</i></div>
          <button type="button" className="tl-free tl-btn" onClick={() => onEmpty(11 * 60)}>
            <span className="tl-spark" aria-hidden="true">✦</span>
            <p>비어 있는 하루</p>
            <strong>이 날은 아직 예약이 없어요</strong>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="look-sheet">
      {rows.map((row) => {
        if (row.kind === "gap") {
          const t = clock(row.at);
          return (
            <div className="tl-row" key={`gap-${row.at}`}>
              <div className="tl-hour"><b>{t.hour}</b><i>{t.ap}</i></div>
              <button type="button" className="tl-free tl-btn" onClick={() => onEmpty(row.at)}>
                <span className="tl-spark" aria-hidden="true">✦</span>
                <p>비어 있는 시간</p>
                <strong>{durLabel(row.mins)} 여유</strong>
              </button>
            </div>
          );
        }
        const { item } = row;
        const t = clock(item.s);
        const blocked = item.b.status === "blocked";
        const customer = blocked ? "외부 일정" : item.b.customer?.name ?? "고객";
        const menu = blocked ? (item.b.memo ?? "시간 막음") : item.b.items.map((entry) => entry.name).join(" + ") || "메뉴 미정";
        const kind = kindOf(blocked ? "etc" : item.b.items[0]?.kind ?? "etc");
        return (
          <div className="tl-row" key={item.b.id}>
            <div className="tl-hour"><b>{t.hour}</b><i>{t.ap}</i></div>
            <button
              type="button"
              className={`tl-card tl-btn tl-kind${item.b.status === "in_service" ? " live" : ""}${selectedId === item.b.id ? " pick" : ""}`}
              style={{ ["--k" as string]: kind.color, ["--kbg" as string]: kind.bg }}
              onClick={() => onSelect(item.b)}
            >
              <header>
                <h4>{menu}</h4>
                <span className="tl-dots" aria-hidden="true">•••</span>
              </header>
              <p className="tl-sub">{STATUS[item.b.status]?.label ?? ""}{item.tag ? ` · ${item.tag}` : ""}</p>
              <p className="tl-sub">{(!blocked && item.b.memo) || `${hhmm(item.s)}–${hhmm(item.e)} 진행`}</p>
              <div className="tl-inner">
                <div className="tl-cell"><i>고객</i><b>{customer}</b></div>
                <div className="tl-cell"><i>시작</i><b>{hhmm(item.s)}</b></div>
                <div className="tl-foot">
                  <span><Clock />{durLabel(item.e - item.s)}</span>
                  {blocked ? null : <Face name={customer} />}
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
