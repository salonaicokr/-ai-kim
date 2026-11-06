"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { redirect } from "@/src/lib/compat";
import { getOps } from "@/src/lib/ops";
import { BILLING_KO, IND_KO, STATUS_KO, TYPE_KO, ymd, type BillingState } from "../../types";
import StatusForm from "./status-form";
import BillingForm from "./billing-form";
import AssignStore, { type Assignment } from "./assign";
import NaverForm from "./naver-form";
import type { NaverStatus } from "@/src/lib/naver";
import AddonsForm, { type ShopAddons } from "./addons-form";


type Detail = {
  shop: { id: string; name: string; owner: string | null; owner_phone: string | null; phone: string | null; address: string | null; biz_no: string | null;
          industries: string[]; type: string; status: "pending" | "active" | "suspended"; plan: string; created: string; biz_doc: boolean; license_doc: boolean; brand: string | null;
          code: string | null; referral: string | null; referral_rep: string | null; customers: number; billing: BillingState; billing_day: number | null;
          naver?: NaverStatus; naver_url?: string | null; naver_id?: string | null; naver_login?: string | null };
  billing_log: { from: BillingState | null; to: BillingState; reason: string | null; auto: boolean; at: string; by: string }[];
  branches: { id: string; name: string; status: string }[];
  members: { active: number; invited: number; manager: string | null };
  last30: { bookings: number; completed: number; sales: number };
  log: { from: string | null; to: string; reason: string | null; at: string; by: string }[];
};

export default function OpsStore() {
  const { id } = useParams<{ id: string }>();
  return <Suspense fallback={<div className="skel" style={{ minHeight: 400 }} />}><Body id={id} /></Suspense>;
}

