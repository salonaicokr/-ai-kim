"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/browser";
import { dbErrorMessage } from "@/src/lib/format";
import { clearSignupDraft, createOwnerStore, readSignupDraft } from "@/src/lib/owner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: signError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signError) {
      setError(dbErrorMessage(signError));
      setBusy(false);
      return;
    }
    const draft = readSignupDraft();
    if (draft) {
      try {
        await createOwnerStore(supabase, data.user, draft, {});
      } catch (caught) {
        clearSignupDraft();
        setError(`${caught.message} 매장 정보는 가입 화면에서 다시 입력해 주세요.`);
        setBusy(false);
        router.replace("/signup");
        return;
      }
    }
    router.replace("/desk");
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <div className="brand">SALONAI<span>매장 · 디자이너</span></div>
        <div className="aside-copy">
          <h1>원장님 로그인</h1>
          <p>가입할 때 만든 이메일 계정으로 들어옵니다.</p>
        </div>
        <div className="aside-foot">디자이너 초대는 코드로 따로 받습니다.</div>
      </aside>
      <main className="auth-main">
        <form className="card" style={{ maxWidth: 460 }} onSubmit={submit}>
          <h2>로그인</h2>
          {error ? <p className="error">{error}</p> : null}
          <label className="field">이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label className="field">비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "확인 중" : "들어가기"}</button>
          <p className="lede" style={{ marginTop: 16 }}>계정이 없으면 <Link href="/signup">가입</Link>하고, 초대 코드가 있으면 <Link href="/join">디자이너로 들어가기</Link>.</p>
        </form>
      </main>
    </div>
  );
}
