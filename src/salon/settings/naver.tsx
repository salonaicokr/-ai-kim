"use client";

import { useState } from "react";
import type { createClient } from "@/src/lib/supabase/client";
import { NAVER_KO, isNaverUrl, parsePlaceId, type NaverStatus } from "@/src/lib/naver";
import { resolveNaverPlace } from "@/src/lib/naver-resolve";

type SB = ReturnType<typeof createClient>;
export type NaverInfo = { naver_place_url: string | null; naver_place_id: string | null; naver_login_id: string | null; naver_status: NaverStatus };

/** 설정 › 네이버 · 연동: 플레이스 주소 · 아이디 (비밀번호는 받지 않음). 본사가 확인하면 '확인됨' */
export default function NaverPlace({ supabase, shopId, initial, canEdit }: { supabase: SB; shopId: string; initial: NaverInfo; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const [url, setUrl] = useState(initial.naver_place_url ?? "");
  const [login, setLogin] = useState(initial.naver_login_id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = url.trim() ? parsePlaceId(url) : null;

  async function save() {
    setMsg(null);
    if (url.trim() && !isNaverUrl(url)) return setMsg({ ok: false, t: "네이버 플레이스 · 지도 주소(naver.com · naver.me)를 붙여넣어 주세요." });
    setBusy(true);
    const r = await resolveNaverPlace(url);
    if (r.error) { setBusy(false); return setMsg({ ok: false, t: r.error }); }
    const { data, error } = await supabase.from("shops").update({ naver_place_url: r.url || null, naver_place_id: r.id, naver_login_id: login.trim() || null })
      .eq("id", shopId).select("naver_place_url, naver_place_id, naver_login_id, naver_status").single();
    setBusy(false);
    if (error) return setMsg({ ok: false, t: `저장하지 못했어요: ${error.message}` });
    setV(data as NaverInfo);
    setMsg({ ok: true, t: r.url ? (r.id ? `저장했어요. 플레이스 번호 ${r.id} — 본사에서 매장 정보와 맞는지 확인해요.` : "저장했어요. 플레이스 번호는 본사에서 확인해요.") : "네이버 플레이스 연결을 비웠어요." });
  }

  return (
    <section className="card st-card st-naver" id="naver">
      <h2 className="st-h">네이버 플레이스 연결 <span className={`pill ${v.naver_status === "verified" ? "p-teal" : v.naver_status === "entered" ? "p-amb" : "p-gray"}`}>{NAVER_KO[v.naver_status]}</span></h2>
      <p className="sm">네이버 예약을 SALONAI 예약 캘린더로 자동으로 받기 위한 정보예요. 네이버 지도에서 우리 매장 → <b>공유</b> → 링크 복사 후 붙여넣어 주세요. 네이버 예약 연동은 네이버와 절차를 진행 중이라, 열리면 바로 연결돼요.</p>
      <label className="field"><span className="lbl">네이버 플레이스 주소</span>
        <input className="input" inputMode="url" value={url} maxLength={300} disabled={!canEdit} placeholder="https://naver.me/… 또는 https://map.naver.com/…/place/1234567" onChange={(e) => setUrl(e.target.value)} />
        {url.trim() && <span className="sm" style={{ color: preview ? "#0F766E" : undefined }}>{preview ? `플레이스 번호 ${preview}` : isNaverUrl(url) ? "짧은 링크는 저장할 때 번호를 찾아요" : "네이버 주소가 아닌 것 같아요"}</span>}
      </label>
      <label className="field"><span className="lbl">네이버 아이디 (스마트플레이스 관리 계정 · 선택)</span>
        <input className="input" value={login} maxLength={60} autoComplete="off" disabled={!canEdit} placeholder="비밀번호는 절대 입력하지 마세요" onChange={(e) => setLogin(e.target.value)} /></label>
      {v.naver_status === "verified" && <p className="sm">본사에서 확인한 정보예요. 주소를 바꾸면 다시 확인해요.</p>}
      {canEdit ? <button type="button" className="btn pri" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        : <p className="sm">원장님만 바꿀 수 있어요.</p>}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
    </section>
  );
}
