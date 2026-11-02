"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { dbErrorMessage, digits } from "@/src/lib/format";

export default function CustomersPage() {
  const desk = useDesk();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  async function load(storeId) {
    const { data, error: loadError } = await supabase.from("customers").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    if (loadError) setError(dbErrorMessage(loadError));
    else setRows(data ?? []);
  }

  useEffect(() => {
    if (desk?.store) load(desk.store.id);
  }, [desk?.store]);

  async function addCustomer(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
      return;
    }
    const { error: insertError } = await supabase.from("customers").insert({
      store_id: desk.store.id,
      name: name.trim(),
      phone: digits(phone) || null,
    });
    if (insertError) {
      setError(dbErrorMessage(insertError));
      return;
    }
    setName("");
    setPhone("");
    if (!desk.setup?.import_done) {
      await supabase.from("store_setup").update({ import_done: true }).eq("store_id", desk.store.id);
      desk.refresh();
    }
    load(desk.store.id);
  }

  async function importCsv(file) {
    setError("");
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const body = lines[0]?.includes("이름") ? lines.slice(1) : lines;
    const payload = body.map((line) => {
      const [person, mobile] = line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
      return person ? { store_id: desk.store.id, name: person, phone: digits(mobile) || null } : null;
    }).filter(Boolean);
    if (!payload.length) {
      setError("이름 열이 있는 CSV를 올려 주세요.");
      return;
    }
    const { error: insertError } = await supabase.from("customers").insert(payload);
    if (insertError) {
      setError(dbErrorMessage(insertError));
      return;
    }
    await supabase.from("store_setup").update({ import_done: true }).eq("store_id", desk.store.id);
    desk.refresh();
    load(desk.store.id);
  }

  if (!desk?.store) return null;
  return (
    <>
      <header className="page-head">
        <div>
          <h1>고객</h1>
          <p>이 매장에 직접 남긴 고객입니다. 다른 매장 기록은 보이지 않습니다.</p>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div className="two">
        <div className="stack">
          <form className="card" onSubmit={addCustomer}>
            <h3>한 명 추가</h3>
            <label className="field">이름<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="field">휴대폰<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <button className="btn primary" type="submit">저장</button>
          </form>
          <label className="card upload">
            CSV 가져오기<br />이름,휴대폰
            <input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])} />
          </label>
        </div>
        <div className="card" style={{ padding: 0 }}>
          {rows.length ? (
            <table className="table">
              <thead><tr><th>이름</th><th>휴대폰</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.phone || "없음"}</td></tr>)}</tbody>
            </table>
          ) : <p className="empty">등록된 고객이 없습니다.</p>}
        </div>
      </div>
    </>
  );
}
