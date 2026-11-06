"use client";
// @ts-nocheck

import { useState } from "react";
import Link from "next/link";
import { getShopContext } from "@/src/lib/session";
import { asyncComp } from "@/src/lib/compat";
import { BOOKING_SELECT, normalize } from "../calendar/lib";
import BrandOverview from "./brand";
import "./dashboard.css";



/** 오늘 0시~내일 0시 (한국 시간) */
function todayRangeKST() {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const start = new Date(`${ymd}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { ymd, start: start.toISOString(), end: end.toISOString() };
}

async function DashboardImpl() {
  const { supabase, shop, member, perms, brand } = await getShopContext();
  const view = new URLSearchParams(window.location.search).get("view");
  // 다매장 대표만 통합 보기 (지점장 · 구성원은 ?view=all 을 붙여도 자기 지점 화면)
  if (view === "all" && brand && member.role === "owner") return <BrandOverview supabase={supabase} brand={brand} today={todayRangeKST()} />;
  if (shop.status === "pending") return <PendingStart />;
  const { ymd, start, end } = todayRangeKST();
  // 이용료 · 부가서비스는 원장 · 설정 권한자만 (Jina님 결정 11/6)
  const isAdmin = member.role === "owner" || perms.settings === "all";

  const [bookings, members, menus, naverRow] = await Promise.all([
    supabase.from("bookings").select(BOOKING_SELECT).eq("shop_id", shop.id).gte("start_at", start).lt("start_at", end).order("start_at"),
    supabase.from("shop_members").select("id, user_id, display_name, title, role, status, is_designer, sort_order").eq("shop_id", shop.id).neq("status", "left").order("sort_order"),
    supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("shop_id", shop.id),
    supabase.from("shops").select("naver_status").eq("id", shop.id).maybeSingle(),
  ]);

  const rows = normalize(bookings.data ?? []);
  const live = rows.filter((b) => b.status !== "blocked" && !b.status.startsWith("cancelled") && b.status !== "no_show");
  const requested = live.filter((b) => b.status === "requested").length;
  const mems = members.data ?? [];
  const invited = mems.filter((m) => m.status === "invited");
  const caution = live.filter((b) => b.survey?.status === "answered" && b.survey.flags.some((f) => f.level === "safety")).length;
  const setupLeft = (menus.count ?? 0) === 0 || mems.length <= 1;
  const showNaver = isAdmin && ["none", "skipped"].includes((naverRow.data?.naver_status as string | undefined) ?? "none");

  return (
    <>
      {showNaver && <NaverBanner />}
      <div>
        <p className="crumb">{ymd} · {shop.name}</p>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <h1 className="h1">오늘 매장 현황</h1>
          <span className="sp" />
          {requested > 0 && <Link href="/desk/bookings" className="rk rk-c hm-chip">승인 대기 {requested}</Link>}
          {caution > 0 && <span className="rk rk-s">시술 전 확인 {caution}명</span>}
        </div>
        <div className="row hm-sub" style={{ flexWrap: "wrap", gap: 8 }}>
          <p className="sm">안녕하세요, {member.display_name} {member.title}님</p>
          <span className="sp" />
          <Link className="btn sm-btn" href="/desk/bookings?new=block">외부 예약 입력</Link>
          <Link className="btn pri sm-btn" href="/desk/bookings?new=walkin">현장 등록</Link>
        </div>
        {(invited.length > 0 || setupLeft) && (
          <p className="hm-note sm">
            {invited.length > 0 && <>초대 수락 대기 <b>{invited.map((m) => m.display_name).join(", ")}</b> <Link href="/desk/members">관리 →</Link></>}
            {invited.length > 0 && setupLeft && <span aria-hidden> · </span>}
            {setupLeft && <>시작하기: {(menus.count ?? 0) === 0 && <Link href="/desk/settings/menus">시술 메뉴 등록 →</Link>} {mems.length <= 1 && <Link href="/desk/members">디자이너 초대 →</Link>}</>}
          </p>
        )}
      </div>

      {isAdmin && <p className="sm hm-biz hm-o5">사업자 정보 · 영업시간 · 시술 메뉴는 <b>설정</b>에서 바꿔요 <Link href="/desk/settings">바로 가기 →</Link></p>}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="skel" style={{ minHeight: 56 }} />
      <div className="grid g4">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" />)}</div>
      <div className="grid g2"><div className="skel" style={{ minHeight: 200 }} /><div className="skel" style={{ minHeight: 200 }} /></div>
    </>
  );
}

/** S4 가입 신청 접수 · 승인 대기 · 시작 준비 */
async function PendingStartImpl() {
  const { supabase, shop, member, user } = await getShopContext();
  // '승인된 것처럼 보기'는 테스트 계정 + 테스트 기능이 켜진 배포에서만 (정식 오픈 때 SALONAI_TEST_FEATURES=off)
  const isTest = false;
  const demoApprove = undefined;
  const [info, menus, members, hours] = await Promise.all([
    supabase.from("shops").select("shop_type, industries, biz_doc_path, license_doc_path, address, created_at, naver_status").eq("id", shop.id).maybeSingle(),
    supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("shop_id", shop.id),
    supabase.from("shop_members").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).neq("status", "left"),
    supabase.from("shop_business_hours").select("weekday", { count: "exact", head: true }).eq("shop_id", shop.id),
  ]);
  const s = info.data;
  const solo = s?.shop_type === "solo";
  const industry = s?.industries?.[0] === "nail" ? "네일" : "헤어";
  const docs = [
    { label: "사업자등록증", done: !!s?.biz_doc_path },
    { label: industry === "네일" ? "영업신고증 · 자격증" : "영업신고증 · 미용사 면허", done: !!s?.license_doc_path },
  ];
  const docsDone = docs.every((d) => d.done);
  // ② 승인까지 남은 절차
  const steps = [
    { t: "가입 신청 접수", d: s?.created_at ? new Date(s.created_at).toLocaleDateString("ko-KR") : "", done: true },
    { t: "제출 서류 확인", d: docsDone ? "운영팀이 확인하고 있어요" : "서류가 모두 있어야 확인할 수 있어요", done: false, now: true },
    { t: "승인 · 운영 시작", d: `${member.display_name}님 휴대폰으로 알려드려요`, done: false },
  ];
  // 승인 대기 중에도 지금 할 수 있는 것 (실제로 들어갈 수 있음)
  const prep = [
    { t: "매장 정보", d: s?.address ? "주소 · 연락처 입력됨" : "주소 · 연락처를 입력해요", done: !!s?.address, href: "/desk/settings#info" },
    { t: "네이버 플레이스 연결", d: ["entered", "verified"].includes(s?.naver_status ?? "") ? "플레이스 주소 입력됨" : "네이버 예약을 받으려면 꼭 필요해요", done: ["entered", "verified"].includes(s?.naver_status ?? ""), href: "/desk/settings#naver" },
    { t: "영업시간", d: (hours.count ?? 0) > 0 ? "요일별 영업시간 저장됨" : "요일별 영업시간 · 휴무를 정해요", done: (hours.count ?? 0) > 0, href: "/desk/settings#hours" },
    { t: "시술 메뉴 · 가격", d: `기본 메뉴 ${menus.count ?? 0}개 준비됨 · 가격만 확인`, done: (menus.count ?? 0) > 0, href: "/desk/settings/menus" },
    ...(solo ? [] : [{ t: "디자이너 초대", d: (members.count ?? 0) > 1 ? "초대한 구성원이 있어요" : "초대 링크를 보내요", done: (members.count ?? 0) > 1, href: "/desk/members" }]),
  ];
  // ③ 승인되면 열리는 기능
  const unlock = ["고객 앱 · 네이버에서 예약 받기", "예약 확정 · 리마인드 알림 발송", "결제 · 매출 정산", "고객 앱 시술 다이어리 전송", "AI 보정 시술 사진 게시"];
  return (
    <>
      <div>
        <p className="crumb">가입 완료 · 승인 대기 · {shop.name} · {solo ? "1인샵" : s?.shop_type === "multi" ? "다매장" : "매장"} · {industry}</p>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <h1 className="h1">승인까지 이것만 확인해 주세요</h1>
          <span className="pill p-amb">● 관리자 확인 중</span>
          <span className="sp" />
        </div>
      </div>

      <section className="pd-grid">
        <div className="card pd-card">
          <h2 className="b">① 제출 서류</h2>
          <ul className="pd-check">
            {docs.map((d) => <li key={d.label} className={d.done ? "done" : "todo"}><span className="ck" aria-hidden>{d.done ? "✓" : "!"}</span><b>{d.label}</b><span className="sp" /><span className={`pill ${d.done ? "p-teal" : "p-amb"}`}>{d.done ? "제출됨" : "필요"}</span></li>)}
          </ul>
          {!docsDone && <p className="sm">가입 때 올리지 못한 서류는 운영팀이 연락드려 받아요.</p>}
        </div>
        <div className="card pd-card">
          <h2 className="b">② 승인까지 남은 절차</h2>
          <ol className="pd-steps">
            {steps.map((x, i) => <li key={x.t} className={x.done ? "done" : x.now ? "now" : ""}><span className="n">{x.done ? "✓" : i + 1}</span><span><b>{x.t}</b><span className="sm">{x.d}</span></span></li>)}
          </ol>
        </div>
        <div className="card pd-card">
          <h2 className="b">③ 승인되면 열리는 기능</h2>
          <ul className="pd-unlock">{unlock.map((u) => <li key={u}><span aria-hidden>🔒</span>{u}</li>)}</ul>
        </div>
      </section>

      <section className="card">
        <div className="row"><h2 className="b">기다리는 동안 미리 해 두세요</h2><span className="sp" /><b style={{ color: "var(--c-primary)" }}>{prep.filter((p) => p.done).length} / {prep.length}</b></div>
        <ul className="pd-prep">
          {prep.map((p) => (
            <li key={p.t}><a href={p.href}><span className={`ck${p.done ? " on" : ""}`} aria-hidden>{p.done ? "✓" : ""}</span><span><b>{p.t}</b><span className="sm">{p.d}</span></span><span className="go" aria-hidden>→</span></a></li>
          ))}
        </ul>
        {s?.shop_type === "multi" && <p className="sm" style={{ marginTop: 8 }}>다른 지점도 위의 <b>지점</b> 옆 <b>+ 지점 추가</b>로 등록할 수 있어요.</p>}
      </section>

      {isTest && (
        <form action={demoApprove} className="pd-demo">
          <input type="hidden" name="shop" value={shop.id} />
          <span className="sm">테스트 계정 전용</span>
          <button className="pd-demo-link" type="submit">승인된 것처럼 보기</button>
        </form>
      )}
    </>
  );
}

const NAVER_BANNER_KEY = "salonai.naverBanner";

/** 매장 홈을 열 때 위의 배너. 닫으면 이 브라우저를 닫기 전까지 다시 안 나와요. */
function NaverBanner() {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(NAVER_BANNER_KEY) !== "off"; } catch { return true; }
  });
  if (!open) return null;
  return (
    <div className="hm-naver-banner" role="region" aria-label="네이버 플레이스 연결">
      <Link href="/desk/settings#naver" className="hm-naver">
        <span className="hm-naver-n" aria-hidden>N</span>
        <span><b>네이버 플레이스를 연결해 주세요</b><span className="sm">연결하면 네이버 예약이 캘린더에 자동으로 들어와요 (네이버 연동 준비 중)</span></span>
        <span className="go" aria-hidden>연결하기 →</span>
      </Link>
      <button
        type="button"
        className="hm-naver-x"
        aria-label="닫기"
        onClick={() => {
          try { sessionStorage.setItem(NAVER_BANNER_KEY, "off"); } catch { /* 저장 불가 */ }
          setOpen(false);
        }}
      >×</button>
    </div>
  );
}

const PendingStart = asyncComp(PendingStartImpl, <DashboardSkeleton />);
const Dashboard = asyncComp(DashboardImpl, <DashboardSkeleton />);

/** 매장 홈 (SALONAI 홈): 오늘 운영 · 이용료 · 부가서비스 · 고객 앱 알림 · 공지 · 이탈 위기 */
export default function StoreHome() {
  return <Dashboard />;
}
