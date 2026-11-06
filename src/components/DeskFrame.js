"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Sidebar } from "@/src/components/Sidebar";
import { DeskPanel, DeskShopSwitch, GraceAlert } from "@/src/components/DeskExtras";
import { supabase } from "@/src/lib/browser";
import { loadDesk } from "@/src/lib/owner";
import { hqState } from "@/src/lib/supabase/hq-backend";

const DeskContext = createContext(null);

export function useDesk() {
  return useContext(DeskContext);
}

function NoticeBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState(null);
  const [seen, setSeen] = useState("");
  const wrap = useRef(null);

  useEffect(() => {
    let alive = true;
    setSeen(window.localStorage.getItem("salonai.noticeSeen") || "");
    supabase.from("hq_notices").select("id, no, title, body, important, published_at").order("important", { ascending: false }).order("published_at", { ascending: false }).limit(30)
      .then(({ data }) => { if (alive) setRows(data ?? []); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open || !rows) return;
    const newest = rows.reduce((m, r) => (r.published_at > m ? r.published_at : m), "");
    if (newest) {
      window.localStorage.setItem("salonai.noticeSeen", newest);
      setSeen(newest);
    }
    function onDoc(e) { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, rows]);

  const unread = (rows ?? []).some((r) => r.published_at > seen);
  const day = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));

  return (
    <div className="profile-wrap" ref={wrap}>
      <button className="icon-btn" type="button" aria-label="알림" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16h12l-1.2-2.1V10a4.8 4.8 0 0 0-9.6 0v3.9L6 16z" /><path d="M10 16a2 2 0 0 0 4 0" /></svg>
        {unread ? <span className="notice-dot" /> : null}
      </button>
      {open ? (
        <div className="profile-panel notice-panel" role="dialog" aria-label="본사 공지와 알림">
          <div className="notice-head">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h2.6L14 6v12l-7.4-4H4z" /><path d="M7.2 14.4v2.3a1.6 1.6 0 0 0 1.3 1.6l1.8.4" /><path d="M16.4 9a3.6 3.6 0 0 1 0 6" /><path d="M18.2 7a6.2 6.2 0 0 1 0 10" /></svg>
            <h2>본사 공지</h2>
          </div>
          {rows === null ? <p className="sm">불러오는 중이에요.</p> : rows.length === 0 ? <p className="sm">새 공지가 없어요.</p> : (
            <ul className="notice-list">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" className={picked === r.id ? "on" : ""} onClick={() => setPicked((id) => (id === r.id ? null : r.id))}>
                    <b>{r.important ? "[중요] " : ""}{r.title}</b>
                    <span>{day(r.published_at)}</span>
                  </button>
                  {picked === r.id ? <p>{r.body || "내용 없음"}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <div className="notice-split" />
          <h2>알림</h2>
          <p className="sm">새 알림이 없어요.</p>
        </div>
      ) : null}
    </div>
  );
}

export function DeskFrame({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState({ loading: true });

  async function refresh(userId) {
    const sessionUser = userId ?? state.user?.id;
    if (!sessionUser) return;
    const loaded = await loadDesk(supabase, sessionUser);
    setState({ loading: false, user: state.user ?? { id: sessionUser }, ...loaded });
  }

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!alive) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const loaded = await loadDesk(supabase, user.id);
        if (!alive) return;
        if (!loaded.store) {
          router.replace("/signup");
          return;
        }
        // 본사에서 정지한 매장은 안내 화면만 보여요
        if (hqState().shops[loaded.store.id]?.status === "suspended") {
          router.replace("/suspended");
          return;
        }
        setState({ loading: false, user, ...loaded });
      } catch (error) {
        if (alive) setState({ loading: false, error: error.message });
      }
    });
    return () => {
      alive = false;
    };
  }, [router]);

  if (state.loading) {
    return <div className="desk-main loading">매장 정보를 불러오는 중입니다.</div>;
  }
  if (state.error) {
    return <div className="desk-main"><p className="error">{state.error}</p></div>;
  }

  const pending = state.store.status !== "approved";
  return (
    <DeskContext.Provider value={{ ...state, refresh: () => refresh(state.user.id) }}>
      <div className={pending ? "desk" : "desk with-panel"}>
        <Sidebar />
        <div className="desk-main">
          <div className="topbar">
            <div className="top-copy">
              <div className="brand-logo" role="img" aria-label={`${state.store.name}. SALONAI`}>
              </div>
            </div>
            <div className="top-actions">
              <span className={pending ? "status" : "status live"}>{pending ? "관리자 확인 중" : "운영 중"}</span>
              <button className="icon-btn" type="button" aria-label="프로필">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M5.5 19.2c1.1-2.4 3.3-3.6 6.5-3.6s5.4 1.2 6.5 3.6" /></svg>
              </button>
              <NoticeBell />
              <button className="icon-btn" type="button" aria-label="QR 코드 스캔">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.2v2.2H14zM17.8 14H20v2.2h-2.2zM14 17.8h2.2V20H14zM17.8 17.8H20V20h-2.2z" /></svg>
              </button>
            </div>
          </div>
          <DeskShopSwitch stores={state.stores} current={state.store.id} />
          <GraceAlert store={state.store} />
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </div>
        {pending ? null : <DeskPanel store={state.store} />}
      </div>
    </DeskContext.Provider>
  );
}
