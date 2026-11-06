// @ts-nocheck
import type { Metadata } from "next";
import "./hq.css";

// 본사 화면: 검색 노출 금지 · 매장 화면 어디에도 링크하지 않음
export const metadata: Metadata = {
  title: { default: "운영", template: "%s · SALONAI 운영" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <div className="ops">{children}</div>;
}
