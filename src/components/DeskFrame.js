"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/src/components/Sidebar";
import { supabase } from "@/src/lib/browser";
import { categoryLabel, formLabel } from "@/src/lib/format";
import { loadDesk } from "@/src/lib/owner";

const DeskContext = createContext(null);

export function useDesk() {
  return useContext(DeskContext);
}

export function DeskFrame({ children }) {
  const router = useRouter();
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
      <div className="desk">
        <Sidebar />
        <div className="desk-main">
          <div className="topbar">
            <div className="top-copy">
              <h1>{state.store.name}</h1>
              <p>{formLabel[state.store.form]} · {categoryLabel[state.store.category]}</p>
            </div>
            <div className="top-actions">
              <span className={pending ? "status" : "status live"}>{pending ? "관리자 확인 중" : "운영 중"}</span>
              <span className="avatar" aria-hidden="true">{(state.store.representative || state.store.name || "원").trim().slice(0, 1)}</span>
            </div>
          </div>
          {children}
        </div>
      </div>
    </DeskContext.Provider>
  );
}
