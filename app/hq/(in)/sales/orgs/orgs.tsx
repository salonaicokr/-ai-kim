"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import { ORG_TYPES, type Org, type Overview } from "../types";

type Region = { name: string; prefix: string; orgs: number };
type Preview = { ok: boolean; region: string; prefix?: string; known?: boolean; next?: string; seq?: number };

/** 영업조직 트리 (STEP 1): 지역명(한글)만 쓰면 약어 · 번호 자동 · 폐점은 비활성 */
export default function OrgsEditor({ initial, regions: regions0 }: { initial: Overview; regions: Region[] }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState(initial.orgs);
  const [f, setF] = useState({ region: "", name: "", type: "영업소" as Org["type"], parent: "" });
  const [regions, setRegions] = useState(regions0);
  const [pv, setPv] = useState<Preview | null>(null);
  // 지역명을 쓰면 약어 · 이번 코드를 미리 보여줌 (저장은 추가할 때)
  useEffect(() => {
    const r = f.region.trim();
    if (!r) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await createOpsBrowserClient().rpc("hq_region_preview", { p_region: r });
      if (alive) setPv((data as Preview) ?? null);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [f.region]);
  const preview = f.region.trim() ? pv : null;
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  async function reload() {
    const { data } = await createOpsBrowserClient().rpc("hq_sales_overview");
    if (data) setOrgs((data as Overview).orgs);
    const { data: rg } = await createOpsBrowserClient().rpc("hq_regions");
    if (rg) setRegions(rg as Region[]);
    window.dispatchEvent(new Event("salonai:refresh"));
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.region.trim()) return setMsg({ ok: false, t: "지역명을 한글로 써주세요. 예: 인천, 서울" });
    if (preview && !preview.ok) return setMsg({ ok: false, t: "지역명은 한글(또는 영문)로만 써주세요. 숫자 · 기호는 빼주세요." });
    const { data, error } = await createOpsBrowserClient().rpc("hq_create_org", { p_region: f.region, p_type: f.type, p_parent: f.parent || null, p_name: f.name.trim() || null });
    if (error) return setMsg({ ok: false, t: error.message });
    setMsg({ ok: true, t: `${preview?.region ?? f.region} ${f.type}를 만들고 코드 ${data} 를 발급했어요.${preview && !preview.known ? ` 새 지역 '${preview.region}'은 약어 ${preview.prefix}로 기억했어요.` : ""}` });
    setF({ ...f, region: "", name: "" });
    reload();
  }
  async function close(o: Org) {
    setAsk(null);
    const { error } = await createOpsBrowserClient().rpc("hq_close_org", { p_org: o.id });
    setMsg(error ? { ok: false, t: error.message } : { ok: true, t: `${o.name} 을(를) 비활성(폐점)으로 바꿨어요. 코드 ${o.code} 는 다시 쓰지 않아요.` });
    reload();
  }

  // 트리 순서로 펼치기
  const kids = (pid: string | null) => orgs.filter((o) => o.parent === pid && (showClosed || o.active));
  const rows: { o: Org; depth: number }[] = [];
  const walk = (pid: string | null, d: number) => kids(pid).forEach((o) => { rows.push({ o, depth: d }); walk(o.id, d + 1); });
  walk(null, 0);

  return (
    <>
      <form className="card ops-form" onSubmit={add}>
        <h2 className="b">조직 추가</h2>
        <div className="ops-form-grid">
          <label className="field"><span className="lbl">구분</span>
            <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Org["type"] })}>{ORG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="field"><span className="lbl">지역명 (한글)</span>
            <input className="input" list="hq-regions" maxLength={12} placeholder="인천, 서울, 분당…" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} autoComplete="off" />
            <datalist id="hq-regions">{regions.map((r) => <option key={r.name} value={r.name}>{r.prefix}</option>)}</datalist></label>
          <label className="field"><span className="lbl">상위 조직</span>
            <select className="input" value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}>
              <option value="">없음 (최상위)</option>{orgs.filter((o) => o.active).map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
            </select></label>
          <label className="field"><span className="lbl">이름 (비우면 자동)</span>
            <input className="input" maxLength={40} placeholder={preview?.ok ? `${preview.region} ${f.type}${(preview.seq ?? 1) > 1 ? ` ${preview.seq}` : ""}` : "인천 영업소"} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="sm" role="status">
            {!preview ? "지역명만 한글로 쓰면 영문 약어와 번호는 자동으로 붙어요 (예 인천 → IC01, 두 번째 인천 → IC02)."
              : !preview.ok ? "지역명은 한글(또는 영문)로만 써주세요."
              : <>{preview.region} → 약어 <b>{preview.prefix}</b> {preview.known ? "(등록된 지역)" : "· 새 지역이라 이 약어로 기억해요"} · 이번 코드 <code className="code">{preview.next}</code></>}
          </span>
          <span className="sp" /><button className="btn pri" type="submit">추가하고 코드 발급</button></div>
        {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
      </form>

      <section className="card">
        <div className="row"><h2 className="b">조직 트리</h2><span className="sp" />
          <label className="sm"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> 폐점(비활성) 보기</label></div>
        {rows.length === 0 ? <p className="sm" style={{ marginTop: 8 }}>아직 영업조직이 없어요. 위에서 본부 · 영업소부터 만들어주세요.</p> : (
          <ul className="org-tree">
            {rows.map(({ o, depth }) => (
              <li key={o.id} className={o.active ? "" : "closed"} style={{ paddingLeft: 12 + depth * 22 }}>
                {depth > 0 && <span className="branch" aria-hidden>└</span>}
                <code className="code">{o.code}</code><b>{o.name}</b><span className="pill p-gray">{o.type}</span>
                <span className="sm">영업사원 {o.reps}명 · {o.opened} 개설{o.closed ? ` · ${o.closed} 폐점` : ""}</span>
                <span className="sp" />
                {o.active && (ask === o.id ? (
                  <span className="row" style={{ gap: 6 }}><span className="sm">비활성으로 바꿀까요?</span>
                    <button type="button" className="btn ghost sm-btn" onClick={() => setAsk(null)}>취소</button>
                    <button type="button" className="btn sm-btn del-solid" onClick={() => close(o)}>폐점 처리</button></span>
                ) : <button type="button" className="btn ghost sm-btn" onClick={() => setAsk(o.id)}>폐점</button>)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="b">지역 약어 표</h2>
        <p className="sm" style={{ margin: "4px 0 8px" }}>시스템이 기억하는 지역이에요. 한 번 정한 약어는 이미 나간 코드가 써서 바꾸지 않아요. 새 지역은 처음 조직을 만들 때 자동으로 추가돼요.</p>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {regions.map((r) => <span key={r.name} className="pill p-gray"><b>{r.name}</b>&nbsp;<code>{r.prefix}</code>{r.orgs > 0 && <>&nbsp;· {r.orgs}</>}</span>)}
        </div>
      </section>
    </>
  );
}
