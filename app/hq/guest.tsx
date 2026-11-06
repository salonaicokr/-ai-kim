"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import OpsLogin from "./login";

/** 테스트 기간: 로그인 없이 자동 입장 (익명 계정 → 테스트 손님 = 마스터). 실패하거나 '운영 계정으로 로그인'을 누르면 로그인 폼 */
export default function GuestEnter() {
  const router = useRouter();
  const [state, setState] = useState<"going" | "fail" | "login">("going");

  useEffect(() => {
    let off = false;
    (async () => {
      const sb = createOpsBrowserClient();
      await sb.auth.signOut().catch(() => {});
      const { error } = await sb.auth.signInAnonymously();
      const { data: ok } = error ? { data: false } : await sb.rpc("hq_me");
      if (off) return;
      if (error || ok !== true) { setState("fail"); return; }
      router.replace("/hq/dashboard"); window.dispatchEvent(new Event("salonai:refresh"));
    })();
    return () => { off = true; };
  }, [router]);

  if (state === "going") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="sm">테스트 기간이라 로그인 없이 들어가는 중이에요…</p>
      <button type="button" className="btn ghost" onClick={() => setState("login")}>운영 계정으로 로그인</button>
    </div>
  );
  return (
    <>
      {state === "fail" && <p className="msg err" role="alert">로그인 없이 들어가기가 아직 켜지지 않았어요. 운영 계정으로 로그인해 주세요.</p>}
      <OpsLogin />
    </>
  );
}
