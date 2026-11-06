"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/client";
import Showcase from "./showcase";
import CustomerImport from "./import";
import HoursEditor from "./hours";
import NaverPlace, { type NaverInfo } from "./naver";
import ScheduleEditor, { type MemberOff, type ShopEvent } from "./schedule";
import ShopInfo, { type ShopInfoData } from "./shop-info";
import type { Holiday, HoursRow } from "@/src/lib/hours";
import { CONNECT, TEMP } from "@/src/lib/roadmap";
import "./settings.css";

type Admin = { id: string; name: string; title: string; owner: boolean };
type Props = {
  shopId: string; shopName: string; shopType: string; shopStatus: string; industries: string[];
  isOwner: boolean; admins: Admin[]; canPerm: boolean;
  info: ShopInfoData; hours: HoursRow[]; holidays: Holiday[];
  naver: NaverInfo; members: { id: string; name: string }[]; events: ShopEvent[]; offs: MemberOff[];
};

const TYPE_LABEL: Record<string, string> = { solo: "1인샵", shop: "매장", multi: "다매장" };
const IND_LABEL: Record<string, string> = { hair: "헤어", nail: "네일" };
const STATUS_LABEL: Record<string, string> = { pending: "승인 대기", active: "운영 중", rejected: "반려", suspended: "정지" };



const HEAD = ["이름", "휴대폰", "담당 디자이너", "방문 횟수", "최근 방문", "포인트", "정액권 잔액", "메모", "등록일"];

type Summary = {
  app: { sent: number; read: number };
  bill?: { estimate: boolean; plan: string | null; plan_fee: number; addon_fee: number; msg_fee: number; total: number; next: string | null; state: string };
  addons?: { code: string; name: string; fee: number; status: "active" | "preparing" | "none" }[];
};
const ADDON_ST = { active: "사용 중", preparing: "준비 중", none: "미신청" } as const;
const BILL_STATE: Record<string, string> = { grace: "결제 유예 중", restricted: "미납 · 일부 제한", blocked: "미납 · 이용 중지", terminated: "해지" };
const won = (n: number) => n.toLocaleString("ko-KR");

function StoreAccount({ shopId }: { shopId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [sum, setSum] = useState<Summary | null>(null);
  const [linked, setLinked] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.rpc("store_home_summary", { p_shop: shopId }),
      supabase.from("shop_customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId).not("customer_id", "is", null),
    ]).then(([summary, appLinked]) => {
      if (!alive) return;
      setSum((summary.data ?? null) as Summary | null);
      setLinked(appLinked.count ?? 0);
      setReady(true);
    });
    return () => { alive = false; };
  }, [shopId, supabase]);

  if (!ready) return <div className="st-account" aria-hidden><div className="skel" style={{ minHeight: 89 }} /><div className="skel" style={{ minHeight: 180 }} /><div className="skel" style={{ minHeight: 150 }} /></div>;

  const readRate = sum && sum.app.sent > 0 ? Math.round((sum.app.read / sum.app.sent) * 100) : null;
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return (
    <div className="st-account">
      {sum?.bill && (
        <section className="hm-bill" aria-label="SALONAI 이용료">
          <span className="hm-bill-tag">SALONAI 이용료</span>
          <b className="hm-bill-amt">{won(sum.bill.total)}<small>원</small></b>
          <span className="hm-bill-sub">이번 달 예상 · {sum.bill.plan ?? "요금제"}{sum.bill.next ? ` · 다음 청구 ${md(sum.bill.next)}` : ""}{sum.bill.state !== "normal" ? ` · ${BILL_STATE[sum.bill.state] ?? sum.bill.state}` : ""}</span>
          <span className="sp" />
          <span className="hm-bill-br">월 이용료 <b>{won(sum.bill.plan_fee)}</b> · 부가서비스 <b>{won(sum.bill.addon_fee)}</b> · 문자 <b>{won(sum.bill.msg_fee)}</b></span>
        </section>
      )}
      <div className="card hm-o7">
        <div className="hm-h"><h2 className="b">부가서비스 신청현황</h2><span className="sp" /><span className="sm">본사에서 켜고 끄는 기능</span></div>
        <div className="hm-addons">
          {(sum?.addons ?? []).map((a) => (
            <div key={a.code} className="hm-addon"><b>{a.name}</b><span className="sm">월 {won(a.fee)}원 <span className={`pill ${a.status === "active" ? "p-teal" : a.status === "preparing" ? "p-amb" : "p-gray"}`}>{ADDON_ST[a.status]}</span></span></div>
          ))}
        </div>
        <p className="sm" style={{ marginTop: 8 }}>신청 · 변경은 본사에서 처리해요. 매장에서는 상태만 확인할 수 있어요.</p>
      </div>
      <div className="card hm-o4">
        <div className="hm-h"><h2 className="b">고객 앱 · 알림</h2><span className="sp" /><span className="sm">문자 대신 앱으로</span></div>
        <div className="hm-app3">
          <div className="hm-mini"><p className="lbl">앱 연결 고객</p><p className="big">{linked}<small>명</small></p></div>
          <div className="hm-mini"><p className="lbl">이번 달 발송</p><p className="big">{sum?.app.sent ?? 0}<small>건</small></p></div>
          <div className="hm-mini"><p className="lbl">열람률</p><p className="big">{readRate ?? "-"}<small>{readRate != null ? "%" : ""}</small></p></div>
        </div>
        <p className="sm" style={{ marginTop: 8 }}>예약 확정 · 하루 전 리마인드 · 시술 다이어리 · 재방문 안내를 <b>앱 알림</b>으로 보내요. 문자 대체 발송 · 카카오 알림톡은 준비 중이에요.</p>
      </div>
    </div>
  );
}

