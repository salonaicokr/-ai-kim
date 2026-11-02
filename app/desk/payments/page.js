"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { dbErrorMessage, entryLabel, methodLabel, won } from "@/src/lib/format";

const empty = { amount: "", service: "", entry: "paid", method: "card_terminal", note: "" };

export default function PaymentsPage() {
  const desk = useDesk();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  async function load(storeId) {
    const { data, error: loadError } = await supabase.from("payment_entries").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    if (loadError) setError(dbErrorMessage(loadError));
    else setRows(data ?? []);
  }

  useEffect(() => {
    if (desk?.store) load(desk.store.id);
  }, [desk?.store]);

  async function save(event) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.service.trim() || !Number.isFinite(amount) || amount < 0) {
      setError("시술명과 0원 이상 금액을 입력해 주세요.");
      return;
    }
    const { error: insertError } = await supabase.from("payment_entries").insert({
      store_id: desk.store.id,
      amount_krw: amount,
      service_name: form.service.trim(),
      entry_type: form.entry,
      method_label: form.method,
      note: form.note.trim() || null,
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
          <h1>결제</h1>
          <p>카드 번호는 받지 않습니다. 매장에서 받은 금액과 환불만 적습니다.</p>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div className="two">
        <form className="card" onSubmit={save}>
          <h3>수납 기록</h3>
          <label className="field">금액<input inputMode="numeric" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
          <label className="field">시술명<input value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value })} /></label>
          <label className="field">구분
            <select value={form.entry} onChange={(event) => setForm({ ...form, entry: event.target.value })}>
              <option value="paid">수납</option>
              <option value="refund">환불</option>
              <option value="partial_refund">부분 환불</option>
            </select>
          </label>
          <label className="field">수단
            <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              <option value="cash">현금</option>
              <option value="card_terminal">카드 단말기</option>
              <option value="naver_pay">네이버페이(매장 수기)</option>
              <option value="transfer">계좌이체</option>
              <option value="other">기타</option>
            </select>
          </label>
          <label className="field">메모<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          <button className="btn primary" type="submit">저장</button>
        </form>
        <div className="card" style={{ padding: 0 }}>
          {rows.length ? (
            <table className="table">
              <thead><tr><th>시술</th><th>구분</th><th>수단</th><th>금액</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.service_name}</td>
                    <td>{entryLabel[row.entry_type]}</td>
                    <td>{methodLabel[row.method_label]}</td>
                    <td>{won(row.amount_krw)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">적은 매출이 없습니다.</p>}
        </div>
      </div>
    </>
  );
}
