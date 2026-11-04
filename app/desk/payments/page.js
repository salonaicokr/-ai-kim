"use client";

import Sales from "@/src/salon/sales/sales";
import { useDesk } from "@/src/components/DeskFrame";

export default function PaymentsPage() {
  const desk = useDesk();
  if (!desk?.store) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return <Sales shopId={desk.store.id} shopName={desk.store.name} scope="all" myMemberId="" canExport today={today} />;
}
