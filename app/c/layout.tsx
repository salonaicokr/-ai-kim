// @ts-nocheck
import type { Metadata, Viewport } from "next";
import "./c.css";

export const metadata: Metadata = { title: { default: "SALONAI", template: "%s · SALONAI" }, description: "흩어진 뷰티 기록을 하나로" };
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

/** 고객 앱: 휴대폰 화면 전용 (PC 에서는 가운데 휴대폰 폭으로) */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <div className="capp">{children}</div>;
}
