"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/browser";
import { hqState } from "@/src/lib/supabase/hq-backend";

/** 정지된 매장 안내: 예약 · 고객 · 매출 화면은 열리지 않아요 (본사에서 정지하면 이 화면으로 와요) */
export default function SuspendedPage() {
  const [names, setNames] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("stores").select("id, name");
      const shops = hqState().shops;
      setNames((data ?? []).filter((s) => shops[s.id]?.status === "suspended").map((s) => s.name));
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <div className="auth-screen" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <main className="auth-main">
        <div className="card" style={{ margin: "0 auto" }}>
          <p className="eyebrow">SALONAI</p>
          <h1>매장 이용이 잠시 멈췄어요</h1>
          <p className="muted">
            {names?.length ? <><b>{names.join(", ")}</b> 매장은 </> : "이 매장은 "}지금 이용이 정지된 상태라 예약 · 고객 · 매출 정보를 볼 수 없어요.
            자세한 내용은 SALONAI 고객센터로 문의해주세요.
          </p>
          {names && names.length === 0 && <Link className="btn primary" href="/desk/home">매장으로 돌아가기</Link>}
          <button className="btn" type="button" onClick={logout} style={{ marginTop: 10 }}>로그아웃</button>
        </div>
      </main>
    </div>
  );
}
