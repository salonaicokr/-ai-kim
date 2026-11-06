"use client";
// @ts-nocheck

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NAVER_KO } from "@/src/lib/naver";
import { BILLING_KO, IND_KO, STATUS_KO, TYPE_KO, ymd, type StoreRow } from "../types";

type Sort = "created" | "name" | "branches";

/** 매장 목록: 검색 · 상태 필터 · 정렬 (상태 필터는 주소에 남아 새로고침해도 유지) */
export default function StoresTable({ rows }: { rows: StoreRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "all";
  const [naverMissing, setNaverMissing] = useState(false);
  const missing = (r: StoreRow) => !r.naver || r.naver === "none" || r.naver === "skipped";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("created");

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => !naverMissing || missing(r))
      .filter((r) => !k || [r.name, r.owner ?? "", r.brand ?? "", r.code ?? "", r.rep ?? "", r.referral ?? ""].some((v) => v.toLowerCase().includes(k)))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "ko") : sort === "branches" ? b.branches - a.branches : b.created.localeCompare(a.created));
  }, [rows, q, status, sort, naverMissing]);

  const setStatus = (s: string) => router.replace(s === "all" ? "/hq/stores" : `/hq/stores?status=${s}`);
  const count = (s: string) => (s === "all" ? rows.length : rows.filter((r) => r.status === s).length);

  return (
    <section className="card">
      <div className="ops-tools">
        <input className="input" type="search" placeholder="매장명 · 대표자 · 매장코드 · 영업코드 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="매장 검색" />
        <div className="ops-chips" role="tablist" aria-label="상태">
          {["all", "pending", "active", "suspended"].map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} className={`chip${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>
              {s === "all" ? "전체" : STATUS_KO[s]} <b>{count(s)}</b>
            </button>
          ))}
          <button type="button" className={`chip${naverMissing ? " on" : ""}`} aria-pressed={naverMissing} onClick={() => setNaverMissing((v) => !v)}>
            네이버 미입력 <b>{rows.filter(missing).length}</b>
          </button>
        </div>
        <label className="sm ops-sort">정렬
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="created">가입일 최신순</option><option value="name">매장명순</option><option value="branches">지점 많은 순</option>
          </select>
        </label>
      </div>
      <div className="ops-tw">
        <table className="ops-table">
          <thead><tr><th>매장코드</th><th>매장명</th><th>담당 영업</th><th>대표자</th><th>업종</th><th>형태 · 지점 수</th><th>가입일</th><th>상태</th><th>네이버</th><th>요금제</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/hq/stores/${r.id}`)}>
                <td><code className="code">{r.code ?? "승인 때 발급"}</code></td>
                <th scope="row"><Link href={`/hq/stores/${r.id}`}>{r.name}</Link>{r.brand && r.brand !== r.name && <span className="sm"> · {r.brand}</span>}</th>
                <td>{r.rep ? <code className="code">{r.rep}</code> : r.referral ? <span className="sm">추천 {r.referral}</span> : <span className="sm">본사 직영</span>}</td>
                <td>{r.owner ?? "-"}</td>
                <td>{r.industries.map((i) => IND_KO[i] ?? i).join(" · ")}</td>
                <td>{TYPE_KO[r.type]}{r.type === "multi" ? ` · ${r.branches}곳` : ""}</td>
                <td>{ymd(r.created)}</td>
                <td><span className={`pill st-${r.status}`}>{STATUS_KO[r.status]}</span>{r.billing && r.billing !== "normal" && <span className={`pill bl-${r.billing}`} style={{ marginLeft: 4 }} title="과금 상태">{BILLING_KO[r.billing]}</span>}</td>
                <td><span className={`pill ${r.naver === "verified" ? "p-teal" : r.naver === "entered" ? "p-amb" : "p-gray"}`}>{NAVER_KO[r.naver ?? "none"]}</span></td>
                <td>{r.plan}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={10} className="sm" style={{ textAlign: "center", padding: 24 }}>조건에 맞는 매장이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
