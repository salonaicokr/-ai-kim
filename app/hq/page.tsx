"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOps } from "@/src/lib/ops";
import OpsLogin from "./login";
import GuestEnter from "./guest";

export default function OpsLoginPage() {
  return (
    <main className="auth">
      <div className="card">
        <p className="wordmark">SALONAI</p>
        <h1 className="h1">운영 로그인</h1>
        <Gate />
      </div>
    </main>
  );
}

function Gate() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "guest" | "login">("loading");
  useEffect(() => {
    (async () => {
      const { ok, supabase } = await getOps();
      if (ok) { router.replace("/hq/dashboard"); return; }
      // 테스트 기간(hq_open 켜짐)에는 로그인 없이 바로 입장
      // /hq?login=1 로 오면 관리자 아이디 로그인 폼을 바로 보여줘요
      if (new URLSearchParams(window.location.search).get("login")) { setState("login"); return; }
      const { data: open } = await supabase.rpc("hq_open");
      setState(open === true ? "guest" : "login");
    })();
  }, [router]);
  if (state === "loading") return <div className="skel" />;
  return state === "guest" ? <GuestEnter /> : <OpsLogin />;
}
