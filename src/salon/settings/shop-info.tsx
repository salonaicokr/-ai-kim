"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { createClient } from "@/src/lib/supabase/client";
import AddressField, { addrError, addrLine, type Addr } from "@/src/components/address-field";

type SB = ReturnType<typeof createClient>;
export type ShopInfoData = { name: string; phone: string | null; postcode: string | null; address: string | null; address_detail: string | null; inflow_sources?: string[] };

const digits = (s: string) => s.replace(/[^0-9]/g, "");
const phoneFmt = (s: string) => { const d = digits(s); return d.length >= 9 ? d.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3") : d; };

/** 설정 › 매장 정보: 매장명 · 연락처 · 주소(우편번호 검색). 원장 · 지점장만 수정 */
export default function ShopInfo({ supabase, shopId, data, canEdit, children }: { supabase: SB; shopId: string; data: ShopInfoData; canEdit: boolean; children?: React.ReactNode }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(data.name);
  const [phone, setPhone] = useState(data.phone ?? "");
  const [addr, setAddr] = useState<Addr>({ postcode: data.postcode ?? "", address: data.address ?? "", detail: data.address_detail ?? "" });
  const [inflows, setInflows] = useState((data.inflow_sources ?? []).join(", "));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  async function save() {
    if (!name.trim()) return setMsg({ ok: false, t: "매장 이름을 입력해주세요." });
    const ae = addrError(addr);
    if (ae) return setMsg({ ok: false, t: ae });
    const { error } = await supabase.from("shops").update({
      name: name.trim(), phone: phoneFmt(phone) || null, postcode: addr.postcode || null, address: addr.address || null, address_detail: addr.detail.trim() || null,
      // S-13 고객 유입경로 항목 (매장이 편집)
      inflow_sources: [...new Set(inflows.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 12),
    }).eq("id", shopId);
    if (error) return setMsg({ ok: false, t: `저장하지 못했어요: ${error.message}` });
    setMsg({ ok: true, t: "매장 정보를 저장했어요." });
    setEdit(false);
    router.refresh();
  }

  return (
    <section className="card st-card" id="info">
      <div className="row"><h2 className="st-h">매장 정보</h2><span className="sp" />
        {canEdit && !edit && <button type="button" className="btn ghost sm-btn" onClick={() => { setEdit(true); setMsg(null); }}>수정</button>}</div>
      {edit ? (
        <div className="st-form">
          <label className="field"><span className="lbl">매장 이름</span><input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span className="lbl">매장 연락처</span><input className="input" inputMode="tel" placeholder="02-000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <div className="field"><span className="lbl">주소</span><AddressField idPrefix="st-addr" value={addr} onChange={setAddr} /></div>
          <label className="field"><span className="lbl">고객 유입경로 항목 (쉼표로 구분)</span><input className="input" value={inflows} onChange={(e) => setInflows(e.target.value)} placeholder="네이버, 인스타, 지인소개, 지나가다, 기타" /></label>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setEdit(false)}>취소</button>
            <button type="button" className="btn pri" onClick={save}>저장</button>
          </div>
        </div>
      ) : (
        <dl className="st-dl">
          <div><dt>매장 이름</dt><dd>{data.name}</dd></div>
          <div><dt>연락처</dt><dd>{data.phone ?? "-"}</dd></div>
          <div><dt>주소</dt><dd>{data.address ? <>{data.postcode && <span className="sm">({data.postcode}) </span>}{addrLine({ postcode: "", address: data.address, detail: data.address_detail ?? "" })}</> : "-"}</dd></div>
          <div><dt>유입경로 항목</dt><dd className="sm">{(data.inflow_sources ?? []).join(" · ") || "-"}</dd></div>
          {children}
        </dl>
      )}
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.t}</p>}
    </section>
  );
}
