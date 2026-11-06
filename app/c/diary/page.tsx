"use client";
// @ts-nocheck

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ACTIVE, KINDS, STATUS_KO, STATUS_TONE, kindOfName, msgOf, rpc, when, won } from "@/src/lib/customer/api";
import { Loading, Page, Pill, SignedImg, useGuard } from "../ui";

const SEG = [["all", "전체"], ["up", "예정"], ["done", "완료"], ["cx", "취소"]] as const;

export default function Diary() {
  const g = useGuard();
  const [bks, setBks] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [seg, setSeg] = useState<string>("all");
  const [year, setYear] = useState<number | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => { if (g.ready) rpc<any[]>("c_my_bookings").then(setBks).catch((e) => setErr(msgOf(e))); }, [g.ready]);

  const years = useMemo(() => [...new Set((bks ?? []).map((b) => new Date(b.start).getFullYear()))].sort((a, b) => b - a), [bks]);
  const list = useMemo(() => (bks ?? []).filter((b) => {
    if (seg === "up" && !(ACTIVE.includes(b.status) && new Date(b.end) > new Date())) return false;
    if (seg === "done" && b.status !== "completed") return false;
    if (seg === "cx" && !["cancelled_customer", "cancelled_shop", "no_show"].includes(b.status)) return false;
    if (year && new Date(b.start).getFullYear() !== year) return false;
    if (kind && !b.items.some((i: any) => kindOfName(i.name) === kind)) return false;
    const s = q.trim();
    if (s && !`${b.store} ${b.designer ?? ""} ${b.items.map((i: any) => i.name).join(" ")}`.includes(s)) return false;
    return true;
  }), [bks, seg, year, kind, q]);

  const byMonth = useMemo(() => {
    const m = new Map<string, any[]>();
    list.forEach((b) => { const d = new Date(b.start); const k = `${d.getFullYear()}년 ${d.getMonth() + 1}월`; m.set(k, [...(m.get(k) ?? []), b]); });
    return [...m.entries()];
  }, [list]);

  if (!g.ready) return <main className="cpage"><Loading /></main>;
  return (
    <Page>
      <h1 className="ch1">다이어리</h1>
      <div className="cseg" role="tablist">{SEG.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={seg === k} className={seg === k ? "on" : ""} onClick={() => setSeg(k)}>{l}</button>)}</div>
      <input className="cin" style={{ height: 48 }} placeholder="매장 · 디자이너 · 시술 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="검색" />
      {years.length > 1 && <div className="cchips" role="group" aria-label="연도">{years.map((y) => <button key={y} type="button" className={`cchip${year === y ? " on" : ""}`} aria-pressed={year === y} onClick={() => setYear(year === y ? null : y)}>{y}년</button>)}</div>}
      <div className="cchips" role="group" aria-label="시술 종류">{KINDS.map((k) => <button key={k} type="button" className={`cchip${kind === k ? " on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>{k}</button>)}</div>
      {err && <p className="cmsg err" role="alert">{err}</p>}
      {!bks ? <Loading /> : list.length === 0 ? (
        <div className="ccard soft"><b>{bks.length === 0 ? "아직 예약 · 시술 기록이 없어요" : "조건에 맞는 기록이 없어요"}</b><span className="cmt">{bks.length === 0 ? "예약하면 시술 사진과 홈케어가 여기에 쌓여요" : "필터를 바꿔 보세요"}</span>{bks.length === 0 && <Link className="cbtn pri sm" href="/c/book">예약하기</Link>}</div>
      ) : byMonth.map(([month, rows]) => (
        <section key={month} className="clist">
          <div className="csec"><h2 style={{ fontSize: 16 }}>{month}</h2><span className="cmt">{rows.length}건</span></div>
          {rows.map((b) => (
            <Link key={b.id} href={`/c/booking/${b.id}`} className="citem">
              {b.cover ? <SignedImg path={b.cover} className="cthumb" /> : <div className="cdate"><b>{new Date(b.start).getDate()}</b><span>{["일", "월", "화", "수", "목", "금", "토"][new Date(b.start).getDay()]}</span></div>}
              <div className="cstack">
                <div className="crow"><b>{b.items.map((i: any) => i.name).join(" + ") || "시술"}</b></div>
                <span className="cmt">{b.store}{b.designer ? ` · ${b.designer}` : ""}</span>
                <span className="cmt">{when(b.start)}</span>
                <div className="crow" style={{ gap: 6, flexWrap: "wrap" }}>
                  <Pill tone={STATUS_TONE[b.status]}>{STATUS_KO[b.status] ?? b.status}</Pill>
                  {b.pay_request && <Pill>결제 요청</Pill>}
                  {b.record_sent && !b.record_deleted && <Pill tone="teal">시술 기록</Pill>}
                  {b.open_request && <Pill tone="gray">{b.open_request === "cancel" ? "취소 요청 중" : "변경 요청 중"}</Pill>}
                  {b.total > 0 && <span className="cmt">{won(b.paid || b.total)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </section>
      ))}
    </Page>
  );
}
