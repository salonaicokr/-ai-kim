"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOps } from "@/src/lib/ops";
import OpsNav from "./nav";

/** 본사 화면: 본사 계정(마스터 · 재무 · CS · 영업관리)만. 아니면 운영 로그인 화면으로 */
export default function OpsInLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ops, setOps] = useState<Awaited<ReturnType<typeof getOps>> | null>(null);
  useEffect(() => {
    getOps().then((o) => {
      if (!o.ok || !o.me) { router.replace("/hq"); return; }
      setOps(o);
    });
  }, [router]);
  if (!ops) return <div className="skel" style={{ minHeight: "100vh" }} />;
  return (
    <div className="ops-app">
      <OpsNav email={ops.user?.email ?? ""} me={ops.me} />
      <main className="ops-main">{children}</main>
    </div>
  );
}
