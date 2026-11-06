"use client";
// @ts-nocheck

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { daysSince, kindOfName, msgOf, rpc, when } from "@/src/lib/customer/api";
import { damageAdvice, damageColor, damageHeadline } from "@/src/lib/customer/care";
import { Loading, Page, useGuard } from "../ui";

export default function Analysis() {
  const g = useGuard();
  const [bks, setBks] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (g.ready) rpc<any[]>("c_my_bookings").then(setBks).catch((e) => setErr(msgOf(e))); }, [g.ready]);

  const a = useMemo(() => {
    const done = (bks ?? []).filter((b) => b.status === "completed");
    const withD = done.filter((b) => b.damage != null).slice(0, 3).reverse(); // 오래된 → 최근
    const since = Date.now() - 90 * 86400000;
    const recent = done.filter((b) => new Date(b.start).getTime() >= since);
    const kinds: Record<string, number> = {};
    done.forEach((b) => b.items.forEach((i: any) => { const k = kindOfName(i.name); kinds[k] = (kinds[k] ?? 0) + 1; }));
    const lastVisit = done[0];
    const next = lastVisit ? new Date(new Date(lastVisit.start).getTime() + 42 * 86400000) : null;
    const trend = withD.length >= 2 ? withD[withD.length - 1].damage - withD[0].damage : 0;
    const summaries = done.filter((b) => b.summary).slice(0, 3);
    return { done, withD, recent, kinds, lastVisit, next, trend, summaries };
  }, [bks]);

  if (!g.ready || !bks) return <main className="cpage"><Loading /></main>;
  const cur = a.withD[a.withD.length - 1]?.damage ?? null;
  return (
    <Page>
      <h1 className="ch1">헤어 분석</h1>
      {err && <p className="cmsg err">{err}</p>}
      {a.done.length === 0 ? (
        <div className="ccard soft"><b>분석할 시술 기록이 아직 없어요</b><span className="cmt">시술을 받으면 손상도 · 방문 주기를 분석해드려요</span><Link className="cbtn pri sm" href="/c/book">예약하기</Link></div>
      ) : (<>
        <div className="ccard">
          <span className="ck">현재 손상도</span>
          {cur != null ? (<>
            <div className="crow"><b style={{ fontSize: 20 }}>{damageHeadline(cur)}</b><span className="csp" /><b style={{ fontSize: 28, color: damageColor(cur) }}>{cur}<small style={{ fontSize: 14 }}>/10</small></b></div>
            <div className="cbar"><i style={{ width: `${cur * 10}%`, background: damageColor(cur) }} /></div>
            <span className="cmt">{damageAdvice(cur)}</span>
          </>) : <span className="cmt">손상도 기록이 아직 없어요</span>}
        </div>

        {a.withD.length >= 2 && (
          <div className="ccard">
            <div className="crow"><b>손상도 추이</b><span className="csp" /><span className="cmt" style={{ color: a.trend > 0 ? "#E5484D" : a.trend < 0 ? "#00A88F" : undefined, fontWeight: 800 }}>{a.trend > 0 ? `▲ ${a.trend} 악화` : a.trend < 0 ? `▼ ${-a.trend} 개선` : "변화 없음"}</span></div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 110 }}>
              {a.withD.map((b) => (
                <div key={b.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, justifyContent: "flex-end", height: "100%" }}>
                  <b style={{ color: damageColor(b.damage) }}>{b.damage}</b>
                  <div style={{ width: "100%", height: `${b.damage * 8}px`, background: damageColor(b.damage), borderRadius: 8 }} />
                  <span className="cmt" style={{ fontSize: 11 }}>{new Date(b.start).getMonth() + 1}/{new Date(b.start).getDate()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="cgrid3">
          <div className="cstat"><b>{a.recent.length}</b><span>최근 3개월 방문</span></div>
          <div className="cstat"><b>{a.lastVisit ? daysSince(a.lastVisit.start) : "-"}</b><span>마지막 시술 후(일)</span></div>
          <div className="cstat"><b>{a.done.length}</b><span>누적 시술</span></div>
        </div>

        <div className="ccard">
          <b>시술 종류</b>
          <div className="cchips">{Object.entries(a.kinds).sort((x, y) => y[1] - x[1]).map(([k, n]) => <span key={k} className="cpill">{k} {n}회</span>)}</div>
        </div>

        {a.next && (
          <div className="ccard warm">
            <span className="ck">다음 방문 추천</span>
            <b style={{ fontSize: 18 }}>{when(a.next.toISOString())}</b>
            <span className="cmt">마지막 시술 6주 뒤 · 모발 건강과 스타일 유지에 적당한 시기예요</span>
            <Link className="cbtn pri sm" href="/c/book">예약하기</Link>
          </div>
        )}

        {a.summaries.length > 0 && (
          <section className="clist">
            <h2 className="ch2">AI 시술 요약</h2>
            {a.summaries.map((b) => (
              <Link key={b.id} href={`/c/booking/${b.id}`} className="ccard" style={{ textDecoration: "none", color: "inherit" }}>
                <span className="ck">{when(b.start)} · {b.store}</span>
                <span className="cmt" style={{ color: "var(--k)" }}>{b.summary}</span>
              </Link>
            ))}
          </section>
        )}
      </>)}
    </Page>
  );
}
