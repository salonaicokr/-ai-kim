"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";

export type Rule = { version: number; base: string; rate: number; months: number | null; from: string; to: string | null; note: string | null; by: string | null; at: string };

const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/** 인센티브 정책: 매장 영업매출 × 요율 · 기간. 새 버전으로만 바꾸고(마스터), 바꾼 날부터 적용 · 지난 정산은 그대로 */
export default function PolicyEditor({ initial, canEdit }: { initial: Rule[]; canEdit: boolean }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const cur = rules.find((r) => !r.to) ?? rules[0];
  const [rate, setRate] = useState(String(cur?.rate ?? 0.1));
  const [months, setMonths] = useState(cur?.months ? String(cur.months) : "");
  const [from, setFrom] = useState(today());
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  async function add() {
    const sb = createOpsBrowserClient();
    const { error } = await sb.rpc("hq_add_commission_rule", { p_rate: Number(rate), p_months: months ? Number(months) : null, p_from: from, p_note: note });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    const { data } = await sb.rpc("hq_commission_rules");
    if (data) setRules(data as Rule[]);
    setMsg({ ok: true, t: `새 정책을 ${from}부터 적용해요.` }); setOpen(false); setNote(""); window.dispatchEvent(new Event("salonai:refresh"));
  }

  return (
    <section className="card ops-set">
      <div className="row"><h2 className="b">인센티브 정책</h2><span className="sp" />
        {canEdit && !open && <button type="button" className="btn ghost sm-btn" onClick={() => setOpen(true)}>정책 바꾸기</button>}</div>
      {cur && (
        <p>지금: 매장 영업매출(구독료 제외 · 실결제)의 <b>{cur.rate}%</b> · {cur.months ? <b>유치 후 {cur.months}개월</b> : <b>매장이 있는 동안</b>} · 미납 달 · 해지 달부터 제외</p>
      )}
      {open && (
        <div className="ops-add">
          <label className="field" style={{ maxWidth: 140 }}><span className="lbl">요율(%)</span><input className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
          <label className="field" style={{ maxWidth: 200 }}><span className="lbl">기간(개월, 비우면 매장이 있는 동안)</span><input className="input num" inputMode="numeric" value={months} placeholder="계속" onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ""))} /></label>
          <label className="field" style={{ maxWidth: 170 }}><span className="lbl">적용 시작일</span><input className="input" type="date" min={today()} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span className="lbl">바꾸는 사유 (필수)</span><input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>취소</button>
          <button type="button" className="btn pri" onClick={add}>새 정책 적용</button>
        </div>
      )}
      {!canEdit && <p className="sm">정책은 마스터 역할만 바꿀 수 있어요.</p>}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
      <table>
        <thead><tr><th>버전</th><th>요율</th><th>기간</th><th>적용</th><th>사유</th><th>바꾼 사람</th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.version}><td>v{r.version}{!r.to && <span className="pill p-teal" style={{ marginLeft: 6 }}>지금</span>}</td><td>{r.rate}%</td>
              <td>{r.months ? `${r.months}개월` : "매장이 있는 동안"}</td><td className="sm">{r.from} ~ {r.to ?? ""}</td><td className="sm">{r.note}</td><td className="sm">{r.by ?? "처음 설정"}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
