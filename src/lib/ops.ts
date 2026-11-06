"use client";
// @ts-nocheck

import { createOpsBrowserClient } from "@/src/lib/supabase/ops-browser";
import { kv } from "@/src/lib/supabase/local-db";

export type HqCan = { admin: boolean; store: boolean; sales: boolean; billing: boolean; settle: boolean; payout?: boolean };
export type HqMe = { role: "hq_master" | "hq_finance" | "hq_cs" | "hq_sales"; guest?: boolean; can: HqCan };

/** 본사 화면용 로그인 상태 (서버 쿠키 대신 이 브라우저의 테스트 입장 상태) */
export async function getOps() {
  const supabase = createOpsBrowserClient();
  const session = kv.get("hq.session", null) as { guest?: boolean; email?: string | null } | null;
  if (!session) return { ok: false, user: null, me: null, supabase };
  const me: HqMe = { role: "hq_master", guest: !!session.guest, can: { admin: true, store: true, sales: true, billing: true, settle: true, payout: true } };
  return { ok: true, user: { email: session.email ?? "" }, me, supabase };
}
