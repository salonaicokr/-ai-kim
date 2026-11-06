"use client";
// @ts-nocheck

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import { validRepCode } from "@/src/lib/sales-code";
import { REP_TYPES, type Overview, type Rep } from "../types";

type Lookup = {
  found: boolean; valid: boolean; code: string; type?: "ORG" | "REP"; status?: string; void_reason?: string | null;
  rep?: { name: string; type: string; org: string; joined: string; active: boolean } | null;
  org?: { name: string; type: string; active: boolean } | null;
  assignments?: { store_id: string; store: string; role: string; share: number; start: string; end: string | null; rep: string; rep_code: string }[];
};

/** W1 영업사원 등록(코드 1회 자동 발급) · 목록 · 코드 역조회 · 폐기(상태값) */
export default function RepsEditor({ initial }: { initial: Overview }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const offices = data.orgs.filter((o) => o.active);
  const [f, setF] = useState({ org: offices.find((o) => o.type === "영업소")?.id ?? offices[0]?.id ?? "", name: "", type: "정규" as Rep["type"], joined: today, emp: "" });
  const [issued, setIssued] = useState<{ code: string; name: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("all");
  const [look, setLook] = useState<Lookup | null>(null);
  const [voidAsk, setVoidAsk] = useState<{ id: string; reason: string } | null>(null);

  async function reload() {
    const { data: d } = await createOpsBrowserClient().rpc("hq_sales_overview");
    if (d) setData(d as Overview);
    window.dispatchEvent(new Event("salonai:refresh"));
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!f.org) return setMsg({ ok: false, t: "영업소를 먼저 만들어주세요 (영업조직 화면)." });
    if (!f.name.trim()) return setMsg({ ok: false, t: "이름을 입력해주세요." });
    const { data: code, error } = await createOpsBrowserClient().rpc("hq_create_rep", { p_name: f.name, p_org: f.org, p_type: f.type, p_joined: f.joined || null, p_emp_no: f.emp || null });
    if (error) return setMsg({ ok: false, t: error.message });
    setIssued({ code: code as string, name: f.name.trim() });
    setMsg(null);
    setF({ ...f, name: "", emp: "" });
    reload();
  }
  async function lookup(code: string) {
    const v = code.trim().toUpperCase();
    if (!v) return;
    const { data: r, error } = await createOpsBrowserClient().rpc("hq_code_lookup", { p_code: v });
    if (error) return setMsg({ ok: false, t: error.message });
    setLook(r as Lookup);
  }
  async function voidRep() {
    if (!voidAsk) return;
    const { error } = await createOpsBrowserClient().rpc("hq_void_rep", { p_rep: voidAsk.id, p_reason: voidAsk.reason });
    setMsg(error ? { ok: false, t: error.message } : { ok: true, t: "코드를 폐기했어요. 이 코드는 다시 쓰이지 않아요." });
    setVoidAsk(null);
    reload();
  }

  const shown = useMemo(() => {
    const k = q.trim().toUpperCase();
    return data.reps.filter((r) => (org === "all" || r.org_id === org) && (!k || r.code.includes(k) || r.name.toUpperCase().includes(k)));
  }, [data.reps, q, org]);
  const qIsCode = /^[A-Z]{2}[0-9]{2}-/.test(q.trim().toUpperCase());

  return (
    <>
      <div className="ops-2">
        <form className="card ops-form" onSubmit={create}>
          <h2 className="b">W1 · 영업사원 등록</h2>
          <label className="field"><span className="lbl">영업소 <b className="req">필수</b></span>
            <select className="input" value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })}>
              {offices.length === 0 && <option value="">먼저 영업조직을 만들어주세요</option>}
              {offices.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
            </select></label>
          <label className="field"><span className="lbl">이름 <b className="req">필수</b></span><input className="input" maxLength={20} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="김민정" /></label>
          <div className="ops-form-grid two">
            <label className="field"><span className="lbl">구분</span>
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Rep["type"] })}>{REP_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="field"><span className="lbl">입사일</span><input className="input" type="date" value={f.joined} onChange={(e) => setF({ ...f, joined: e.target.value })} /></label>
          </div>
          <label className="field"><span className="lbl">사번 (선택 · 인사 사번과 별개)</span><input className="input" maxLength={20} value={f.emp} onChange={(e) => setF({ ...f, emp: e.target.value })} /></label>
          {issued && (
            <div className="code-issued" role="status">
              <span className="sm">발급된 영업코드 (자동 · 수정 불가)</span>
              <code>{issued.code}</code>
              <span className="sm">{issued.name} · {today} 발급 · 재발급 / 재사용 불가 · 폐기 시 상태값만 변경</span>
            </div>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn pri" type="submit">등록하고 코드 발급</button></div>
          <p className="sm note-line">코드는 이 화면에서만 발급돼요. 매장 화면에는 ‘발급’ 버튼이 없고 ‘선택’만 있어요 — 매장을 지웠다 다시 만들어도 코드가 새로 생기지 않아요.</p>
          {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
        </form>

        <section className="card ops-form">
          <h2 className="b">코드로 찾기 (역조회)</h2>
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); lookup(q); }}>
            <input className="input" placeholder="SL01-0217-T" value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} aria-label="영업코드" />
            <button className="btn" type="submit">찾기</button>
          </form>
          {qIsCode && q.trim().length === 11 && !validRepCode(q) && <p className="msg err">체크 문자가 맞지 않는 코드예요. 오타를 확인해주세요.</p>}
          {look && (look.found ? (
            <div className="lookup">
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}><code className="code">{look.code}</code>
                <span className={`pill ${look.status === "active" ? "st-active" : "st-suspended"}`}>{look.status === "active" ? "사용 중" : "폐기"}</span>
                {look.rep && <b>{look.rep.name} · {look.rep.org} · {look.rep.type}</b>}{look.org && <b>{look.org.name} ({look.org.type})</b>}</div>
              {look.void_reason && <p className="sm">폐기 사유: {look.void_reason}</p>}
              <h3 className="sm b">매장 배정 이력</h3>
              {look.assignments?.length ? (
                <ul className="list">{look.assignments.map((a, i) => (
                  <li key={i}><Link href={`/hq/stores/${a.store_id}`}><b>{a.store}</b></Link><span className="sm">{a.role} {a.share}% · {a.start} ~ {a.end ?? "현재"}{look.type === "ORG" ? ` · ${a.rep}` : ""}</span></li>
                ))}</ul>
              ) : <p className="sm">배정 이력이 없어요.</p>}
            </div>
          ) : <p className="msg err">{look.valid ? "발급된 적 없는 코드예요." : "형식 · 체크 문자가 맞지 않는 코드예요."}</p>)}
        </section>
      </div>

      <section className="card">
        <div className="ops-tools">
          <select className="input" style={{ maxWidth: 240 }} value={org} onChange={(e) => setOrg(e.target.value)} aria-label="영업소">
            <option value="all">전체 영업소</option>{data.orgs.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
          </select>
          <span className="sm">{shown.length}명</span>
        </div>
        <div className="ops-tw">
          <table className="ops-table">
            <thead><tr><th>영업코드</th><th>이름</th><th>영업소</th><th>구분</th><th>입사일</th><th>담당 매장</th><th>상태</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => { setQ(r.code); lookup(r.code); }}>
                  <th scope="row"><code className="code">{r.code}</code></th><td>{r.name}</td><td>{r.org}</td><td>{r.type}</td><td>{r.joined}</td><td>{r.stores}곳</td>
                  <td><span className={`pill ${r.active ? "st-active" : "st-suspended"}`}>{r.active ? "사용 중" : "폐기"}</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {r.active && (voidAsk?.id === r.id ? (
                      <span className="row" style={{ gap: 6 }}>
                        <input className="input" style={{ minWidth: 140 }} placeholder="폐기 사유" value={voidAsk.reason} onChange={(e) => setVoidAsk({ id: r.id, reason: e.target.value })} />
                        <button type="button" className="btn ghost sm-btn" onClick={() => setVoidAsk(null)}>취소</button>
                        <button type="button" className="btn sm-btn del-solid" disabled={!voidAsk.reason.trim()} onClick={voidRep}>폐기</button>
                      </span>
                    ) : <button type="button" className="btn ghost sm-btn" onClick={() => setVoidAsk({ id: r.id, reason: "" })}>폐기</button>)}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={8} className="sm" style={{ textAlign: "center", padding: 24 }}>영업사원이 없어요.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
