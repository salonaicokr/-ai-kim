"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import { toLoginEmail } from "@/src/lib/login-id";

// 권한 없는 계정도 일반 실패와 같은 문구 (존재를 알리지 않음)
const FAIL = "이메일 또는 비밀번호가 맞지 않아요.";

export default function OpsLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const supabase = createOpsBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(email), password: pw });
    const { data: ok } = error ? { data: false } : await supabase.rpc("hq_me");
    if (error || ok !== true) {
      if (!error) await supabase.auth.signOut();
      setBusy(false); setErr(FAIL); return;
    }
    router.replace("/hq/dashboard");
    window.dispatchEvent(new Event("salonai:refresh"));
  }

  return (
    <form className="ops-login" onSubmit={submit}>
      <label className="field"><span className="lbl">아이디 또는 이메일</span>
        <input className="input" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field"><span className="lbl">비밀번호</span>
        <input className="input" type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      {err && <p className="msg err" role="alert">{err}</p>}
      <button className="btn pri wide" type="submit" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
    </form>
  );
}
