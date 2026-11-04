"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/browser";
import { dbErrorMessage } from "@/src/lib/format";
import { clearSignupDraft, createOwnerStore, readSignupDraft } from "@/src/lib/owner";

const METHODS = [
  ["phone", "휴대폰 번호로 시작하기"],
  ["kakao", "카카오로 시작하기"],
  ["naver", "네이버로 시작하기"],
  ["google", "구글로 시작하기"],
];

const SOCIAL = {
  kakao: { label: "카카오", asks: "카카오계정(이메일) · 이름 · 휴대폰 번호" },
  naver: { label: "네이버", asks: "이름 · 이메일 · 휴대폰 번호" },
  google: { label: "구글", asks: "이름 · 이메일 주소" },
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState("");
  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

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

  function closeSheet() {
    setMethod("");
    setCodeSent(false);
    setCode("");
    setError("");
  }

  function continueStart() {
    sessionStorage.setItem("salonai-login-method", method);
    if (method === "phone") sessionStorage.setItem("salonai-login-phone", phone);
    router.push("/signup");
  }

  const digits = phone.replace(/\D/g, "");

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <div className="brand">SALONAI<span>매장 · 디자이너</span></div>
        <div className="aside-copy">
          <h1>원장님 로그인</h1>
          <p>휴대폰, 카카오, 네이버, 구글로 시작할 수 있습니다. 처음이면 가입으로 이어집니다.</p>
        </div>
        <div className="aside-foot">디자이너 초대는 코드로 따로 받습니다.</div>
      </aside>
      <main className="auth-main">
        <div className="card" style={{ maxWidth: 460 }}>
          {method ? (
            <>
              <p className="note">테스트 버전 · 실제 인증 없이 가입 화면으로 넘어갑니다.</p>
              {method === "phone" ? (
                <>
                  <h2>휴대폰 번호로 시작하기</h2>
                  <label className="field">휴대폰 번호
                    <input inputMode="tel" placeholder="010-0000-0000" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </label>
                  <button className="btn" type="button" disabled={digits.length < 10} onClick={() => { setCodeSent(true); setCode("123456"); }}>{codeSent ? "다시 받기" : "인증번호 받기"}</button>
                  {codeSent ? (
                    <label className="field" style={{ marginTop: 12 }}>인증번호 6자리
                      <input inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />
                    </label>
                  ) : null}
                  <button className="btn primary" type="button" disabled={!codeSent || code.length < 6} onClick={continueStart}>확인하고 계속하기</button>
                </>
              ) : (
                <>
                  <h2>{SOCIAL[method].label}로 시작하기</h2>
                  <p className="lede">SALONAI에서 {SOCIAL[method].label} 계정으로 로그인하려고 합니다.</p>
                  <p>제공 항목<br />{SOCIAL[method].asks}</p>
                  <button className="btn primary" type="button" onClick={continueStart}>동의하고 계속하기</button>
                </>
              )}
              <button className="btn" type="button" onClick={closeSheet}>돌아가기</button>
            </>
          ) : (
            <>
              <h2>시작하기</h2>
              <div className="auth-methods">
                {METHODS.map(([id, label]) => (
                  <button key={id} className="btn" type="button" onClick={() => setMethod(id)}>{label}</button>
                ))}
              </div>
              <p className="lede">처음이면 자동으로 가입됩니다. 원장님과 디자이너 모두 같은 방법으로 시작합니다.</p>
              <form onSubmit={submit}>
                <h2>이메일로 로그인</h2>
                {error ? <p className="error">{error}</p> : null}
                <label className="field">이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
                <label className="field">비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
                <button className="btn primary" type="submit" disabled={busy}>{busy ? "확인 중" : "들어가기"}</button>
              </form>
              <p className="lede" style={{ marginTop: 16 }}>초대 코드가 있으면 <Link href="/join">디자이너로 들어가기</Link>.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
