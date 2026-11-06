"use client";
// @ts-nocheck

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/src/lib/customer/api";

/** /c : 로그인했으면 홈, 아니면 로그인으로 */
export default function CustomerEntry() {
  const router = useRouter();
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => router.replace(data.session ? "/c/home" : "/c/login"));
  }, [router]);
  return <main className="cpage"><p className="cmt">불러오는 중…</p></main>;
}
