"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { createClient } from "@/src/lib/supabase/client";

type SB = ReturnType<typeof createClient>;
type Field = "name" | "phone" | "designer" | "memo" | "last_visit" | "visits" | "marketing" | "skip";
const FIELDS: { v: Field; label: string; keys: string[] }[] = [
  { v: "name", label: "이름", keys: ["이름", "고객명", "성함", "name"] },
  { v: "phone", label: "전화번호 (정규화)", keys: ["휴대폰", "전화", "연락처", "phone", "핸드폰", "번호"] },
  { v: "designer", label: "담당 디자이너", keys: ["담당", "디자이너", "designer"] },
  { v: "last_visit", label: "마지막 방문일", keys: ["최근방문", "마지막방문", "최종방문", "방문일", "lastvisit"] },
  { v: "visits", label: "방문 횟수", keys: ["방문횟수", "방문수", "횟수", "visits"] },
  { v: "marketing", label: "마케팅 수신 동의", keys: ["마케팅", "수신", "광고", "sms동의", "marketing"] },
  { v: "memo", label: "매장 내부 메모", keys: ["메모", "비고", "memo", "특이사항"] },
  { v: "skip", label: "가져오지 않음", keys: [] },
];
const STEPS = ["다운로드 안내", "파일 업로드", "칸 연결", "검증 · 병합", "이전 완료"];

/** 따옴표 · 줄바꿈까지 처리하는 CSV 읽기 */
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}
/** 엑셀에서 저장한 CSV(한글 EUC-KR)도 읽기 */
function decode(buf: ArrayBuffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch { return new TextDecoder("euc-kr").decode(buf); }
}
const cellText = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
const norm = (h: string) => h.replace(/\s/g, "").toLowerCase();
const digits = (s: string) => s.replace(/[^0-9]/g, "");
const MK_YES = ["동의", "y", "yes", "1", "true", "o", "수신", "예"];
const MK_NO = ["거부", "n", "no", "0", "false", "x", "미수신", "아니오", "비동의"];

