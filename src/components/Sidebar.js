"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { supabase } from "@/src/lib/browser";

const items = [
  ["매장 홈", "/desk", "M4 11l8-6 8 6M6 10v9h12v-9M10 19v-5h4v5"],
  ["예약", "/desk/bookings", "M5 5h14v14H5zM8 3v4M16 3v4M5 9h14"],
  ["고객", "/desk/customers", "M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 19c1.2-2 3-3 6-3s4.8 1 6 3"],
  ["매출", "/desk/payments", "M4 7h16v10H4zM4 11h16"],
  ["구성원", "/desk/members", "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M16 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M3 19c.8-2 2.4-3 5-3s4.2 1 5 3M14 19c.4-1.2 1.4-2 3-2 1.2 0 2 .4 2.6 1.2"],
  ["설정", "/desk/settings", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 3v2M12 19v2M3 12h2M19 12h2"],
];

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        SALONAI
        <span className="brand-sub">매장 · 디자이너</span>
      </div>
      <nav>
        {items.map(([label, href, d]) => {
          const on = href === "/desk"
            ? pathname === "/desk"
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={on ? "nav-item on" : "nav-item"}>
              {on ? <motion.span className="nav-glow" layoutId="nav-glow" transition={{ type: "spring", stiffness: 380, damping: 34 }} /> : null}
              <Icon d={d} />
              <span className="nav-copy">
                <b>{label}</b>
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="grow" />
      <button className="quiet" type="button" onClick={signOut}>
        <span>로그아웃</span>
      </button>
    </aside>
  );
}
