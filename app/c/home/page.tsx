"use client";
// @ts-nocheck

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ACTIVE, STATUS_KO, STATUS_TONE, daysSince, msgOf, rpc, sb, when, won } from "@/src/lib/customer/api";
import { damageColor, damageHeadline, fetchWeather, weatherAdvice } from "@/src/lib/customer/care";
import { Loading, Page, Pill, SignedImg, useGuard, useNotifWatch } from "../ui";

export default function Home() {
  const g = useGuard();
  const [bks, setBks] = useState<any[] | null>(null);
  const [pays, setPays] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [mine, setMine] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [wx, setWx] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadUnread = useCallback(async () => {
    const { count } = await sb.from("customer_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    setUnread(count ?? 0);
  }, []);
  useEffect(() => {
    if (!g.ready) return;
    rpc("c_refresh_care").catch(() => {}).finally(loadUnread);
    rpc<any[]>("c_my_bookings").then(setBks).catch((e) => setErr(msgOf(e)));
    rpc("c_payments").then(setPays).catch(() => {});
    rpc("c_home_feed").then(setFeed).catch(() => {});
    rpc<any[]>("c_my_stores").then(setMine).catch(() => {});
  }, [g.ready, loadUnread]);
  useNotifWatch(g.uid, loadUnread);

  const upcoming = (bks ?? []).filter((b) => ACTIVE.includes(b.status) && new Date(b.end) > new Date()).sort((a, b) => a.start.localeCompare(b.start))[0];
  const recent = (bks ?? []).find((b) => b.status === "completed" && b.record_sent && !b.record_deleted) ?? (bks ?? []).find((b) => b.status === "completed");
  const damage = (bks ?? []).find((b) => b.damage != null)?.damage ?? null;
  useEffect(() => { if (g.ready) fetchWeather(false).then(setWx).catch(() => {}); }, [g.ready]);
  const adv = wx ? weatherAdvice(wx, damage) : null;
  const requests = pays?.requests ?? [];
  const name = g.profile?.nickname || g.profile?.name || "고객";

  if (!g.ready) return <main className="cpage"><Loading /></main>;
  return (
    <Page>
      <div className="crow" style={{ paddingTop: 4 }}>
        <div className="cstack">
          <span className="cmt">안녕하세요</span>
          <h1 className="ch1" style={{ fontSize: 24 }}>{name} 님</h1>
        </div>
        <Link href="/c/care" className="cback" aria-label={`케어 알림 ${unread}건`} style={{ position: "relative" }}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          {unread > 0 && <span className="cbadge" style={{ position: "absolute", top: 2, right: 0 }}>{unread > 9 ? "9+" : unread}</span>}
        </Link>
      </div>
      {err && <p className="cmsg err" role="alert">{err}</p>}

      {requests.length > 0 && (
        <Link href={requests.length === 1 ? `/c/pay/${requests[0].id}` : "/c/pay"} className="cbanner">
          <span style={{ fontSize: 26 }} aria-hidden>💳</span>
          <span style={{ flex: 1 }}>결제 요청이 {requests.length}건 있어요<small>{requests[0].store} · {won(requests[0].amount)}</small></span>
          <span aria-hidden>›</span>
        </Link>
      )}

      {!bks ? <Loading /> : upcoming ? (
        <Link href={`/c/booking/${upcoming.id}`} className="ccard dark" style={{ textDecoration: "none", color: "#fff" }}>
          <div className="crow"><span className="ck">다가오는 예약</span><span className="csp" /><Pill tone={STATUS_TONE[upcoming.status]}>{STATUS_KO[upcoming.status]}</Pill></div>
          <b style={{ fontSize: 20 }}>{when(upcoming.start)}</b>
          <span className="cmt">{upcoming.store}{upcoming.designer ? ` · ${upcoming.designer}` : ""} · {upcoming.items.map((i: any) => i.name).join(" + ")}</span>
          {upcoming.survey?.status === "sent" && <span className="cpill" style={{ alignSelf: "flex-start" }}>사전 문진 작성하기 ›</span>}
        </Link>
      ) : (
        <div className="ccard warm">
          <b style={{ fontSize: 18 }}>다음 예약을 잡아볼까요?</b>
          <span className="cmt">원하는 매장 · 디자이너 · 시간을 골라 바로 요청해요</span>
          <Link href={mine[0] ? `/c/book?store=${mine[0].store_id}${mine[0].designer_id ? `&designer=${mine[0].designer_id}` : ""}` : "/c/book"} className="cbtn pri">예약하기</Link>
        </div>
      )}

      {recent && (
        <section className="clist">
          <div className="csec"><h2>최근 시술</h2><span className="csp" /><Link href="/c/diary" className="clink">전체 보기</Link></div>
          <Link href={`/c/booking/${recent.id}`} className="citem">
            {recent.cover ? <SignedImg path={recent.cover} className="cthumb" /> : <div className="cdate"><b>{new Date(recent.start).getDate()}</b><span>{new Date(recent.start).getMonth() + 1}월</span></div>}
            <div className="cstack">
              <b>{recent.items.map((i: any) => i.name).join(" + ") || "시술"}</b>
              <span className="cmt">{recent.store}{recent.designer ? ` · ${recent.designer}` : ""}</span>
              <span className="cmt">{daysSince(recent.start)}일 전{recent.damage != null ? ` · 손상도 ${recent.damage}/10` : ""}</span>
            </div>
          </Link>
        </section>
      )}

      <div className="cgrid2">
        <Link href="/c/today" className="ccard soft" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="ck">오늘의 케어</span>
          <b style={{ fontSize: 15 }}>{adv ? adv.headline : damageHeadline(damage)}</b>
          {wx && <span className="cmt">{wx.label} {wx.temp}° · 습도 {wx.humidity}%</span>}
          {damage != null && <span className="cmt" style={{ color: damageColor(damage), fontWeight: 800 }}>손상도 {damage}/10</span>}
        </Link>
        <Link href="/c/ai" className="ccard soft" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="ck">AI 상담</span>
          <b style={{ fontSize: 15 }}>머릿결 고민을 물어보세요</b>
          <span className="cmt">내 시술 기록으로 답해줘요</span>
        </Link>
      </div>

      <div className="cgrid2">
        <Link href="/c/care" className="ccard" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="ck">케어 알림</span>
          <b>{unread > 0 ? `새 알림 ${unread}건` : "새 알림 없음"}</b>
          <span className="cmt">예약 · 시술 후 관리 · 재방문</span>
        </Link>
        <Link href="/c/shops" className="ccard" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="ck">내 매장</span>
          <b>{mine.length ? `${mine.length}곳 연결됨` : "매장 연결하기"}</b>
          <span className="cmt">코드 · QR · 검색</span>
        </Link>
      </div>

      {feed?.designers?.length > 0 && (
        <section className="clist">
          <div className="csec"><h2>인기 디자이너</h2></div>
          <div className="chs">
            {feed.designers.map((d: any) => (
              <Link key={d.id} href={`/c/book?store=${d.store_id}&designer=${d.id}`} className="ccard" style={{ width: 150, textDecoration: "none", color: "inherit" }}>
                <div className="cavatar" aria-hidden>{d.name.slice(0, 1)}</div>
                <b>{d.name}</b>
                <span className="cmt">{d.store}</span>
                <span className="cmt">{d.reviews > 0 ? `★ ${d.rating} (${d.reviews})` : d.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {feed?.showcase?.length > 0 && (
        <section className="clist">
          <div className="csec"><h2>매장 시술 사진</h2></div>
          <div className="chs">
            {feed.showcase.map((s: any) => (
              <Link key={s.record_id} href={`/c/book?store=${s.store_id}`} style={{ width: 200, textDecoration: "none", color: "inherit" }}>
                <div className="cgrid2" style={{ gap: 4 }}>
                  {s.before ? <SignedImg path={s.before} /> : <div className="cphoto" />}
                  {s.after ? <SignedImg path={s.after} /> : <div className="cphoto" />}
                </div>
                <b style={{ fontSize: 14 }}>{s.label || "시술"}</b><span className="cmt" style={{ display: "block" }}>{s.store}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
