"use client";

import { useDesk } from "@/src/components/DeskFrame";
import { CareBoard } from "@/src/components/CareBoard";

export default function CarePage() {
  const desk = useDesk();
  if (!desk?.store) return null;
  return <CareBoard storeId={desk.store.id} category={desk.store.category} />;
}
