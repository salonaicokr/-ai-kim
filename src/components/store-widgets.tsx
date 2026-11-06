// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { ACTIVE, BOOKING_SELECT, STATUS, addDays, hhmm, kstDate, mdLabel, minsOfDay, normalize, ymdOf, ymdOfIso, type Booking, type Status } from "@/src/salon/calendar/lib";
import { hoursError } from "@/src/lib/hours";
import "./store-widgets.css";

type Props = { shopId: string; myMemberId: string; designers: { id: string; name: string }[]; okPerm: "none" | "own" | "all" };
const TABS: { key: "all" | Status; label: string }[] = [
  { key: "all", label: "전체" }, { key: "confirmed", label: "확정" }, { key: "requested", label: "승인 대기" }, { key: "in_service", label: "시술중" },
];
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

/**
 * S-10 매장 현황 패널: 데스크톱은 오른쪽 고정 칸(320px · 1024~1279px 는 280px) — 본문을 덮지 않음.
 * ① 승인 대기(고객 앱 · 네이버에서 들어온 예약을 여기서 바로 승인/거절) ② 오늘 현황 ③ 네이버 예약 위젯 자리.
 * 1023px 이하는 하단 탭 위 고정 바(기본 접힘).
 */
export default function StoreWidgets({ shopId, myMemberId, designers, okPerm }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const path = usePathname();
  const [rows, setRows] = useState<Booking[]>([]);
  const [reqs, setReqs] = useState<Booking[]>([]);
  const [chg, setChg] = useState<{ id: string; booking_id: string; kind: string; message: string | null; created_at: string; b: Booking | null }[]>([]);
  const [tab, setTab] = useState<"all" | Status>("all");
  const [open, setOpen] = useState(false); // 휴대폰 · 태블릿에서 펼침
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const withCustomers = useCallback(async (list: Booking[]) => {
    const ids = [...new Set(list.map((r) => r.shop_customer_id).filter(Boolean))] as string[];
    if (!ids.length) return list;
    const { data } = await supabase.from("v_shop_customers").select("id, name, phone").in("id", ids);
    const map = new Map((data ?? []).map((c) => [c.id as string, c]));
    return list.map((r) => ({ ...r, customer: r.shop_customer_id ? map.get(r.shop_customer_id) ?? undefined : undefined }));
  }, [supabase]);

  const load = useCallback(async () => {
    const today = ymdOf(new Date());
    const [t, r] = await Promise.all([
      supabase.from("bookings").select(BOOKING_SELECT).eq("shop_id", shopId)
        .gte("start_at", kstDate(today).toISOString()).lt("start_at", kstDate(addDays(today, 1)).toISOString()).in("status", ACTIVE).order("start_at"),
      // 승인 대기: 오늘 이후 전부 (가까운 순)
      supabase.from("bookings").select(BOOKING_SELECT).eq("shop_id", shopId).eq("status", "requested")
        .gte("start_at", new Date(Date.now() - 2 * 3_600_000).toISOString()).order("start_at").limit(20),
    ]);
    setRows(await withCustomers(normalize(t.data ?? [])));
    setReqs(await withCustomers(normalize(r.data ?? [])));
    // 고객 앱에서 들어온 시간 변경 · 취소 요청
    const { data: cr } = await supabase.from("booking_change_requests").select("id, booking_id, kind, message, created_at").eq("shop_id", shopId).eq("status", "open").order("created_at", { ascending: false }).limit(20);
    const reqRows = (cr ?? []) as { id: string; booking_id: string; kind: string; message: string | null; created_at: string }[];
    if (reqRows.length) {
      const { data: bk } = await supabase.from("bookings").select(BOOKING_SELECT).in("id", reqRows.map((x) => x.booking_id));
      const named = await withCustomers(normalize(bk ?? []));
      const bm = new Map(named.map((x) => [x.id, x]));
      setChg(reqRows.map((x) => ({ ...x, b: bm.get(x.booking_id) ?? null })).filter((x) => x.b));
    } else setChg([]);
  }, [supabase, shopId, withCustomers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const ch = supabase.channel(`panel-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `shop_id=eq.${shopId}` }, () => load())
      .subscribe();
    const t = setInterval(load, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [supabase, shopId, load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t); }, [msg]);

  /** 고객 취소 요청 승인(예약 취소) · 시간 변경 요청 처리 완료 · 요청 거절(예약 유지) */
  async function settle(x: (typeof chg)[number], act: "approve" | "decline") {
    setBusy(x.id);
    let err: string | null = null;
    if (act === "approve" && x.kind === "cancel") {
      const r = await supabase.from("bookings").update({ status: "cancelled_customer" }).eq("id", x.booking_id);
      err = r.error?.message ?? null;
    }
    if (!err) {
      const r = await supabase.from("booking_change_requests").update({ status: act === "approve" ? "handled" : "declined", handled_at: new Date().toISOString() }).eq("id", x.id);
      err = r.error?.message ?? null;
    }
    setBusy(null);
    setMsg(err ? `처리하지 못했어요: ${err}` : act === "approve" ? (x.kind === "cancel" ? "예약을 취소했어요" : "요청을 처리 완료로 표시했어요") : "요청을 거절하고 예약을 유지해요");
    load();
  }

  const canOk = (b: Booking) => okPerm === "all" || (okPerm === "own" && b.designer_id === myMemberId);
  async function decide(b: Booking, ok: boolean) {
    setBusy(b.id);
    const { error } = await supabase.from("bookings").update({ status: ok ? "confirmed" : "cancelled_shop" }).eq("id", b.id);
    setBusy(null);
    setMsg(error ? `처리하지 못했어요: ${hoursError(error.message)}` : `${b.customer?.name ?? "고객"} 님 예약을 ${ok ? "확정했어요" : "거절했어요"}`);
    load();
  }

  const cnt = (s: Status) => rows.filter((r) => r.status === s).length;
  const list = tab === "all" ? rows : rows.filter((r) => r.status === tab);
  const dn = (id: string) => designers.find((d) => d.id === id)?.name ?? "";
  const seen = new Set((get("salonai.naver.seen") ?? "").split(",").filter(Boolean));
  if (path.startsWith("/signup")) return null;

  return (
    <aside className={`sp-panel${open ? " open" : ""}`} aria-label="매장 현황">
      {/* 휴대폰 · 태블릿: 한 줄 요약 바 (누르면 펼침) */}
      <button type="button" className="sp-bar" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <b>매장 현황</b>
        <span className="sp-nums tnum">
          <span>오늘 <b>{rows.length}</b></span><span>확정 <b>{cnt("confirmed")}</b></span>
          <span className={reqs.length ? "hot" : ""}>승인 대기 <b>{reqs.length}</b></span><span>시술중 <b>{cnt("in_service")}</b></span>
        </span>
        <span className="chev" aria-hidden>{open ? "▾" : "▴"}</span>
      </button>

      <div className="sp-body">
        <h2 className="sp-title">매장 현황 <span className="sm">{mdLabel(ymdOf(new Date()))} 오늘</span></h2>
        {msg && <p className="msg ok sp-msg" role="status">{msg}</p>}

        <section className="sp-sec sp-req" aria-label="승인 대기">
          <div className="sp-h"><b>승인 대기</b><span className={`pill ${reqs.length ? "p-amb" : "p-gray"}`}>{reqs.length}</span></div>
          {reqs.length === 0 ? <p className="sm sp-empty">승인을 기다리는 예약이 없어요.</p> : (
            <ul className="sp-reqs">
              {reqs.map((b) => (
                <li key={b.id}>
                  <Link href={`/desk/bookings?b=${b.id}`} className="sp-who">
                    {b.source === "naver" && <span className="nv-badge">N</span>}{b.source === "app" && <span className="nv-badge app">앱</span>}
                    <b>{b.customer?.name ?? "고객"}</b>
                    {b.source === "naver" && !seen.has(b.id) && <span className="new">새</span>}
                    <span className="sm tnum">{mdLabel(ymdOfIso(b.start_at))} {hhmm(minsOfDay(b.start_at))}</span>
                  </Link>
                  <span className="sm sp-sub">{b.items.map((i) => i.name).join(" + ") || "메뉴 미정"} · {dn(b.designer_id)}</span>
                  {canOk(b) && (
                    <span className="sp-acts">
                      <button type="button" className="btn ghost sm-btn" disabled={busy === b.id} onClick={() => decide(b, false)}>거절</button>
                      <button type="button" className="btn pri sm-btn" disabled={busy === b.id} onClick={() => decide(b, true)}>승인</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {chg.length > 0 && (
          <section className="sp-sec sp-req" aria-label="고객 변경 요청">
            <div className="sp-h"><b>고객 변경 · 취소 요청</b><span className="pill p-amb">{chg.length}</span></div>
            <ul className="sp-reqs">
              {chg.map((x) => (
                <li key={x.id}>
                  <Link href={`/desk/bookings?b=${x.booking_id}`} className="sp-who">
                    <span className="nv-badge app">앱</span>
                    <b>{x.b?.customer?.name ?? "고객"}</b>
                    <span className="sm tnum">{x.b ? `${mdLabel(ymdOfIso(x.b.start_at))} ${hhmm(minsOfDay(x.b.start_at))}` : ""}</span>
                  </Link>
                  <span className="sm sp-sub">{x.kind === "cancel" ? "예약 취소 요청" : "시간 변경 요청"}{x.message ? ` · ${x.message}` : ""}</span>
                  <span className="sp-acts">
                    <button type="button" className="btn ghost sm-btn" disabled={busy === x.id} onClick={() => settle(x, "decline")}>거절</button>
                    <button type="button" className="btn pri sm-btn" disabled={busy === x.id} onClick={() => settle(x, "approve")}>{x.kind === "cancel" ? "취소 승인" : "처리 완료"}</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sp-sec" aria-label="오늘 예약">
          <div className="sp-kpi tnum">
            <div><span className="sm">오늘</span><b>{rows.length}</b></div>
            <div><span className="sm">확정</span><b>{cnt("confirmed")}</b></div>
            <div><span className="sm">시술중</span><b>{cnt("in_service")}</b></div>
            <div><span className="sm">방문완료</span><b>{cnt("completed")}</b></div>
          </div>
          <div className="st-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
                {t.label} {t.key === "all" ? rows.length : cnt(t.key)}
              </button>
            ))}
          </div>
          <ul className="st-list">
            {list.length === 0 && <li className="sm empty">해당하는 예약이 없어요.</li>}
            {list.map((b) => (
              <li key={b.id}>
                <Link href={`/desk/bookings?b=${b.id}`}>
                  <span className="tnum t">{hhmm(minsOfDay(b.start_at))}</span>
                  <span className={`pill ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
                  <b className="nm ell">{b.customer?.name ?? "고객"}</b>
                  <span className="sm ell d">{dn(b.designer_id)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link className="st-more sm" href="/desk/bookings">예약 캘린더 열기 →</Link>
        </section>

        <section className="sp-sec sp-naver" aria-label="네이버 예약">
          <div className="sp-h"><span className="nv-badge">N</span><b>네이버 예약</b><span className="pill soon">연동 준비 중</span></div>
          <p className="sm">네이버 예약을 연결하면 이 자리에 네이버 예약 현황이 보여요. 지금은 연동 준비 중이에요.</p>
        </section>
      </div>
    </aside>
  );
}
