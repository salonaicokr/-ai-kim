"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import { validRepCode } from "@/src/lib/sales-code";

export type Assignment = { id: string; code: string; name: string; org: string; role: "주담당" | "공동"; share: number; start: string; end: string | null; reason: string | null };
type RepOpt = { code: string; name: string; org: string; active: boolean };
type Line = { code: string; role: "주담당" | "공동"; share: string };

/**
 * W2 매장 › 담당 영업 배정: 코드로 검색 · 선택만 (발급 없음).
 * 담당 변경은 덮어쓰지 않음 → 기존 배정 종료일 + 새 행. 주담당 1명 · 공동영업 비율 합 100% 아니면 저장 차단.
 */
export default function AssignStore({ storeId, history, reps }: { storeId: string; history: Assignment[]; reps: RepOpt[] }) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const current = history.filter((a) => a.end == null);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ code: "", role: "주담당", share: "100" }]);
  const [start, setStart] = useState(today);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const sum = lines.reduce((a, l) => a + (Number(l.share) || 0), 0);
  const mains = lines.filter((l) => l.role === "주담당").length;
  const badCode = lines.find((l) => l.code && !validRepCode(l.code));
  const unknown = lines.find((l) => l.code && validRepCode(l.code) && !reps.some((r) => r.active && r.code === l.code.trim().toUpperCase()));
  // 검증 배지 3종: 비율합 100% · 코드 체크섬 · 귀속일(시작일) 누락 → 하나라도 걸리면 저장 차단
  const checks = [
    { ok: sum === 100, t: `비율 합 ${sum}%` },
    { ok: !badCode && !unknown && lines.every((l) => l.code), t: badCode ? `체크 문자 오류 ${badCode.code}` : unknown ? `없는 코드 ${unknown.code}` : "코드 확인" },
    { ok: !!start, t: start ? `시작일 ${start}` : "시작일 누락" },
  ];
  const ok = checks.every((c) => c.ok) && mains === 1;
  const repOf = (c: string) => reps.find((r) => r.code === c.trim().toUpperCase());
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    if (!ok) return;
    const { error } = await createOpsBrowserClient().rpc("hq_assign_store", {
      p_store: storeId, p_lines: lines.map((l) => ({ code: l.code.trim().toUpperCase(), role: l.role, share: Number(l.share) })), p_start: start, p_reason: reason,
    });
    if (error) return setMsg({ ok: false, t: error.message });
    setMsg({ ok: true, t: current.length ? "기존 배정에 종료일을 채우고 새 배정을 추가했어요." : "담당 영업을 배정했어요." });
    setOpen(false); setLines([{ code: "", role: "주담당", share: "100" }]); setReason("");
    window.dispatchEvent(new Event("salonai:refresh"));
  }

  return (
    <section className="card">
      <div className="row"><h2 className="b">담당 영업</h2><span className="sp" />
        {!open && <button type="button" className="btn sm-btn" onClick={() => { setOpen(true); setMsg(null); }}>{current.length ? "담당 변경" : "담당 배정"}</button>}</div>
      {current.length === 0 ? <p className="sm" style={{ marginTop: 6 }}>아직 담당 영업이 없어요.</p> : (
        <ul className="list" style={{ marginTop: 6 }}>
          {current.map((a) => <li key={a.id}><code className="code">{a.code}</code><b>{a.name}</b><span className="sm">{a.org} · {a.role} {a.share}% · {a.start} 부터</span></li>)}
        </ul>
      )}

      {open && (
        <div className="assign-form">
          <datalist id="rep-codes">{reps.filter((r) => r.active).map((r) => <option key={r.code} value={r.code}>{r.name} · {r.org}</option>)}</datalist>
          {lines.map((l, i) => {
            const r = repOf(l.code);
            return (
              <div key={i} className="assign-line">
                <label className="field grow"><span className="lbl">{i === 0 ? "담당 영업 (코드 검색)" : "공동영업"}</span>
                  <input className="input" list="rep-codes" placeholder="SL01-0217-T" value={l.code} onChange={(e) => set(i, { code: e.target.value.toUpperCase() })} /></label>
                <span className="sm who">{r ? `${r.name} · ${r.org}` : l.code ? (validRepCode(l.code) ? "없는 코드" : "형식 확인") : ""}</span>
                <label className="field"><span className="lbl">역할</span>
                  <select className="input" value={l.role} onChange={(e) => set(i, { role: e.target.value as Line["role"] })}><option>주담당</option><option>공동</option></select></label>
                <label className="field pct"><span className="lbl">비율 %</span><input className="input" inputMode="decimal" value={l.share} onChange={(e) => set(i, { share: e.target.value.replace(/[^0-9.]/g, "") })} /></label>
                {i > 0 && <button type="button" className="btn ghost sm-btn" aria-label="공동영업 빼기" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>}
              </div>
            );
          })}
          <button type="button" className="btn ghost sm-btn" onClick={() => setLines((ls) => [...ls, { code: "", role: "공동", share: "0" }])}>+ 공동영업 추가 (선택)</button>
          <div className="ops-form-grid two">
            <label className="field"><span className="lbl">배정 시작일 (기본 = 계약일)</span><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field"><span className="lbl">사유 (선택)</span><input className="input" maxLength={80} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 담당 이동" /></label>
          </div>
          <div className="assign-checks">
            {checks.map((c) => <span key={c.t} className={`pill ${c.ok ? "st-active" : "st-suspended"}`}>{c.ok ? "✓" : "!"} {c.t}</span>)}
            <span className={`pill ${mains === 1 ? "st-active" : "st-suspended"}`}>{mains === 1 ? "✓ 주담당 1명" : `! 주담당 ${mains}명`}</span>
          </div>
          {current.length > 0 && <p className="sm note-line">담당이 바뀌어도 덮어쓰지 않아요. 지금 배정에 종료일({start ? "시작일 전날" : "-"})을 채우고 새 배정 행을 추가해요. 시작일 이전 계약은 이전 담당에게 귀속돼요.</p>}
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>나중에 배정</button>
            <button type="button" className="btn pri" disabled={!ok} onClick={save}>배정 저장</button>
          </div>
        </div>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}

      {history.length > 0 && (
        <details className="assign-hist" open={history.length > current.length}>
          <summary className="sm">배정 이력 {history.length}행</summary>
          <table className="ops-table"><thead><tr><th>영업코드</th><th>이름</th><th>역할</th><th>비율</th><th>시작</th><th>종료</th><th>사유</th></tr></thead>
            <tbody>{history.map((a) => <tr key={a.id}><td><code className="code">{a.code}</code></td><td>{a.name}</td><td>{a.role}</td><td>{a.share}%</td><td>{a.start}</td><td>{a.end ?? "현재"}</td><td>{a.reason ?? ""}</td></tr>)}</tbody></table>
        </details>
      )}
    </section>
  );
}
