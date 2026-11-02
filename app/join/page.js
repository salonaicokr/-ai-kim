"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/src/lib/browser";
import { categoryLabel, dbErrorMessage } from "@/src/lib/format";

function JoinForm() {
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const next = params.get("code");
    if (next) setCode(next);
  }, [params]);

  async function lookup(event) {
    event?.preventDefault();
    setError("");
    const { data, error: lookupError } = await supabase.rpc("peek_invite", { code: code.trim().toUpperCase() });
    if (lookupError || !data?.length) {
      setStoreName("");
      setError(lookupError ? dbErrorMessage(lookupError) : "초대 코드를 찾지 못했습니다.");
      return;
    }
    setStoreName(data[0].store_name);
    setCategory(data[0].category);
  }

  async function join(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { data, error: signError } = await supabase.auth.signUp({ email: email.trim(), password });
      if (signError) {
        const signed = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signed.error) {
          setError(dbErrorMessage(signError));
          setBusy(false);
          return;
        }
        sessionData = signed.data;
      } else if (!data.session) {
        setError("확인 메일을 누른 뒤, 같은 초대 코드로 다시 들어와 주세요.");
        setBusy(false);
        return;
      }
    }
    const { error: joinError } = await supabase.rpc("join_with_invite", {
      code: code.trim().toUpperCase(),
      member_name: name.trim() || "디자이너",
    });
    if (joinError) {
      setError(dbErrorMessage(joinError));
      setBusy(false);
      return;
    }
    setDone(true);
    setBusy(false);
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <div className="brand">SALONAI<span>디자이너 초대</span></div>
        <div className="aside-copy">
          <h1>원장님이 보낸 코드로 들어옵니다.</h1>
          <p>매장 가입 화면이 아닙니다. 시술 기록은 디자이너 앱에서 남깁니다.</p>
        </div>
        <div className="aside-foot"><Link href="/signup">원장님 가입으로</Link></div>
      </aside>
      <main className="auth-main">
        <form className="card" style={{ maxWidth: 460 }} onSubmit={join}>
          <h2>초대 코드</h2>
          {error ? <p className="error">{error}</p> : null}
          {done ? <p className="note">이 매장 디자이너로 연결됐습니다. 시술 화면은 전용 앱에서 열립니다.</p> : null}
          {storeName ? <p className="note">{storeName} · {categoryLabel[category] ?? category}</p> : null}
          <label className="field">코드<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /></label>
          <button className="btn" type="button" onClick={lookup}>매장 확인</button>
          <label className="field" style={{ marginTop: 12 }}>이름<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field">이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="field">비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "연결 중" : "이 매장에 들어가기"}</button>
        </form>
      </main>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<main className="desk-main">초대 화면을 여는 중입니다.</main>}>
      <JoinForm />
    </Suspense>
  );
}