const MENU: { id: string; label: string; hint: string; href?: string }[] = [
  { id: "info", label: "매장 정보", hint: "이름 · 주소 · 전화" },
  { id: "hours", label: "영업시간", hint: "요일별 시간 · 휴무" },
  { id: "schedule", label: "매장 일정", hint: "일정 · 휴무 · 당직" },
  { id: "menu", label: "시술메뉴", hint: "종류 · 가격", href: "/desk/settings/menus" },
  { id: "members", label: "구성원 · 권한", hint: "초대 · 역할", href: "/desk/members" },
  { id: "db", label: "고객 DB", hint: "올리기 · 내려받기" },
  { id: "ai", label: "AI 보정본", hint: "시술 사진" },
  { id: "perm", label: "설정 권한", hint: "누가 설정을 바꾸나" },
  { id: "naver", label: "네이버 · 연동", hint: "플레이스 연결" },
  { id: "connect", label: "정식 연결", hint: "아직 연결 전인 기능" },
];

export default function Settings({ shopId, shopName, shopType, shopStatus, industries, isOwner, admins, canPerm, info, hours, holidays, naver, members, events, offs }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<"down" | "up" | null>(null);
  const [importing, setImporting] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const id = window.location.hash.slice(1);
      setPanel(MENU.some((item) => item.id === id && !item.href) ? id : null);
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);

  function openPanel(id: string) {
    window.history.pushState(null, "", `#${id}`);
    setPanel(id);
  }
  function closePanel() {
    window.history.pushState(null, "", window.location.pathname);
    setPanel(null);
  }

  const csvOf = (rows: (string | number)[][]) => "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const save = (csv: string, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };

  async function download() {
    setBusy("down"); setMsg(null);
    const { data, error } = await supabase.rpc("export_customers", { p_shop: shopId });
    setBusy(null);
    if (error) { setMsg({ kind: "err", text: error.message }); return; }
    const rows = (data ?? []) as { name: string; phone: string | null; designer: string | null; visit_count: number; last_visit_at: string | null; points: number; prepaid_balance: number; memo: string | null; created_at: string }[];
    const d = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
    save(csvOf([HEAD, ...rows.map((r) => [r.name, r.phone ?? "", r.designer ?? "", r.visit_count, d(r.last_visit_at), r.points, r.prepaid_balance, r.memo ?? "", d(r.created_at)])]),
      `SALONAI_고객DB_${shopName}_${new Date().toISOString().slice(0, 10)}.csv`);
    setMsg({ kind: "ok", text: `고객 ${rows.length.toLocaleString()}명을 엑셀(CSV) 파일로 내려받았어요.` });
  }

  return (
    <div className="st-page">
      <div>
        <p className="crumb">설정 · {isOwner ? "원장(마스터)" : "설정 권한을 받은 구성원"}</p>
        <h1 className="h1">설정</h1>
      </div>
      {msg && <p className={`msg ${msg.kind}`} role="status">{msg.text}</p>}

      {panel ? (
        <button type="button" className="set-back" onClick={closePanel}>← 설정</button>
      ) : (
        <>
        <StoreAccount shopId={shopId} />
        <nav className="set-menu" aria-label="설정 항목">
          {MENU.map((item) => item.href ? (
            <Link key={item.id} href={item.href}><b>{item.label}</b><span className="sm">{item.hint}</span><span className="go" aria-hidden>→</span></Link>
          ) : (
            <button key={item.id} type="button" onClick={() => openPanel(item.id)}><b>{item.label}</b><span className="sm">{item.hint}</span><span className="go" aria-hidden>→</span></button>
          ))}
        </nav>
        </>
      )}

      {panel && <div className="st-grid st-one">
        {panel === "info" && <ShopInfo supabase={supabase} shopId={shopId} data={info} canEdit={isOwner}>
          <div><dt>형태</dt><dd>{TYPE_LABEL[shopType] ?? shopType} · {industries.map((i) => IND_LABEL[i] ?? i).join(" · ")}</dd></div>
          <div><dt>상태</dt><dd><span className={`pill ${shopStatus === "active" ? "p-teal" : "p-gray"}`}>{STATUS_LABEL[shopStatus] ?? shopStatus}</span></dd></div>
        </ShopInfo>}

        {panel === "hours" && <HoursEditor supabase={supabase} shopId={shopId} initial={hours} holidays={holidays} />}

        {panel === "schedule" && <ScheduleEditor supabase={supabase} shopId={shopId} members={members} events={events} offs={offs} />}

        {panel === "db" && <section className="card st-card st-db" id="db">
          <h2 className="st-h">고객 DB</h2>
          <p className="sm">다른 프로그램에서 쓰던 고객 명단을 올리거나, 지금 고객 명단을 엑셀 파일로 받아요. 전화번호가 같은 고객은 새로 만들지 않고 정보만 갱신해요.</p>
          <div className="st-acts">
            <button type="button" className="btn pri" disabled={busy != null} onClick={download}>{busy === "down" ? "준비 중…" : "↓ 고객 DB 다운로드"}</button>
            <button type="button" className="btn" disabled={busy != null} onClick={() => setImporting(true)}>↑ 고객 DB 업로드 · 이전</button>
            <button type="button" className="btn ghost" onClick={() => save(csvOf([["이름", "휴대폰", "담당 디자이너", "메모"], ["홍길동", "010-1234-5678", "", "두피 민감"]]), "SALONAI_고객DB_양식.csv")}>양식 받기</button>
          </div>
          <p className="sm st-hint">쓰던 프로그램의 엑셀(.xlsx) · CSV 파일을 그대로 올리면 <b>칸 연결 → 검증(오류 행 · 번호 중복 · 동의 근거) → 이전</b> 순서로 진행해요. 최근 방문 · 방문 횟수 · 마케팅 수신 동의도 가져와요.</p>

          {importing && <CustomerImport supabase={supabase} shopId={shopId} onClose={() => setImporting(false)} onDone={(t) => setMsg({ kind: "ok", text: t })} />}
        </section>}

        {panel === "ai" && <Showcase supabase={supabase} shopId={shopId} />}

        {panel === "perm" && <section className="card st-card" id="perm">
          <h2 className="st-h">설정 권한</h2>
          <p className="sm">설정 화면은 기본적으로 <b>원장님(마스터)만</b> 열 수 있어요. 원장님이 구성원 · 권한 표의 <b>‘설정’</b> 칸을 켜주면 그 구성원도 설정을 바꿀 수 있어요.</p>
          <ul className="st-admins">
            {admins.map((a) => <li key={a.id}><b>{a.name}</b><span className="sm">{a.title}</span><span className={`pill ${a.owner ? "p-teal" : "p-gray"}`}>{a.owner ? "원장 · 마스터" : "설정 권한"}</span></li>)}
          </ul>
          {canPerm && <Link href="/desk/members" className="btn">설정 권한 주기 · 빼기</Link>}
        </section>}

        {panel === "naver" && <NaverPlace supabase={supabase} shopId={shopId} initial={naver} canEdit={isOwner} />}

        {panel === "connect" && <section className="card st-card st-soon" id="connect">
          <h2 className="st-h">정식 버전에서 연결할 기능 <span className="pill soon">테스트 버전</span></h2>
          <p className="sm">테스트 버전이라 임시로 넣어두고 실제로 연결하지 않은 기능이에요. 정식 오픈 전에 하나씩 연결하거나 정리해요. 새로 임시 처리한 기능이 생기면 여기에 계속 추가돼요.</p>
          <h3 className="st-sub">외부 서비스 연결 <b>{CONNECT.length}</b></h3>
          <ul>{CONNECT.map((s) => (
            <li key={s.t}><b>{s.t}</b><span className="sm st-where">{s.where}</span><span className="sm"><i>지금</i> {s.now}</span><span className="sm"><i className="lt">정식</i> {s.later}</span></li>
          ))}</ul>
          <h3 className="st-sub">오픈 전 정리할 테스트용 기능 · 데이터 <b>{TEMP.length}</b></h3>
          <ul className="tmp">{TEMP.map((s) => (
            <li key={s.t}><b>{s.t}</b><span className="sm st-where">{s.where}</span><span className="sm"><i>지금</i> {s.now}</span><span className="sm"><i className="lt">정식</i> {s.later}</span></li>
          ))}</ul>
        </section>}
      </div>}
    </div>
  );
}
