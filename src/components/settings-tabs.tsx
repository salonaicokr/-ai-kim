"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./settings-tabs.css";

/**
 * 설정 상단 탭 (S-09 보완): 항상 위에 붙어 있고, 아래로 내려가 있어도 누르면 그 구역으로 바로 이동.
 * 시술메뉴 · 구성원은 별도 화면이라 그 화면에서도 같은 탭을 보여줘요.
 */
const TABS: { id: string; label: string; page?: string }[] = [
  { id: "info", label: "매장 정보" }, { id: "hours", label: "영업시간" }, { id: "schedule", label: "매장 일정" },
  { id: "menu", label: "시술메뉴", page: "/desk/settings/menus" }, { id: "members", label: "구성원 · 권한", page: "/desk/members" },
  { id: "db", label: "고객DB" }, { id: "ai", label: "AI 보정본" }, { id: "naver", label: "네이버 · 연동" },
];
const SECTIONS = TABS.filter((t) => !t.page).map((t) => t.id);

export default function SettingsTabs({ current }: { current?: "menu" | "members" }) {
  const onSettings = !current;
  const [active, setActive] = useState<string>(current ?? "info");
  const nav = useRef<HTMLElement>(null);
  // 휴대폰: 지금 탭이 가로 목록 안에 보이게
  useEffect(() => {
    const n = nav.current, on = n?.querySelector<HTMLElement>("a.on");
    if (n && on) n.scrollTo({ left: on.offsetLeft - n.clientWidth / 2 + on.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  useEffect(() => {
    if (!onSettings) return;
    // 주소에 #구역 이 있으면 그 구역으로 (화면이 늦게 그려져도)
    const h = window.location.hash.slice(1);
    if (SECTIONS.includes(h)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(h);
      requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView({ block: "start" }));
    }
    // 스크롤 위치에 맞춰 지금 보고 있는 구역을 표시
    const onScroll = () => {
      let cur = SECTIONS[0];
      for (const id of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) cur = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1];
      setActive(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onSettings]);

  function go(e: React.MouseEvent, id: string) {
    const el = document.getElementById(id);
    if (!el) return; // 다른 화면이면 링크 그대로 이동
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    setActive(id);
  }

  return (
    <nav ref={nav} className="set-tabs" aria-label="설정 항목">
      {TABS.map((t) => {
        const on = active === t.id;
        const cls = on ? "on" : undefined;
        if (t.page) return <Link key={t.id} href={t.page} className={cls} aria-current={on ? "page" : undefined}>{t.label}</Link>;
        return onSettings
          ? <a key={t.id} href={`#${t.id}`} className={cls} aria-current={on ? "true" : undefined} onClick={(e) => go(e, t.id)}>{t.label}</a>
          : <Link key={t.id} href={`/desk/settings#${t.id}`} className={cls}>{t.label}</Link>;
      })}
    </nav>
  );
}
