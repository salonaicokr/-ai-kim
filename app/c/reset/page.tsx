"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/src/lib/customer/api";
import { Top } from "../ui";

export default function Reset() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data } = sb.auth.onAuthStateChange((ev, s) => { if (s) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (pw.length < 8) { setErr("비밀번호는 8자 이상이어야 해요"); return; }
    if (pw !== pw2) { setErr("비밀번호가 서로 달라요"); return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setErr(error.message); return; }
    setDone(true);
    setTimeout(() => router.replace("/c/home"), 1200);
  }
  return (
    <main className="cpage">
      <Top back="/c/login" title="새 비밀번호" />
      {!ready ? <p className="cmt">메일의 재설정 링크로 들어와 주세요. 링크가 만료됐다면 비밀번호 찾기를 다시 해주세요.</p> : done ? <p className="cmsg">비밀번호를 바꿨어요. 홈으로 이동해요…</p> : (
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 className="ch1">새 비밀번호를 정해요</h1>
          <input className="cin" type="password" placeholder="새 비밀번호 (8자 이상)" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="cin" type="password" placeholder="새 비밀번호 확인" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {err && <p className="cmsg err" role="alert">{err}</p>}
          <button className="cbtn pri" type="submit">비밀번호 바꾸기</button>
        </form>
      )}
    </main>
  );
}
