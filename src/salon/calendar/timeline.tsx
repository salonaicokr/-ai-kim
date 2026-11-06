"use client";

import { useRef, useState } from "react";
import { kindOf } from "@/src/lib/menu";
import { RiskBadges } from "./consult";
import { CLOSED, STATUS, durLabel, hhmm, snap, type Booking } from "./lib";

export type Lane = { key: string; label: string; sub?: string; count?: number; off?: boolean; today?: boolean; onLabel?: () => void;
  /** 영업시간 밖 · 휴무 구간 [시작분, 끝분) — 회색, 예약 불가 */ closed?: [number, number][]; closedLabel?: string };
export type Placed = { b: Booking; lane: string; s: number; e: number; tag?: string };

type Props = {
  lanes: Lane[];
  items: Placed[];
  orient: "v" | "h";
  compact?: boolean;
  nowMin: number | null;
  nowLane?: string | null;
  selectedId: string | null;
  canEdit: (laneKey: string, b?: Booking) => boolean;
  allowLaneMove?: boolean;
  onSelect: (b: Booking) => void;
  onEmpty: (laneKey: string, min: number) => void;
  onChange: (b: Booking, next: { s: number; e: number; lane: string }) => void;
  onBlocked?: () => void;
  /** 보여줄 시간 범위 (시) — 매장 영업시간 기준 */
  startH: number; endH: number;
};

const V_HOUR = 64, H_HOUR = 104;

/** 같은 열에서 시간이 겹치는 블록을 나란히 배치 */
function layout(items: Placed[]) {
  const out = new Map<string, { col: number; cols: number }>();
  const byLane = new Map<string, Placed[]>();
  items.forEach((p) => byLane.set(p.lane, [...(byLane.get(p.lane) ?? []), p]));
  byLane.forEach((list) => {
    const sorted = [...list].sort((a, b) => a.s - b.s || b.e - a.e);
    let cluster: Placed[] = [], clusterEnd = -1, ends: number[] = [];
    const flush = () => { cluster.forEach((p) => (out.get(p.b.id)!.cols = ends.length)); cluster = []; ends = []; };
    sorted.forEach((p) => {
      if (p.s >= clusterEnd && cluster.length) flush();
      let col = ends.findIndex((e) => e <= p.s);
      if (col < 0) { col = ends.length; ends.push(p.e); } else ends[col] = p.e;
      out.set(p.b.id, { col, cols: 1 });
      cluster.push(p); clusterEnd = Math.max(clusterEnd, p.e);
    });
    flush();
  });
  return out;
}

