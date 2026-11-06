"use client";
// @ts-nocheck

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { msgOf, rpc, when } from "@/src/lib/customer/api";
import { Loading, Page, Top, useGuard } from "../ui";

export default function Shops() {
  const g = useGuard();
  const [mine, setMine] = useState<any[] | null>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [near, setNear] = useState<string | null>(null);

  const loadMine = useCallback(() => { rpc<any[]>("c_my_stores").then(setMine).catch((e) => setErr(msgOf(e))); }, []);
  useEffect(() => { if (g.ready) loadMine(); }, [g.ready, loadMine]);
  useEffect(() => {
    if (!g.ready) return;
    const t = setTimeout(() => { rpc<any[]>("c_list_stores", { p_q: q }).then(setList).catch((e) => setErr(msgOf(e))); }, 250);
    return () => clearTimeout(t);
  }, [g.ready, q]);

  async function unlink(id: string) {
    if (!window.confirm("이 매장 연결을 해제할까요? 시술 기록은 그대로 남아 있어요.")) return;
    try { await rpc("c_unlink_store", { p_store: id }); loadMine(); } catch (e) { setErr(msgOf(e)); }
  }
  function nearby() {
    setNear("위치를 확인하는 중…");
    navigator.geolocation?.getCurrentPosition(
      async (p) => {
        try {
          const r = await fetch("/api/nearby-shops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }) });
          const j = await r.json();
          if (j.fallback === "no_key") { setNear("내 주변 검색은 카카오 지도 키(KAKAO_REST_API_KEY) 연결 후 쓸 수 있어요"); return; }
          const names: string[] = (j.shops ?? []).map((s: any) => String(s.name ?? "")).filter(Boolean);
          const hit = (list ?? []).filter((s) => names.some((n) => n.includes(s.name) || s.name.includes(n)));
          setNear(hit.length ? `내 주변 등록 매장 ${hit.length}곳을 위에 모았어요` : "내 주변에 등록된 매장을 찾지 못했어요");
          if (hit.length) setList([...hit, ...(list ?? []).filter((s) => !hit.includes(s))]);
        } catch { setNear("주변 매장 검색을 사용할 수 없어요"); }
      },
      () => setNear("위치 권한이 없어서 주변 검색을 할 수 없어요"),
      { timeout: 8000 },
    );
  }
  if (!g.ready) return <main className="cpage"><Loading /></main>;

  return (
    <Page tabbed={false}>
      <Top back="/c/home" title="내 매장" right={<Link href="/c/connect" className="clink">코드 입력</Link>} />
      {err && <p className="cmsg err" role="alert">{err}</p>}
      <section className="clist">
        <h2 className="ch2">연결된 매장</h2>
        {!mine ? <Loading /> : mine.length === 0 ? <p className="cmt">아직 연결된 매장이 없어요. 아래에서 매장을 찾아 예약하거나, 매장에서 받은 코드를 입력해 주세요.</p> : mine.map((s) => (
          <div key={s.store_id} className="ccard">
            <div className="crow"><b style={{ fontSize: 17 }}>{s.store}</b><span className="csp" />{s.designer && <span className="cpill teal">담당 {s.designer}</span>}</div>
            <span className="cmt">방문 {s.visits}회{s.last_visit ? ` · 최근 ${when(s.last_visit)}` : ""}</span>
            {s.address && <span className="cmt">{s.address}</span>}
            <div className="crow">
              <Link className="cbtn sm pri" href={`/c/book?store=${s.store_id}${s.designer_id ? `&designer=${s.designer_id}` : ""}`}>예약하기</Link>
              {s.phone && <a className="cbtn sm" href={`tel:${s.phone}`}>전화</a>}
              <span className="csp" />
              <button type="button" className="clink" onClick={() => unlink(s.store_id)}>연결 해제</button>
            </div>
          </div>
        ))}
      </section>
      <section className="clist">
        <h2 className="ch2">매장 찾기</h2>
        <div className="crow"><input className="cin" placeholder="매장 이름 · 지역 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="매장 검색" /><button type="button" className="cbtn sm" style={{ flex: "none" }} onClick={nearby}>내 주변</button></div>
        {near && <p className="chint">{near}</p>}
        {!list ? <Loading /> : list.length === 0 ? <p className="cmt">검색 결과가 없어요.</p> : list.map((s) => (
          <Link key={s.id} href={`/c/book?store=${s.id}`} className="citem">
            <div className="cstack"><b>{s.name}</b><span className="cmt">{s.address ?? "주소 미등록"}</span><span className="cmt">{s.category === "nail" ? "네일" : "헤어"} · 디자이너 {s.designer_count}명</span></div>
            {s.linked && <span className="cpill teal" style={{ alignSelf: "center" }}>연결됨</span>}
          </Link>
        ))}
      </section>
    </Page>
  );
}
