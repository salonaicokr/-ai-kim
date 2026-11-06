"use client";
// @ts-nocheck
import type { Metadata } from "next";
import { asyncComp } from "@/src/lib/compat";
import { Suspense } from "react";
import { getOps } from "@/src/lib/ops";
import AdminsEditor, { type Admin } from "./editor";


export default function OpsAdmins() {
  return <Suspense fallback={<div className="skel" style={{ minHeight: 300 }} />}><Body /></Suspense>;
}

async function BodyImpl() {
  const { supabase, me } = await getOps();
  if (!me?.can.admin) return <section className="card"><p className="sm">운영 계정은 마스터 역할만 관리할 수 있어요.</p></section>;
  const { data } = await supabase.rpc("hq_admins");
  return (
    <>
      <div><p className="crumb">운영 · 운영 계정</p><h1 className="h1">살롱에이아이 본사 관리자</h1>
        <p className="sm">이 이메일로 로그인한 계정만 운영 화면에 들어올 수 있어요. 관리자를 바꾸려면 새 이메일을 추가한 뒤 이전 이메일을 빼주세요. 역할마다 할 수 있는 일이 달라요 (조회는 모두 가능).</p></div>
      <AdminsEditor initial={(data ?? []) as Admin[]} />
    </>
  );
}
const Body = asyncComp(BodyImpl);
