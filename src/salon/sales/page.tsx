import type { Metadata } from "next";
import { Suspense } from "react";
import { getShopContext } from "@/src/lib/session";
import { ymdOf } from "../calendar/lib";
import Sales from "./sales";

export const metadata: Metadata = { title: "매출 · 정산" };

export default function SalesPage() {
  return (
    <Suspense fallback={<div className="skel" style={{ minHeight: 560 }} />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  const { shop, perms, member } = await getShopContext();
  const sales = (perms.sales ?? "none") as "none" | "own" | "all";
  if (sales === "none") {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <h1 className="h1">매출 · 정산</h1>
        <p className="sm" style={{ marginTop: 8 }}>매출을 볼 권한이 없어요. 원장님이 구성원 · 권한에서 ‘매출 보기’를 켜주면 볼 수 있어요.</p>
      </div>
    );
  }
  return <Sales shopId={shop.id} shopName={shop.name} scope={sales} myMemberId={member.id} canExport={perms.export === "all"} today={ymdOf(new Date())} />;
}
