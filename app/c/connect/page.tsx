"use client";
// @ts-nocheck

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { msgOf, rpc } from "@/src/lib/customer/api";
import { Loading, Top, useGuard } from "../ui";

function Connect() {
  const g = useGuard();
  const q = useSearchParams();
  const [code, setCode] = useState((q.get("code") ?? "").toUpperCase().slice(0, 6));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ store_id: string; store: string; designer_id: string | null; designer: string | null } | null>(null);
  const [pend, setPend] = useState<any[] | null>(null);
  const auto = useRef(false);

  const loadPend = useCallback(() => { rpc<any[]>("c_pending_links").then(setPend).catch(() => setPend([])); }, []);
  const link = useCallback(async (c: string) => {
    setBusy(true); setErr(null);
    try { setDone(await rpc("c_link_with_code", { p_code: c })); loadPend(); } catch (e) { setErr(msgOf(e)); }
    setBusy(false);
  }, [loadPend]);
  useEffect(() => {
    if (!g.ready) return;
    loadPend();
    if (code.length === 6 && !auto.current) { auto.current = true; link(code); }
  }, [g.ready, loadPend, link, code]);

  async function claim(id: string) {
    setBusy(true); setErr(null);
    try { await rpc("c_link_customer", { p_customer: id }); loadPend(); } catch (e) { setErr(msgOf(e)); }
    setBusy(false);
  }
  if (!g.ready) return <main className="cpage"><Loading /></main>;

  return (
    <main className="cpage">
      <Top back={q.get("from") === "signup" ? "/c/home" : "/c/shops"} title="매장 연결" />
      {done ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: "var(--a)", color: "#fff", display: "grid", placeItems: "center", fontSize: 34, fontWeight: 900 }} aria-hidden>✓</div>
          <h1 className="ch1">{done.store}와 연결됐어요</h1>
          <p className="cmt" style={{ fontSize: 16 }}>{done.designer ? `${done.designer} 디자이너가 담당으로 지정됐어요. ` : ""}이제 예약하면 시술 기록 · 결제 · 케어 알림이 앱으로 와요.</p>
          <Link className="cbtn pri" href={`/c/book?store=${done.store_id}${done.designer_id ? `&designer=${done.designer_id}` : ""}`}>예약하러 가기</Link>
          <Link className="cbtn" href="/c/home">홈으로</Link>
        </div>
      ) : (
        <>
          <h1 className="ch1">매장 코드를 입력해 주세요</h1>
          <p className="cmt">매장에서 받은 6자리 코드나 QR로 연결할 수 있어요. 디자이너 코드로 연결하면 그 디자이너가 담당이 돼요.</p>
          <input className="cin" style={{ textAlign: "center", fontSize: 28, letterSpacing: 8, fontWeight: 900 }} maxLength={6} autoCapitalize="characters" aria-label="매장 코드 6자리" placeholder="ABC123"
            value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          {err && <p className="cmsg err" role="alert">{err}</p>}
          <button type="button" className="cbtn pri" disabled={busy || code.length !== 6} onClick={() => link(code)}>{busy ? "연결 중…" : "연결하기"}</button>
        </>
      )}
      {pend && pend.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <h2 className="ch2">이전 시술 기록을 찾았어요</h2>
          <p className="cmt">가입한 이름 · 휴대폰 번호와 같은 기록이 있는 매장이에요. 본인 기록이 맞으면 연결해 주세요.</p>
          {pend.map((p) => (
            <div key={p.customer_id} className="ccard">
              <b>{p.store}</b>
              <span className="cmt">방문 {p.visits}회{p.designer ? ` · 담당 ${p.designer}` : ""}</span>
              <button type="button" className="cbtn sm pri" disabled={busy} onClick={() => claim(p.customer_id)}>내 기록이 맞아요</button>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

export default function Page() { return <Suspense fallback={null}><Connect /></Suspense>; }