/** 기존 CRM 고객 데이터 이전: 파일 → 칸 연결 → 검증 · 병합 → 이전 */
export default function CustomerImport({ supabase, shopId, onClose, onDone }: { supabase: SB; shopId: string; onClose: () => void; onDone: (text: string) => void }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<string | null>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const [map, setMap] = useState<Field[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number } | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setErr(null); setBusy(true);
    try {
      let g: string[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const rows = await readSheet(f);
        g = rows.map((r) => r.map(cellText)).filter((r) => r.some(Boolean));
      } else if (/\.csv$/i.test(f.name)) {
        g = parseCsv(decode(await f.arrayBuffer()));
      } else { setErr("엑셀(.xlsx) 또는 CSV 파일을 올려주세요. 예전 .xls 파일은 엑셀에서 ‘다른 이름으로 저장 → .xlsx’로 바꿔주세요."); setBusy(false); return; }
      if (g.length < 2) { setErr("고객 정보가 없는 파일이에요. 첫 줄은 제목, 둘째 줄부터 고객이에요."); setBusy(false); return; }
      const head = g[0];
      const used = new Set<Field>();
      const auto = head.map((h) => {
        const f2 = FIELDS.find((x) => x.v !== "skip" && !used.has(x.v) && x.keys.some((k) => norm(h).includes(norm(k))));
        if (f2) used.add(f2.v);
        return f2?.v ?? "skip";
      });
      setFile(f.name); setGrid(g); setMap(auto); setStep(3);
    } catch (ex) { setErr(`파일을 읽지 못했어요: ${(ex as Error).message}`); }
    setBusy(false);
  }

  const check = useMemo(() => {
    if (grid.length < 2) return null;
    const idx = (v: Field) => map.indexOf(v);
    const get = (r: string[], v: Field) => (idx(v) >= 0 ? (r[idx(v)] ?? "").trim() : "");
    const ok: Record<string, string>[] = []; const bad: { row: number; reason: string; data: string[] }[] = [];
    const seen = new Map<string, number>(); let dup = 0; let noConsent = 0;
    grid.slice(1).forEach((r, i) => {
      const name = get(r, "name"); const ph = digits(get(r, "phone"));
      if (!name) { bad.push({ row: i + 2, reason: "이름 없음", data: r }); return; }
      if (ph && (ph.length < 10 || ph.length > 11)) { bad.push({ row: i + 2, reason: "전화번호 형식 오류", data: r }); return; }
      const lv = get(r, "last_visit");
      if (lv && Number.isNaN(Date.parse(lv.replace(/\./g, "-")))) { bad.push({ row: i + 2, reason: "방문일 형식 오류", data: r }); return; }
      const mk = get(r, "marketing").toLowerCase();
      if (!MK_YES.includes(mk) && !MK_NO.includes(mk)) noConsent++;
      const rec = { name, phone: ph, designer: get(r, "designer"), memo: get(r, "memo"), last_visit: lv ? new Date(lv.replace(/\./g, "-")).toISOString().slice(0, 10) : "", visits: get(r, "visits"), marketing: get(r, "marketing") };
      if (ph && seen.has(ph)) { dup++; ok[seen.get(ph)!] = { ...ok[seen.get(ph)!], ...Object.fromEntries(Object.entries(rec).filter(([, v]) => v)) }; return; }
      if (ph) seen.set(ph, ok.length);
      ok.push(rec);
    });
    return { total: grid.length - 1, ok, bad, dup, noConsent };
  }, [grid, map]);

  async function run() {
    if (!check) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc("import_customers", { p_shop: shopId, p_rows: check.ok });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setResult(data as { inserted: number; updated: number; skipped: number }); setStep(5);
    onDone(`이전 완료 · 새 고객 ${(data as { inserted: number }).inserted}명 · 기존 고객 갱신 ${(data as { updated: number }).updated}명`);
  }
  function downloadBad() {
    if (!check) return;
    const csv = "﻿" + [["행", "사유", ...grid[0]], ...check.bad.map((b) => [String(b.row), b.reason, ...b.data])].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "SALONAI_이전_오류행.csv"; a.click();
  }
  function template() {
    const csv = "﻿" + [["이름", "휴대폰", "담당 디자이너", "최근방문", "방문횟수", "마케팅수신", "메모"], ["홍길동", "010-1234-5678", "", "2026-09-12", "4", "동의", "두피 민감"]].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "SALONAI_고객DB_양식.csv"; a.click();
  }

  return createPortal(
    <div className="im-back" role="dialog" aria-modal="true" aria-label="기존 CRM 고객 데이터 이전" onClick={onClose}>
      <div className="im" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h2 className="st-h">기존 CRM 고객 데이터 이전</h2><span className="sp" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>×</button></div>
        <ol className="im-steps">{STEPS.map((s, i) => <li key={s} className={i + 1 === step ? "cur" : i + 1 < step ? "done" : ""}><span>{i + 1}</span>{s}</li>)}</ol>

        {step <= 2 && (
          <div className="im-body">
            <div className="im-guide">
              <b>1 · 쓰던 프로그램에서 고객 목록 내려받기</b>
              <p className="sm">예약 · 고객관리 프로그램의 ‘고객 목록 → 엑셀 다운로드’로 받은 파일을 그대로 올리면 돼요. 칸 이름이 달라도 다음 단계에서 연결할 수 있어요.</p>
              <button type="button" className="btn ghost sm-btn" onClick={template}>SALONAI 양식 받기</button>
            </div>
            <label className="im-drop">
              <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} />
              <b>2 · 파일 올리기</b><span className="sm">{busy ? "읽는 중…" : "엑셀(.xlsx) 또는 CSV · 최대 5,000명"}</span>
            </label>
          </div>
        )}

        {step === 3 && check && (
          <div className="im-body">
            <p className="sm">파일: <b>{file}</b> · {check.total.toLocaleString()}행 — 원본 칸을 SALONAI 항목에 연결해주세요.</p>
            <div className="im-map">
              {grid[0].map((h, i) => (
                <div key={i} className="im-row">
                  <span className="im-src">{h || `(${i + 1}번째 칸)`}<small className="sm">{grid[1]?.[i] ?? ""}</small></span>
                  <span aria-hidden>›</span>
                  <select className="input" value={map[i]} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? (e.target.value as Field) : x === e.target.value && e.target.value !== "skip" ? "skip" : x)))}>
                    {FIELDS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
                  </select>
                  <span className={`pill ${map[i] === "skip" ? "p-gray" : "p-teal"}`}>{map[i] === "skip" ? "제외" : "연결"}</span>
                </div>
              ))}
            </div>
            {!map.includes("name") && <p className="msg err">‘이름’ 칸을 하나 연결해야 해요.</p>}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setStep(2)}>다른 파일</button>
              <button type="button" className="btn pri" disabled={!map.includes("name")} onClick={() => setStep(4)}>검증 실행</button>
            </div>
          </div>
        )}

        {step === 4 && check && (
          <div className="im-body">
            <div className="im-kpis">
              <div><span className="lbl">총 행</span><b>{check.total.toLocaleString()}</b></div>
              <div className="ok"><span className="lbl">이전할 고객</span><b>{check.ok.length.toLocaleString()}</b></div>
              <div className="bad"><span className="lbl">오류 행 (다시 올리기 가능)</span><b>{check.bad.length}</b></div>
              <div><span className="lbl">번호 기준 중복 병합</span><b>{check.dup}</b></div>
              <div className="warn"><span className="lbl">동의 근거 없음</span><b>{check.noConsent}</b></div>
            </div>
            <p className="sm">동의 근거가 없는 고객은 <b>광고성 발송에서 제외</b>되고, 고객이 앱에 가입해 본인인증하면 이력이 연결돼요. 이미 등록된 번호는 새로 만들지 않고 정보만 갱신해요.</p>
            {check.bad.length > 0 && (
              <div className="im-bad">
                {check.bad.slice(0, 5).map((b) => <p key={b.row} className="sm"><b>{b.row}행</b> {b.reason} · {b.data.slice(0, 3).join(" / ")}</p>)}
                <button type="button" className="btn ghost sm-btn" onClick={downloadBad}>오류 행 받기 (고쳐서 다시 올리기)</button>
              </div>
            )}
            {err && <p className="msg err">{err}</p>}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setStep(3)}>칸 연결 다시</button>
              <button type="button" className="btn pri" disabled={busy || check.ok.length === 0} onClick={run}>{busy ? "이전 중…" : `${check.ok.length.toLocaleString()}명 이전`}</button>
            </div>
          </div>
        )}

        {step === 5 && result && (
          <div className="im-body im-done">
            <b>이전이 끝났어요</b>
            <p>새 고객 <b>{result.inserted}</b>명 등록 · 기존 고객 <b>{result.updated}</b>명 갱신{result.skipped ? ` · 건너뜀 ${result.skipped}` : ""}</p>
            <div className="row" style={{ gap: 8 }}><a className="btn pri" href="/desk/customers">고객 목록 보기</a><button type="button" className="btn ghost" onClick={onClose}>닫기</button></div>
          </div>
        )}
        {err && step < 4 && <p className="msg err">{err}</p>}
      </div>
    </div>,
    document.body,
  );
}
