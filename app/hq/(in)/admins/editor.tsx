"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import { ymd } from "../types";
import { ROLE_LABEL } from "../nav";

type Role = keyof typeof ROLE_LABEL;
export type Admin = { email: string; role: Role; created: string; account: boolean; me: boolean };
const ROLE_HELP: Record<Role, string> = {
  hq_master: "모든 일 · 운영 계정 · 인센티브 정책", hq_finance: "과금 상태 · 요금표 · 정산", hq_cs: "매장 승인 · 정지", hq_sales: "영업조직 · 사원 · 매장 배정 · 정산 조회",
};

/** 본사 관리자 이메일 추가 · 빼기 (최소 1명 유지 · 자기 자신은 빼려면 확인) */
export default function AdminsEditor({ initial }: { initial: Admin[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("hq_cs");
  const masters = list.filter((a) => a.role === "hq_master").length;
  const [ask, setAsk] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  async function reload() {
    const { data } = await createOpsBrowserClient().rpc("hq_admins");
    if (data) setList(data as Admin[]);
    window.dispatchEvent(new Event("salonai:refresh"));
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createOpsBrowserClient().rpc("hq_add_admin", { p_email: email, p_role: role });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: `${email.trim().toLowerCase()} 을(를) ${ROLE_LABEL[role]}(으)로 추가했어요. 이 이메일로 계정을 만들고 이메일 인증을 마치면 들어올 수 있어요.` });
    setEmail(""); reload();
  }
  async function changeRole(a: Admin, r: Role) {
    const { error } = await createOpsBrowserClient().rpc("hq_set_admin_role", { p_email: a.email, p_role: r });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: `${a.email} 역할을 ${ROLE_LABEL[r]}(으)로 바꿨어요.` });
    if (a.me && r !== "hq_master") { router.replace("/hq/dashboard"); window.dispatchEvent(new Event("salonai:refresh")); return; }
    reload();
  }
  async function remove(a: Admin) {
    setAsk(null);
    const { error } = await createOpsBrowserClient().rpc("hq_remove_admin", { p_email: a.email });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: `${a.email} 을(를) 관리자에서 뺐어요.` });
    if (a.me) { router.replace("/hq"); window.dispatchEvent(new Event("salonai:refresh")); return; }
    reload();
  }

  return (
    <section className="card">
      <ul className="list ops-admins">
        {list.map((a) => (
          <li key={a.email}>
            <b>{a.email}</b>{a.me && <span className="pill p-teal">나</span>}
            <span className={`pill ${a.account ? "st-active" : "st-pending"}`}>{a.account ? "계정 있음" : "계정 만들기 전"}</span>
            <select className="input sm-sel" value={a.role} aria-label={`${a.email} 역할`} title={ROLE_HELP[a.role]}
              disabled={a.role === "hq_master" && masters <= 1} onChange={(e) => changeRole(a, e.target.value as Role)}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <span className="sm">{ymd(a.created)} 추가</span>
            <span className="sp" />
            {ask === a.email ? (
              <span className="row" style={{ gap: 6 }}>
                <span className="sm">{a.me ? "내 이메일이에요. 빼면 바로 로그아웃돼요." : "관리자에서 뺄까요?"}</span>
                <button type="button" className="btn ghost sm-btn" onClick={() => setAsk(null)}>취소</button>
                <button type="button" className="btn sm-btn del-solid" onClick={() => remove(a)}>빼기</button>
              </span>
            ) : (
              <button type="button" className="btn ghost sm-btn" disabled={a.role === "hq_master" && masters <= 1} title={a.role === "hq_master" && masters <= 1 ? "마스터는 최소 1명이 있어야 해요" : undefined} onClick={() => setAsk(a.email)}>빼기</button>
            )}
          </li>
        ))}
      </ul>
      <form className="ops-add" onSubmit={add}>
        <label className="field"><span className="lbl">관리자 이메일 추가</span>
          <input className="input" type="email" required placeholder="name@salonai.co.kr" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span className="lbl">역할</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]} — {ROLE_HELP[r]}</option>)}
          </select></label>
        <button className="btn pri" type="submit">추가</button>
      </form>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
    </section>
  );
}
