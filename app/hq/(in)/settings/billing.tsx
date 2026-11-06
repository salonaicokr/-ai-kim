"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";

type Plan = { code: string; name: string; monthly_fee: number; included_msgs: number; active: boolean; note: string | null };
type Addon = { code: string; name: string; monthly_fee: number; available: boolean; note: string | null };
type Price = { kind: "sms" | "lms" | "alimtalk"; unit_price: number | null };
export type BillingConfig = { plans: Plan[]; addons: Addon[]; prices: Price[]; mode: "signup" | "first"; log: { item: string; field: string; old: string | null; new: string | null; at: string; by: string }[] };

const KIND_KO = { sms: "문자 SMS", lms: "문자 LMS(장문)", alimtalk: "알림톡" } as const;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 요금제 · 부가서비스 · 문자 단가 · 결제일 방식 (재무 · 마스터) — 한 줄씩 저장, 이력 남김 */
export default function BillingEditor({ initial }: { initial: BillingConfig }) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [nw, setNw] = useState<{ name: string; fee: number; available: boolean; note: string } | null>(null);
  const [del, setDel] = useState<string | null>(null);

  async function reload(t: string) {
    const { data } = await createOpsBrowserClient().rpc("hq_billing_config");
    if (data) setC(data as BillingConfig);
    setMsg({ ok: true, t }); window.dispatchEvent(new Event("salonai:refresh"));
  }
  async function addAddon() {
    if (!nw) return;
    if (!nw.name.trim()) { setMsg({ ok: false, t: "부가서비스 이름을 입력해주세요." }); return; }
    const { error } = await createOpsBrowserClient().rpc("hq_add_billing_addon", { p_name: nw.name, p_fee: nw.fee, p_available: nw.available, p_note: nw.note });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setNw(null); reload(`부가서비스 ${nw.name.trim()}을(를) 추가했어요.`);
  }
  async function removeAddon(a: Addon) {
    setDel(null);
    const { error } = await createOpsBrowserClient().rpc("hq_delete_billing_addon", { p_code: a.code });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    reload(`부가서비스 ${a.name}을(를) 삭제했어요.`);
  }

  async function save(p: Record<string, unknown>, label: string) {
    const sb = createOpsBrowserClient();
    const { error } = await sb.rpc("hq_save_billing_item", { p });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    const { data } = await sb.rpc("hq_billing_config");
    if (data) setC(data as BillingConfig);
    setMsg({ ok: true, t: `${label} 저장했어요.` }); window.dispatchEvent(new Event("salonai:refresh"));
  }
  const setPlan = (code: string, k: keyof Plan, v: unknown) => setC({ ...c, plans: c.plans.map((p) => (p.code === code ? { ...p, [k]: v } : p)) });
  const setAddon = (code: string, k: keyof Addon, v: unknown) => setC({ ...c, addons: c.addons.map((a) => (a.code === code ? { ...a, [k]: v } : a)) });
  const setPrice = (kind: string, v: number | null) => setC({ ...c, prices: c.prices.map((p) => (p.kind === kind ? { ...p, unit_price: v } : p)) });
  const num = (s: string) => Math.max(0, Math.round(Number(s.replace(/[^0-9]/g, "")) || 0));

  return (
    <>
      <section className="card ops-set">
        <h2 className="b">요금제</h2>
        <p className="sm">매장이 매달 본사에 내는 기본 요금이에요. 매장 ERP 전체와 고객 앱 예약이 들어 있어요.</p>
        <table>
          <thead><tr><th>이름</th><th>월액(원)</th><th>포함 문자(건)</th><th>판매</th><th /></tr></thead>
          <tbody>
            {c.plans.map((p) => (
              <tr key={p.code}>
                <td><input className="input" value={p.name} maxLength={20} onChange={(e) => setPlan(p.code, "name", e.target.value)} aria-label="요금제 이름" /><div className="sm">{p.note}</div></td>
                <td><input className="input num" inputMode="numeric" value={p.monthly_fee.toLocaleString("ko-KR")} onChange={(e) => setPlan(p.code, "monthly_fee", num(e.target.value))} aria-label={`${p.name} 월액`} /></td>
                <td><input className="input num" inputMode="numeric" value={p.included_msgs} onChange={(e) => setPlan(p.code, "included_msgs", num(e.target.value))} aria-label={`${p.name} 포함 문자`} /></td>
                <td><label className="row" style={{ gap: 6 }}><input type="checkbox" checked={p.active} onChange={(e) => setPlan(p.code, "active", e.target.checked)} />{p.active ? "판매 중" : "중지"}</label></td>
                <td><button type="button" className="btn ghost sm-btn" onClick={() => save({ kind: "plan", code: p.code, name: p.name, fee: p.monthly_fee, included: p.included_msgs, active: p.active }, `요금제 ${p.name}`)}>저장</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card ops-set">
        <div className="row"><h2 className="b">부가서비스</h2><span className="sp" />
          {!nw && <button type="button" className="btn ghost sm-btn" onClick={() => setNw({ name: "", fee: 0, available: true, note: "" })}>+ 부가서비스 추가</button>}</div>
        <p className="sm">매장이 골라서 켜는 월정액 서비스예요. &lsquo;나중 단계&rsquo;는 요금표에만 있고, 기능이 생길 때까지 매장에는 보이지 않아요.</p>
        <table>
          <thead><tr><th>이름</th><th>월액(원)</th><th>제공</th><th>참고</th><th /></tr></thead>
          <tbody>
            {c.addons.map((a) => (
              <tr key={a.code}>
                <td><input className="input" value={a.name} maxLength={30} onChange={(e) => setAddon(a.code, "name", e.target.value)} aria-label="부가서비스 이름" /></td>
                <td><input className="input num" inputMode="numeric" value={a.monthly_fee.toLocaleString("ko-KR")} onChange={(e) => setAddon(a.code, "monthly_fee", num(e.target.value))} aria-label={`${a.name} 월액`} /></td>
                <td><label className="row" style={{ gap: 6 }}><input type="checkbox" checked={a.available} onChange={(e) => setAddon(a.code, "available", e.target.checked)} />{a.available ? "제공" : "나중 단계"}</label></td>
                <td className="sm">{a.monthly_fee === 0 ? "무료 · " : ""}{a.note}</td>
                <td className="ops-acts">
                  {del === a.code ? (
                    <><span className="sm">삭제할까요?</span>
                      <button type="button" className="btn ghost sm-btn" onClick={() => setDel(null)}>취소</button>
                      <button type="button" className="btn sm-btn del-solid" onClick={() => removeAddon(a)}>삭제</button></>
                  ) : (
                    <><button type="button" className="btn ghost sm-btn" onClick={() => save({ kind: "addon", code: a.code, name: a.name, fee: a.monthly_fee, available: a.available }, `부가서비스 ${a.name}`)}>저장</button>
                      <button type="button" className="btn ghost sm-btn ops-del" aria-label={`${a.name} 삭제`} onClick={() => setDel(a.code)}>삭제</button></>
                  )}
                </td>
              </tr>
            ))}
            {nw && (
              <tr className="ops-new">
                <td><input className="input" autoFocus value={nw.name} maxLength={30} placeholder="예: 알림톡 자동 발송" onChange={(e) => setNw({ ...nw, name: e.target.value })} aria-label="새 부가서비스 이름" /></td>
                <td><input className="input num" inputMode="numeric" value={nw.fee.toLocaleString("ko-KR")} onChange={(e) => setNw({ ...nw, fee: num(e.target.value) })} aria-label="새 부가서비스 월액" /></td>
                <td><label className="row" style={{ gap: 6 }}><input type="checkbox" checked={nw.available} onChange={(e) => setNw({ ...nw, available: e.target.checked })} />{nw.available ? "제공" : "나중 단계"}</label></td>
                <td><input className="input" value={nw.note} maxLength={60} placeholder="메모 (선택)" onChange={(e) => setNw({ ...nw, note: e.target.value })} aria-label="새 부가서비스 메모" /></td>
                <td className="ops-acts"><button type="button" className="btn ghost sm-btn" onClick={() => setNw(null)}>취소</button><button type="button" className="btn pri sm-btn" onClick={addAddon}>추가</button></td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="ops-2">
        <section className="card ops-set">
          <h2 className="b">문자 · 알림톡 건당 단가</h2>
          <p className="sm">요금제에 포함된 건수를 넘으면 다음 달 청구에 붙어요. 발송 업체 계약 후 넣어주세요 (비우면 미정).</p>
          <table>
            <tbody>
              {c.prices.map((p) => (
                <tr key={p.kind}>
                  <th scope="row">{KIND_KO[p.kind]}</th>
                  <td><input className="input num" inputMode="decimal" placeholder="미정" value={p.unit_price ?? ""} onChange={(e) => setPrice(p.kind, e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)} aria-label={`${KIND_KO[p.kind]} 단가`} /> 원</td>
                  <td><button type="button" className="btn ghost sm-btn" onClick={() => save({ kind: "price", code: p.kind, unit_price: p.unit_price == null ? "" : String(p.unit_price) }, `${KIND_KO[p.kind]} 단가`)}>저장</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card ops-set">
          <h2 className="b">결제일</h2>
          <p className="sm">매달 카드에서 구독료가 빠져나가는 날이에요. 미납 단계(D-Day → D+15)도 이 날 기준이에요.</p>
          <label className="row" style={{ gap: 8 }}><input type="radio" name="mode" checked={c.mode === "signup"} onChange={() => save({ kind: "mode", mode: "signup" }, "결제일 방식")} />
            <span><b>가입일 기준</b> <span className="sm">· 11월 6일 운영 시작 → 매월 6일 (29~31일은 28일)</span></span></label>
          <label className="row" style={{ gap: 8 }}><input type="radio" name="mode" checked={c.mode === "first"} onChange={() => save({ kind: "mode", mode: "first" }, "결제일 방식")} />
            <span><b>매월 1일 일괄</b> <span className="sm">· 첫 달은 남은 날만큼(일할)</span></span></label>
          <p className="sm">매장별 결제일은 매장 상세 › 과금 상태에서 바꿀 수 있어요.</p>
        </section>
      </div>

      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}

      <section className="card ops-set">
        <h2 className="b">변경 이력</h2>
        <ul className="list ops-log">
          {c.log.map((l, i) => (
            <li key={i}><span className="sm">{new Date(l.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
              <span><b>{l.item}</b> · {l.field} {l.old ? `${l.old} → ` : ""}{l.new}</span><span className="sp" /><span className="sm">{l.by}</span></li>
          ))}
          {c.log.length === 0 && <li className="sm">아직 바꾼 내용이 없어요. (처음 값: 기본 {won(c.plans.find((p) => p.code === "basic")?.monthly_fee ?? 0)} 등 임시값)</li>}
        </ul>
      </section>
    </>
  );
}
