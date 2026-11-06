"use client";

import { useEffect, useMemo, useState } from "react";
import type { createClient } from "@/src/lib/supabase/client";
import TreatmentRecord, { ensureRecord, sendRecord } from "./record";
import { kindOf } from "@/src/lib/menu";
import { durLabel, hhmm, mdLabel, minsOfDay, ymdOfIso, type Booking, type Designer, type MenuOpt } from "./lib";
import "./checkout.css";

type SB = ReturnType<typeof createClient>;
type Len = "base" | "m" | "l";
type Line = { key: string; menuId: string | null; name: string; base: number; m: number | null; l: number | null; len: Len; source: "reserved" | "added" | "custom"; kind: string };
type Method = "card" | "npay" | "cash" | "transfer" | "prepaid";
const METHODS: { v: Method; label: string }[] = [
  { v: "card", label: "카드" }, { v: "npay", label: "N페이" }, { v: "cash", label: "현금" }, { v: "transfer", label: "계좌이체" }, { v: "prepaid", label: "정액권" },
];
const REASONS = ["단골 서비스", "현장 할인", "시술 보상", "끝전 정리", "가격 협의"];
const won = (n: number) => n.toLocaleString("ko-KR");
const unit = (x: Line) => x.base + (x.len === "m" ? x.m ?? 0 : x.len === "l" ? x.l ?? 0 : 0);
let seq = 0;
const k = () => `l${++seq}`;

/** S17 완료 · 결제 등록 (예약 메뉴 + 현장 추가 + 기장 M/L 합산 · 포인트 · 예약금 · 결제수단 · 금액 수정 사유) */
const TOPUP_METHODS = [{ v: "card", label: "카드" }, { v: "npay", label: "N페이" }, { v: "cash", label: "현금" }, { v: "transfer", label: "계좌이체" }] as const;

