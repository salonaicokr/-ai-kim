"use client";
// @ts-nocheck

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import { NAVER_KO, type NaverStatus } from "@/src/lib/naver";

/** 네이버 플레이스: 매장이 넣은 주소를 열어 상호 · 전화 · 주소가 가입 정보와 맞으면 '확인됨' (마스터 · CS) */
export default function NaverForm({ shopId, status, url, placeId, login, canEdit }: { shopId: string; status: NaverStatus; url: string | null; placeId: string | null; login: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const href = placeId ? `https://map.naver.com/p/entry/place/${placeId}` : url;
  async function set(v: boolean) {
    const { error } = await createOpsBrowserClient().rpc("hq_set_naver", { p_shop: shopId, p_verified: v });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setMsg({ ok: true, t: v ? "확인됨으로 바꿨어요." : "확인을 취소했어요." }); window.dispatchEvent(new Event("salonai:refresh"));
  }
  return (
    <div className="ops-naver">
      <dl className="ops-dl">
        <div><dt>상태</dt><dd><span className={`pill ${status === "verified" ? "p-teal" : status === "entered" ? "p-amb" : "p-gray"}`}>{NAVER_KO[status]}</span></dd></div>
        <div><dt>플레이스</dt><dd>{href ? <a href={href} target="_blank" rel="noreferrer noopener">{placeId ? `번호 ${placeId}` : url} ↗</a> : <span className="sm">매장이 아직 입력하지 않았어요</span>}</dd></div>
        <div><dt>네이버 아이디</dt><dd>{login ?? "-"}</dd></div>
      </dl>
      {canEdit && (status === "entered" || status === "verified") && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <span className="sm">플레이스를 열어 상호 · 전화 · 주소가 위 사업자 정보와 맞는지 확인해 주세요.</span><span className="sp" />
          {status === "entered" ? <button className="btn pri sm-btn" type="button" onClick={() => set(true)}>확인됨으로</button>
            : <button className="btn ghost sm-btn" type="button" onClick={() => set(false)}>확인 취소</button>}
        </div>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
    </div>
  );
}
