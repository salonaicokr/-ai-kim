"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/browser";
import { dbErrorMessage } from "@/src/lib/format";
import { toLoginEmail } from "@/src/lib/login-id";
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

/** 로그인 방법별 로고 (카카오 · 네이버 · 구글은 각 브랜드 색) */
function MethodLogo({ id }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", "aria-hidden": true, className: "method-logo" };
  if (id === "kakao") {
    return (
      <svg {...common}>
        <rect width="24" height="24" rx="7" fill="#FEE500" />
        <path d="M12 5.2c-3.9 0-7 2.4-7 5.4 0 1.9 1.3 3.6 3.2 4.6l-.8 2.9c-.1.3.2.5.5.3l3.4-2.2c.2 0 .5.1.7.1 3.9 0 7-2.4 7-5.4s-3.1-5.7-7-5.7z" fill="#191919" />
      </svg>
    );
  }
  if (id === "naver") {
    return (
      <svg {...common}>
        <rect width="24" height="24" rx="7" fill="#03C75A" />
        <path d="M13.2 12.5 10.6 8.6H8.2v6.8h2.6v-3.9l2.6 3.9h2.4V8.6h-2.6z" fill="#fff" />
      </svg>
    );
  }
  if (id === "google") {
    return (
      <svg {...common}>
        <rect width="24" height="24" rx="7" fill="#fff" stroke="#E3E3E8" />
        <path d="M18.6 12.2c0-.4 0-.8-.1-1.2H12v2.3h3.7a3.2 3.2 0 0 1-1.4 2.1v1.8h2.3c1.3-1.2 2-3 2-5z" fill="#4285F4" />
        <path d="M12 19c1.9 0 3.5-.6 4.6-1.7l-2.3-1.8c-.6.4-1.4.7-2.3.7-1.8 0-3.3-1.2-3.9-2.9H5.7v1.8A7 7 0 0 0 12 19z" fill="#34A853" />
        <path d="M8.1 13.3a4.2 4.2 0 0 1 0-2.7V8.8H5.7a7 7 0 0 0 0 6.3z" fill="#FBBC05" />
        <path d="M12 7.8c1 0 1.9.4 2.6 1l2-2A7 7 0 0 0 5.7 8.8l2.4 1.8C8.7 9 10.2 7.8 12 7.8z" fill="#EA4335" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect width="24" height="24" rx="7" fill="#7867DB" />
      <path d="M9.1 6.5h1.3c.3 0 .5.2.6.4l.7 2.2c.1.2 0 .5-.2.7l-.9.9a8 8 0 0 0 3.2 3.2l.9-.9c.2-.2.5-.3.7-.2l2.2.7c.2.1.4.3.4.6v1.3c0 .6-.5 1-1 1A10.5 10.5 0 0 1 8.1 7.5c0-.6.4-1 1-1z" fill="#fff" />
    </svg>
  );
}

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
    const { data, error: signError } = await supabase.auth.signInWithPassword({ email: toLoginEmail(email), password });
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
                  <button key={id} className="btn method-btn" type="button" onClick={() => setMethod(id)}><MethodLogo id={id} /><span>{label}</span></button>
                ))}
              </div>
              <p className="lede">처음이면 자동으로 가입됩니다. 원장님과 디자이너 모두 같은 방법으로 시작합니다.</p>
              <form onSubmit={submit}>
                <h2>아이디로 로그인</h2>
                {error ? <p className="error">{error}</p> : null}
                <label className="field">아이디 또는 이메일<input type="text" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
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
