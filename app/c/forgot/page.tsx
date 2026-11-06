"use client";
// @ts-nocheck

import { useState } from "react";
import { msgOf, rpc, sb } from "@/src/lib/customer/api";
import { Top } from "../ui";

export default function Forgot() {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const who = v.trim();
    if (!who) return;
    setBusy(true);
    try {
      let email = who;
      if (!who.includes("@")) {
        const found = await rpc<string | null>("lookup_login_email", { p_login_id: who });
        if (!found) throw new Error("가입된 아이디를 찾지 못했어요");
        email = found;
      }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/c/reset` });
      if (error) throw error;
      setMsg({ ok: true, t: "비밀번호 재설정 메일을 보냈어요. 메일의 링크를 눌러 새 비밀번호를 정해 주세요." });
    } catch (x) { setMsg({ ok: false, t: msgOf(x) }); }
    setBusy(false);
  }
  return (
    <main className="cpage">
      <Top back="/c/login" title="비밀번호 찾기" />
      <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 className="ch1">가입한 아이디 또는<br />이메일을 알려주세요</h1>
        <input className="cin" placeholder="아이디 또는 이메일" value={v} onChange={(e) => setV(e.target.value)} aria-label="아이디 또는 이메일" />
        {msg && <p className={`cmsg${msg.ok ? "" : " err"}`} role="status">{msg.t}</p>}
        <button className="cbtn pri" type="submit" disabled={busy || !v.trim()}>{busy ? "보내는 중…" : "재설정 메일 보내기"}</button>
      </form>
    </main>
  );
}
