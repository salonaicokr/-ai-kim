"use client";
// @ts-nocheck

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KO_DOW, msgOf, rpc, sb, shrinkImage, when, won, ymd } from "@/src/lib/customer/api";
import { Loading, Page, Top, useGuard } from "../ui";

type Step = "store" | "designer" | "menu" | "time" | "request" | "confirm" | "done";
const ORDER: Step[] = ["store", "designer", "menu", "time", "request", "confirm"];
const STYLE_SAMPLES = [
  { id: "s1", img: "/samples/s1-after-ai.jpg", t: "볼륨 웨이브" },
  { id: "s2", img: "/samples/s2-after-ai.jpg", t: "애쉬 단발 레이어드" },
  { id: "s3", img: "/samples/s1-before-ai.jpg", t: "내추럴 롱 스트레이트" },
  { id: "s4", img: "/samples/s2-before-ai.jpg", t: "내추럴 컬러 미디엄" },
];

function Calendar({ value, onPick, closedDow, holidays }: { value: string | null; onPick: (d: string) => void; closedDow: Set<number>; holidays: { start: string; end: string }[] }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [m, setM] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const first = m.getDay();
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const limit = new Date(today); limit.setDate(limit.getDate() + 90);
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1))];
  const off = (d: Date) => d < today || d > limit || closedDow.has(d.getDay()) || holidays.some((h) => ymd(d) >= h.start && ymd(d) <= h.end);
  return (
    <div className="ccal">
      <div className="ctop">
        <button type="button" className="cback" aria-label="이전 달" disabled={m <= new Date(today.getFullYear(), today.getMonth(), 1)} onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>
        <b>{m.getFullYear()}년 {m.getMonth() + 1}월</b>
        <button type="button" className="cback" aria-label="다음 달" disabled={new Date(m.getFullYear(), m.getMonth() + 1, 1) > limit} onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="ccal-grid">
        {KO_DOW.map((d) => <span key={d} className="ccal-dow">{d}</span>)}
        {cells.map((d, i) => d ? (
          <button key={i} type="button" className={`ccal-day${value === ymd(d) ? " on" : ""}${ymd(d) === ymd(today) ? " today" : ""}`} disabled={off(d)} aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일`} onClick={() => onPick(ymd(d))}>{d.getDate()}</button>
        ) : <span key={i} />)}
      </div>
    </div>
  );
}

function Book() {
  const g = useGuard();
  const router = useRouter();
  const q = useSearchParams();
  const resched = q.get("reschedule");
  const [step, setStep] = useState<Step>("store");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stores, setStores] = useState<{ mine: any[]; all: any[] } | null>(null);
  const [sq, setSq] = useState("");
  const [cat, setCat] = useState<any>(null);
  const [storeId, setStoreId] = useState<string | null>(q.get("store"));
  const [designer, setDesigner] = useState<string | null>(q.get("designer"));
  const [menus, setMenus] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [cur, setCur] = useState<File[]>([]);
  const [wish, setWish] = useState<File[]>([]);
  const [samples, setSamples] = useState<string[]>([]);
  const [done, setDone] = useState<any>(null);
  const [rbk, setRbk] = useState<any>(null);
  const [ask, setAsk] = useState("");

  // 예약 변경 모드: 기존 예약을 불러와 시간만 고르게 해요
  useEffect(() => {
    if (!g.ready || !resched) return;
    rpc("c_booking_detail", { p_id: resched }).then((b) => {
      if (!b) { setErr("예약을 찾지 못했어요"); return; }
      setRbk(b); setStoreId(b.store.id); setDesigner(b.designer?.id ?? null); setStep("time");
    }).catch((e) => setErr(msgOf(e)));
  }, [g.ready, resched]);

  useEffect(() => {
    if (!g.ready || resched) return;
    Promise.all([rpc<any[]>("c_my_stores"), rpc<any[]>("c_list_stores", { p_q: sq })]).then(([mine, all]) => setStores({ mine, all })).catch((e) => setErr(msgOf(e)));
  }, [g.ready, sq, resched]);

  useEffect(() => {
    if (!g.ready || !storeId) { setCat(null); return; }
    rpc("c_store_catalog", { p_store: storeId }).then((c) => {
      setCat(c);
      if (!c) { setErr("예약할 수 없는 매장이에요"); setStoreId(null); }
    }).catch((e) => setErr(msgOf(e)));
  }, [g.ready, storeId]);
  // 매장이 이미 정해져 있으면 건너뛰기
  useEffect(() => { if (cat && step === "store" && storeId && !resched) setStep(designer ? "menu" : "designer"); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = useMemo(() => (cat?.menus ?? []).filter((m: any) => menus.includes(m.id)), [cat, menus]);
  const minutes = resched && rbk ? Math.max(10, Math.round((new Date(rbk.end).getTime() - new Date(rbk.start).getTime()) / 60000)) : Math.max(10, picked.reduce((a: number, m: any) => a + (m.minutes ?? 0), 0));
  const total = picked.reduce((a: number, m: any) => a + (m.price ?? 0), 0);
  const dName = (cat?.designers ?? []).find((d: any) => d.id === designer)?.name ?? "디자이너 지정 안 함";
  const closedDow = useMemo(() => new Set<number>((cat?.hours ?? []).filter((h: any) => h.closed).map((h: any) => h.weekday)), [cat]);

  useEffect(() => {
    if (!date || !storeId || !cat) { setSlots(null); return; }
    let alive = true;
    setSlots(null); setTime(null);
    rpc<string[]>("c_slots", { p_store: storeId, p_member: designer, p_date: date, p_minutes: minutes, p_exclude: resched ?? null })
      .then((s) => { if (alive) setSlots(s); }).catch((e) => { if (alive) { setSlots([]); setErr(msgOf(e)); } });
    return () => { alive = false; };
  }, [date, storeId, designer, minutes, cat, resched]);

  const pick = (id: string, d: string | null) => { setStoreId(id); setDesigner(d); if (cat?.store?.id === id) setStep(d ? "menu" : "designer"); };
  const idx = ORDER.indexOf(step);
  const back = () => { setErr(null); if (resched) router.back(); else if (idx > 0) setStep(ORDER[idx - 1]); else router.back(); };
  const startIso = date && time ? new Date(`${date}T${time}:00+09:00`).toISOString() : null;

  async function submit() {
    if (!startIso || !storeId) return;
    setBusy(true); setErr(null);
    try {
      if (resched) {
        await rpc("c_reschedule_booking", { p_id: resched, p_start: startIso });
        router.replace(`/c/booking/${resched}`);
        return;
      }
      const r = await rpc<any>("c_request_booking", { p_store: storeId, p_member: designer, p_start: startIso, p_menus: menus, p_request: memo || null });
      const items: any[] = [];
      const up = async (file: File, kind: string) => {
        const blob = await shrinkImage(file);
        const path = `${g.uid}/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from("booking-style-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (!error) items.push({ kind, source: "photo", path });
      };
      for (const f of cur.slice(0, 3)) await up(f, "current");
      for (const f of wish.slice(0, 3)) await up(f, "wish");
      samples.forEach((id) => { const s = STYLE_SAMPLES.find((x) => x.id === id); if (s) items.push({ kind: "wish", source: "ai_sample", path: s.img, title: s.t }); });
      if (items.length) await rpc("c_attach_style_photos", { p_booking: r.booking, p_items: items }).catch(() => {});
      setDone(r); setStep("done");
    } catch (e) { setErr(msgOf(e)); }
    setBusy(false);
  }
  async function sendAsk() {
    if (!resched || !ask.trim()) return;
    setBusy(true); setErr(null);
    try { await rpc("c_request_change", { p_id: resched, p_message: ask.trim() }); router.replace(`/c/booking/${resched}`); } catch (e) { setErr(msgOf(e)); setBusy(false); }
  }

  if (!g.ready) return <main className="cpage"><Loading /></main>;
  if (step === "done") return (
    <main className="cpage" style={{ padding: 28 }}>
      <div style={{ height: 30 }} />
      <div style={{ width: 64, height: 64, borderRadius: 32, background: "var(--a)", color: "#fff", display: "grid", placeItems: "center", fontSize: 34, fontWeight: 900 }} aria-hidden>✓</div>
      <h1 className="ch1">예약을 요청했어요</h1>
      <p className="cmt" style={{ fontSize: 16 }}>{cat?.store?.name}에서 확인하면 알림으로 알려드려요.<br />{startIso && when(startIso)} · {dName}</p>
      <div className="cfoot">
        {done?.survey && <Link className="cbtn pri" href={`/c/survey/${done.survey}`}>사전 문진 작성하기</Link>}
        <Link className={`cbtn${done?.survey ? "" : " pri"}`} href={`/c/booking/${done?.booking}`}>예약 내역 보기</Link>
        <Link className="cbtn" href="/c/home">홈으로</Link>
      </div>
    </main>
  );

  return (
    <Page tabbed={false}>
      <Top back={back} title={resched ? "예약 시간 변경" : "예약하기"} />
      {!resched && <div className="cbar" aria-label={`${idx + 1}/${ORDER.length}단계`}><i style={{ width: `${((idx + 1) / ORDER.length) * 100}%` }} /></div>}
      {err && <p className="cmsg err" role="alert">{err}</p>}

      {step === "store" && (
        <>
          <h1 className="ch1">어느 매장에서<br />받을까요?</h1>
          {!stores ? <Loading /> : (
            <>
              {stores.mine.length > 0 && <>
                <h2 className="ch2">내 매장</h2>
                <div className="clist">{stores.mine.map((s) => (
                  <button key={s.store_id} type="button" className="citem" onClick={() => pick(s.store_id, s.designer_id ?? null)}>
                    <div className="cstack"><b>{s.store}</b><span className="cmt">{s.designer ? `담당 ${s.designer}` : "담당 지정 없음"} · 방문 {s.visits}회</span></div>
                  </button>
                ))}</div>
              </>}
              <h2 className="ch2">매장 찾기</h2>
              <input className="cin" placeholder="매장 이름 · 지역" value={sq} onChange={(e) => setSq(e.target.value)} aria-label="매장 검색" />
              <div className="clist">{stores.all.map((s) => (
                <button key={s.id} type="button" className="citem" onClick={() => pick(s.id, null)}>
                  <div className="cstack"><b>{s.name}</b><span className="cmt">{s.address ?? "주소 미등록"}</span></div>
                </button>
              ))}{stores.all.length === 0 && <p className="cmt">검색 결과가 없어요.</p>}</div>
              <Link href="/c/connect" className="clink" style={{ textAlign: "center" }}>매장 코드가 있나요?</Link>
            </>
          )}
        </>
      )}

      {step === "designer" && cat && (
        <>
          <p className="ck">{cat.store.name}</p>
          <h1 className="ch1">디자이너를 골라요</h1>
          <div className="clist">
            <button type="button" className={`citem${designer === null ? " sel" : ""}`} style={designer === null ? { borderColor: "var(--a)", background: "var(--as)" } : undefined} onClick={() => { setDesigner(null); setStep("menu"); }}>
              <div className="cstack"><b>지정 안 함</b><span className="cmt">가능한 디자이너가 배정돼요</span></div>
            </button>
            {cat.designers.map((d: any) => (
              <button key={d.id} type="button" className="citem" style={designer === d.id ? { borderColor: "var(--a)", background: "var(--as)" } : undefined} onClick={() => { setDesigner(d.id); setStep("menu"); }}>
                <div className="cstack"><b>{d.name}</b><span className="cmt">{d.title}</span></div>
              </button>
            ))}
          </div>
          {cat.designers.length === 0 && <p className="cmsg">이 매장은 아직 예약 가능한 디자이너가 없어요.</p>}
        </>
      )}

      {step === "menu" && cat && (
        <>
          <p className="ck">{cat.store.name} · {dName}</p>
          <h1 className="ch1">시술을 골라요</h1>
          <p className="cmt">여러 개 고를 수 있어요</p>
          <div className="clist">{cat.menus.map((m: any) => {
            const on = menus.includes(m.id);
            return (
              <button key={m.id} type="button" role="checkbox" aria-checked={on} className="citem" style={on ? { borderColor: "var(--a)", background: "var(--as)" } : undefined} onClick={() => setMenus((x) => (on ? x.filter((i) => i !== m.id) : [...x, m.id]))}>
                <span className={`cbox${on ? " y" : ""}`} aria-hidden style={{ alignSelf: "center" }}>{on ? "✓" : ""}</span>
                <div className="cstack"><b>{m.name}</b><span className="cmt">{m.minutes}분 · {won(m.price)}</span></div>
              </button>
            );
          })}{cat.menus.length === 0 && <p className="cmsg">이 매장은 아직 메뉴를 등록하지 않았어요.</p>}</div>
          <div className="cfoot">
            {menus.length > 0 && <p className="cmt" style={{ textAlign: "center" }}>{picked.length}개 · 약 {minutes}분 · {won(total)}</p>}
            <button type="button" className="cbtn pri" disabled={menus.length === 0} onClick={() => setStep("time")}>다음</button>
          </div>
        </>
      )}

      {step === "time" && cat && (
        <>
          <p className="ck">{cat.store.name} · {dName}</p>
          <h1 className="ch1">{resched ? "바꿀 날짜와 시간을 골라요" : "날짜와 시간을 골라요"}</h1>
          {resched && rbk && <p className="cmt">지금 예약: {when(rbk.start)}. 시간을 바꾸면 매장이 다시 확인해요.</p>}
          <Calendar value={date} onPick={setDate} closedDow={closedDow} holidays={cat.holidays ?? []} />
          {date && (slots === null ? <Loading text="가능한 시간을 확인하는 중…" /> : slots.length === 0 ? <p className="cmsg">이 날은 가능한 시간이 없어요. 다른 날을 골라주세요.</p> : (
            <div className="cgrid3" role="radiogroup" aria-label="시간">{slots.map((s) => <button key={s} type="button" role="radio" aria-checked={time === s} className={`cslot${time === s ? " on" : ""}`} onClick={() => setTime(s)}>{s}</button>)}</div>
          ))}
          <div className="cfoot">
            {resched ? (
              <>
                <button type="button" className="cbtn pri" disabled={!time || busy} onClick={submit}>{busy ? "변경 중…" : "이 시간으로 변경"}</button>
                <details><summary className="clink" style={{ textAlign: "center", padding: 8 }}>원하는 시간이 없나요? 매장에 요청하기</summary>
                  <textarea className="cin" style={{ height: 90, padding: 12, marginTop: 8 }} placeholder="예: 다음 주 평일 저녁 7시 이후" value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={200} />
                  <button type="button" className="cbtn sm" style={{ marginTop: 8 }} disabled={!ask.trim() || busy} onClick={sendAsk}>요청 보내기</button>
                </details>
              </>
            ) : <button type="button" className="cbtn pri" disabled={!time} onClick={() => setStep("request")}>다음</button>}
          </div>
        </>
      )}

      {step === "request" && (
        <>
          <h1 className="ch1">원하는 스타일을<br />알려주세요</h1>
          <p className="cmt">선택 사항이에요. 담당 디자이너만 볼 수 있어요.</p>
          <textarea className="cin" style={{ height: 110, padding: 14 }} placeholder="예: 손상 없이 컬이 오래 갔으면 좋겠어요" maxLength={300} value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="요청 사항" />
          {[["지금 내 모습", cur, setCur], ["원하는 스타일 사진", wish, setWish]].map(([label, files, setFiles]: any) => (
            <div key={label} className="ccard soft">
              <div className="crow"><b>{label}</b><span className="csp" /><span className="cmt">{files.length}/3</span></div>
              <label className="cbtn sm" style={{ cursor: "pointer" }}>사진 추가
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 3)); e.target.value = ""; }} />
              </label>
              {files.length > 0 && <div className="cgrid3">{files.map((f: File, i: number) => <button key={i} type="button" onClick={() => setFiles(files.filter((_: any, k: number) => k !== i))} aria-label="사진 빼기" style={{ all: "unset", cursor: "pointer" }}><img src={URL.createObjectURL(f)} alt="" className="cphoto" style={{ aspectRatio: "1" }} /></button>)}</div>}
            </div>
          ))}
          <div className="ccard soft">
            <b>스타일 샘플에서 고르기</b>
            <div className="cgrid2">{STYLE_SAMPLES.map((s) => {
              const on = samples.includes(s.id);
              return <button key={s.id} type="button" aria-pressed={on} onClick={() => setSamples((x) => (on ? x.filter((i) => i !== s.id) : [...x, s.id].slice(-2)))} style={{ all: "unset", cursor: "pointer", borderRadius: 12, outline: on ? "3px solid var(--a)" : "none" }}>
                <img src={s.img} alt={s.t} className="cphoto" style={{ aspectRatio: "1" }} /><span className="cmt" style={{ display: "block", textAlign: "center", padding: "4px 0" }}>{s.t}</span></button>;
            })}</div>
          </div>
          <div className="cfoot"><button type="button" className="cbtn pri" onClick={() => setStep("confirm")}>다음</button></div>
        </>
      )}

      {step === "confirm" && cat && (
        <>
          <h1 className="ch1">예약 내용을 확인해요</h1>
          <div className="ccard">
            <dl className="cdl">
              <dt>매장</dt><dd>{cat.store.name}</dd>
              <dt>디자이너</dt><dd>{dName}</dd>
              <dt>일시</dt><dd>{startIso && when(startIso)}</dd>
              <dt>시술</dt><dd>{picked.map((m: any) => m.name).join(" + ")}</dd>
              <dt>예상 금액</dt><dd>{won(total)}</dd>
              {memo && <><dt>요청</dt><dd>{memo}</dd></>}
              {(cur.length + wish.length + samples.length) > 0 && <><dt>사진</dt><dd>{cur.length + wish.length + samples.length}장 첨부</dd></>}
            </dl>
          </div>
          <p className="chint">예약은 매장이 확인하면 확정돼요. 금액은 시술 후 달라질 수 있어요.</p>
          <div className="cfoot"><button type="button" className="cbtn pri" disabled={busy} onClick={submit}>{busy ? "요청 중…" : "예약 요청하기"}</button></div>
        </>
      )}
    </Page>
  );
}

export default function PageWrap() { return <Suspense fallback={null}><Book /></Suspense>; }
