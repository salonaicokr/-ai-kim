"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { dbErrorMessage, weekdayRows } from "@/src/lib/format";

export default function SettingsPage() {
  const desk = useDesk();
  const [hours, setHours] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!desk?.store) return;
    supabase.from("store_hours").select("*").eq("store_id", desk.store.id).then(({ data }) => {
      const order = weekdayRows.map(([id]) => id);
      setHours((data ?? []).slice().sort((a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday)));
    });
    supabase.from("message_templates").select("code, name, body, audience").eq("audience", "customer").then(({ data }) => {
      setMessages(data ?? []);
    });
  }, [desk?.store]);

  async function saveHours(event) {
    event.preventDefault();
    setError("");
    for (const row of hours) {
      const { error: updateError } = await supabase
        .from("store_hours")
        .update({ opens: row.opens.slice(0, 5), closes: row.closes.slice(0, 5), closed: row.closed })
        .eq("store_id", desk.store.id)
        .eq("weekday", row.weekday);
      if (updateError) {
        setError(dbErrorMessage(updateError));
        return;
      }
    }
    await supabase.from("store_setup").update({ hours: true }).eq("store_id", desk.store.id);
    desk.refresh();
  }

  async function copyInvite() {
    const link = `${window.location.origin}/join?code=${desk.store.invite_code}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    await supabase.from("store_setup").update({ staff: true }).eq("store_id", desk.store.id);
    desk.refresh();
  }

  async function confirmNotices() {
    await supabase.from("store_setup").update({ notices: true }).eq("store_id", desk.store.id);
    desk.refresh();
  }

  if (!desk?.store) return null;
  const labels = Object.fromEntries(weekdayRows);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>설정</h1>
          <p>{desk.store.address}</p>
        </div>
        <Link className="btn" href="/desk/settings/menus">메뉴·가격</Link>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div className="stack">
        <form id="hours" className="card" onSubmit={saveHours}>
          <h3>영업시간</h3>
          {hours.map((row, index) => (
            <div className="split" key={row.weekday} style={{ alignItems: "end" }}>
              <label className="field">{labels[row.weekday]}
                <input type="time" value={row.opens.slice(0, 5)} disabled={row.closed} onChange={(event) => {
                  const next = hours.slice();
                  next[index] = { ...row, opens: event.target.value };
                  setHours(next);
                }} />
              </label>
              <label className="field">종료
                <input type="time" value={row.closes.slice(0, 5)} disabled={row.closed} onChange={(event) => {
                  const next = hours.slice();
                  next[index] = { ...row, closes: event.target.value };
                  setHours(next);
                }} />
              </label>
              <label className="field">휴무
                <input type="checkbox" checked={row.closed} onChange={(event) => {
                  const next = hours.slice();
                  next[index] = { ...row, closed: event.target.checked };
                  setHours(next);
                }} />
              </label>
            </div>
          ))}
          <button className="btn primary" type="submit">영업시간 저장</button>
        </form>
        <section id="invite" className="card">
          <h3>디자이너 초대</h3>
          <p>코드 <b>{desk.store.invite_code}</b></p>
          <button className="btn" type="button" onClick={copyInvite}>{copied ? "링크를 복사했습니다" : "초대 링크 복사"}</button>
        </section>
        <section id="notices" className="card">
          <h3>알림 문구</h3>
          <p className="lede">발송은 카카오 계약 뒤에 시작됩니다. 지금은 문구만 확인합니다.</p>
          {messages.map((item) => (
            <article key={item.code} style={{ marginBottom: 12 }}>
              <b>{item.name}</b>
              <p style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{item.body}</p>
            </article>
          ))}
          <button className="btn" type="button" onClick={confirmNotices}>{desk.setup?.notices ? "확인함" : "문구를 확인했어요"}</button>
        </section>
      </div>
    </>
  );
}