export default function Timeline({ lanes, items, orient, compact, nowMin, nowLane, selectedId, canEdit, allowLaneMove, onSelect, onEmpty, onChange, onBlocked, startH: START_H, endH: END_H }: Props) {
  const v = orient === "v";
  const unit = v ? V_HOUR : H_HOUR;
  const ppm = unit / 60;
  const span = (END_H - START_H) * unit;
  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  const pos = layout(items);
  const laneRefs = useRef(new Map<string, HTMLDivElement>());

  // ---- 드래그: 시작(start) · 끝(end) · 통째 이동(move), 10분 단위 ----
  const drag = useRef<{ id: string; mode: "start" | "end" | "move"; x: number; y: number; s: number; e: number; lane: string; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<{ id: string; s: number; e: number; lane: string } | null>(null);

  function down(ev: React.PointerEvent, p: Placed, mode: "start" | "end" | "move") {
    if (!canEdit(p.lane, p.b) || CLOSED.includes(p.b.status)) { if (mode === "move") return; return; }
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    drag.current = { id: p.b.id, mode, x: ev.clientX, y: ev.clientY, s: p.s, e: p.e, lane: p.lane, moved: false };
  }
  function move(ev: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const delta = v ? ev.clientY - d.y : ev.clientX - d.x;
    if (!d.moved && Math.abs(delta) < 5 && Math.abs((v ? ev.clientX - d.x : ev.clientY - d.y)) < 5) return;
    d.moved = true;
    const dm = snap(delta / ppm);
    let s = d.s, e = d.e;
    if (d.mode === "start") s = Math.min(d.e - 10, Math.max(START_H * 60 - 120, d.s + dm));
    else if (d.mode === "end") e = Math.max(d.s + 10, Math.min(END_H * 60 + 180, d.e + dm));
    else { s = d.s + dm; e = d.e + dm; if (s < 0) { e -= s; s = 0; } }
    let lane = d.lane;
    if (d.mode === "move" && allowLaneMove) {
      for (const [key, el] of laneRefs.current) {
        const r = el.getBoundingClientRect();
        const inside = v ? ev.clientX >= r.left && ev.clientX <= r.right : ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (inside && canEdit(key)) { lane = key; break; }
      }
    }
    setPreview({ id: d.id, s, e, lane });
  }
  function up(p: Placed) {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (!d.moved) { setPreview(null); if (d.mode === "move") onSelect(p.b); return; }
    const pv = preview; setPreview(null);
    if (!pv || (pv.s === d.s && pv.e === d.e && pv.lane === d.lane)) return;
    // 수동 블록이 아닌 예약은 영업시간 밖으로 못 옮김 → 원위치 + 안내 (서버도 한 번 더 막음)
    const closed = lanes.find((l) => l.key === pv.lane)?.closed ?? [];
    if (p.b.status !== "blocked" && closed.some(([a, b]) => pv.s < b && pv.e > a)) { onBlocked?.(); return; }
    onChange(p.b, pv);
  }

  function emptyClick(ev: React.MouseEvent<HTMLDivElement>, lane: Lane) {
    if (!canEdit(lane.key) || lane.off) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const off = v ? ev.clientY - r.top : ev.clientX - r.left;
    const min = Math.min(END_H * 60 - 30, START_H * 60 + Math.floor(off / ppm / 30) * 30);
    // 회색(영업시간 밖 · 휴무) 칸은 등록 창을 열지 않음
    if ((lane.closed ?? []).some(([a, b]) => min >= a && min < b)) return;
    onEmpty(lane.key, min);
  }

  return (
    <div className={`tl ${v ? "tl-v" : "tl-h"}${compact ? " compact" : ""}`} style={{ ["--lanes" as string]: lanes.length, ["--span" as string]: `${span}px` }}>
      <div className="tl-corner" />
      {/* 시간 눈금 */}
      <div className="tl-scale">
        {hours.map((h) => {
          const hour = h % 12 || 12;
          return (
            <span key={h} className="tl-hour" style={{ [v ? "top" : "left"]: (h - START_H) * unit }}>
              {v ? <><b>{hour}</b><i>{h < 12 ? "AM" : "PM"}</i></> : `${h}:00`}
            </span>
          );
        })}
      </div>
      {lanes.map((l, i) => (
        <div key={`h-${l.key}`} className={`tl-head${l.off ? " off" : ""}${l.today ? " today" : ""}`} style={v ? { gridColumn: i + 2, gridRow: 1 } : { gridRow: i + 2, gridColumn: 1 }}>
          <button type="button" className="tl-label" onClick={l.onLabel} disabled={!l.onLabel}>
            <b>{l.label}</b>{l.sub && <span className="sm">{l.sub}</span>}
          </button>
          {l.count != null && <span className="sm cnt">{l.count}건</span>}
        </div>
      ))}
      {lanes.map((l, i) => (
        <div key={`l-${l.key}`} style={v ? { gridColumn: i + 2, gridRow: 2 } : { gridRow: i + 2, gridColumn: 2 }} ref={(el) => { if (el) laneRefs.current.set(l.key, el); else laneRefs.current.delete(l.key); }}
          className={`tl-lane${l.off ? " off" : ""}${canEdit(l.key) && !l.off ? " editable" : ""}`}
          onClick={(ev) => emptyClick(ev, l)}>
          {hours.map((h) => <i key={h} className="tick" style={{ [v ? "top" : "left"]: (h - START_H) * unit }} />)}
          {(l.closed ?? []).map(([a, b]) => {
            const s0 = Math.max(a, START_H * 60), e0 = Math.min(b, END_H * 60);
            if (e0 <= s0) return null;
            return <div key={`c${a}`} className="tl-closed" aria-hidden style={v ? { top: (s0 - START_H * 60) * ppm, height: (e0 - s0) * ppm } : { left: (s0 - START_H * 60) * ppm, width: (e0 - s0) * ppm }}>
              {e0 - s0 >= 60 && <span>{l.closedLabel ?? (a > 0 && b < 1440 ? "브레이크" : "영업시간 외")}</span>}
            </div>;
          })}
          {nowMin != null && (nowLane == null || nowLane === l.key) && nowMin >= START_H * 60 && nowMin <= END_H * 60 && (
            <div className="now" style={{ [v ? "top" : "left"]: (nowMin - START_H * 60) * ppm }}><span>{hhmm(nowMin)}</span></div>
          )}
          {items.filter((p) => (preview?.id === p.b.id ? preview.lane : p.lane) === l.key).map((p) => {
            const pv = preview?.id === p.b.id ? preview : null;
            const s = pv?.s ?? p.s, e = pv?.e ?? p.e;
            const k = kindOf(p.b.items[0]?.kind ?? "etc");
            const lp = pos.get(p.b.id) ?? { col: 0, cols: 1 };
            const editable = canEdit(p.lane, p.b) && !CLOSED.includes(p.b.status);
            const a = Math.max(0, (s - START_H * 60) * ppm), len = Math.max(compact ? 18 : 24, (e - s) * ppm - 2);
            const cross = pv ? { a: 0, w: 100 } : { a: (lp.col / lp.cols) * 100, w: 100 / lp.cols };
            const style = v
              ? { top: a, height: len, left: `calc(${cross.a}% + 3px)`, width: `calc(${cross.w}% - 6px)` }
              : { left: a, width: len, top: `calc(${cross.a}% + 3px)`, height: `calc(${cross.w}% - 6px)` };
            const name = p.b.status === "blocked" ? (p.b.memo ?? "수동 블록") : p.b.customer?.name ?? "고객";
            return (
              <div key={p.b.id} role="button" tabIndex={0} aria-label={`${name} ${hhmm(s)}–${hhmm(e)}`}
                className={`bk ${STATUS[p.b.status].cls}${selectedId === p.b.id ? " sel" : ""}${pv ? " dragging" : ""}${editable ? " can" : ""}`}
                style={{ ...style, ["--k" as string]: k.color, ["--kbg" as string]: k.bg }}
                onClick={(ev) => ev.stopPropagation()}
                onPointerDown={(ev) => (editable ? down(ev, p, "move") : undefined)}
                onPointerMove={move}
                onPointerUp={() => (editable ? up(p) : onSelect(p.b))}
                onKeyDown={(ev) => { if (ev.key === "Enter") onSelect(p.b); }}>
                {editable && <span className="rh rh-s" onPointerDown={(ev) => down(ev, p, "start")} onPointerMove={move} onPointerUp={() => up(p)} aria-hidden />}
                <div className="bk-top">
                  {p.b.source === "naver" && <span className="nv">N</span>}{p.b.source === "app" && <span className="nv app" title="고객 앱 예약">앱</span>}
                  <b className="nm">{name}</b>
                  {!compact && !["confirmed", "blocked"].includes(p.b.status) && <span className={`pill ${STATUS[p.b.status].cls}`}>{STATUS[p.b.status].label}</span>}
                </div>
                {p.b.status !== "blocked" && <div className="mn">{p.tag ? `${p.tag} · ` : ""}{p.b.items.map((i) => i.name).join(" + ") || "메뉴 미정"}</div>}
                <div className="tm">{hhmm(s)}–{hhmm(e)}{!compact && ` · ${durLabel(e - s)}`}</div>
                {p.b.status !== "blocked" && !CLOSED.includes(p.b.status) && p.b.survey && (
                  <RiskBadges flags={p.b.survey.status === "answered" ? p.b.survey.flags : null} pending={p.b.survey.status === "sent"} max={compact ? 1 : 2} />
                )}
                {editable && <span className="rh rh-e" onPointerDown={(ev) => down(ev, p, "end")} onPointerMove={move} onPointerUp={() => up(p)} aria-hidden />}
              </div>
            );
          })}
          {l.off && !l.closed?.length && <span className="off-label">휴무</span>}
        </div>
      ))}
    </div>
  );
}
