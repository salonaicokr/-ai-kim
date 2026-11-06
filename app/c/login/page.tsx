"use client";
// @ts-nocheck

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { msgOf, rpc, sb } from "@/src/lib/customer/api";

function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const who = id.trim();
    if (!who || !pw) { setErr("아이디와 비밀번호를 입력해 주세요"); return; }
    setBusy("login");
    try {
      let email = who;
      if (!who.includes("@")) {
        const found = await rpc<string | null>("lookup_login_email", { p_login_id: who });
        if (!found) throw new Error("아이디 또는 비밀번호가 맞지 않아요");
        email = found;
      }
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error(/Invalid login/i.test(error.message) ? "아이디 또는 비밀번호가 맞지 않아요" : /not confirmed/i.test(error.message) ? "이메일 인증을 먼저 완료해 주세요" : error.message);
      router.replace(next && next.startsWith("/c/") ? next : "/c/home");
    } catch (x) { setErr(msgOf(x)); setBusy(null); }
  }
  async function social(provider: "kakao" | "google") {
    setErr(null); setBusy(provider);
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/c/home` } });
    if (error) { setErr(/not enabled|Unsupported provider/i.test(error.message) ? "이 로그인 방법은 아직 연결되지 않았어요. 아이디로 로그인해 주세요" : error.message); setBusy(null); }
  }

  return (
    <main className="cpage" style={{ padding: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 24 }}>
        <div style={{ width: 84, height: 84, borderRadius: 26, background: "#14161C", color: "#F0A58C", display: "grid", placeItems: "center", fontSize: 16, fontWeight: 900 }}>SALONAI</div>
        <h1 className="ch1" style={{ fontSize: 30 }}>흩어진 뷰티 기록을<br />하나로 이어요</h1>
        <p className="cmt" style={{ fontSize: 16 }}>예약 · 시술 기록 · 결제 · 홈케어를 내 앱에서 한 번에 관리해요</p>
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
        <input className="cin" placeholder="아이디 또는 이메일" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} aria-label="아이디 또는 이메일" />
        <input className="cin" type="password" placeholder="비밀번호" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="비밀번호" />
        {err && <p className="cmsg err" role="alert">{err}</p>}
        <button type="submit" className="cbtn pri" disabled={!!busy}>{busy === "login" ? "로그인 중…" : "로그인"}</button>
        <div className="crow" style={{ justifyContent: "center", gap: 18 }}>
          <Link href="/c/forgot" className="clink">비밀번호 찾기</Link>
          <Link href="/c/signup" className="clink">회원가입</Link>
        </div>
      </form>
      <div className="cfoot">
        <p className="cmt" style={{ textAlign: "center" }}>간편 로그인</p>
        <button type="button" className="cbtn kakao" disabled={!!busy} onClick={() => social("kakao")}>{busy === "kakao" ? "연결 중…" : "카카오로 계속하기"}</button>
        <button type="button" className="cbtn google" disabled={!!busy} onClick={() => social("google")}>{busy === "google" ? "연결 중…" : "구글로 계속하기"}</button>
        <button type="button" className="cbtn naver" disabled>네이버 로그인 <span className="csoon">준비 중</span></button>
      </div>
    </main>
  );
}

export default function Page() { return <Suspense fallback={null}><Login /></Suspense>; }
