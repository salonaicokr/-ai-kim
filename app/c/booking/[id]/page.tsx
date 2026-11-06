"use client";
// @ts-nocheck

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { STATUS_KO, STATUS_TONE, kindOfName, msgOf, rpc, signed, when, whenLong, won } from "@/src/lib/customer/api";
import { damageAdvice, damageColor } from "@/src/lib/customer/care";
import { Loading, Page, Pill, Top, useGuard } from "../../ui";

const METHOD: Record<string, string> = { cash: "현금", card_terminal: "카드", naver_pay: "N페이", transfer: "계좌이체", other: "앱 결제" };

function careGuide(items: { name: string }[]) {
  const kinds = new Set(items.map((i) => kindOfName(i.name)));
  const out: string[] = [];
  if (kinds.has("염색")) out.push("염색 후 48시간은 샴푸를 미뤄 주세요. 색 빠짐 방지 샴푸를 쓰면 좋아요.");
  if (kinds.has("펌") || kinds.has("열펌")) out.push("펌 후 48시간은 머리를 묶거나 세게 빗지 말아 주세요. 완전히 말린 뒤 자요.");
  if (kinds.has("클리닉")) out.push("클리닉 후 1주일은 고열 기구 사용을 줄여 주세요.");
  if (kinds.has("컷")) out.push("다음 커트는 5~6주 뒤가 적기예요.");
  return out;
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const g = useGuard();
  const [b, setB] = useState<any>(undefined);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | "cancel" | "change">(null);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await rpc("c_booking_detail", { p_id: id });
      setB(d);
      if (d) {
        setNote(d.my_note ?? ""); setScore(d.rating?.score ?? 0); setComment(d.rating?.comment ?? "");
        setUrls(await signed("treatment-photos", (d.record?.photos ?? []).map((p: any) => p.path)));
      }
    } catch (e) { setErr(msgOf(e)); setB(null); }
  }, [id]);
  useEffect(() => { if (g.ready) load(); }, [g.ready, load]);

  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); setMsg(ok); setAsk(null); setText(""); await load(); } catch (e) { setErr(msgOf(e)); }
    setBusy(false);
  }

  async function cancel() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await rpc("c_cancel_booking", { p_id: id, p_reason: text });
      await load(); setAsk(null); setText("");
      setMsg(r === "requested" ? "매장에 취소 요청을 보냈어요. 확인되면 알려드려요." : "예약을 취소했어요");
    } catch (e) { setErr(msgOf(e)); }
    setBusy(false);
  }

  if (!g.ready || b === undefined) return <main className="cpage"><Top back="/c/diary" /><Loading /></main>;
  if (!b) return <main className="cpage"><Top back="/c/diary" /><p className="cmsg err">{err ?? "예약을 찾지 못했어요"}</p></main>;

  const live = ["requested", "confirmed"].includes(b.status) && new Date(b.end) > new Date();
  const rec = b.record;
  const photos = rec?.photos ?? [];
  const before = photos.filter((p: any) => p.kind === "before");
  const after = photos.filter((p: any) => p.kind === "after");
  const paid = (b.payments ?? []).filter((p: any) => p.type === "paid").reduce((a: number, p: any) => a + p.amount, 0);
  const guide = careGuide(b.items);
  const openCancel = (b.requests ?? []).some((r: any) => r.kind === "cancel" && r.status === "open");

  return (
    <Page tabbed={false}>
      <Top back="/c/diary" title="예약 상세" />
      {err && <p className="cmsg err" role="alert">{err}</p>}
      {msg && <p className="cmsg" role="status">{msg}</p>}

      <div className="ccard">
        <div className="crow"><Pill tone={STATUS_TONE[b.status]}>{STATUS_KO[b.status] ?? b.status}</Pill>{b.source === "app" && <Pill tone="gray">앱 예약</Pill>}</div>
        <h1 className="ch1" style={{ fontSize: 22 }}>{when(b.start)}</h1>
        <dl className="cdl">
          <dt>매장</dt><dd>{b.store.name}</dd>
          {b.designer && <><dt>디자이너</dt><dd>{b.designer.name} {b.designer.title}</dd></>}
          <dt>시술</dt><dd>{b.items.map((i: any) => `${i.name}`).join(" + ") || "-"}</dd>
          <dt>금액</dt><dd>{won(paid || b.total)}{!paid && b.total > 0 && <span className="cmt"> (예상)</span>}</dd>
          {b.request && <><dt>요청</dt><dd>{b.request}</dd></>}
          {b.store.address && <><dt>위치</dt><dd>{b.store.address}</dd></>}
        </dl>
        <div className="crow">{b.store.phone && <a className="cbtn sm" href={`tel:${b.store.phone}`}>매장 전화</a>}</div>
      </div>

      {b.pay_request && (
        <Link href={`/c/pay/${b.pay_request.id}`} className="cbanner"><span style={{ fontSize: 26 }} aria-hidden>💳</span><span style={{ flex: 1 }}>결제 요청이 도착했어요<small>{won(b.pay_request.amount)} · 내용 확인하고 결제하기</small></span><span aria-hidden>›</span></Link>
      )}
      {b.survey?.status === "sent" && ["requested", "confirmed"].includes(b.status) && (
        <Link href={`/c/survey/${b.survey.id}`} className="ccard warm" style={{ textDecoration: "none", color: "inherit" }}><b>사전 문진을 작성해 주세요</b><span className="cmt">알레르기 · 두피 상태를 미리 알려주면 더 안전하게 시술해요 ›</span></Link>
      )}

      {live && (
        <div className="ccard">
          <b>예약 관리</b>
          {(b.requests ?? []).filter((r: any) => r.status === "open").map((r: any) => <p key={r.id} className="cmsg">{r.kind === "cancel" ? "취소 요청을 보냈어요. 매장이 확인하면 알려드려요." : `변경 요청: ${r.message}`}</p>)}
          {ask ? (
            <>
              <textarea className="cin" style={{ height: 90, padding: 12 }} maxLength={200} placeholder={ask === "cancel" ? "취소 사유 (선택)" : "원하는 날짜 · 시간을 적어주세요"} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="crow">
                <button type="button" className="cbtn sm" onClick={() => setAsk(null)}>닫기</button>
                {ask === "cancel"
                  ? <button type="button" className="cbtn sm pri" disabled={busy} onClick={cancel}>{b.status === "requested" ? "예약 취소" : "취소 요청 보내기"}</button>
                  : <button type="button" className="cbtn sm pri" disabled={busy || !text.trim()} onClick={() => act(() => rpc("c_request_change", { p_id: id, p_message: text }), "변경 요청을 보냈어요")}>요청 보내기</button>}
              </div>
            </>
          ) : (
            <div className="crow" style={{ flexWrap: "wrap" }}>
              <Link className="cbtn sm" href={`/c/book?reschedule=${id}`}>시간 변경</Link>
              <button type="button" className="cbtn sm" onClick={() => setAsk("change")}>변경 요청</button>
              {!openCancel && <button type="button" className="cbtn sm" onClick={() => setAsk("cancel")}>{b.status === "requested" ? "예약 취소" : "취소 요청"}</button>}
            </div>
          )}
        </div>
      )}

      {b.record_deleted ? <p className="cmsg">삭제한 시술 기록이에요. 예약 · 결제 내역은 그대로 남아 있어요.</p> : rec ? (
        <section className="clist">
          <div className="csec"><h2>시술 기록</h2><span className="csp" /><span className="cmt">{rec.sent_at && whenLong(rec.sent_at)}</span></div>
          {photos.length > 0 && (
            <div className="cgrid2">
              {[["비포", before], ["애프터", after]].map(([label, arr]: any) => (
                <div key={label} className="cstack">
                  <span className="ck">{label}</span>
                  {arr.length === 0 ? <div className="cphoto" style={{ display: "grid", placeItems: "center", color: "#8A93A3", fontSize: 13 }}>사진 없음</div> : arr.map((p: any) => urls.get(p.path) ? <img key={p.id} src={urls.get(p.path)} alt={`${label} 사진`} className="cphoto" onClick={() => setView(urls.get(p.path)!)} /> : <div key={p.id} className="cphoto" />)}
                </div>
              ))}
            </div>
          )}
          {rec.summary && <div className="ccard soft"><b>시술 요약</b><p className="cmt" style={{ color: "var(--k)" }}>{rec.summary}</p></div>}
          {rec.damage_level != null && (
            <div className="ccard">
              <div className="crow"><b>손상도</b><span className="csp" /><b style={{ color: damageColor(rec.damage_level), fontSize: 20 }}>{rec.damage_level}/10</b></div>
              <div className="cbar"><i style={{ width: `${rec.damage_level * 10}%`, background: damageColor(rec.damage_level) }} /></div>
              <span className="cmt">{damageAdvice(rec.damage_level)}</span>
            </div>
          )}
          {rec.diagnosis && <div className="ccard"><b>디자이너 진단</b><p className="cmt" style={{ color: "var(--k)" }}>{rec.diagnosis}</p></div>}
          {rec.products?.length > 0 && <div className="ccard"><b>사용 제품</b><div className="cchips">{rec.products.map((p: string) => <span key={p} className="cpill gray">{p}</span>)}</div></div>}
          {(rec.home_care || guide.length > 0) && (
            <div className="ccard warm"><b>홈케어 가이드</b>{rec.home_care && <p className="cmt" style={{ color: "var(--k)" }}>{rec.home_care}</p>}{guide.map((t) => <p key={t} className="cmt" style={{ color: "var(--k)" }}>• {t}</p>)}</div>
          )}
        </section>
      ) : b.status === "completed" && <p className="cmsg">매장에서 시술 기록을 보내면 여기에 사진과 홈케어가 나타나요.</p>}

      {(b.payments?.length > 0) && (
        <section className="clist">
          <div className="csec"><h2>결제 내역</h2><span className="csp" /><Link href={`/c/receipt/${id}`} className="clink">영수증</Link></div>
          {b.payments.map((p: any) => (
            <div key={p.id} className="ccard"><div className="crow"><b>{p.type === "paid" ? "결제" : "환불"}</b><span className="csp" /><b>{p.type === "paid" ? "" : "-"}{won(p.amount)}</b></div><span className="cmt">{METHOD[p.method] ?? p.method} · {whenLong(p.paid_at)}</span></div>
          ))}
        </section>
      )}

      {b.status === "completed" && (
        <>
          <section className="ccard">
            <b>나의 기록</b>
            <textarea className="cin" style={{ height: 96, padding: 12 }} maxLength={500} placeholder="시술 후 느낀 점 · 다음에 참고할 내용을 적어두세요 (매장에는 보이지 않아요)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="나의 기록" />
            <button type="button" className="cbtn sm" disabled={busy} onClick={() => act(() => rpc("c_save_note", { p_booking: id, p_note: note }), "저장했어요")}>저장</button>
          </section>
          <section className="ccard">
            <b>이번 시술은 어땠나요?</b>
            <div className="cstars" role="radiogroup" aria-label="만족도">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={score === n} aria-label={`${n}점`} className={n <= score ? "on" : ""} onClick={() => setScore(n)}>★</button>)}</div>
            <input className="cin" style={{ height: 48 }} maxLength={100} placeholder="한 줄 후기 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button type="button" className="cbtn sm pri" disabled={busy || !score} onClick={() => act(() => rpc("c_rate_treatment", { p_booking: id, p_score: score, p_comment: comment }), "평가를 남겼어요")}>{b.rating ? "평가 수정" : "평가 남기기"}</button>
          </section>
          {rec && !b.record_deleted && <button type="button" className="clink" style={{ alignSelf: "center", padding: 10 }} onClick={() => { if (window.confirm("이 시술 기록과 사진을 내 앱에서 삭제할까요? 예약 · 결제 내역은 남아요.")) act(() => rpc("c_delete_record", { p_booking: id }), "삭제했어요"); }}>시술 기록 삭제</button>}
        </>
      )}

      {view && <div className="cviewer" role="dialog" aria-modal="true" onClick={() => setView(null)}><img src={view} alt="시술 사진 크게 보기" /></div>}
    </Page>
  );
}
