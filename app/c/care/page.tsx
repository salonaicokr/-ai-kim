"use client";
// @ts-nocheck

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ago, msgOf, rpc, sb } from "@/src/lib/customer/api";
import { Loading, Page, Top, useGuard, useNotifWatch } from "../ui";

const TABS = [["all", "전체"], ["reservation", "예약"], ["aftercare", "시술 후 관리"], ["revisit", "재방문"], ["event", "이벤트"], ["payment", "결제"]] as const;
const ICON: Record<string, string> = { reservation: "📅", aftercare: "💆", revisit: "🔁", event: "🎁", payment: "💳" };

export default function Care() {
  const g = useGuard();
  const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null);
  const [tab, setTab] = useState("all");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("customer_notifications").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) setErr(error.message); else setRows(data ?? []);
  }, []);
  useEffect(() => { if (g.ready) { rpc("c_refresh_care").catch(() => {}).finally(load); } }, [g.ready, load]);
  useNotifWatch(g.uid, () => load());

  async function open(n: any) {
    try {
      await rpc("c_confirm_notification", { p_id: n.id });
      setRows((r) => (r ?? []).map((x) => (x.id === n.id ? { ...x, read_at: x.read_at ?? new Date().toISOString(), confirmed_at: new Date().toISOString() } : x)));
      if (n.category === "payment" && n.booking_id) router.push(`/c/booking/${n.booking_id}`);
      else if (n.booking_id) router.push(`/c/booking/${n.booking_id}`);
      else if (n.category === "revisit") router.push("/c/book");
    } catch (e) { setErr(msgOf(e)); }
  }
  async function readAll() {
    try { await rpc("c_mark_notifications_read", { p_ids: null }); await load(); } catch (e) { setErr(msgOf(e)); }
  }
  async function askPermission() {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    if (r === "granted") localStorage.setItem("c.push", "on");
    setErr(r === "granted" ? null : "브라우저에서 알림이 차단돼 있어요. 주소창 설정에서 허용해 주세요.");
  }

  if (!g.ready) return <main className="cpage"><Top back="/c/home" title="케어 알림" /><Loading /></main>;
  const list = (rows ?? []).filter((n) => tab === "all" || n.category === tab);
  const unread = (rows ?? []).filter((n) => !n.read_at).length;
  const canAsk = typeof Notification !== "undefined" && Notification.permission === "default";
  return (
    <Page tabbed={false}>
      <Top back="/c/home" title="케어 알림" right={unread > 0 ? <button type="button" className="clink" onClick={readAll}>모두 읽음</button> : null} />
      {canAsk && <button type="button" className="cbanner" onClick={askPermission}><span style={{ fontSize: 24 }} aria-hidden>🔔</span><span style={{ flex: 1, textAlign: "left" }}>알림을 켜 보세요<small>예약 확정 · 결제 요청을 바로 받아요</small></span></button>}
      <div className="cchips" role="tablist">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`cchip${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {err && <p className="cmsg err" role="alert">{err}</p>}
      {!rows ? <Loading /> : list.length === 0 ? <div className="ccard soft"><b>알림이 없어요</b><span className="cmt">예약 · 시술 · 결제 소식이 여기에 모여요</span></div> : (
        <div className="clist">
          {list.map((n) => (
            <button key={n.id} type="button" className="citem" style={{ textAlign: "left", opacity: n.read_at ? 0.7 : 1 }} onClick={() => open(n)}>
              <span style={{ fontSize: 24 }} aria-hidden>{ICON[n.category] ?? "🔔"}</span>
              <div className="cstack" style={{ flex: 1 }}>
                <div className="crow"><b>{n.title}</b>{!n.read_at && <span className="cdot" aria-label="안 읽음" />}</div>
                {n.body && <span className="cmt">{n.body}</span>}
                <span className="cmt" style={{ fontSize: 12 }}>{ago(n.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}
