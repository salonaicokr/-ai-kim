"use client";

import { useState } from "react";
import type { createClient } from "@/src/lib/supabase/client";

type SB = ReturnType<typeof createClient>;
export type ShopEvent = { id: string; event_date: string; title: string };
export type MemberOff = { id: string; member_id: string; off_date: string; kind: "off" | "duty"; memo: string | null };
type Member = { id: string; name: string };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const KIND = { off: "휴무", duty: "당직" } as const;

/** 설정 › 매장 일정 (11/6 홈 시안 ⑤): 교육 · 방역 같은 매장 일정 + 디자이너 개인 휴무 · 당직. 홈 ‘오늘 운영’에 나와요 */
export default function ScheduleEditor({ supabase, shopId, members, events: initE, offs: initO }: { supabase: SB; shopId: string; members: Member[]; events: ShopEvent[]; offs: MemberOff[] }) {
  const [events, setEvents] = useState(initE);
  const [offs, setOffs] = useState(initO);
  const [ne, setNe] = useState({ date: "", title: "" });
  const [no, setNo] = useState({ member: members[0]?.id ?? "", date: "", kind: "off" as "off" | "duty", memo: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "구성원";

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!ne.date || !ne.title.trim()) return;
    const { data, error } = await supabase.from("shop_events").insert({ shop_id: shopId, event_date: ne.date, title: ne.title.trim() }).select("id, event_date, title").single();
    if (error) return setMsg({ ok: false, t: `일정을 저장하지 못했어요: ${error.message}` });
    setEvents((x) => [...x, data as ShopEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)));
    setNe({ date: "", title: "" }); setMsg({ ok: true, t: "매장 일정을 등록했어요. 홈 ‘오늘 운영’에 보여요." });
  }
  async function addOff(e: React.FormEvent) {
    e.preventDefault();
    if (!no.member || !no.date) return;
    const { data, error } = await supabase.from("member_offs").insert({ shop_id: shopId, member_id: no.member, off_date: no.date, kind: no.kind, memo: no.memo.trim() || null })
      .select("id, member_id, off_date, kind, memo").single();
    if (error) return setMsg({ ok: false, t: error.code === "23505" ? "그날 같은 항목이 이미 있어요." : `저장하지 못했어요: ${error.message}` });
    setOffs((x) => [...x, data as MemberOff].sort((a, b) => a.off_date.localeCompare(b.off_date)));
    setNo({ ...no, date: "", memo: "" }); setMsg({ ok: true, t: `${name(no.member)} ${KIND[no.kind]}를 등록했어요.` });
  }
  async function del(table: "shop_events" | "member_offs", id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return setMsg({ ok: false, t: error.message });
    if (table === "shop_events") setEvents((x) => x.filter((y) => y.id !== id)); else setOffs((x) => x.filter((y) => y.id !== id));
  }

  return (
    <section className="card st-card" id="schedule">
      <h2 className="st-h">매장 일정 · 휴무 · 당직</h2>
      <p className="sm">교육 · 방역 같은 매장 일정과 디자이너 개인 휴무 · 당직을 적어두면 홈 <b>오늘 운영</b>에서 모두가 봐요. 매장 전체 휴무는 위 영업시간 › 임시휴무에서 정해요.</p>

      <h3 className="st-sub">매장 일정</h3>
      <form className="hr-hol" onSubmit={addEvent}>
        <label className="field"><span className="lbl">날짜</span><input className="input" type="date" required value={ne.date} onChange={(e) => setNe({ ...ne, date: e.target.value })} /></label>
        <label className="field grow"><span className="lbl">내용</span><input className="input" required maxLength={60} placeholder="예: 교육 참석 (전 직원)" value={ne.title} onChange={(e) => setNe({ ...ne, title: e.target.value })} /></label>
        <button className="btn" type="submit">일정 추가</button>
      </form>
      {events.length > 0 && (
        <ul className="list hr-hlist">{events.map((x) => (
          <li key={x.id}><b>{md(x.event_date)}</b><span className="sm">{x.title}</span><span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={() => del("shop_events", x.id)}>삭제</button></li>
        ))}</ul>
      )}

      <h3 className="st-sub">디자이너 휴무 · 당직</h3>
      <form className="hr-hol" onSubmit={addOff}>
        <label className="field"><span className="lbl">구성원</span>
          <select className="input" value={no.member} onChange={(e) => setNo({ ...no, member: e.target.value })}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="field"><span className="lbl">날짜</span><input className="input" type="date" required value={no.date} onChange={(e) => setNo({ ...no, date: e.target.value })} /></label>
        <label className="field"><span className="lbl">구분</span>
          <select className="input" value={no.kind} onChange={(e) => setNo({ ...no, kind: e.target.value as "off" | "duty" })}><option value="off">휴무</option><option value="duty">당직</option></select></label>
        <label className="field grow"><span className="lbl">메모 (선택)</span><input className="input" maxLength={60} value={no.memo} onChange={(e) => setNo({ ...no, memo: e.target.value })} /></label>
        <button className="btn" type="submit">추가</button>
      </form>
      {offs.length > 0 && (
        <ul className="list hr-hlist">{offs.map((x) => (
          <li key={x.id}><b>{md(x.off_date)}</b><span className="sm">{name(x.member_id)} · {KIND[x.kind]}{x.memo ? ` · ${x.memo}` : ""}</span><span className="sp" /><button type="button" className="btn ghost sm-btn" onClick={() => del("member_offs", x.id)}>삭제</button></li>
        ))}</ul>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
    </section>
  );
}
