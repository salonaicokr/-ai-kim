// @ts-nocheck
"use client";
// @ts-nocheck

import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient as createShopClient } from "./client";
import { hqRpc } from "./hq-backend";
import { kv } from "./local-db";

/**
 * 본사(/hq) 전용 클라이언트. 본사 로그인은 아직 연결되지 않았고,
 * 테스트 기간 입장(익명 → 마스터)만 이 브라우저에서 동작해요.
 */
export function createOpsBrowserClient() {
  const shop = createShopClient();
  return {
    from: shop.from,
    rpc(name: string, args: Record<string, unknown> = {}) {
      const run = hqRpc(name, args);
      return { then: (resolve: (v: any) => any, reject?: (r: any) => any) => run.then(resolve, reject) };
    },
    auth: {
      async getUser() { const s = kv.get("hq.session", null); return { data: { user: s ? { id: "hq-guest", email: s.email ?? null } : null }, error: null }; },
      // 실제 계정으로 확인(클라우드 Supabase Auth) 후 hq_admins 에 등록된 관리자만 입장. 매장 로그인 세션은 건드리지 않아요.
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const fail = { data: { user: null }, error: { message: "login failed" } };
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return fail;
        const probe = createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        const { data, error } = await probe.auth.signInWithPassword({ email, password });
        if (error || !data?.user) return fail;
        const { data: row } = await probe.from("hq_admins").select("role").eq("user_id", data.user.id).is("removed_at", null).maybeSingle();
        await probe.auth.signOut().catch(() => {});
        if (!row) return fail;
        kv.set("hq.session", { guest: false, email: data.user.email ?? email, role: row.role, at: new Date().toISOString() });
        return { data: { user: { id: data.user.id, email: data.user.email } }, error: null };
      },
      async signInAnonymously() { kv.set("hq.session", { guest: true, email: null, at: new Date().toISOString() }); return { data: { user: { id: "hq-guest" } }, error: null }; },
      async signOut() { kv.set("hq.session", null); return { error: null }; },
    },
  };
}