export default function Checkout({ supabase, shopId, b, canRecord = false, menus, designers, onClose, onDone }: {
  supabase: SB; shopId: string; b: Booking; canRecord?: boolean; menus: MenuOpt[]; designers: Designer[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [lines, setLines] = useState<Line[]>(() => b.items.map((i) => {
    const m = menus.find((x) => x.id === i.menu_item_id);
    return { key: k(), menuId: i.menu_item_id, name: i.name, base: i.price, m: m?.priceM ?? null, l: m?.priceL ?? null, len: "base", source: "reserved", kind: i.kind };
  }));
  const cats = [...new Set(menus.map((m) => m.cat))];
  const [cat, setCat] = useState(cats[0] ?? "");
  const [custName, setCustName] = useState("");
  const [custPrice, setCustPrice] = useState("");
  const [cust, setCust] = useState<{ points: number; deposit: number; prepaid: number }>({ points: 0, deposit: 0, prepaid: 0 });
  const [points, setPoints] = useState(0);
  const [method, setMethod] = useState<Method>("card");
  const [paidStr, setPaidStr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 정액권 잔액 부족 → 충전 결제 창
  const [topup, setTopup] = useState(false);
  const [topAmt, setTopAmt] = useState(0);
  const [topBy, setTopBy] = useState<(typeof TOPUP_METHODS)[number]["v"]>("card");
  const [topMemo, setTopMemo] = useState("");
  const [topBusy, setTopBusy] = useState(false);
  const [topDone, setTopDone] = useState<string | null>(null);
  const [sendApp, setSendApp] = useState(true);
  // AI 시술 기록 초안 (고객 다이어리에 함께 감 · 매장 메모와 별개)
  const [svFlags, setSvFlags] = useState<{ level: string; label: string }[]>([]);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.from("pre_surveys").select("flags").eq("booking_id", b.id).eq("status", "answered").maybeSingle()
      .then(({ data }) => { if (alive) setSvFlags(((data as { flags?: { level: string; label: string }[] } | null)?.flags) ?? []); });
    Promise.all([
      b.shop_customer_id ? supabase.from("v_shop_customers").select("points, prepaid_balance").eq("id", b.shop_customer_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("bookings").select("deposit_amount").eq("id", b.id).maybeSingle(),
    ]).then(([c, bk]) => {
      if (alive) setCust({ points: (c.data as { points?: number } | null)?.points ?? 0, prepaid: (c.data as { prepaid_balance?: number } | null)?.prepaid_balance ?? 0, deposit: (bk.data as { deposit_amount?: number } | null)?.deposit_amount ?? 0 });
    });
    return () => { alive = false; };
  }, [supabase, b.id, b.shop_customer_id]);

  const subtotal = lines.reduce((a, x) => a + unit(x), 0);
  const usePts = Math.min(points, cust.points, subtotal);
  const calc = Math.max(0, subtotal - usePts - cust.deposit);
  const paid = paidStr == null ? calc : Number(paidStr.replace(/[^0-9]/g, "") || 0);
  const overridden = paid !== calc;
  const s = minsOfDay(b.start_at);
  // 실제 시술 담당: 예약 담당과 같으면 그대로, 다르면 여기서 바꿈 (Jina님 의견)
  const [performer, setPerformer] = useState(b.designer_id);
  const designer = designers.find((d) => d.id === (performer || b.designer_id))?.name ?? "";
  /** 시술 담당 확인 → 예약 담당을 실제 시술자로 바꿈 (고객 담당 디자이너도 이걸로 자동 입력) */
  async function confirmPerformer() {
    if (performer === b.designer_id) return true;
    const { error } = await supabase.from("bookings").update({ designer_id: performer }).eq("id", b.id);
    if (error) { setErr(`시술 담당 저장 실패: ${error.message}`); return false; }
    return true;
  }
  const shownMenus = useMemo(() => menus.filter((m) => m.cat === cat), [menus, cat]);

  function add(m: MenuOpt) {
    setLines((ls) => [...ls, { key: k(), menuId: m.id, name: m.name, base: m.price, m: m.priceM ?? null, l: m.priceL ?? null, len: "base", source: "added", kind: m.kind }]);
    setPaidStr(null);
  }
  function addCustom() {
    const price = Number(custPrice.replace(/[^0-9]/g, ""));
    if (!custName.trim() || !price) { setErr("직접 입력은 이름과 금액을 모두 넣어주세요."); return; }
    setErr(null);
    setLines((ls) => [...ls, { key: k(), menuId: null, name: custName.trim(), base: price, m: null, l: null, len: "base", source: "custom", kind: "etc" }]);
    setCustName(""); setCustPrice(""); setPaidStr(null);
  }

  function openTopup() {
    const short = Math.max(0, paid - cust.prepaid);
    setTopAmt(Math.max(100000, Math.ceil(short / 100000) * 100000));
    setTopMemo(""); setTopup(true); setErr(null);
  }
  async function charge() {
    if (!b.shop_customer_id || topAmt <= 0) return;
    setTopBusy(true); setErr(null);
    const { error } = await supabase.from("prepaid_ledger").insert({
      shop_id: shopId, shop_customer_id: b.shop_customer_id, kind: "charge", amount: topAmt, pay_method: topBy, memo: topMemo.trim() || "결제 중 충전",
    });
    setTopBusy(false);
    if (error) { setErr(`충전 실패: ${error.message}`); return; }
    setCust((c) => ({ ...c, prepaid: c.prepaid + topAmt }));
    setTopup(false);
    setTopDone(`${won(topAmt)}원 충전 완료 (${TOPUP_METHODS.find((m) => m.v === topBy)?.label}) · 이제 정액권으로 결제할 수 있어요`);
  }

  const autoDraft = (() => {
    const names = lines.map((x) => (x.len === "base" ? x.name : `${x.name}(기장 ${x.len.toUpperCase()})`));
    if (!names.length) return "";
    const kinds = new Set(lines.map((x) => x.kind));
    const out = [`오늘 ${names.join(" + ")} 시술을 했어요.`];
    const safe = svFlags.filter((f) => f.level === "safety").map((f) => f.label);
    const cost = svFlags.filter((f) => f.level === "cost").map((f) => f.label);
    if (safe.length) out.push(`사전 문진의 ${safe.join(" · ")} 내용을 확인하고 자극을 줄여 진행했어요.`);
    if (cost.length) out.push(`${cost.join(" · ")}을(를) 고려해 모발 상태에 맞춰 시술했어요.`);
    const care: string[] = [];
    if (kinds.has("color")) care.push("염색 후 48시간은 샴푸를 미뤄 주세요");
    if (kinds.has("perm") || kinds.has("heat_perm")) care.push("펌 후 48시간은 머리를 묶거나 세게 빗지 말아 주세요");
    if (kinds.has("clinic")) care.push("1주일은 고열 기구 사용을 줄여 주세요");
    if (kinds.has("cut")) care.push("다음 커트는 5주 뒤가 적기예요");
    if (care.length) out.push(`케어: ${care.join(" · ")}.`);
    return out.join(" ");
  })();
  const summaryText = draft ?? autoDraft;

  /** 고객 앱으로 청구 보내기 → 고객이 앱에서 내역 확인 후 원클릭 승인하면 결제 · 방문완료 */
  async function sendClaim() {
    if (!b.shop_customer_id) return;
    if (lines.length === 0) { setErr("시술 내역을 1개 이상 넣어주세요."); return; }
    if (overridden) { setErr("앱 청구는 자동 계산 금액으로만 보낼 수 있어요. 금액을 직접 고쳤다면 매장 결제로 완료해주세요."); return; }
    setBusy(true); setErr(null);
    if (!(await confirmPerformer())) { setBusy(false); return; }
    const { error } = await supabase.from("payment_requests").insert({
      shop_id: shopId, booking_id: b.id, shop_customer_id: b.shop_customer_id, designer_id: performer || b.designer_id,
      lines: lines.map((x) => ({ menu_item_id: x.menuId, name: x.len === "base" ? x.name : `${x.name} (기장 ${x.len.toUpperCase()})`, unit_price: unit(x), length_option: x.len, source: x.source })),
      subtotal, points_used: usePts, deposit_applied: cust.deposit, amount: calc, memo: memo.trim() || null,
    });
    if (error) { setBusy(false); setErr(error.code === "23505" ? "이미 보낸 청구가 있어요. 예약 상세에서 확인해주세요." : error.message); return; }
    if (canRecord && summaryText.trim()) {
      const rec = await ensureRecord(supabase, b, shopId);
      if (rec) await supabase.from("treatment_records").update({ ai_summary: summaryText.trim() }).eq("id", rec.id);
    }
    setBusy(false);
    onDone(`${b.customer?.name ?? "고객"} 님 앱으로 ${won(calc)}원 청구를 보냈어요 · 고객이 승인하면 결제 · 방문완료로 바뀌어요`);
  }

  async function submit() {
    if (method === "prepaid" && cust.prepaid < paid) { openTopup(); return; }
    if (lines.length === 0) { setErr("시술 내역을 1개 이상 넣어주세요."); return; }
    if (overridden && !reason.trim()) { setErr("결제 금액을 바꿨어요. 바꾼 사유를 골라주세요."); return; }
    setBusy(true); setErr(null);
    if (!(await confirmPerformer())) { setBusy(false); return; }
    const { error } = await supabase.rpc("complete_checkout", {
      p_booking: b.id,
      p_lines: lines.map((x) => ({ menu_item_id: x.menuId, name: x.len === "base" ? x.name : `${x.name} (기장 ${x.len.toUpperCase()})`, unit_price: unit(x), length_option: x.len, source: x.source })),
      p_points_used: usePts, p_paid_amount: paid, p_method: method,
      p_override_reason: overridden ? reason.trim() : null, p_memo: memo.trim() || null,
    });
    if (error) { setBusy(false); setErr(error.message); return; }
    let sent = "";
    if (canRecord && b.shop_customer_id && summaryText.trim()) {
      const rec = await ensureRecord(supabase, b, shopId);
      if (rec) await supabase.from("treatment_records").update({ ai_summary: summaryText.trim() }).eq("id", rec.id);
    }
    if (canRecord && sendApp && b.shop_customer_id) {
      const e2 = await sendRecord(supabase, b, shopId, designer);
      sent = e2 ? ` · 고객 앱 전송 실패(${e2})` : " · 고객 앱 다이어리로 전송";
    }
    setBusy(false);
    onDone(`${b.customer?.name ?? "고객"} 님 ${won(paid)}원 ${METHODS.find((m) => m.v === method)?.label} 결제 · 방문완료${sent}`);
  }

  return (
    <div className="co-back" role="dialog" aria-modal="true" aria-label="완료 · 결제 등록" onClick={onClose}>
      <div className="co" onClick={(ev) => ev.stopPropagation()}>
        <header className="co-h">
          <h2>완료 · 결제 등록</h2>
          <span className="pill p-gray">{b.customer?.name ?? "고객"} · {mdLabel(ymdOfIso(b.start_at))} {hhmm(s)}</span>
          <label className={`co-perf${performer !== b.designer_id ? " chg" : ""}`} title="예약 담당과 실제 시술자가 다르면 바꿔주세요"><span className="sm">시술 담당</span>
            <select id="co-performer" value={performer} onChange={(e) => { setPerformer(e.target.value); setErr(null); }} aria-label="실제 시술 담당 (예약 담당과 다르면 변경)">
              {designers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.id === b.designer_id ? " (예약 담당)" : ""}</option>)}
            </select></label>
          <span className="sm co-perf-note">{performer !== b.designer_id ? "예약 담당에서 바뀌어요" : "예약 담당과 다르면 바꿔주세요"}</span>
          <span className="sp" />
          <button type="button" className="x" aria-label="닫기" onClick={onClose}>×</button>
        </header>

        <div className="co-body">
          {/* 왼쪽: 시술 추가 */}
          <section className="co-l">
            <p className="lbl">+ 시술 추가 · 누르면 오른쪽 시술 내역에 담겨요</p>
            <div className="co-tabs">
              {cats.map((c) => {
                const n = lines.filter((x) => menus.find((m) => m.id === x.menuId)?.cat === c && x.source !== "reserved").length;
                return <button key={c} type="button" className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}{n > 0 && <b className="n">{n}</b>}</button>;
              })}
            </div>
            <div className="co-grid">
              {shownMenus.map((m) => (
                <button key={m.id} type="button" className="co-item" style={{ ["--k" as string]: kindOf(m.kind).color }} onClick={() => add(m)}>
                  <b>{m.name}</b><span className="tnum">{won(m.price)}원</span>
                  <span className="sm">{durLabel(m.minutes)}{(m.priceM || m.priceL) ? " · 기장 추가 있음" : ""}</span>
                </button>
              ))}
            </div>
            <div className="co-custom">
              <p className="lbl">금액 직접 입력 · 메뉴에 없는 시술</p>
              <div className="row">
                <input id="co-cname" className="input" placeholder="시술 이름" value={custName} onChange={(ev) => setCustName(ev.target.value)} maxLength={30} />
                <input id="co-cprice" className="input" placeholder="금액" inputMode="numeric" value={custPrice} onChange={(ev) => setCustPrice(ev.target.value)} />
                <button type="button" className="btn sm-btn" onClick={addCustom}>담기</button>
              </div>
            </div>
          </section>

          {/* 오른쪽: 실제 시술 내역 + 합계 */}
          <section className="co-r">
            <div className="row"><b>실제 시술 내역</b><span className="pill p-teal">{lines.length}건</span><span className="sp" /><span className="sm">예약: {b.items.map((i) => i.name).join(" + ") || "없음"}</span></div>
            <ul className="co-lines">
              {lines.length === 0 && <li className="sm empty">왼쪽에서 시술을 담아주세요.</li>}
              {lines.map((x) => (
                <li key={x.key} className={x.source !== "reserved" ? "added" : ""} style={{ ["--k" as string]: kindOf(x.kind as never).color }}>
                  <div className="ln-top">
                    <b>{x.name}</b>
                    {x.source !== "reserved" && <span className="pill tag">{x.source === "custom" ? "직접 입력" : "현장 추가"}</span>}
                    <span className="sp" />
                    <b className="tnum">{won(unit(x))}원</b>
                    <button type="button" className="rm" aria-label={`${x.name} 빼기`} onClick={() => { setLines((ls) => ls.filter((y) => y.key !== x.key)); setPaidStr(null); }}>×</button>
                  </div>
                  {(x.m || x.l) && (
                    <div className="len" role="radiogroup" aria-label={`${x.name} 기장`}>
                      <span className="sm">기장</span>
                      {(["base", "m", "l"] as Len[]).filter((v) => v === "base" || (v === "m" ? x.m : x.l)).map((v) => (
                        <button key={v} type="button" role="radio" aria-checked={x.len === v} className={x.len === v ? "on" : ""}
                          onClick={() => { setLines((ls) => ls.map((y) => (y.key === x.key ? { ...y, len: v } : y))); setPaidStr(null); }}>
                          {v === "base" ? "기본" : v === "m" ? `M +${won(x.m!)}` : `L +${won(x.l!)}`}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="co-sum">
              <div><span>시술 합계 ({lines.length}건)</span><b className="tnum">{won(subtotal)}원</b></div>
              <div>
                <span>포인트 사용 <small>보유 {won(cust.points)}P</small></span>
                <input id="co-points" className="pts tnum" inputMode="numeric" value={points || ""} placeholder="0" disabled={!cust.points}
                  onChange={(ev) => { setPoints(Number(ev.target.value.replace(/[^0-9]/g, "") || 0)); setPaidStr(null); }} />
              </div>
              {cust.deposit > 0 && <div><span>예약금 차감</span><b className="tnum">−{won(cust.deposit)}원</b></div>}
              <div className="total"><span>최종 결제 금액</span><b className="tnum">{won(calc)}원</b></div>
            </div>

            <div className="two">
              <label className="field"><span className="lbl">결제 금액 {overridden ? <span className="pill warn">직접 수정</span> : <span className="pill p-teal">자동 계산</span>}</span>
                <input id="co-paid" className="input tnum" inputMode="numeric" value={paidStr ?? won(calc)} onChange={(ev) => setPaidStr(ev.target.value)}
                  onFocus={(ev) => ev.target.select()} /></label>
              <div className="field"><span className="lbl">결제 수단</span>
                <div className="methods">
                  {METHODS.map((m) => <button key={m.v} type="button" className={`${method === m.v ? "on" : ""}${m.v === "npay" ? " npay" : ""}`} onClick={() => setMethod(m.v)}>{m.label}{m.v === "prepaid" && cust.prepaid > 0 ? ` ${won(cust.prepaid)}` : ""}</button>)}
                </div>
                {method === "prepaid" && !b.shop_customer_id && <span className="sm pp-short">고객 카드가 연결된 예약만 정액권을 쓸 수 있어요.</span>}
                {method === "prepaid" && b.shop_customer_id && (cust.prepaid < paid ? (
                  <div className="pp-need">
                    <span className="sm pp-short">정액권 잔액 {won(cust.prepaid)}원 · <b>{won(paid - cust.prepaid)}원 부족</b></span>
                    <button type="button" className="btn pri sm-btn" onClick={openTopup}>정액권 충전하기</button>
                  </div>
                ) : (
                  <span className="sm">정액권 잔액 {won(cust.prepaid)}원 → 결제 후 {won(cust.prepaid - paid)}원</span>
                ))}
                {topDone && method === "prepaid" && <span className="sm pp-ok">✓ {topDone}</span>}
              </div>
            </div>
            {overridden && (
              <div className="field reason">
                <span className="lbl">금액을 바꾼 사유 (필수 · 이력에 남아요) · 계산 {won(calc)}원 → {won(paid)}원</span>
                <div className="co-tabs">{REASONS.map((r) => <button key={r} type="button" className={`chip${reason === r ? " on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}</div>
                <input id="co-reason" className="input" placeholder="직접 입력" value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={60} />
              </div>
            )}
            {b.shop_customer_id && (
              <>
                <TreatmentRecord supabase={supabase} shopId={shopId} b={b} designerName={designer} canRecord={canRecord} compact />
                {canRecord && (
                  <label className="field co-ai"><span className="lbl">AI 시술 기록 초안 <span className="pill p-teal">자동 작성</span> <span className="sm">고객 다이어리에 함께 가요 · 고쳐도 돼요</span></span>
                    <textarea id="co-ai" className="input" rows={3} value={summaryText} onChange={(ev) => setDraft(ev.target.value)} />
                    <span className="sm">테스트 버전: 시술 · 문진으로 만든 초안이에요. 정식 버전에서는 Gemini가 사진 · 메모까지 보고 작성해요.</span></label>
                )}
                {canRecord && (
                  <label className="co-send"><input type="checkbox" checked={sendApp} onChange={(ev) => setSendApp(ev.target.checked)} />
                    <span><b>완료하면 고객 앱 다이어리로 보내기</b><span className="sm">시술 내역 · 결제 정보 · 사진만 보내요 (메모는 안 보내요)</span></span></label>
                )}
              </>
            )}
            <label className="field"><span className="lbl">시술 메모 (선택 · 매장 · 디자이너만 봐요)</span>
              <input id="co-memo" className="input" placeholder="예: 애쉬브라운 7레벨 · 산화제 6%" value={memo} onChange={(ev) => setMemo(ev.target.value)} maxLength={80} /></label>
          </section>
        </div>

        <footer className="co-f">
          {err ? <p className="msg err">{err}</p> : <p className="sm">금액은 시술 내역으로 자동 합산돼요 · 필요하면 결제 금액을 직접 고칠 수 있어요 (사유 필수)</p>}
          <span className="sp" />
          <button type="button" className="btn ghost" onClick={onClose}>취소</button>
          {b.shop_customer_id && <button type="button" className="btn" disabled={busy || overridden} onClick={sendClaim} title="고객 앱에서 내역 확인 후 원클릭 승인">고객 앱으로 청구</button>}
          <button type="button" className="btn pri" disabled={busy} onClick={submit}>{busy ? "처리 중…" : method === "prepaid" && b.shop_customer_id && cust.prepaid < paid ? "정액권 충전하고 결제" : `${won(paid)}원 완료 처리`}</button>
        </footer>
        {topup && (
          <div className="tp-back" onClick={() => setTopup(false)}>
            <div className="tp" role="dialog" aria-modal="true" aria-label="정액권 충전 결제" onClick={(ev) => ev.stopPropagation()}>
              <div className="row"><h3>정액권 충전 결제</h3><span className="sp" /><button type="button" className="x" aria-label="닫기" onClick={() => setTopup(false)}>×</button></div>
              <div className="tp-sum">
                <div><span>현재 잔액</span><b className="tnum">{won(cust.prepaid)}원</b></div>
                <div><span>이번 결제</span><b className="tnum">{won(paid)}원</b></div>
                <div className="short"><span>부족한 금액</span><b className="tnum">{won(Math.max(0, paid - cust.prepaid))}원</b></div>
              </div>
              <div className="field"><span className="lbl">충전 금액</span>
                <div className="tp-chips">
                  {[...new Set([Math.max(0, paid - cust.prepaid), 100000, 200000, 300000, 500000])].filter((v) => v > 0).sort((a, z) => a - z).map((v) => (
                    <button key={v} type="button" className={`chip${topAmt === v ? " on" : ""}`} onClick={() => setTopAmt(v)}>{v === paid - cust.prepaid ? `부족분 ${won(v)}원` : `${v / 10000}만원`}</button>
                  ))}
                </div>
                <input id="tp-amt" className="input tnum" inputMode="numeric" value={topAmt ? won(topAmt) : ""} onChange={(ev) => setTopAmt(Number(ev.target.value.replace(/[^0-9]/g, "")) || 0)} placeholder="직접 입력 (원)" />
              </div>
              <div className="field"><span className="lbl">충전 결제 수단</span>
                <div className="methods">
                  {TOPUP_METHODS.map((m) => <button key={m.v} type="button" className={`${topBy === m.v ? "on" : ""}${m.v === "npay" ? " npay" : ""}`} onClick={() => setTopBy(m.v)}>{m.label}</button>)}
                </div>
              </div>
              <input className="input" placeholder="메모 (예: 30만원 결제 시 33만원 적립)" value={topMemo} onChange={(ev) => setTopMemo(ev.target.value)} maxLength={100} />
              <p className="sm">충전 후 잔액 <b className="tnum">{won(cust.prepaid + topAmt)}원</b> → 이번 결제 후 <b className="tnum">{won(cust.prepaid + topAmt - paid)}원</b>{cust.prepaid + topAmt < paid && <span className="pp-short"> · 아직 부족해요</span>}</p>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn ghost" onClick={() => setTopup(false)}>취소</button>
                <button type="button" className="btn pri" disabled={topBusy || topAmt <= 0} onClick={charge}>{topBusy ? "충전 중…" : `${won(topAmt)}원 충전하기`}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
