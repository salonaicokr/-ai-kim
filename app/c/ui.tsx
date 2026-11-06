"use client";
// @ts-nocheck

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/src/lib/customer/api";

export type Profile = {
  user_id: string; name: string | null; phone: string | null; nickname: string | null; login_id: string | null; email: string | null;
  address: string | null; avatar_path: string | null; style_prefs: string[]; terms_agreed_at: string | null;
  location_agree: boolean; marketing_agree: boolean; night_push_agree: boolean | null;
  msg_booking: boolean; msg_aftercare: boolean; msg_revisit: boolean; msg_all_off: boolean; created_at: string;
};

/** 로그인 확인 + 내 프로필 불러오기. 로그인 안 했으면 /c/login, 가입 정보가 없으면 /c/signup 으로 보내요. */
export function useGuard() {
  const router = useRouter();
  const path = usePathname();
  const [st, setSt] = useState<{ ready: boolean; uid: string | null; profile: Profile | null }>({ ready: false, uid: null, profile: null });
  const load = useCallback(async () => {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) { router.replace(`/c/login?next=${encodeURIComponent(path + window.location.search)}`); return; }
    const { data: p } = await sb.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (!p?.terms_agreed_at) { router.replace("/c/signup?step=2"); return; }
    setSt({ ready: true, uid: user.id, profile: p as Profile });
  }, [router, path]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { ...st, reload: load };
}

export function Top({ back, title, right }: { back?: string | true | (() => void); title?: string; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="ctop">
      {back ? <button type="button" className="cback" aria-label="뒤로" onClick={() => (typeof back === "function" ? back() : back === true ? router.back() : router.push(back))}>‹</button> : <span style={{ width: 44 }} />}
      <b className="ctop-t">{title ?? ""}</b>
      <span style={{ minWidth: 44, display: "flex", justifyContent: "flex-end" }}>{right}</span>
    </div>
  );
}

const ICON = {
  home: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />,
  book: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  diary: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  ai: <><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  my: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
};
export function TabBar() {
  const path = usePathname();
  const tabs = [["/c/home", "홈", "home"], ["/c/book", "예약", "book"], ["/c/diary", "다이어리", "diary"], ["/c/analysis", "분석", "chart"], ["/c/ai", "AI 상담", "ai"], ["/c/my", "계정", "my"]] as const;
  return (
    <nav className="ctab" aria-label="고객 앱 메뉴">
      {tabs.map(([href, label, ic]) => (
        <Link key={href} href={href} className={path.startsWith(href) ? "on" : ""} aria-current={path.startsWith(href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[ic]}</svg>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function Loading({ text = "불러오는 중…" }: { text?: string }) {
  return <p className="cmt" role="status" style={{ padding: "24px 0", textAlign: "center" }}>{text}</p>;
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`ctoggle${on ? " on" : ""}`} onClick={() => onChange(!on)}><i /></button>;
}

export function Pill({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`cpill ${tone}`}>{children}</span>;
}

export function Page({ children, tabbed = true }: { children: React.ReactNode; tabbed?: boolean }) {
  return <><main className={`cpage${tabbed ? " tabbed" : ""}`}>{children}</main>{tabbed && <TabBar />}</>;
}

/** 새 알림이 들어오면(앱이 열려 있는 동안) 바로 알려줘요. 브라우저 알림 허용 시 시스템 알림도 띄워요. */
export function useNotifWatch(uid: string | null, onNew: (n: any) => void) {
  useEffect(() => {
    if (!uid) return;
    const ch = sb.channel(`cn-${uid}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "customer_notifications", filter: `user_id=eq.${uid}` }, (p) => {
      const n = p.new as any;
      try { if (typeof Notification !== "undefined" && Notification.permission === "granted" && localStorage.getItem("c.push") !== "off") new Notification(n.title, { body: n.body ?? "" }); } catch { /* 알림 불가 환경 */ }
      onNew(n);
    }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 서명 주소가 필요한 사진 한 장 */
export function SignedImg({ bucket = "treatment-photos", path, className = "cphoto", alt = "", onClick, style }: { bucket?: string; path: string | null; className?: string; alt?: string; onClick?: () => void; style?: React.CSSProperties }) {
  const [url, setUrl] = useState<string | null>(path && path.startsWith("/") ? path : null);
  useEffect(() => {
    if (!path || path.startsWith("/")) { setUrl(path); return; }
    let alive = true;
    sb.storage.from(bucket).createSignedUrl(path, 3600).then(({ data }) => { if (alive) setUrl(data?.signedUrl ?? null); });
    return () => { alive = false; };
  }, [bucket, path]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className={className} style={style} onClick={onClick} /> : <div className={className} style={{ ...style, background: "#DDE1E8" }} aria-hidden />;
}
