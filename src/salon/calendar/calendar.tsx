"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { KINDS } from "@/src/lib/menu";
import Timeline, { type Lane, type Placed } from "./timeline";
import MonthView from "./month";
import { Detail, EditBooking, NewBooking } from "./forms";
import Checkout from "./checkout";
import {
  ACTIVE, BOOKING_SELECT, FILTERS, START_H, STATUS, WEEK, addDays, addMonths, dowOf, hhmm, kstAt, kstDate, mdLabel,
  minsOfDay, monthStart, normalize, weekStart, ymdOf, ymdOfIso, type Booking, type Designer, type MenuOpt, type Status,
} from "./lib";
import "./calendar.css";

export type { Designer, MenuOpt };

type Props = {
  shopId: string; shopName: string; myMemberId: string; designers: Designer[]; menus: MenuOpt[];
  canViewAll: boolean; canEditAll: boolean; canEditOwn: boolean;
  payPerm: "none" | "own" | "all"; refundPerm: "none" | "own" | "all"; recPerm: "none" | "own" | "all";
  today: string; nowMin: number;
};
type View = "day" | "week" | "month";

const store = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const save = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* 저장 불가 환경 */ } };

/** 767px 이하인지 (모바일에서는 디자이너 한 명씩) */
function useNarrow() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia("(max-width: 767px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

const STRIP_DAYS = 30;

export default function Calendar({ shopId, shopName, myMemberId, designers, menus, canViewAll, canEditAll, canEditOwn, payPerm, refundPerm, recPerm, today: todayInit, nowMin: nowInit }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const narrow = useNarrow();
  const [today, setToday] = useState(todayInit);
  const [nowMin, setNowMin] = useState(nowInit);
  const [date, setDate] = useState(todayInit);
  const [view, setView] = useState<View>("day");
  const [orient, setOrient] = useState<"v" | "h">("v");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, boolean>>(() => Object.fromEntries(FILTERS.map((s) => [s, STATUS[s].on])));
  const [sel, setSel] = useState<Booking | null>(null);
  const [panel, setPanel] = useState<null | { kind: "new"; designer: string; date: string; start: number; customer?: { id: string; name: string }; blocked?: boolean } | { kind: "edit"; confirming: boolean }>(null);
  const [checkout, setCheckout] = useState<Booking | null>(null);
  const [mobileCol, setMobileCol] = useState(designers.find((d) => d.id === myMemberId)?.id ?? designers[0]?.id ?? null);
  const [toast, setToast] = useState<string | null>(null);

  // 위젯 · 알림에서 ?b=예약ID 로 들어오면 그 날짜로 가서 예약 열기
  const [openId, setOpenId] = useState<string | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect -- 주소(?c= · ?b=)는 브라우저에서만 읽을 수 있어 첫 렌더 뒤에 반영 */
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const cid = qs.get("c"), cname = qs.get("n");
    const nw = qs.get("new");
    if (cid || nw) {
      // ?c= 고객 카드에서 · ?new=walkin 현장 등록 · ?new=block 외부 예약 입력(수동 블록)
      setPanel({ kind: "new", designer: myMemberId, date: todayInit, start: Math.max(START_H * 60, Math.ceil(nowInit / 10) * 10), ...(cid ? { customer: { id: cid, name: cname ?? "고객" } } : {}), ...(nw === "block" ? { blocked: true } : {}) });
      window.history.replaceState(null, "", "/calendar");
    }
    const id = qs.get("b");
    if (!id) return;
    setOpenId(id);
    supabase.from("bookings").select("start_at").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) { setView("day"); setDate(ymdOfIso(data.start_at as string)); }
    });
  }, [supabase, myMemberId, todayInit, nowInit]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!openId) return;
    const b = bookings.find((x) => x.id === openId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (b) { setSel(b); setPanel(null); setOpenId(null); window.history.replaceState(null, "", "/calendar"); }
  }, [openId, bookings]);

  // 화면 설정 기억 (보기 · 방향)
  useEffect(() => {
    const v = store("salonai.cal.view", "day") as View, o = store("salonai.cal.orient", "v") as "v" | "h";
    const linked = new URLSearchParams(window.location.search).has("b");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!linked) setView(v);
    setOrient(o);
  }, []);

  const cols = canViewAll ? designers : designers.filter((d) => d.id === myMemberId);
  const canEditDesigner = useCallback((id: string) => canEditAll || (canEditOwn && id === myMemberId), [canEditAll, canEditOwn, myMemberId]);

  const range = useMemo(() => {
    if (view === "day") return { from: date, to: addDays(date, 1) };
    if (view === "week") { const w = weekStart(date); return { from: w, to: addDays(w, 7) }; }
    const m = monthStart(date), lead = (dowOf(m) + 6) % 7, s = addDays(m, -lead);
    return { from: s, to: addDays(s, 42) };
  }, [view, date]);
  const key = `${view}:${range.from}`;
  const loading = loadedKey !== key;

  const load = useCallback(async () => {
    const { data } = await supabase.from("bookings").select(BOOKING_SELECT).eq("shop_id", shopId)
      .gte("start_at", kstDate(range.from).toISOString()).lt("start_at", kstDate(range.to).toISOString()).order("start_at");
    const rows = normalize(data ?? []);
    const ids = [...new Set(rows.map((r) => r.shop_customer_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: cs } = await supabase.from("v_shop_customers").select("id, name, phone").in("id", ids);
      const map = new Map((cs ?? []).map((c) => [c.id as string, c]));
      rows.forEach((r) => { if (r.shop_customer_id) r.customer = map.get(r.shop_customer_id) ?? undefined; });
    }
    setBookings(rows);
    setSel((s) => (s ? rows.find((r) => r.id === s.id) ?? null : s));
    setLoadedKey(key);
  }, [supabase, shopId, range, key]);

  const loadCounts = useCallback(async () => {
    const from = today, to = addDays(today, STRIP_DAYS);
    const { data } = await supabase.from("bookings").select("start_at, status").eq("shop_id", shopId)
      .gte("start_at", kstDate(from).toISOString()).lt("start_at", kstDate(to).toISOString()).in("status", ACTIVE);
    const c: Record<string, number> = {};
    (data ?? []).forEach((b) => { const k = ymdOfIso(b.start_at as string); c[k] = (c[k] ?? 0) + 1; });
    setCounts(c);
  }, [supabase, shopId, today]);

  // 범위가 바뀌면 다시 불러오기 (setState 는 응답 뒤에만)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); loadCounts(); }, [load, loadCounts]);
  // 문진 답변 등 다른 칸에서 바뀌면 다시 불러오기
  useEffect(() => { const f = () => { load(); }; window.addEventListener("calendar:reload", f); return () => window.removeEventListener("calendar:reload", f); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { const n = new Date(); setNowMin(minsOfDay(n.toISOString())); setToday(ymdOf(n)); }, 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  // 다른 화면 · 위젯에서 예약이 바뀌면 다시 불러오기
  useEffect(() => {
    const ch = supabase.channel(`cal-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `shop_id=eq.${shopId}` }, () => { load(); loadCounts(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, shopId, load, loadCounts]);

  const visible = bookings.filter((b) => filters[b.status === "cancelled_shop" ? "cancelled_customer" : b.status]);
  const countBy = (s: Status) => bookings.filter((b) => (view === "day" ? true : true) && (b.status === s || (s === "cancelled_customer" && b.status === "cancelled_shop"))).length;

  function setViewP(v: View) { setView(v); save("salonai.cal.view", v); setSel(null); setPanel(null); }
  function setOrientP(o: "v" | "h") { setOrient(o); save("salonai.cal.orient", o); }

  async function patchBooking(b: Booking, patch: Record<string, string>, msg: string) {
    setBookings((bs) => bs.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
    setSel((s) => (s && s.id === b.id ? { ...s, ...patch } : s));
    const { error } = await supabase.from("bookings").update(patch).eq("id", b.id);
    setToast(error ? `저장 실패: ${error.message}` : msg);
    load(); loadCounts();
  }

  // ---- 타임라인 데이터 (일: 디자이너 열 / 주: 요일 열) ----
  const designerName = (id: string) => designers.find((d) => d.id === id)?.name ?? "";
  let lanes: Lane[] = [], placed: Placed[] = [];
  if (view === "day") {
    const shown = narrow && orient === "v" ? cols.filter((d) => d.id === mobileCol) : cols;
    lanes = shown.map((d) => ({ key: d.id, label: d.name, sub: d.title, count: visible.filter((b) => b.designer_id === d.id && b.status !== "blocked").length }));
    placed = visible.filter((b) => shown.some((d) => d.id === b.designer_id)).map((b) => ({ b, lane: b.designer_id, s: minsOfDay(b.start_at), e: minsOfDay(b.end_at) }));
  } else if (view === "week") {
    const w = weekStart(date);
    lanes = Array.from({ length: 7 }, (_, i) => addDays(w, i)).map((d) => ({
      key: d, label: `${WEEK[dowOf(d)]} ${mdLabel(d)}`, today: d === today,
      count: visible.filter((b) => ymdOfIso(b.start_at) === d && b.status !== "blocked").length,
      onLabel: () => { setDate(d); setViewP("day"); },
    }));
    const mine = canViewAll ? visible : visible.filter((b) => b.designer_id === myMemberId);
    placed = mine.map((b) => ({ b, lane: ymdOfIso(b.start_at), s: minsOfDay(b.start_at), e: minsOfDay(b.end_at), tag: cols.length > 1 ? designerName(b.designer_id) : undefined }));
  }

  function onTimelineChange(b: Booking, n: { s: number; e: number; lane: string }) {
    const day = view === "week" ? n.lane : ymdOfIso(b.start_at);
    const patch: Record<string, string> = { start_at: kstAt(day, n.s).toISOString(), end_at: kstAt(day, n.e).toISOString() };
    if (view === "day" && n.lane !== b.designer_id) patch.designer_id = n.lane;
    const who = b.status === "blocked" ? "블록" : b.customer?.name ?? "예약";
    patchBooking(b, patch, `${who} → ${mdLabel(day)} ${hhmm(n.s)}–${hhmm(n.e)}${patch.designer_id ? ` · ${designerName(n.lane)}` : ""} 저장했어요`);
  }

  // 날짜 바로가기: 항상 오늘부터 30일 (일 · 주 보기 · PC/태블릿에서만)
  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i));
  const title = view === "month" ? `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`
    : view === "week" ? `${mdLabel(weekStart(date))} – ${mdLabel(addDays(weekStart(date), 6))}`
    : `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 (${WEEK[dowOf(date)]})`;
  const step = (n: number) => setDate(view === "month" ? addMonths(date, n) : addDays(date, view === "week" ? 7 * n : n));
  const pending = bookings.filter((b) => b.status === "requested").sort((a, b) => a.start_at.localeCompare(b.start_at));
  const firstEditable = cols.find((d) => canEditDesigner(d.id))?.id ?? myMemberId;

  return (
    <div className="cal-page">
      <div className="cal-head">
        <div>
          <p className="crumb">예약 · {canViewAll ? "전체 디자이너" : "내 예약"}</p>
          <h1 className="h1">예약 캘린더</h1>
        </div>
        <div className="row nav">
          <button className="btn ghost icon" type="button" aria-label="이전" onClick={() => step(-1)}>‹</button>
          <span className="cur">{title}</span>
          <button className="btn ghost icon" type="button" aria-label="다음" onClick={() => step(1)}>›</button>
          <button className="btn ghost sm-btn" type="button" onClick={() => setDate(today)} disabled={date === today}>오늘</button>
        </div>
        <span className="sp" />
        <div className="seg" role="tablist" aria-label="보기 단위">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setViewP(v)}>{{ day: "일", week: "주", month: "월" }[v]}</button>
          ))}
        </div>
        <div className="seg" role="tablist" aria-label="보기 방향">
          <button type="button" role="tab" aria-selected={orient === "v"} className={orient === "v" ? "on" : ""} disabled={view === "month"} onClick={() => setOrientP("v")} title="시간을 세로로">세로형</button>
          <button type="button" role="tab" aria-selected={orient === "h"} className={orient === "h" ? "on" : ""} disabled={view === "month"} onClick={() => setOrientP("h")} title="시간을 가로로">가로형</button>
        </div>
        {(canEditAll || canEditOwn) && (
          <button className="btn pri" type="button" onClick={() => { setSel(null); setPanel({ kind: "new", designer: mobileCol && canEditDesigner(mobileCol) ? mobileCol : firstEditable, date, start: date === today ? Math.max(START_H * 60, Math.ceil(nowMin / 30) * 30) : 11 * 60 }); }}>+ 예약 등록</button>
        )}
      </div>

      {view !== "month" && (
        <div className="strip" role="tablist" aria-label="날짜 선택">
          {strip.map((d) => {
            const w = dowOf(d);
            return (
              <button key={d} type="button" role="tab" aria-selected={d === date} className={`day${d === date ? " on" : ""}${d === today ? " today" : ""}${w === 0 ? " sun" : w === 6 ? " sat" : ""}`} onClick={() => setDate(d)}>
                <span className="w">{d === today ? "오늘" : WEEK[w]}</span><span className="n">{Number(d.slice(8)) === 1 || d === today ? `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` : Number(d.slice(8))}</span><span className={`c${counts[d] ? "" : " zero"}`}>{counts[d] ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="filters">
        {FILTERS.map((s) => (
          <label key={s} className={`fchip${filters[s] ? " on" : ""}`}>
            <input type="checkbox" checked={filters[s]} onChange={(e) => setFilters({ ...filters, [s]: e.target.checked })} />
            {STATUS[s].label} <b>{countBy(s)}</b>
          </label>
        ))}
        <span className="sp" />
        {view !== "month" && <span className="sm hint">빈 칸 누르기 = 예약 등록 · 블록 위/아래 끝 끌기 = 시작/종료 10분 단위 · 블록 끌기 = 옮기기</span>}
      </div>

      {view === "day" && narrow && orient === "v" && cols.length > 1 && (
        <div className="mcols" role="tablist" aria-label="디자이너 선택">
          {cols.map((d) => <button key={d.id} type="button" className={`chip${mobileCol === d.id ? " on" : ""}`} onClick={() => setMobileCol(d.id)}>{d.name}</button>)}
        </div>
      )}

      <div className="cal-body">
        <div className="card grid-card">
          {view === "month" ? (
            <MonthView month={monthStart(date)} today={today} sel={date} bookings={visible} onPick={(d) => { setDate(d); setViewP("day"); }} />
          ) : (
            <Timeline
              lanes={lanes} items={placed} orient={orient} compact={view === "week"}
              nowMin={(view === "day" && date === today) || view === "week" ? nowMin : null}
              nowLane={view === "week" ? today : null}
              selectedId={sel?.id ?? null}
              canEdit={(lane, b) => (view === "day" ? canEditDesigner(lane) : b ? canEditDesigner(b.designer_id) : canEditDesigner(firstEditable))}
              allowLaneMove={view === "day" ? canEditAll : true}
              onSelect={(b) => { setPanel(null); setSel(b); }}
              onEmpty={(lane, min) => { setSel(null); setPanel({ kind: "new", designer: view === "day" ? lane : (mobileCol && canEditDesigner(mobileCol) ? mobileCol : firstEditable), date: view === "day" ? date : lane, start: min }); }}
              onChange={onTimelineChange}
            />
          )}
          {loading && <div className="loading sm">불러오는 중…</div>}
          {!loading && cols.length === 0 && <p className="sm" style={{ padding: 20 }}>예약을 받을 디자이너가 없어요. 구성원 화면에서 디자이너를 초대해주세요.</p>}
        </div>

        <aside className="side-col">
          {panel?.kind === "new" ? (
            <NewBooking key={`${panel.designer}-${panel.date}-${panel.start}`} supabase={supabase} shopId={shopId} designers={cols.filter((d) => canEditDesigner(d.id))}
              menus={menus} init={panel} onClose={() => setPanel(null)}
              onSaved={(m, d) => { setPanel(null); setToast(m); setDate(d); load(); loadCounts(); }} />
          ) : panel?.kind === "edit" && sel ? (
            <EditBooking key={sel.id + String(panel.confirming)} supabase={supabase} b={sel} designers={cols.filter((d) => canEditDesigner(d.id) || d.id === sel.designer_id)}
              menus={menus} confirming={panel.confirming} onClose={() => setPanel(null)}
              onSaved={(m, d) => { setPanel(null); setToast(m); setDate(d); load(); loadCounts(); }} />
          ) : sel ? (
            <Detail supabase={supabase} shopId={shopId} shopName={shopName} myMemberId={myMemberId} b={sel} designers={designers} editable={canEditDesigner(sel.designer_id)}
              canRecord={recPerm === "all" || (recPerm === "own" && sel.designer_id === myMemberId)}
              canPay={payPerm === "all" || (payPerm === "own" && sel.designer_id === myMemberId)}
              canRefund={refundPerm === "all" || (refundPerm === "own" && sel.designer_id === myMemberId)}
              onClose={() => setSel(null)}
              onStatus={(st) => patchBooking(sel, { status: st }, `${sel.customer?.name ?? "예약"} → ${STATUS[st].label}`)}
              onEdit={(confirming) => setPanel({ kind: "edit", confirming })}
              onCheckout={() => setCheckout(sel)}
              onChanged={(m) => setToast(m)} />
          ) : (
            <div className="card panel">
              <div className="row"><b>예약 요청</b><span className="sp" /><span className="pill st-req">{pending.length}</span></div>
              <p className="sm">확정 전에 시간 · 담당 · 메뉴를 조정할 수 있어요.</p>
              <ul className="req-list">
                {pending.length === 0 && <li className="sm">대기 중인 요청이 없어요.</li>}
                {pending.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => { setSel(b); setPanel(null); }}>
                      <b>{b.customer?.name ?? "고객"}</b>{b.source === "naver" && <span className="nv">N</span>}
                      <span className="sm">{mdLabel(ymdOfIso(b.start_at))} {hhmm(minsOfDay(b.start_at))} · {b.items[0]?.name ?? ""} · {designerName(b.designer_id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="card legend">
            <b>시술 컬러</b>
            <ul>{KINDS.filter((k) => k.value !== "etc").map((k) => <li key={k.value}><span className="sw" style={{ background: k.color }} />{k.label}</li>)}</ul>
            <p className="sm">예약 메뉴의 소요시간만큼 블록이 자동으로 잡혀요. 위 · 아래 끝을 끌어 10분 단위로 조절해요.</p>
          </div>
        </aside>
      </div>
      {checkout && (
        <Checkout supabase={supabase} shopId={shopId} b={checkout} canRecord={recPerm === "all" || (recPerm === "own" && checkout.designer_id === myMemberId)} menus={menus} designers={designers} onClose={() => setCheckout(null)}
          onDone={(m) => { setCheckout(null); setToast(m); load(); loadCounts(); }} />
      )}
      {toast && <div className="cal-toast" role="status">{toast}</div>}
    </div>
  );
}
