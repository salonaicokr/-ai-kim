import "./globals.css";
import "./bklit.css";

export const metadata = {
  title: "SALONAI",
  description: "시술 기록과 재방문을 잇는 매장 화면",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
