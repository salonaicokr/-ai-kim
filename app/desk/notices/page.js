"use client";

import { Suspense } from "react";
import Notices from "@/src/salon/notices/notices";

export default function NoticesPage() {
  return <Suspense fallback={null}><Notices /></Suspense>;
}

