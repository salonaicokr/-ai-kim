"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/browser";

/** 설정 맨 위: 고객 앱 연결 코드 · QR (매장 코드 / 디자이너별 코드) */
export default function CustomerInvite({ shopId, shopName }: { shopId: string; shopName: string }) {
  const [store, setStore] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; display_name: string; customer_code: string | null }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, m] = await Promise.all([
        supabase.from("stores").select("customer_code").eq("id", shopId).maybeSingle(),
        supabase.from("store_members").select("id, display_name, customer_code, role, is_designer, status").eq("store_id", shopId),
      ]);
      if (!alive) return;
      setStore(s.data?.customer_code ?? null);
      setMembers((m.data ?? []).filter((x) => x.customer_code && x.status !== "left" && x.status !== "invited" && x.is_designer !== false));
    })();
    return () => { alive = false; };
  }, [shopId]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = (code: string) => `${origin}/c/connect?code=${code}`;
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(link(code)); setMsg("연결 링크를 복사했어요."); } catch { setMsg(`링크: ${link(code)}`); }
    setTimeout(() => setMsg(null), 2500);
  }
  if (!store && !members.length) return null;
  const rows = [...(store ? [{ id: "store", label: `${shopName} (매장 전체)`, code: store }] : []), ...members.map((m) => ({ id: m.id, label: `${m.display_name} 디자이너`, code: m.customer_code! }))];
  return (
    <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }} aria-label="고객 앱 연결 코드">
      <h2 style={{ margin: 0, fontSize: 17 }}>고객 앱 연결 코드 · QR</h2>
      <p className="sm" style={{ margin: 0 }}>고객이 앱에서 이 코드를 입력하거나 QR을 찍으면 우리 매장과 연결돼요. 디자이너 코드로 연결하면 그 디자이너가 담당으로 지정돼요.</p>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid #e6e8ee", paddingTop: 8 }}>
          <b style={{ minWidth: 140 }}>{r.label}</b>
          <code style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3 }}>{r.code}</code>
          <button type="button" className="btn ghost sm-btn" onClick={() => copy(r.code)}>링크 복사</button>
          <button type="button" className="btn ghost sm-btn" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "QR 닫기" : "QR 보기"}</button>
          {open === r.id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${r.label} QR`} width={160} height={160} src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(link(r.code))}`} />
          )}
        </div>
      ))}
      {msg && <p className="msg ok" role="status">{msg}</p>}
    </section>
  );
}
