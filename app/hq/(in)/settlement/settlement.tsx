"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";

type RepLine = { code: string; name: string; share: number; amount: number };
type Store = { code: string; name: string; service: number; refund: number; prepaid: number; prepaid_refund: number; net: number; excluded: boolean; reason: string | null; reps: RepLine[] };
type Branch = { org: string; name: string; type: string; reps: number; stores: number; sales: number; amount: number };
type Rep = { code: string; name: string; org: string; org_name: string; stores: number; sales: number; amount: number };
export type View = {
  period: string; status: "calculated" | "confirmed" | "paid" | null;
  rule?: { version: number; rate: number; months: number | null };
  calculated_at?: string; confirmed_at?: string | null; paid_at?: string | null; pay_note?: string | null;
  by?: { calc: string | null; confirm: string | null; pay: string | null };
  totals?: { stores: number; sales: number; excluded: number; amount: number };
  stores?: Store[]; branches?: Branch[]; reps?: Rep[];
};
export type RunRow = { period: string; status: "calculated" | "confirmed" | "paid"; amount: number };

const ST: Record<"calculated" | "confirmed" | "paid", { t: string; cls: string }> = {
  calculated: { t: "계산됨", cls: "bl-grace" }, confirmed: { t: "확정", cls: "st-active" }, paid: { t: "지급완료", cls: "bl-normal" },
};
const won = (n: number) => n.toLocaleString("ko-KR");
const at = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/** 엑셀에서 바로 열리는 CSV (한글 깨짐 방지 BOM) */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function Settlement({ period, initial, runs, canPay }: { period: string; initial: View; runs: RunRow[]; canPay: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [tab, setTab] = useState<"branch" | "rep" | "store">("branch");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | "confirm" | "pay">(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  async function run(fn: "hq_settlement_close" | "hq_settlement_confirm" | "hq_settlement_pay", done: string) {
    setBusy(true); setMsg(null); setAsk(null);
    const args: Record<string, string> = { p_period: period };
    if (fn === "hq_settlement_pay") args.p_note = note;
    const { data, error } = await createOpsBrowserClient().rpc(fn, args);
    setBusy(false);
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setV(data as View); setMsg({ ok: true, t: done }); window.dispatchEvent(new Event("salonai:refresh"));
  }

  function exportCsv() {
    const p = v.period;
    if (tab === "branch") downloadCsv(`정산_${p}_브랜치별.csv`, [["정산월", "영업조직코드", "영업조직", "구분", "영업사원 수", "매장 수", "매장 영업매출(배정분)", "인센티브", "상태"],
      ...(v.branches ?? []).map((b) => [p, b.org, b.name, b.type, b.reps, b.stores, b.sales, b.amount, v.status ? ST[v.status].t : ""])]);
    else if (tab === "rep") downloadCsv(`정산_${p}_영업사원별.csv`, [["정산월", "영업코드", "이름", "영업조직코드", "영업조직", "매장 수", "매장 영업매출(배정분)", "인센티브", "상태"],
      ...(v.reps ?? []).map((r) => [p, r.code, r.name, r.org, r.org_name, r.stores, r.sales, r.amount, v.status ? ST[v.status].t : ""])]);
    else downloadCsv(`정산_${p}_매장별.csv`, [["정산월", "매장코드", "매장", "시술 실결제", "환불", "정액권 판매", "정액권 환불", "영업매출", "제외", "제외 사유", "영업코드", "영업사원", "배정 비율(%)", "인센티브"],
      ...(v.stores ?? []).flatMap((s) => (s.reps.length ? s.reps : [null]).map((r) => [p, s.code, s.name, s.service, s.refund, s.prepaid, s.prepaid_refund, s.net, s.excluded ? "제외" : "", s.reason ?? "", r?.code ?? "", r?.name ?? "", r?.share ?? "", r?.amount ?? 0]))]);
  }

  const t = v.totals;
  return (
    <>
      <form className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="sm">정산 월 <input className="input" type="month" name="m" defaultValue={period} style={{ width: 170 }} /></label>
        <button className="btn" type="submit">보기</button>
        {v.status && <span className={`pill ${ST[v.status].cls}`}>{ST[v.status].t}</span>}
        <span className="sp" />
        {canPay && v.status !== "confirmed" && v.status !== "paid" && (
          <button className="btn" type="button" disabled={busy} onClick={() => run("hq_settlement_close", `${period} 마감 계산을 마쳤어요. 확인 후 확정해주세요.`)}>{v.status ? "다시 계산" : "월 마감 (계산)"}</button>
        )}
        {canPay && v.status === "calculated" && <button className="btn pri" type="button" disabled={busy} onClick={() => setAsk("confirm")}>확정</button>}
        {canPay && v.status === "confirmed" && <button className="btn pri" type="button" disabled={busy} onClick={() => setAsk("pay")}>지급완료 처리</button>}
        <button className="btn ghost" type="button" disabled={!v.status} onClick={exportCsv}>엑셀 내려받기</button>
      </form>

      {ask === "confirm" && (
        <div className="card ops-ask"><p><b>{period} 정산을 확정할까요?</b> 확정하면 정산 장부에 기록되고 금액을 바꿀 수 없어요. 이후 환불 등은 다음 달에 정정해요.</p>
          <div className="row" style={{ gap: 8 }}><span className="sp" /><button className="btn ghost" type="button" onClick={() => setAsk(null)}>취소</button>
            <button className="btn pri" type="button" onClick={() => run("hq_settlement_confirm", `${period} 정산을 확정했어요.`)}>확정</button></div></div>
      )}
      {ask === "pay" && (
        <div className="card ops-ask"><p><b>{period} 인센티브를 지급완료로 바꿀까요?</b></p>
          <div className="ops-add"><label className="field"><span className="lbl">지급 메모 (선택)</span><input className="input" value={note} maxLength={200} placeholder="예: 12/10 일괄 이체" onChange={(e) => setNote(e.target.value)} /></label>
            <button className="btn ghost" type="button" onClick={() => setAsk(null)}>취소</button>
            <button className="btn pri" type="button" onClick={() => run("hq_settlement_pay", `${period} 지급완료로 바꿨어요.`)}>지급완료</button></div></div>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}

      {!v.status ? (
        <section className="card"><p className="sm" style={{ padding: 12 }}>
          {period}은(는) 아직 마감하지 않았어요. {canPay ? "말일이 지나면 ‘월 마감 (계산)’을 눌러주세요." : "재무 · 마스터가 마감하면 여기서 볼 수 있어요."}</p></section>
      ) : (
        <>
          <section className="grid g4 ops-sett-kpi">
            <div className="card kpi"><p className="lbl">정산 대상 매장</p><p className="big">{t?.stores ?? 0}</p><p className="sm">제외 {t?.excluded ?? 0}곳 (미납 · 해지)</p></div>
            <div className="card kpi"><p className="lbl">매장 영업매출 합계</p><p className="big">{won(t?.sales ?? 0)}<small>원</small></p></div>
            <div className="card kpi"><p className="lbl">적용 정책</p><p className="big">{v.rule?.rate}%</p><p className="sm">v{v.rule?.version} · {v.rule?.months ? `유치 후 ${v.rule.months}개월` : "매장이 있는 동안"}</p></div>
            <div className="card kpi teal"><p className="lbl">인센티브 합계</p><p className="big">{won(t?.amount ?? 0)}<small>원</small></p></div>
          </section>
          <p className="sm">계산 {at(v.calculated_at)} {v.by?.calc ?? ""}{v.confirmed_at ? ` · 확정 ${at(v.confirmed_at)} ${v.by?.confirm ?? ""}` : ""}{v.paid_at ? ` · 지급완료 ${at(v.paid_at)} ${v.by?.pay ?? ""}${v.pay_note ? ` (${v.pay_note})` : ""}` : ""}</p>
          <section className="card">
            <div className="ops-tabs" role="tablist">
              {([["branch", "브랜치(영업조직)별"], ["rep", "영업사원별"], ["store", "매장별"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div className="ops-tw"><table className="ops-table ops-sett">
              {tab === "branch" && (<>
                <thead><tr><th>영업조직</th><th>구분</th><th>영업사원</th><th>매장</th><th>매장 영업매출(배정분)</th><th>인센티브</th></tr></thead>
                <tbody>{(v.branches ?? []).map((b) => <tr key={b.org}><th scope="row"><code className="code">{b.org}</code> {b.name}</th><td>{b.type}</td><td>{b.reps}</td><td>{b.stores}</td><td>{won(b.sales)}</td><td><b>{won(b.amount)}</b></td></tr>)}
                  {!(v.branches ?? []).length && <tr><td colSpan={6} className="sm empty">담당 영업사원이 있는 매장 매출이 없어요.</td></tr>}</tbody></>)}
              {tab === "rep" && (<>
                <thead><tr><th>영업코드</th><th>이름</th><th>영업조직</th><th>매장</th><th>매장 영업매출(배정분)</th><th>인센티브</th></tr></thead>
                <tbody>{(v.reps ?? []).map((r) => <tr key={r.code}><th scope="row"><code className="code">{r.code}</code></th><td>{r.name}</td><td>{r.org_name}</td><td>{r.stores}</td><td>{won(r.sales)}</td><td><b>{won(r.amount)}</b></td></tr>)}
                  {!(v.reps ?? []).length && <tr><td colSpan={6} className="sm empty">정산할 영업사원이 없어요.</td></tr>}</tbody></>)}
              {tab === "store" && (<>
                <thead><tr><th>매장</th><th>시술 실결제</th><th>환불</th><th>정액권 판매</th><th>영업매출</th><th>담당 · 인센티브</th></tr></thead>
                <tbody>{(v.stores ?? []).map((s) => (
                  <tr key={s.code} className={s.excluded ? "ops-dim" : ""}>
                    <th scope="row"><code className="code">{s.code}</code> {s.name}{s.excluded && <span className="pill bl-blocked" style={{ marginLeft: 6 }}>제외 · {s.reason}</span>}</th>
                    <td>{won(s.service)}</td><td>{s.refund ? `-${won(s.refund)}` : 0}</td><td>{won(s.prepaid - s.prepaid_refund)}</td><td><b>{won(s.net)}</b></td>
                    <td className="sm">{s.reps.length ? s.reps.map((r) => `${r.code} ${r.name} ${r.share}% · ${won(r.amount)}원`).join(" / ") : s.excluded ? "-" : "담당 없음 (본사 직영)"}</td>
                  </tr>))}</tbody></>)}
            </table></div>
            <p className="sm note-line" style={{ marginTop: 10 }}>인센티브 = 영업매출 × {v.rule?.rate}% × 배정 비율, 원 단위 내림. 담당은 그 달 말일 기준 배정이에요.</p>
          </section>
        </>
      )}

      {runs.length > 0 && (
        <section className="card"><h2 className="b">지난 정산</h2>
          <ul className="list ops-log">{runs.map((r) => (
            <li key={r.period}><a href={`?m=${r.period}`}><b>{r.period}</b></a><span className={`pill ${ST[r.status].cls}`}>{ST[r.status].t}</span><span className="sp" /><span>{won(r.amount)}원</span></li>))}</ul>
        </section>
      )}
    </>
  );
}
