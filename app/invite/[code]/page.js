"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";

/**
 * 구성원 초대 링크. 이 브라우저에 남은 초대(구성원 화면에서 만든 것)만 확인해요.
 * 실제 계정 연결(다른 기기에서 가입 후 참여)은 클라우드 초대 테이블이 연결된 뒤에 돼요.
 */
export default function InvitePage() {
  const { code } = useParams();
  const router = useRouter();
  const [inv, setInv] = useState(undefined);
  const [shop, setShop] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("shop_members").select("*").eq("invite_code", String(code)).eq("status", "invited");
      const row = data?.[0] ?? null;
      setInv(row);
      if (row) {
        const { data: s } = await supabase.from("shops").select("name").eq("id", row.shop_id).maybeSingle();
        setShop(s?.name ?? "매장");
      }
    })();
  }, [code]);

  async function accept() {
    setBusy(true); setErr(null);
    const { error } = await createClient().from("shop_members").update({ status: "active" }).eq("id", inv.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.replace("/desk/members");
  }

  return (
    <div className="auth-screen" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <main className="auth-main">
        <div className="card" style={{ margin: "0 auto" }}>
          <p className="eyebrow">SALONAI</p>
          {inv === undefined ? <p className="muted">확인하는 중…</p> : !inv ? (
            <>
              <h1>초대 링크를 확인할 수 없어요</h1>
              <p className="muted">이미 사용됐거나 취소된 링크예요. 원장님께 새 링크를 요청해주세요.</p>
            </>
          ) : (
            <>
              <h1>{shop}</h1>
              <p className="muted">원장님이 <b>{inv.display_name}</b> 님을 <b>{inv.title}</b>(으)로 초대했어요. 참여하면 원장님이 정한 권한으로 예약 · 고객을 볼 수 있어요.</p>
              {err && <p className="error" role="alert">{err}</p>}
              <button className="btn primary" type="button" disabled={busy} onClick={accept}>{busy ? "참여하는 중…" : "매장에 참여하기"}</button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
