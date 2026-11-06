"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { KINDS, kindOf, type MenuKind } from "@/src/lib/menu";
import { END_H, START_H, WEEK, addDays, addMonths, dowOf, hhmm, kstDate, mdLabel, minsOfDay, monthStart, weekStart, ymdOfIso } from "../calendar/lib";
import "./sales.css";

type Period = "day" | "week" | "month";
type Pay = {
  id: string; paid_amount: number; refunded_amount: number; calculated_total: number; status: string; method: string; designer_id: string | null;
  paid_at: string; bookings?: { start_at: string } | null; is_overridden: boolean; override_reason: string | null; shop_customer_id: string | null;
  payment_items: { name: string; unit_price: number; qty: number; menu_items: { menu_categories: { kind: MenuKind } | null } | null }[];
};
const METHOD: Record<string, string> = { card: "카드", npay: "N페이", cash: "현금", transfer: "계좌이체", prepaid: "정액권", app: "앱 결제" };
const won = (n: number) => n.toLocaleString("ko-KR");
const net = (p: Pay) => p.paid_amount - p.refunded_amount;

export default function Sales({ shopId, shopName, scope, canExport, today }: {
  shopId: string; shopName: string; scope: "own" | "all"; myMemberId: string; canExport: boolean; today: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [period, setPeriod] = useState<Period>("day"); // S-14 항상 오늘 일별로 시작 (마지막 선택 저장 안 함)
  const [date, setDate] = useState(today);
  const [pays, setPays] = useState<Pay[]>([]);
  const [prevTotal, setPrevTotal] = useState<number | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [custs, setCusts] = useState<Record<string, string>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; label: string; v: number; n: number } | null>(null);

  const range = useMemo(() => {
    if (period === "day") return { from: date, to: addDays(date, 1), prevFrom: addDays(date, -1) };
    if (period === "week") { const w = weekStart(date); return { from: w, to: addDays(w, 7), prevFrom: addDays(w, -7) }; }
    const m = monthStart(date); return { from: m, to: addMonths(m, 1), prevFrom: addMonths(m, -1) };
  }, [period, date]);
  const key = `${period}:${range.from}`;

  const load = useCallback(async () => {
    const [cur, prev, mem] = await Promise.all([
      supabase.from("payments")
        .select("id, paid_amount, refunded_amount, calculated_total, status, method, designer_id, paid_at, is_overridden, override_reason, shop_customer_id, bookings(start_at), payment_items(name, unit_price, qty, menu_items(menu_categories(kind)))")
        .eq("shop_id", shopId).gte("paid_at", kstDate(range.from).toISOString()).lt("paid_at", kstDate(range.to).toISOString()).order("paid_at", { ascending: false }),
      supabase.from("payments").select("paid_amount, refunded_amount").eq("shop_id", shopId)
        .gte("paid_at", kstDate(range.prevFrom).toISOString()).lt("paid_at", kstDate(range.from).toISOString()),
      supabase.from("shop_members").select("id, display_name").eq("shop_id", shopId),
    ]);
    const rows = (cur.data ?? []) as unknown as Pay[];
    setPays(rows);
    setPrevTotal((prev.data ?? []).reduce((a, p) => a + (p.paid_amount as number) - (p.refunded_amount as number), 0));
    setNames(Object.fromEntries((mem.data ?? []).map((m) => [m.id, m.display_name])));
    const ids = [...new Set(rows.map((r) => r.shop_customer_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data } = await supabase.from("v_shop_customers").select("id, name").in("id", ids);
      setCusts(Object.fromEntries((data ?? []).map((c) => [c.id, c.name])));
    }
    setLoadedKey(key);
  }, [supabase, shopId, range, key]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // ---- 집계 ----
  const total = pays.reduce((a, p) => a + net(p), 0);
  const count = pays.filter((p) => p.status !== "refunded").length;
  const refunds = pays.reduce((a, p) => a + p.refunded_amount, 0);
  const overrides = pays.filter((p) => p.is_overridden);
  const avg = count ? Math.round(total / count) : 0;
  const delta = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const buckets = useMemo(() => {
    if (period === "day") {
      // 시술 시작 시각 기준(예약 연결 결제) · 없으면 결제 시각. 영업시간 밖 결제가 있으면 그 시간도 포함
      const hourOf = (p: Pay) => Math.floor(minsOfDay(p.bookings?.start_at ?? p.paid_at) / 60);
      const used = pays.map(hourOf);
      const lo = Math.min(START_H, ...used), hi = Math.max(END_H - 1, ...used);
      const hrs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      return hrs.map((h) => {
        const list = pays.filter((p) => hourOf(p) === h);
        return { key: String(h), label: `${h}시`, v: list.reduce((a, p) => a + net(p), 0), n: list.length };
      });
    }
    const days = period === "week" ? 7 : Math.round((kstDate(range.to).getTime() - kstDate(range.from).getTime()) / 86_400_000);
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(range.from, i);
      const list = pays.filter((p) => ymdOfIso(p.paid_at) === d);
      return { key: d, label: period === "week" ? `${WEEK[dowOf(d)]} ${mdLabel(d)}` : String(Number(d.slice(8))), v: list.reduce((a, p) => a + net(p), 0), n: list.length };
    });
  }, [pays, period, range]);
  const max = Math.max(1, ...buckets.map((b) => b.v)) * 1.12; // 막대 위 금액 자리
  /** 막대 위 금액: 1만 이상은 ‘12.5만’, 그 아래는 ‘8,000’ */
  const short = (v: number) => (v >= 10000 ? `${(Math.round(v / 1000) / 10).toLocaleString()}만` : v.toLocaleString());

  const group = (keyOf: (p: Pay) => string) => {
    const m = new Map<string, { v: number; n: number }>();
    pays.forEach((p) => { const k = keyOf(p); const g = m.get(k) ?? { v: 0, n: 0 }; g.v += net(p); if (p.status !== "refunded") g.n += 1; m.set(k, g); });
    return [...m.entries()].map(([k, g]) => ({ k, ...g })).sort((a, b) => b.v - a.v);
  };
  const byDesigner = group((p) => p.designer_id ?? "-");
  const byMethod = group((p) => p.method);
  const byKind = (() => {
    const m = new Map<string, number>();
    pays.filter((p) => p.status !== "refunded").forEach((p) => p.payment_items.forEach((i) => {
      const k = i.menu_items?.menu_categories?.kind ?? "etc";
      m.set(k, (m.get(k) ?? 0) + i.unit_price * (i.qty ?? 1));
    }));
    return KINDS.map((k) => ({ k: k.value, v: m.get(k.value) ?? 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  })();
  const kindMax = Math.max(1, ...byKind.map((x) => x.v));

  function exportCsv() {
    const head = ["결제일시", "고객", "담당", "시술", "결제수단", "계산금액", "결제금액", "환불", "금액수정사유"];
    const rows = pays.map((p) => [
      `${ymdOfIso(p.paid_at)} ${hhmm(minsOfDay(p.paid_at))}`, custs[p.shop_customer_id ?? ""] ?? "", names[p.designer_id ?? ""] ?? "",
      p.payment_items.map((i) => i.name).join(" + "), METHOD[p.method] ?? p.method, p.calculated_total, p.paid_amount, p.refunded_amount, p.override_reason ?? "",
    ]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `SALONAI_매출_${range.from}_${addDays(range.to, -1)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const title = period === "day" ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 (${WEEK[dowOf(date)]})`
    : period === "week" ? `${mdLabel(range.from)} – ${mdLabel(addDays(range.to, -1))}` : `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`;
  const step = (n: number) => setDate(period === "month" ? addMonths(date, n) : addDays(date, period === "week" ? 7 * n : n));
  const prevLabel = period === "day" ? "전날" : period === "week" ? "지난주" : "지난달";
  const loading = loadedKey !== key;

  return (
    <div className="sl-page">
      <div className="sl-head">
        <div>
          <p className="crumb">매출 · 정산 · {scope === "all" ? `${shopName} 전체` : "내 매출"}</p>
          <h1 className="h1">매출 · 정산</h1>
        </div>
        <div className="row nav">
          <button className="btn ghost icon" type="button" aria-label="이전" onClick={() => step(-1)}>‹</button>
          <span className="cur tnum">{title}</span>
          <button className="btn ghost icon" type="button" aria-label="다음" onClick={() => step(1)}>›</button>
        </div>
        <span className="sp" />
        <div className="seg" role="tablist" aria-label="기간">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={period === p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>{{ day: "일별", week: "주별", month: "월별" }[p]}</button>
          ))}
        </div>
        {canExport && <button className="btn ghost" type="button" onClick={exportCsv} disabled={!pays.length}>엑셀(CSV) 내보내기</button>}
      </div>

      <section className="kpi-row" aria-label="요약">
        <div className="card kpi hero">
          <span className="lbl">순매출 (환불 반영)</span>
          <b className="tnum">{won(total)}원</b>
          {delta != null && <span className={`sm delta ${delta >= 0 ? "up" : "down"}`}>{prevLabel} 대비 {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</span>}
          {delta == null && <span className="sm">{prevLabel} 매출 없음</span>}
        </div>
        <div className="card kpi"><span className="lbl">결제 건수</span><b className="tnum">{count}건</b></div>
        <div className="card kpi"><span className="lbl">객단가</span><b className="tnum">{won(avg)}원</b></div>
        <div className="card kpi"><span className="lbl">환불</span><b className="tnum">{won(refunds)}원</b></div>
        <div className="card kpi"><span className="lbl">금액 직접 수정</span><b className="tnum">{overrides.length}건</b></div>
      </section>

      <section className="card chart-card" aria-label={`${period === "day" ? "시간대별" : "일별"} 매출`}>
        <div className="row"><h2 className="b">{period === "day" ? "시간대별 매출" : "일별 매출"}</h2><span className="sp" />{loading && <span className="sm">불러오는 중…</span>}</div>
        <div className={`bars${period === "month" ? " dense" : ""}`} onMouseLeave={() => setTip(null)}>
          {[0.5, 1].map((g) => <i key={g} className="grid" style={{ bottom: `calc(22px + ${g} * (100% - 22px))` }}><span className="tnum">{won(Math.round((max * g) / 10000))}만</span></i>)}
          {buckets.map((b, i) => (
            <div key={b.key} className="bar-col" onMouseEnter={() => setTip({ x: (i + 0.5) / buckets.length, label: b.label, v: b.v, n: b.n })}
              onFocus={() => setTip({ x: (i + 0.5) / buckets.length, label: b.label, v: b.v, n: b.n })} tabIndex={0} aria-label={`${b.label} ${won(b.v)}원 ${b.n}건`}>
              {b.v > 0 && <span className="val tnum" style={{ bottom: `calc(${(b.v / max) * 100}% + 2px)` }}>{short(b.v)}</span>}
              <span className={`bar${b.key === today ? " today" : ""}`} style={{ height: `${(b.v / max) * 100}%` }} />
              <span className="x sm">{b.label}</span>
            </div>
          ))}
          {tip && (
            <div className="tip" style={{ left: `${tip.x * 100}%` }}>
              <b>{tip.label}</b><span className="tnum">{won(tip.v)}원 · {tip.n}건</span>
            </div>
          )}
        </div>
      </section>

      <div className="grid3">
        <section className="card brk">
          <h2 className="b">디자이너별</h2>
          {byDesigner.length === 0 && <p className="sm">이 기간 결제가 없어요.</p>}
          <ul>
            {byDesigner.map((d) => (
              <li key={d.k}>
                <div className="row"><b>{names[d.k] ?? "미지정"}</b><span className="sp" /><b className="tnum">{won(d.v)}원</b></div>
                <div className="meter"><span style={{ width: `${total ? (d.v / total) * 100 : 0}%` }} /></div>
                <span className="sm tnum">{d.n}건 · 객단가 {won(d.n ? Math.round(d.v / d.n) : 0)}원 · {total ? Math.round((d.v / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card brk">
          <h2 className="b">결제 수단별</h2>
          {byMethod.length === 0 && <p className="sm">이 기간 결제가 없어요.</p>}
          <ul>
            {byMethod.map((m) => (
              <li key={m.k}>
                <div className="row"><b className={m.k === "npay" ? "npay" : ""}>{METHOD[m.k] ?? m.k}</b><span className="sp" /><b className="tnum">{won(m.v)}원</b></div>
                <div className="meter"><span style={{ width: `${total ? (m.v / total) * 100 : 0}%` }} /></div>
                <span className="sm tnum">{m.n}건 · {total ? Math.round((m.v / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card brk">
          <h2 className="b">시술 종류별</h2>
          {byKind.length === 0 && <p className="sm">이 기간 시술 내역이 없어요.</p>}
          <ul>
            {byKind.map((x) => {
              const k = kindOf(x.k);
              return (
                <li key={x.k}>
                  <div className="row"><span className="sw" style={{ background: k.color }} /><b>{k.label}</b><span className="sp" /><b className="tnum">{won(x.v)}원</b></div>
                  <div className="meter"><span style={{ width: `${(x.v / kindMax) * 100}%`, background: k.color }} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="card pay-list">
        <div className="row"><h2 className="b">결제 내역</h2><span className="pill p-gray">{pays.length}건</span><span className="sp" />{overrides.length > 0 && <span className="sm">금액을 직접 고친 결제는 <b className="ov-key">수정</b> 표시와 사유가 보여요</span>}</div>
        <div className="tw">
          <table className="pt-tbl">
            <thead><tr><th>일시</th><th>고객</th><th>담당</th><th>시술</th><th>수단</th><th className="num">결제 금액</th></tr></thead>
            <tbody>
              {pays.length === 0 && <tr><td colSpan={6} className="empty">이 기간 결제가 없어요. 예약 캘린더에서 ‘완료 · 결제’를 하면 여기에 쌓여요.</td></tr>}
              {pays.map((p) => (
                <tr key={p.id} className={p.status === "refunded" ? "refunded" : ""}>
                  <td className="tnum">{mdLabel(ymdOfIso(p.paid_at))} {hhmm(minsOfDay(p.paid_at))}</td>
                  <td>{custs[p.shop_customer_id ?? ""] ?? "—"}</td>
                  <td>{names[p.designer_id ?? ""] ?? "—"}</td>
                  <td className="items">{p.payment_items.map((i) => i.name).join(" + ")}</td>
                  <td>{METHOD[p.method] ?? p.method}</td>
                  <td className="num tnum">
                    <div className="amt">
                      <b>{won(p.paid_amount)}원</b>
                      {p.status === "refunded" && <span className="pill rf">환불</span>}
                      {p.is_overridden && <span className="ov" title={p.override_reason ?? ""}>수정 · {p.override_reason} (계산 {won(p.calculated_total)})</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
