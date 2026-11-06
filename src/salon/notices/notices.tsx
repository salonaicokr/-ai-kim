"use client";
// @ts-nocheck

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getShopContext } from "@/src/lib/session";
import { asyncComp } from "@/src/lib/compat";
import "../dashboard/dashboard.css";



/** 본사 공지사항 (홈 ⑦ 전체 보기) · ?n=번호 로 본문 */

async function BodyImpl() {
  const n = new URLSearchParams(window.location.search).get("n");
  const { supabase } = await getShopContext();
  const { data } = await supabase.from("hq_notices").select("id, no, title, body, important, published_at").order("important", { ascending: false }).order("published_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: string; no: number; title: string; body: string; important: boolean; published_at: string }[];
  const open = n ? rows.find((r) => String(r.no) === n) : null;
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));
  return (
    <>
      <div><p className="crumb">홈 · 본사 공지</p><h1 className="h1">본사 공지사항</h1><p className="sm">운영 · 점검 · 업데이트 안내를 본사에서 올려요.</p></div>
      {open && (
        <article className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{open.important && <span className="pill p-amb">중요</span>}<h2 className="b" style={{ fontSize: 18 }}>{open.title}</h2><span className="sp" /><span className="sm">{day(open.published_at)}</span></div>
          <p style={{ whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.7 }}>{open.body || "내용 없음"}</p>
          <Link href="/desk/notices" className="sm b" style={{ color: "var(--c-primary)" }}>← 목록</Link>
        </article>
      )}
      <section className="card">
        {rows.length === 0 ? <p className="sm">아직 공지가 없어요.</p> : (
          <table className="hm-table">
            <thead><tr><th style={{ width: 56 }}>번호</th><th>제목</th><th style={{ width: 110 }}>작성일</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td>{r.no}</td><td><Link href={`/desk/notices?n=${r.no}`} style={{ color: "inherit", textDecoration: "none", fontWeight: r.important ? 800 : 500 }}>{r.important ? "[중요] " : ""}{r.title}</Link></td><td className="tnum">{day(r.published_at)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}

const Body = asyncComp(BodyImpl, <div className="skel" style={{ minHeight: 300 }} />);

export default function Notices() {
  const sp = useSearchParams();
  return <Body key={sp.toString()} />;
}
