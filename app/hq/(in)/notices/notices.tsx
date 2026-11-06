"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";

export type Notice = { id: string; no: number; title: string; body: string; important: boolean; published_at: string };
const EMPTY = { id: null as string | null, title: "", body: "", important: false };
const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));

export default function Notices({ initial, canEdit }: { initial: Notice[]; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<typeof EMPTY | null>(null);
  const [del, setDel] = useState<Notice | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!f) return;
    setBusy(true); setMsg(null);
    const { error } = await createOpsBrowserClient().rpc("hq_save_notice", { p_id: f.id, p_title: f.title, p_body: f.body, p_important: f.important });
    setBusy(false);
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: f.id ? "공지를 고쳤어요." : "공지를 올렸어요. 모든 매장 홈에 바로 보여요." }); setF(null); window.dispatchEvent(new Event("salonai:refresh"));
  }
  async function remove(n: Notice) {
    setBusy(true);
    const { error } = await createOpsBrowserClient().rpc("hq_delete_notice", { p_id: n.id });
    setBusy(false); setDel(null);
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: "공지를 지웠어요." }); window.dispatchEvent(new Event("salonai:refresh"));
  }

  return (
    <>
      {canEdit && !f && <div className="row"><span className="sp" /><button className="btn pri" type="button" onClick={() => setF({ ...EMPTY })}>+ 공지 쓰기</button></div>}
      {f && (
        <section className="card ops-ask">
          <label className="field"><span className="lbl">제목</span><input className="input" maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="예: 11/10 02:00 서비스 점검 안내" /></label>
          <label className="field"><span className="lbl">내용</span><textarea className="input" rows={8} maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.important} onChange={(e) => setF({ ...f, important: e.target.checked })} /><span>중요 공지 (맨 위 고정 · [중요] 표시)</span></label>
          <div className="row" style={{ gap: 8 }}><span className="sp" /><button className="btn ghost" type="button" onClick={() => setF(null)}>취소</button>
            <button className="btn pri" type="button" disabled={busy || !f.title.trim()} onClick={save}>{f.id ? "고치기" : "올리기"}</button></div>
        </section>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
      <section className="card">
        <div className="ops-tw"><table className="ops-table ops-sett" style={{ minWidth: 560 }}>
          <thead><tr><th style={{ width: 60 }}>번호</th><th>제목</th><th style={{ width: 110 }}>작성일</th>{canEdit && <th style={{ width: 130 }} />}</tr></thead>
          <tbody>
            {initial.length === 0 && <tr><td colSpan={4} className="sm empty">아직 공지가 없어요.</td></tr>}
            {initial.map((n) => (
              <tr key={n.id}>
                <td>{n.no}</td>
                <td style={{ whiteSpace: "normal" }}>{n.important && <span className="pill bl-grace" style={{ marginRight: 6 }}>중요</span>}<b>{n.title}</b></td>
                <td>{day(n.published_at)}</td>
                {canEdit && <td>{del?.id === n.id
                  ? <span className="ops-acts"><button className="btn ghost sm-btn" type="button" onClick={() => setDel(null)}>취소</button><button className="btn sm-btn del-solid" type="button" disabled={busy} onClick={() => remove(n)}>지우기</button></span>
                  : <span className="ops-acts"><button className="btn ghost sm-btn" type="button" onClick={() => setF({ id: n.id, title: n.title, body: n.body, important: n.important })}>고치기</button><button className="btn ghost sm-btn ops-del" type="button" onClick={() => setDel(n)}>삭제</button></span>}</td>}
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
