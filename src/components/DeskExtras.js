"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StoreWidgets from "@/src/components/store-widgets";
import { createClient } from "@/src/lib/supabase/client";
import { SHOP_COOKIE } from "@/src/lib/session";

/** S-10 매장 현황 패널 (데스크톱 오른쪽 · 승인 대기 예약 바로 처리) */
export function DeskPanel({ store }) {
  const supabase = useMemo(() => createClient(), []);
  const [designers, setDesigners] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.from("shop_members").select("id, display_name").eq("shop_id", store.id).in("status", ["active", "invited"]).then(({ data }) => {
      if (alive) setDesigners((data ?? []).map((member) => ({ id: member.id, name: member.display_name })));
    });
    return () => { alive = false; };
  }, [supabase, store.id]);

  if (!designers) return null;
  return <StoreWidgets shopId={store.id} myMemberId={designers[0]?.id ?? ""} okPerm="all" designers={designers} />;
}

/** 고객이 삭제한 게시 사진 교체 알림: 어느 화면에서든 위쪽에 표시 */
export function GraceAlert({ store }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;
    supabase.from("showcase_grace").select("id, ai_path, title, remove_after").eq("shop_id", store.id).is("resolved_at", null).order("remove_after").limit(50)
      .then(({ data }) => { if (alive) setRows(data ?? []); });
    return () => { alive = false; };
  }, [supabase, store.id]);

  if (!rows.length) return null;
  return (
    <section className="msg err" role="alert" style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <b>매장에 게시 중인 사진 중 고객이 삭제한 사진이 {rows.length}장 있어요</b>
      <span>사진을 교체해 주세요. 기한이 지나면 자동으로 삭제돼요.</span>
      {rows.slice(0, 3).map((row) => {
        const day = new Date(row.remove_after);
        return <span key={row.id}><b>{row.title ?? "시술 사진"}</b> · {day.getMonth() + 1}월 {day.getDate()}일까지</span>;
      })}
      {rows.length > 3 ? <span>외 {rows.length - 3}장</span> : null}
      <Link href="/desk/settings#showcase-grace"><b>사진 교체하러 가기</b></Link>
    </section>
  );
}

/** 지점 전환 (소속 매장이 2곳 이상일 때) */
export function DeskShopSwitch({ stores, current }) {
  if (!stores || stores.length < 2) return null;
  function change(event) {
    try { localStorage.setItem(SHOP_COOKIE, event.target.value); } catch { /* 저장 불가 환경 */ }
    window.location.assign(window.location.pathname);
  }
  return (
    <div className="shop-switch">
      <label className="sm" htmlFor="shop-switch">지점</label>
      <select id="shop-switch" value={current} onChange={change}>
        {stores.map((store) => <option key={store.id} value={store.id}>{store.name}{store.status === "approved" ? "" : " (승인 대기)"}</option>)}
      </select>
      <Link className="sm" href="/onboarding?add=1">+ 지점 추가</Link>
    </div>
  );
}
