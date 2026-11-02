"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { dbErrorMessage, repeatLabel, seoulStamp, seoulTimeRange, sourceLabel } from "@/src/lib/format";

const empty = { date: "", start: "10:00", end: "11:00", source: "phone", staff: "", repeat: "none", memo: "" };

export default function BookingsPage() {
  const desk = useDesk();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  async function load(storeId) {
    const { data, error: loadError } = await supabase
      .from("external_blocks")
      .select("*")
      .eq("store_id", storeId)
      .order("starts_at");
    if (loadError) setError(dbErrorMessage(loadError));
    else setRows(data ?? []);
  }

  useEffect(() => {
    if (desk?.store) load(desk.store.id);
  }, [desk?.store]);

  async function save(event) {
    event.preventDefault();
    setError("");
    if (!form.date || form.end <= form.start) {
      setError("날짜와 시작보다 늦은 종료 시간을 입력해 주세요.");
      return;
    }
    const { error: insertError } = await supabase.from("external_blocks").insert({
      store_id: desk.store.id,
      starts_at: seoulStamp(form.date, form.start),
      ends_at: seoulStamp(form.date, form.end),
      source: form.source,
      staff_name: form.staff.trim() || null,
      repeat: form.repeat,
      memo: form.memo.trim() || null,
    });
    if (insertError) {
      setError(dbErrorMessage(insertError));
      return;
    }
    setForm(empty);
    load(desk.store.id);
  }

  if (!desk?.store) return null;
  return (
    <>
      <header className="page-head">
        <div>
          <h1>예약</h1>
          <p>외부 예약은 시간만 막습니다. 네이버와 연동하지 않습니다.</p>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div className="two">
        <form className="card" onSubmit={save}>
          <h3>시간 막기</h3>
          <label className="field">날짜<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <div className="split">
            <label className="field">시작<input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label>
            <label className="field">종료<input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></label>
          </div>
          <label className="field">출처
            <select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>
              <option value="naver">네이버</option>
              <option value="phone">전화</option>
              <option value="other">기타</option>
            </select>
          </label>
          <label className="field">담당자<input value={form.staff} onChange={(event) => setForm({ ...form, staff: event.target.value })} /></label>
          <label className="field">반복
            <select value={form.repeat} onChange={(event) => setForm({ ...form, repeat: event.target.value })}>
              <option value="none">반복 없음</option>
              <option value="weekly">매주</option>
            </select>
          </label>
          <label className="field">메모 (선택)<textarea value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></label>
          <button className="btn primary" type="submit">저장</button>
        </form>
        <div className="card" style={{ padding: 0 }}>
          {rows.length ? (
            <table className="table">
              <thead><tr><th>시간</th><th>출처</th><th>담당</th><th>반복</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{seoulTimeRange(row.starts_at, row.ends_at)}{row.memo ? <div>{row.memo}</div> : null}</td>
                    <td>{sourceLabel[row.source]}</td>
                    <td>{row.staff_name || "미정"}</td>
                    <td>{repeatLabel[row.repeat]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">막아 둔 시간이 없습니다.</p>}
        </div>
      </div>
    </>
  );
}
