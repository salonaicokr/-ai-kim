// @ts-nocheck
import { asyncComp } from "@/src/lib/compat";

type SB = any;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const LIVE_OUT = ["blocked", "cancelled_customer", "cancelled_shop", "no_show"];

/**
 * 다매장 대표 · 통합 보기 (S-05): 지점별 요약 카드 + 매출 비교 표 · 합계.
 * 예약 · 고객 목록은 통합하지 않음 (지점을 골라서 봄). 데이터는 대표가 원장인 지점만 서버 권한으로 읽힘.
 */
async function BrandOverviewImpl({ supabase, brand, today }: { supabase: SB; brand: { id: string; name: string }; today: { ymd: string; start: string; end: string } }) {
  const { data: shopRows } = await supabase.from("shops").select("id, name, status").eq("brand_id", brand.id).order("created_at");
  const shops = (shopRows ?? []).filter((s) => s.status !== "suspended");
  const ids = shops.map((s) => s.id);
  const monthStart = new Date(`${today.ymd.slice(0, 7)}-01T00:00:00+09:00`).toISOString();

  const [bk, pay, cust] = ids.length
    ? await Promise.all([
        supabase.from("bookings").select("shop_id, status").in("shop_id", ids).gte("start_at", today.start).lt("start_at", today.end),
        supabase.from("payments").select("shop_id, paid_amount, refunded_amount, paid_at, status").in("shop_id", ids).gte("paid_at", monthStart).lt("paid_at", today.end).neq("status", "refunded"),
        supabase.from("shop_customers").select("shop_id").in("shop_id", ids).gte("created_at", today.start).lt("created_at", today.end),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const net = (p: { paid_amount: number; refunded_amount: number | null }) => (p.paid_amount ?? 0) - (p.refunded_amount ?? 0);
  const rows = shops.map((s) => {
    const pays = (pay.data ?? []).filter((p) => p.shop_id === s.id);
    return {
      ...s,
      bookings: (bk.data ?? []).filter((b) => b.shop_id === s.id && !LIVE_OUT.includes(b.status)).length,
      todaySales: pays.filter((p) => p.paid_at >= today.start).reduce((a, p) => a + net(p), 0),
      monthSales: pays.reduce((a, p) => a + net(p), 0),
      newCust: (cust.data ?? []).filter((c) => c.shop_id === s.id).length,
    };
  });
  const sum = (k: "bookings" | "todaySales" | "monthSales" | "newCust") => rows.reduce((a, r) => a + r[k], 0);
  const maxMonth = Math.max(1, ...rows.map((r) => r.monthSales));

  return (
    <>
      <div>
        <p className="crumb">{today.ymd} · {brand.name} · 지점 {rows.length}곳</p>
        <h1 className="h1">통합 보기</h1>
        <p className="sm">지점별 오늘 현황과 매출만 모아서 보여드려요. 예약 · 고객은 위 <b>지점</b>에서 지점을 골라 확인해주세요.</p>
      </div>

      <section className="grid g4" aria-label="전체 지점 합계">
        <div className="card kpi-c"><p className="lbl">오늘 예약 (전 지점)</p><p className="big">{sum("bookings")}<small>건</small></p></div>
        <div className="card kpi-c teal"><p className="lbl">오늘 매출 합계</p><p className="big">{won(sum("todaySales"))}</p></div>
        <div className="card kpi-c"><p className="lbl">이번 달 매출 합계</p><p className="big">{won(sum("monthSales"))}</p></div>
        <div className="card kpi-c amb"><p className="lbl">오늘 신규 고객</p><p className="big">{sum("newCust")}<small>명</small></p></div>
      </section>

      <section className="br-cards" aria-label="지점별 요약">
        {rows.map((r) => (
          <a key={r.id} className="card br-card" href={`/desk?store=${r.id}`}>
            <div className="row" style={{ gap: 6 }}><b>{r.name}</b>{r.status === "pending" && <span className="pill p-amb">승인 대기</span>}<span className="sp" /><span className="sm">지점 열기 →</span></div>
            <dl>
              <div><dt>오늘 예약</dt><dd>{r.bookings}건</dd></div>
              <div><dt>오늘 매출</dt><dd>{won(r.todaySales)}</dd></div>
              <div><dt>신규 고객</dt><dd>{r.newCust}명</dd></div>
            </dl>
          </a>
        ))}
      </section>

      <section className="card">
        <h2 className="b" style={{ marginBottom: 8 }}>지점 매출 비교 · {Number(today.ymd.slice(5, 7))}월</h2>
        <div className="br-tw">
          <table className="br-table">
            <thead><tr><th scope="col">지점</th><th scope="col">오늘 예약</th><th scope="col">오늘 매출</th><th scope="col">이번 달 매출</th><th scope="col" className="br-barh">비중</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  <td>{r.bookings}건</td>
                  <td>{won(r.todaySales)}</td>
                  <td>{won(r.monthSales)}</td>
                  <td className="br-barh">{r.monthSales > 0 && <span className="br-bar" style={{ width: `${(r.monthSales / maxMonth) * 100}%` }} />}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row">합계</th><td>{sum("bookings")}건</td><td>{won(sum("todaySales"))}</td><td>{won(sum("monthSales"))}</td><td className="br-barh" /></tr></tfoot>
          </table>
        </div>
      </section>
    </>
  );
}

export default asyncComp(BrandOverviewImpl);