async function BodyImpl({ id }: { id: string }) {
  const { supabase, me } = await getOps();
  const [{ data, error }, addons, asg, ov] = await Promise.all([
    supabase.rpc("hq_store", { p_shop: id }),
    supabase.rpc("hq_shop_addons", { p_shop: id }),
    supabase.rpc("hq_store_assignments", { p_store: id }),
    supabase.rpc("hq_sales_overview"),
  ]);
  if (error || !data) redirect("/hq/stores");
  const reps = ((ov.data as { reps?: { code: string; name: string; org: string; active: boolean }[] } | null)?.reps ?? []);
  const d = data as Detail;
  const s = d.shop;
  const at = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <div>
        <p className="crumb"><Link href="/hq/stores">매장</Link> · 상세</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <h1 className="h1">{s.name}</h1><span className={`pill st-${s.status}`}>{STATUS_KO[s.status]}</span>
        </div>
        <p className="sm">{TYPE_KO[s.type]} · {s.industries.map((i) => IND_KO[i] ?? i).join(" · ")} · {ymd(s.created)} 가입 · 요금제 {s.plan}</p>
      </div>

      <div className="ops-2">
        <section className="card">
          <h2 className="b">사업자 정보</h2>
          <dl className="ops-dl">
            <div><dt>매장코드</dt><dd>{s.code ? <code className="code">{s.code}</code> : <span className="sm">승인하면 발급돼요</span>} <span className="sm">· 고객 {s.customers}명 (고객번호 {s.code ?? "매장코드"}-0001부터)</span></dd></div>
            <div><dt>가입 추천 코드</dt><dd>{s.referral ? <><code className="code">{s.referral}</code>{s.referral_rep && <span className="sm"> · {s.referral_rep}</span>}</> : <span className="sm">없음 (본사 직영 HQ01)</span>}</dd></div>
            <div><dt>대표자</dt><dd>{s.owner ?? "-"} {s.owner_phone && <span className="sm">· {s.owner_phone}</span>}</dd></div>
            <div><dt>사업자등록번호</dt><dd>{s.biz_no ?? "-"}</dd></div>
            <div><dt>매장 연락처</dt><dd>{s.phone ?? "-"}</dd></div>
            <div><dt>주소</dt><dd>{s.address ?? "-"}</dd></div>
            <div><dt>제출 서류</dt><dd>사업자등록증 {s.biz_doc ? "✓ 제출" : "미제출"} · 면허/자격 {s.license_doc ? "✓ 제출" : "미제출"}</dd></div>
          </dl>
        </section>
        <section className="card">
          <h2 className="b">최근 30일</h2>
          <div className="ops-mini">
            <div><p className="lbl">예약</p><p className="big">{d.last30.bookings}</p></div>
            <div><p className="lbl">방문완료</p><p className="big">{d.last30.completed}</p></div>
            <div><p className="lbl">매출</p><p className="big">{d.last30.sales.toLocaleString("ko-KR")}<small>원</small></p></div>
          </div>
          <dl className="ops-dl">
            <div><dt>구성원</dt><dd>{d.members.active}명{d.members.invited ? ` · 초대중 ${d.members.invited}명` : ""}</dd></div>
            <div><dt>지점장</dt><dd>{d.members.manager ?? "-"}</dd></div>
          </dl>
        </section>
      </div>

      {d.branches.length > 0 && (
        <section className="card">
          <h2 className="b">소속 지점 · {s.brand ?? ""}</h2>
          <ul className="list" style={{ marginTop: 8 }}>
            {d.branches.map((b) => (
              <li key={b.id}>
                {b.id === s.id ? <b>{b.name} (이 매장)</b> : <Link href={`/hq/stores/${b.id}`}>{b.name}</Link>}
                <span className="sp" /><span className={`pill st-${b.status}`}>{STATUS_KO[b.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="b">과금 상태 <span className="sm" style={{ fontWeight: 400 }}>· 운영 상태(승인 · 정지)와 따로 관리해요</span></h2>
        <BillingForm shopId={s.id} state={s.billing} day={s.billing_day} canEdit={!!me?.can.billing} />
        {d.billing_log.length > 0 && (
          <ul className="list ops-log" style={{ marginTop: 10 }}>
            {d.billing_log.map((l, i) => (
              <li key={i}>
                <span className="sm">{at(l.at)}</span>
                <span>{l.from ? `${BILLING_KO[l.from]} → ` : ""}<b>{BILLING_KO[l.to]}</b>{l.auto && <span className="pill p-gray" style={{ marginLeft: 6 }}>자동</span>}</span>
                <span className="sm">{l.reason ?? ""}</span>
                <span className="sp" /><span className="sm">{l.by}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="b">네이버 플레이스 <span className="sm" style={{ fontWeight: 400 }}>· 네이버 예약 연동 준비 정보 (연동은 네이버 절차 후)</span></h2>
        <NaverForm shopId={s.id} status={s.naver ?? "none"} url={s.naver_url ?? null} placeId={s.naver_id ?? null} login={s.naver_login ?? null} canEdit={!!me?.can.store} />
      </section>

      {addons.data && (
        <section className="card">
          <h2 className="b">요금제 · 부가서비스 <span className="sm" style={{ fontWeight: 400 }}>· 매장 홈 ‘이용료(예상)’ · ‘부가서비스 신청현황’에 바로 보여요</span></h2>
          <AddonsForm shopId={s.id} data={addons.data as ShopAddons} canPlan={!!me?.can.billing} canAddon={!!me?.can.store} />
        </section>
      )}

      <AssignStore storeId={s.id} history={(asg.data ?? []) as Assignment[]} reps={reps} />

      <section className="card">
        <h2 className="b">운영 상태 변경</h2>
        {me?.can.store ? <StatusForm shopId={s.id} status={s.status} /> : <p className="sm">승인 · 정지는 CS · 마스터 역할만 할 수 있어요.</p>}
        <h3 className="b" style={{ marginTop: 16 }}>변경 이력</h3>
        <ul className="list ops-log">
          {d.log.map((l, i) => (
            <li key={i}>
              <span className="sm">{at(l.at)}</span>
              <span>{l.from ? `${STATUS_KO[l.from]} → ` : ""}<b>{STATUS_KO[l.to]}</b></span>
              <span className="sm">{l.reason ?? ""}</span>
              <span className="sp" /><span className="sm">{l.by}</span>
            </li>
          ))}
          {d.log.length === 0 && <li className="sm">이력이 없어요.</li>}
        </ul>
      </section>
    </>
  );
}
const Body = asyncComp(BodyImpl);
