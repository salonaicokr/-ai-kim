"use client";
// @ts-nocheck

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtPhone, msgOf, rpc, sb, won } from "@/src/lib/customer/api";
import { Loading, Page, SignedImg, Toggle, useGuard } from "../ui";

export default function My() {
  const g = useGuard();
  const router = useRouter();
  const [bks, setBks] = useState<any[]>([]);
  const [pays, setPays] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [push, setPush] = useState(false);
  const [saving, setSaving] = useState(false);
  const p = g.profile;

  useEffect(() => {
    if (!g.ready) return;
    rpc<any[]>("c_my_bookings").then(setBks).catch(() => {});
    rpc("c_payments").then(setPays).catch(() => {});
    setPush(typeof Notification !== "undefined" && Notification.permission === "granted" && localStorage.getItem("c.push") !== "off");
  }, [g.ready]);

  async function setMsgPref(patch: Record<string, boolean>) {
    setSaving(true); setErr(null);
    const { error } = await sb.from("customer_profiles").update(patch).eq("user_id", g.uid);
    setSaving(false);
    if (error) setErr(error.message); else g.reload();
  }
  async function togglePush(v: boolean) {
    if (!v) { localStorage.setItem("c.push", "off"); setPush(false); return; }
    if (typeof Notification === "undefined") { setErr("이 브라우저는 알림을 지원하지 않아요"); return; }
    const r = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (r === "granted") { localStorage.setItem("c.push", "on"); setPush(true); } else setErr("브라우저에서 알림이 차단돼 있어요. 주소창의 사이트 설정에서 허용해 주세요.");
  }
  async function logout() { await sb.auth.signOut(); router.replace("/c/login"); }

  if (!g.ready || !p) return <main className="cpage"><Loading /></main>;
  const done = bks.filter((b) => b.status === "completed");
  const spent = (pays?.paid ?? []).reduce((a: number, x: any) => a + (x.type === "paid" ? x.amount : -x.amount), 0);
  const stores = new Set(done.map((b) => b.store_id)).size;
  return (
    <Page>
      <div className="ccard" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        {p.avatar_path ? <SignedImg bucket="customer-avatars" path={p.avatar_path} className="cavatar" style={{ width: 64, height: 64, borderRadius: 32, objectFit: "cover" }} /> : <div className="cavatar" aria-hidden style={{ width: 64, height: 64, fontSize: 24 }}>{(p.name ?? "?").slice(0, 1)}</div>}
        <div className="cstack" style={{ flex: 1 }}>
          <b style={{ fontSize: 19 }}>{p.nickname || p.name}</b>
          <span className="cmt">{p.login_id ? `@${p.login_id}` : p.email}</span>
          <span className="cmt">{fmtPhone(p.phone ?? "")}</span>
        </div>
        <Link href="/c/my/edit" className="cbtn sm">수정</Link>
      </div>
      {err && <p className="cmsg err" role="alert">{err}</p>}

      <div className="cgrid3">
        <div className="cstat"><b>{done.length}</b><span>시술</span></div>
        <div className="cstat"><b>{stores}</b><span>방문 매장</span></div>
        <div className="cstat"><b>{won(spent)}</b><span>누적 결제</span></div>
      </div>

      <section className="clist">
        <Link href="/c/pay" className="citem"><b>결제 · 영수증</b><span className="csp" />{pays?.requests?.length > 0 && <span className="cbadge">{pays.requests.length}</span>}<span aria-hidden>›</span></Link>
        <Link href="/c/shops" className="citem"><b>내 매장 · 매장 연결</b><span className="csp" /><span aria-hidden>›</span></Link>
        <Link href="/c/care" className="citem"><b>케어 알림함</b><span className="csp" /><span aria-hidden>›</span></Link>
        <Link href="/c/today" className="citem"><b>오늘의 케어 · 날씨</b><span className="csp" /><span aria-hidden>›</span></Link>
      </section>

      <section className="ccard">
        <b>알림 설정</b>
        <div className="crow"><span>예약 알림</span><span className="csp" /><Toggle on={p.msg_booking && !p.msg_all_off} label="예약 알림" disabled={saving || p.msg_all_off} onChange={(v) => setMsgPref({ msg_booking: v })} /></div>
        <div className="crow"><span>시술 후 케어 알림</span><span className="csp" /><Toggle on={p.msg_aftercare && !p.msg_all_off} label="시술 후 케어 알림" disabled={saving || p.msg_all_off} onChange={(v) => setMsgPref({ msg_aftercare: v })} /></div>
        <div className="crow"><span>재방문 알림</span><span className="csp" /><Toggle on={p.msg_revisit && !p.msg_all_off} label="재방문 알림" disabled={saving || p.msg_all_off} onChange={(v) => setMsgPref({ msg_revisit: v })} /></div>
        <div className="crow"><span>모든 알림 끄기</span><span className="csp" /><Toggle on={p.msg_all_off} label="모든 알림 끄기" disabled={saving} onChange={(v) => setMsgPref({ msg_all_off: v })} /></div>
        <hr style={{ border: 0, borderTop: "1px solid var(--ln)", width: "100%" }} />
        <div className="crow"><span>이 기기 브라우저 알림</span><span className="csp" /><Toggle on={push} label="브라우저 알림" onChange={togglePush} /></div>
        <span className="cmt" style={{ fontSize: 12 }}>알림은 앱을 열어둔 동안 실시간으로 받아요. 결제 요청 · 결제 알림은 꺼도 항상 받아요.</span>
      </section>

      <section className="clist">
        <Link href="/c/terms" className="citem"><b>이용약관 · 개인정보 처리방침</b><span className="csp" /><span aria-hidden>›</span></Link>
        <a href="mailto:support@ilong.app" className="citem"><b>문의하기</b><span className="csp" /><span aria-hidden>›</span></a>
      </section>
      <button type="button" className="cbtn" onClick={logout}>로그아웃</button>
    </Page>
  );
}
