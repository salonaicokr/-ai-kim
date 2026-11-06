"use client";
// @ts-nocheck

import { useEffect, useRef, useState } from "react";
import { msgOf, sb } from "@/src/lib/customer/api";
import { Loading, Page, useGuard } from "../ui";

const SUGGEST = ["염색 후 샴푸는 언제부터 해도 돼요?", "머리끝이 푸석해요. 어떻게 관리하죠?", "펌 유지하는 방법 알려주세요", "다음 커트는 언제가 좋아요?"];

async function call(body: any) {
  const { data } = await sb.auth.getSession();
  const r = await fetch("/api/ai-chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(j.error ?? "잠시 후 다시 시도해주세요"); e.usage = j.usage; throw e; }
  return j;
}

export default function Ai() {
  const g = useGuard();
  const [msgs, setMsgs] = useState<{ role: "me" | "ai"; text: string }[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!g.ready) return;
    sb.from("customer_ai_messages").select("user_message, ai_response, created_at").order("created_at", { ascending: false }).limit(20).then(({ data }) => {
      setMsgs((data ?? []).reverse().flatMap((m) => [{ role: "me", text: m.user_message }, { role: "ai", text: m.ai_response }]));
    });
    call({ usage: true }).then((j) => setUsage(j.usage)).catch(() => {});
  }, [g.ready]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(q: string) {
    q = q.trim();
    if (!q || busy) return;
    setBusy(true); setErr(null); setText("");
    setMsgs((m) => [...(m ?? []), { role: "me", text: q }]);
    try {
      const j = await call({ message: q });
      setMsgs((m) => [...(m ?? []), { role: "ai", text: j.answer }]);
      setUsage(j.usage);
    } catch (e) {
      setErr(msgOf(e)); if (e.usage) setUsage(e.usage);
      setMsgs((m) => (m ?? []).slice(0, -1)); setText(q);
    }
    setBusy(false);
  }

  if (!g.ready || !msgs) return <main className="cpage"><Loading /></main>;
  const left = usage ? Math.max(0, Math.min(usage.dayLimit - usage.day, usage.monthLimit - usage.month)) : null;
  return (
    <Page>
      <div className="crow"><h1 className="ch1">AI 상담</h1><span className="csp" />{left != null && <span className="cpill">오늘 {left}회 남음</span>}</div>
      <p className="cmt">내 시술 기록을 바탕으로 홈케어를 알려드려요. 정확한 진단은 디자이너와 상담해 주세요.</p>
      <div className="cchat" role="log" aria-live="polite">
        {msgs.length === 0 && (
          <div className="cstack" style={{ gap: 8 }}>
            {SUGGEST.map((s) => <button key={s} type="button" className="cchip" onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => <div key={i} className={`cbubble ${m.role}`}>{m.text}</div>)}
        {busy && <div className="cbubble ai">답변을 만들고 있어요…</div>}
        <div ref={end} />
      </div>
      {err && <p className="cmsg err" role="alert">{err}</p>}
      <form className="cinput" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input className="cin" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="머릿결 고민을 물어보세요" aria-label="질문 입력" />
        <button type="submit" className="cbtn pri" disabled={busy || !text.trim()} style={{ width: 72 }}>전송</button>
      </form>
    </Page>
  );
}
