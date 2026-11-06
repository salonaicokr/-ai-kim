"use client";
// @ts-nocheck

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import type { HqCan, HqMe } from "@/src/lib/ops";

export const ROLE_LABEL: Record<HqMe["role"], string> = { hq_master: "마스터", hq_finance: "재무", hq_cs: "CS", hq_sales: "영업관리" };

/** 역할마다 보이는 메뉴 (조회는 모두 가능하지만, 할 일이 없는 메뉴는 숨김) */
const ITEMS: { href: string; label: string; show?: (c: HqCan) => boolean }[] = [
  { href: "/hq/dashboard", label: "대시보드" },
  { href: "/hq/stores", label: "매장" },
  { href: "/hq/sales/orgs", label: "영업조직" },
  { href: "/hq/sales/reps", label: "영업사원" },
  { href: "/hq/settlement", label: "정산", show: (c) => c.settle },
  { href: "/hq/notices", label: "공지", show: (c) => c.store },
  { href: "/hq/settings", label: "요금 · 정책", show: (c) => c.billing || c.admin || c.settle },
  { href: "/hq/admins", label: "운영 계정", show: (c) => c.admin },
];

export default function OpsNav({ email, me }: { email: string; me: HqMe }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <header className="ops-nav">
      <b className="ops-mark">SALONAI <span>운영</span></b>
      <nav aria-label="운영 메뉴">
        {ITEMS.filter((i) => !i.show || i.show(me.can)).map((i) => (
          <Link key={i.href} href={i.href} className={`ops-link${path.startsWith(i.href) ? " on" : ""}`} aria-current={path.startsWith(i.href) ? "page" : undefined}>{i.label}</Link>
        ))}
      </nav>
      <span className="sp" />
      <span className="sm ops-who">{me.guest ? <><span className="pill bl-grace">테스트</span> 로그인 없이 보는 중 · 마스터</> : <>{email} · {ROLE_LABEL[me.role]}</>}</span>
      <button className="btn ghost sm-btn" type="button" onClick={async () => { await createOpsBrowserClient().auth.signOut(); router.replace("/hq"); }}>로그아웃</button>
    </header>
  );
}
