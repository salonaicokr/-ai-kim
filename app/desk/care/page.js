"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { dbErrorMessage, seoulDateLabel } from "@/src/lib/format";

export default function CarePage() {
  const desk = useDesk();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!desk?.store) return;
    supabase
      .from("bookings")
      .select("id, starts_at, customer_id, customers(name), booking_items(name, store_menus(revisit_cycle_days))")
      .eq("store_id", desk.store.id)
      .eq("status", "completed")
      .order("starts_at", { ascending: false })
      .limit(400)
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(dbErrorMessage(loadError));
          return;
        }
        const seen = new Set();
        const due = [];
        for (const row of data ?? []) {
          if (!row.customer_id || seen.has(row.customer_id)) continue;
          seen.add(row.customer_id);
          const cycle = row.booking_items?.map((item) => item.store_menus?.revisit_cycle_days).find(Boolean);
          if (!cycle) continue;
          const at = new Date(row.starts_at).getTime() + Number(cycle) * 86400000;
          if (at - 3 * 86400000 <= Date.now()) {
            due.push({
              id: row.customer_id,
              name: row.customers?.name || "고객",
              menu: row.booking_items?.map((item) => item.name).filter(Boolean).join("+"),
              when: seoulDateLabel(new Date(at)),
            });
          }
        }
        setRows(due);
      });
  }, [desk?.store]);

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
      {error ? <p className="error">{error}</p> : null}
      <div className="setup-grid">
        <article className="setup-card"><h3>케어</h3><p>{hair ? "시술 후 1일, 7일, 14일에 안내를 예약합니다." : "시술 다음 날 안내를 예약합니다."} 하루 2건, 7일에 5건을 넘기지 않습니다.</p></article>
        <article className="setup-card"><h3>재방문</h3><p>메뉴에 적힌 주기 3일 전에 안내합니다. {hair ? "헤어 주기는 메뉴마다 다릅니다." : "네일 기본 주기는 3주에서 4주입니다."}</p></article>
        <article className="setup-card"><h3>조용한 시간</h3><p>21시부터 다음 날 8시까지는 보내지 않고 8시 30분에 보냅니다.</p></article>
      </div>
      {rows.length ? (
        <div className="card" style={{ padding: 0, marginTop: 16 }}>
          <table className="table">
            <thead><tr><th>고객</th><th>메뉴</th><th>재방문 시점</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}><td>{row.name}</td><td>{row.menu || "메뉴 없음"}</td><td>{row.when}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="empty">아직 발송 대기 건이 없습니다. 기록은 담당자 앱에서 남기고, 담당자가 확인한 글만 고객에게 갑니다.</p>}
    </>
  );
}
