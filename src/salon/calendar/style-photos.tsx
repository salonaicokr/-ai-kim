"use client";
/* eslint-disable @next/next/no-img-element -- 비공개 버킷 서명 URL */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { createClient } from "@/src/lib/supabase/client";
import "./record.css";

type SB = ReturnType<typeof createClient>;
type Photo = { id: string; kind: "current" | "wish"; source: "photo" | "ai_sample"; path: string; title: string | null; url?: string };

/** 고객이 예약할 때 보낸 지금 모습 · 원하는 스타일 (예약을 볼 수 있는 담당 디자이너 · 권한자만) */
export default function StylePhotos({ supabase, bookingId }: { supabase: SB; bookingId: string }) {
  const [list, setList] = useState<Photo[] | null>(null);
  const [view, setView] = useState<Photo | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("booking_style_photos").select("id, kind, source, path, title").eq("booking_id", bookingId).order("created_at");
      const rows = (data ?? []) as Photo[];
      const priv = rows.filter((p) => !p.path.startsWith("/")).map((p) => p.path);
      const map = new Map<string, string>();
      if (priv.length) {
        const { data: s } = await supabase.storage.from("booking-style-photos").createSignedUrls(priv, 3600);
        (s ?? []).forEach((x) => { if (x.path && x.signedUrl) map.set(x.path, x.signedUrl); });
      }
      rows.forEach((p) => { p.url = p.path.startsWith("/") ? p.path : map.get(p.path); });
      if (alive) setList(rows);
    })();
    return () => { alive = false; };
  }, [supabase, bookingId]);

  if (!list?.length) return null;
  const groups = [["current", "지금 모습"], ["wish", "원하는 스타일"]] as const;
  return (
    <section className="trec" aria-label="고객이 보낸 스타일 사진">
      <div className="trec-h"><h3>고객이 보낸 스타일 사진</h3><span className="pill p-teal">{list.length}장</span></div>
      <div className="trec-cols">
        {groups.map(([k, label]) => (
          <div key={k} className="trec-col">
            <span className="lbl">{label}</span>
            <div className="trec-grid">
              {list.filter((p) => p.kind === k).map((p) => (
                <button key={p.id} type="button" className="trec-ph" aria-label={`${label} 크게 보기`} onClick={() => setView(p)}>
                  {p.url ? <img src={p.url} alt="" /> : <span className="sm">…</span>}
                </button>
              ))}
              {!list.some((p) => p.kind === k) && <span className="sm">없음</span>}
            </div>
          </div>
        ))}
      </div>
      {view && createPortal(
        <div className="trec-view" role="dialog" aria-modal="true" aria-label="고객이 보낸 사진" onClick={() => setView(null)}>
          <div className="trec-box" onClick={(e) => e.stopPropagation()}>
            <div className="row"><b>{view.kind === "current" ? "지금 모습" : view.title ?? "원하는 스타일"}</b><span className="sp" /><button type="button" className="x" aria-label="닫기" onClick={() => setView(null)}>×</button></div>
            <div className="trec-pair"><figure><img src={view.url} alt="" /><figcaption className="sm">{view.source === "ai_sample" ? "고객이 고른 스타일 샘플" : "고객이 보낸 사진 · 상담 외 용도로 쓰지 않아요"}</figcaption></figure></div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
