"use client";

import { useDesk } from "@/src/components/DeskFrame";

export default function CarePage() {
  const desk = useDesk();
  if (!desk?.store) return null;
  const hair = desk.store.category === "hair";
  return (
    <>
      <header className="page-head">
        <div>
          <h1>사후관리</h1>
          <p>시술이 끝난 뒤에 보내는 케어와 재방문 안내입니다. 예약 알림은 횟수에서 빼지 않습니다.</p>
        </div>
      </header>
      <div className="setup-grid">
        <article className="setup-card"><h3>케어</h3><p>{hair ? "시술 후 1일, 7일, 14일에 안내를 예약합니다." : "시술 다음 날 안내를 예약합니다."} 하루 2건, 7일에 5건을 넘기지 않습니다.</p></article>
        <article className="setup-card"><h3>재방문</h3><p>메뉴에 적힌 주기 3일 전에 안내합니다. {hair ? "헤어 주기는 메뉴마다 다릅니다." : "네일 기본 주기는 3주에서 4주입니다."}</p></article>
        <article className="setup-card"><h3>조용한 시간</h3><p>21시부터 다음 날 8시까지는 보내지 않고 8시 30분에 보냅니다.</p></article>
      </div>
      <p className="empty">아직 발송 대기 건이 없습니다. 기록은 담당자 앱에서 남기고, 담당자가 확인한 글만 고객에게 갑니다.</p>
    </>
  );
}
