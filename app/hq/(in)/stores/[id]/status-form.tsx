"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";

type St = "pending" | "active" | "suspended";
const ACTIONS: Record<St, { to: St; label: string; tone: string; reason: string }[]> = {
  pending: [{ to: "active", label: "승인 (운영 시작)", tone: "pri", reason: "서류 확인 완료" }, { to: "suspended", label: "정지", tone: "del-solid", reason: "" }],
  active: [{ to: "suspended", label: "정지", tone: "del-solid", reason: "" }],
  suspended: [{ to: "active", label: "정지 해제 (운영 재개)", tone: "pri", reason: "" }],
};

/** 승인 · 정지 · 해제: 사유 필수, 누가 · 언제 · 사유가 이력에 남음 */
export default function StatusForm({ shopId, status }: { shopId: string; status: St }) {
  const router = useRouter();
  const [pick, setPick] = useState<(typeof ACTIONS)[St][number] | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!pick) return;
    if (!reason.trim()) { setMsg({ ok: false, t: "사유를 입력해주세요." }); return; }
    setBusy(true);
    const { error } = await createOpsBrowserClient().rpc("hq_set_status", { p_shop: shopId, p_status: pick.to, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: `${pick.label} 처리했어요.` });
    setPick(null); setReason("");
    window.dispatchEvent(new Event("salonai:refresh"));
  }

  return (
    <div className="ops-status">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {ACTIONS[status].map((a) => (
          <button key={a.to} type="button" className={`btn ${a.tone}${pick?.to === a.to ? " on" : ""}`} onClick={() => { setPick(a); setReason(a.reason); setMsg(null); }}>{a.label}</button>
        ))}
      </div>
      {pick && (
        <div className="ops-reason">
          <label className="field"><span className="lbl">사유 (필수 · 이력에 남아요)</span>
            <input className="input" autoFocus maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={pick.to === "suspended" ? "예: 요금 미납 2개월" : "예: 서류 확인 완료"} /></label>
          {pick.to === "suspended" && <p className="sm">정지하면 이 매장 계정은 로그인 후 안내 화면만 보고, 예약 · 고객 · 매출 정보를 열람할 수 없어요.</p>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setPick(null)}>취소</button>
            <button type="button" className={`btn ${pick.tone}`} disabled={busy} onClick={save}>{busy ? "처리 중…" : `${pick.label} 확정`}</button>
          </div>
        </div>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
    </div>
  );
}
