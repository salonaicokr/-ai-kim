"use client";
// @ts-nocheck

import { Suspense } from "react";
import Wizard from "./wizard";

/** 매장 만들기 · 지점 추가 (/onboarding?add=1) */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="skel" style={{ minHeight: "100vh" }} />}>
      <Wizard />
    </Suspense>
  );
}
