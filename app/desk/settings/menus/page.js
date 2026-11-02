"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { categoryLabel, dbErrorMessage, won } from "@/src/lib/format";

export default function MenusPage() {
  const desk = useDesk();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!desk?.store) return;
    supabase.from("store_menus").select("*").eq("store_id", desk.store.id).order("sort_order").then(({ data, error: loadError }) => {
      if (loadError) setError(dbErrorMessage(loadError));
      else setRows(data ?? []);
    });
  }, [desk?.store]);

  function edit(index, key, value) {
    const next = rows.slice();
    next[index] = { ...next[index], [key]: value };
    setRows(next);
    setSaved(false);
  }

  async function save() {
    setError("");
    for (const row of rows) {
      const price = Number(row.price_krw);
      const duration = Number(row.duration_min);
      if (!row.name.trim() || !Number.isFinite(price) || price < 0 || duration < 1) {
        setError("메뉴 이름, 0원 이상 가격, 1분 이상 소요시간을 확인해 주세요.");
        return;
      }
      const { error: updateError } = await supabase
        .from("store_menus")
        .update({ name: row.name.trim(), price_krw: price, duration_min: duration })
        .eq("id", row.id);
      if (updateError) {
        setError(dbErrorMessage(updateError));
        return;
      }
    }
    await supabase.from("store_setup").update({ menus: true }).eq("store_id", desk.store.id);
    desk.refresh();
    setSaved(true);
  }

  if (!desk?.store) return null;
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{categoryLabel[desk.store.category]} 메뉴</h1>
          <p>가입할 때 업종 템플릿을 복사했습니다. 가격과 시간을 매장에 맞게 바꾸세요.</p>
        </div>
        <Link className="btn" href="/desk/settings">설정으로</Link>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {saved ? <p className="note">저장했습니다.</p> : null}
      <div className="card" style={{ padding: 0 }}>
        {rows.length ? (
          <table className="table">
            <thead><tr><th>메뉴</th><th>소요시간</th><th>가격</th><th>재방문</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td><input value={row.name} onChange={(event) => edit(index, "name", event.target.value)} /></td>
                  <td><input inputMode="numeric" value={row.duration_min} onChange={(event) => edit(index, "duration_min", event.target.value)} /> 분</td>
                  <td><input inputMode="numeric" value={row.price_krw} onChange={(event) => edit(index, "price_krw", event.target.value)} /></td>
                  <td>{row.revisit_cycle_days ? `${row.revisit_cycle_days}일` : "없음"} · {won(row.price_krw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">복사된 메뉴가 없습니다.</p>}
      </div>
      <div className="actions"><button className="btn primary" type="button" onClick={save}>저장</button></div>
    </>
  );
}
