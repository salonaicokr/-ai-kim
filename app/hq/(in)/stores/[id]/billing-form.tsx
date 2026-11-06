"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import { BILLING_KO, type BillingState } from "../../types";

const HELP: Record<BillingState, string> = {
  normal: "모든 기능 사용",
  grace: "결제 실패 · 재결제 기다리는 중 (기능은 그대로)",
  restricted: "문자 · 알림톡 · 고객 관리 · 예약 연동 잠금, 예약 확인 · 결제는 가능",
  blocked: "매장 화면 전면 차단 (결제 수단 변경만 가능)",
  terminated: "해지 — 인센티브 정산에서도 빠져요",
};

/** 과금 상태 · 결제일 (재무 · 마스터). 자동 단계(3단계 개발)도 같은 이력에 남아요 */
export default function BillingForm({ shopId, state, day, canEdit }: { shopId: string; state: BillingState; day: number | null; canEdit: boolean }) {
  const router = useRouter();
  const [to, setTo] = useState<BillingState>(state);
  const [d, setD] = useState<string>(day ? String(day) : "");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const changed = to !== state || (d && Number(d) !== day);

  async function save() {
    if (!reason.trim()) { setMsg({ ok: false, t: "바꾸는 사유를 적어주세요." }); return; }
    const { error } = await createOpsBrowserClient().rpc("hq_set_billing", { p_shop: shopId, p_state: to, p_day: d ? Number(d) : null, p_reason: reason });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: "과금 상태를 저장했어요." }); setReason(""); window.dispatchEvent(new Event("salonai:refresh"));
  }

  return (
    <div className="ops-billing">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className={`pill bl-${state}`}>{BILLING_KO[state]}</span>
        <span className="sm">{HELP[state]}</span>
        <span className="sp" />
        <span className="sm">결제일 매월 <b>{day ?? "-"}</b>일</span>
      </div>
      {canEdit ? (
        <div className="ops-add" style={{ marginTop: 10 }}>
          <label className="field"><span className="lbl">과금 상태</span>
            <select className="input" value={to} onChange={(e) => setTo(e.target.value as BillingState)}>
              {(Object.keys(BILLING_KO) as BillingState[]).map((k) => <option key={k} value={k}>{BILLING_KO[k]} — {HELP[k]}</option>)}
            </select></label>
          <label className="field" style={{ maxWidth: 120 }}><span className="lbl">결제일</span>
            <select className="input" value={d} onChange={(e) => setD(e.target.value)}>
              <option value="">-</option>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}일</option>)}
            </select></label>
          <label className="field"><span className="lbl">사유 (필수)</span>
            <input className="input" value={reason} maxLength={200} placeholder="예: 입금 확인 · 유예 7일 연장 요청" onChange={(e) => setReason(e.target.value)} /></label>
          <button className="btn pri" type="button" disabled={!changed} onClick={save}>저장</button>
        </div>
      ) : <p className="sm" style={{ marginTop: 8 }}>과금 상태는 재무 · 마스터 역할만 바꿀 수 있어요.</p>}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
    </div>
  );
}
