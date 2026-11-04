"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/browser";
import { useDesk } from "@/src/components/DeskFrame";
import { bookingStatusLabel, dbErrorMessage, digits, seoulStamp } from "@/src/lib/format";

const START = 10 * 60;
const END = 20 * 60;
const STEP = 30;
const SLOTS = Array.from({ length: (END - START) / STEP }, (_, index) => START + index * STEP);

function ymd(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function ymdOf(iso) {
  return ymd(new Date(iso));
}
function minutesOf(iso) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour").value);
  const minute = Number(parts.find((part) => part.type === "minute").value);
  return hour * 60 + minute;
}
function addDays(day, count) {
  const date = new Date(`${day}T12:00:00+09:00`);
  date.setDate(date.getDate() + count);
  return ymd(date);
}
function clock(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function plusMinutes(time, minutes) {
  const [hour, minute] = time.split(":").map(Number);
  return clock(hour * 60 + minute + Number(minutes || 60));
}
function tone(row) {
  if (row.status === "blocked" || row.kind === "block") return "block";
  if (row.source === "naver") return "naver";
  if (row.status === "completed") return "done";
  if (row.status === "in_service") return "doing";
  if (row.status === "requested") return "ask";
  if (row.status === "confirmed") return "hold";
  return "";
}
const NEXT = {
  requested: [["confirmed", "확정"], ["cancelled_shop", "거절"]],
  confirmed: [["in_service", "시술 시작"], ["no_show", "노쇼"], ["cancelled_customer", "고객 취소"]],
  in_service: [["completed", "시술 완료"]],
  cancelled_customer: [["confirmed", "되살리기"]],
  cancelled_shop: [["confirmed", "되살리기"]],
  no_show: [["confirmed", "되살리기"]],
  blocked: [["cancelled_shop", "블록 해제"]],
};

export function DeskCalendar() {
  const desk = useDesk();
  const today = ymd(new Date());
  const [view, setView] = useState("day");
  const [date, setDate] = useState(today);
  const [members, setMembers] = useState([]);
  const [menus, setMenus] = useState([]);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [picked, setPicked] = useState(null);

  const people = useMemo(() => {
    const staff = members.filter((member) => member.role === "staff" || member.role === "owner");
    return staff.length ? staff : [{ id: "none", display_name: "담당 없음" }];
  }, [members]);

  useEffect(() => {
    if (!desk?.store) return undefined;
    let alive = true;
    const from = view === "month" ? addDays(date.slice(0, 8) + "01", -7) : view === "week" ? addDays(date, -((new Date(`${date}T12:00:00+09:00`).getDay() + 6) % 7)) : date;
    const span = view === "month" ? 42 : view === "week" ? 7 : 1;
    const start = new Date(`${from}T00:00:00+09:00`).toISOString();
    const end = new Date(`${addDays(from, span)}T00:00:00+09:00`).toISOString();
    Promise.all([
      supabase.from("store_members").select("id, role, display_name").eq("store_id", desk.store.id),
      supabase.from("store_menus").select("id, name, duration_min, price_krw").eq("store_id", desk.store.id).order("sort_order"),
      supabase.from("bookings").select("id, starts_at, ends_at, status, source, memo, member_id, customers(name), booking_items(name, price_krw)").eq("store_id", desk.store.id).gte("starts_at", start).lt("starts_at", end),
      supabase.from("external_blocks").select("id, starts_at, ends_at, memo, staff_name, source").eq("store_id", desk.store.id).gte("starts_at", start).lt("starts_at", end),
    ]).then(([memberRows, menuRows, bookingRows, blockRows]) => {
      if (!alive) return;
      const failed = bookingRows.error || blockRows.error;
      setError(failed ? dbErrorMessage(failed) : "");
      setMembers(memberRows.data ?? []);
      setMenus(menuRows.data ?? []);
      const staff = memberRows.data ?? [];
      const blocks = (blockRows.data ?? []).map((row) => ({
        ...row,
        status: "blocked",
        kind: "block",
        member_id: staff.find((member) => member.display_name === row.staff_name)?.id || staff[0]?.id,
        customers: { name: row.memo || "시간 막음" },
      }));
      setRows([...(bookingRows.data ?? []), ...blocks]);
    });
    return () => { alive = false; };
  }, [desk?.store, date, view]);

  function shift(amount) {
    if (view === "month") setDate(addDays(date.slice(0, 8) + "01", amount * 30));
    else setDate(addDays(date, view === "week" ? amount * 7 : amount));
  }

  function openNew(memberId, mins) {
    const start = clock(mins);
    setPicked(null);
    setDraft({ date, start, end: plusMinutes(start, 60), memberId: memberId === "none" ? "" : memberId, name: "", phone: "", menuId: "", source: "phone", memo: "", blocked: false });
  }

  async function saveDraft(event) {
    event.preventDefault();
    setError("");
    if (!draft.blocked && !draft.name.trim()) {
      setError("고객 이름을 입력해 주세요.");
      return;
    }
    let customerId = null;
    if (!draft.blocked) {
      const phone = digits(draft.phone);
      if (phone) {
        const found = await supabase.from("customers").select("id").eq("store_id", desk.store.id).eq("phone", phone).limit(1);
        customerId = found.data?.[0]?.id ?? null;
      }
      if (!customerId) {
        const created = await supabase.from("customers").insert({ store_id: desk.store.id, name: draft.name.trim(), phone: phone || null }).select("id").single();
        if (created.error) {
          setError(dbErrorMessage(created.error));
          return;
        }
        customerId = created.data.id;
      }
    }
    const inserted = await supabase.from("bookings").insert({
      store_id: desk.store.id,
      member_id: draft.memberId || null,
      customer_id: customerId,
      starts_at: seoulStamp(draft.date, draft.start),
      ends_at: seoulStamp(draft.date, draft.end),
      status: draft.blocked ? "blocked" : "confirmed",
      source: draft.source,
      memo: draft.memo.trim() || null,
    }).select("id").single();
    if (inserted.error) {
      setError(dbErrorMessage(inserted.error));
      return;
    }
    const menu = menus.find((item) => item.id === draft.menuId);
    if (menu) {
      await supabase.from("booking_items").insert({ booking_id: inserted.data.id, menu_id: menu.id, name: menu.name, price_krw: menu.price_krw, duration_min: menu.duration_min });
    }
    setDraft(null);
    setDate(draft.date);
  }

  async function setStatus(id, status) {
    const { error: updateError } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (updateError) setError(dbErrorMessage(updateError));
    else {
      setRows(rows.map((row) => (row.id === id ? { ...row, status } : row)));
      setPicked(null);
    }
  }

  const title = view === "month" ? date.slice(0, 7) : date;

  return (
    <>
      <div className="cal-bar">
        <button className="btn small" type="button" onClick={() => shift(-1)}>이전</button>
        <button className="btn small" type="button" onClick={() => setDate(today)}>오늘</button>
        <button className="btn small" type="button" onClick={() => shift(1)}>다음</button>
        <h2>{title}</h2>
        <div className="cal-views">
          {[["day", "일"], ["week", "주"], ["month", "월"]].map(([id, label]) => (
            <button key={id} className={view === id ? "btn small on" : "btn small"} type="button" onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {view === "day" ? (
        <div className="cal-board" style={{ "--cols": people.length }}>
          <div>
            <div className="cal-head">시간</div>
            <div className="cal-hours">{SLOTS.map((mins) => <span key={mins}>{mins % 60 === 0 ? clock(mins) : ""}</span>)}</div>
          </div>
          {people.map((member) => (
            <div key={member.id}>
              <div className="cal-head">{member.display_name}</div>
              <div className="cal-col">
                {SLOTS.map((mins) => <button key={mins} className="cal-slot" type="button" onClick={() => openNew(member.id, mins)} />)}
                {rows.filter((row) => ymdOf(row.starts_at) === date && (member.id === "none" ? !row.member_id : row.member_id === member.id)).map((row) => {
                  const start = Math.max(START, minutesOf(row.starts_at));
                  const finish = Math.min(END, minutesOf(row.ends_at));
                  return (
                    <button
                      key={row.id}
                      className={`slot cal-event ${tone(row)}`}
                      type="button"
                      style={{ top: `${((start - START) / STEP) * 28}px`, height: `${Math.max(1, (finish - start) / STEP) * 28 - 4}px` }}
                      onClick={() => { setDraft(null); setPicked(row); }}
                    >
                      <b>{row.customers?.name || "예약"}</b>
                      <span>{clock(minutesOf(row.starts_at))} {bookingStatusLabel[row.status] || ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {view === "week" ? (
        <div className="cal-week">
          {Array.from({ length: 7 }, (_, index) => {
            const day = addDays(date, index - ((new Date(`${date}T12:00:00+09:00`).getDay() + 6) % 7));
            const items = rows.filter((row) => ymdOf(row.starts_at) === day);
            return (
              <button key={day} className="card cal-day" type="button" onClick={() => { setDate(day); setView("day"); }}>
                <b>{day.slice(8)}</b>
                {items.map((row) => <span key={row.id}>{row.customers?.name || "예약"}</span>)}
              </button>
            );
          })}
        </div>
      ) : null}
      {view === "month" ? (
        <div className="cal-month">
          {Array.from({ length: 42 }, (_, index) => {
            const first = new Date(`${date.slice(0, 8)}01T12:00:00+09:00`);
            const lead = (first.getDay() + 6) % 7;
            const day = addDays(ymd(first), index - lead);
            const count = rows.filter((row) => ymdOf(row.starts_at) === day).length;
            return (
              <button key={day} className="card cal-day" type="button" onClick={() => { setDate(day); setView("day"); }}>
                <b>{day.slice(8)}</b>
                {count ? <span>{count}건</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {draft ? (
        <div className="cal-sheet" onClick={() => setDraft(null)}>
          <form className="card" onClick={(event) => event.stopPropagation()} onSubmit={saveDraft}>
            <h3>{draft.blocked ? "시간 막기" : "예약 등록"}</h3>
            <label className="day-off">시간 막기<input type="checkbox" checked={draft.blocked} onChange={(event) => setDraft({ ...draft, blocked: event.target.checked })} /></label>
            <label className="field">날짜<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
            <div className="split">
              <label className="field">시작<input type="time" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label>
              <label className="field">종료<input type="time" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label>
            </div>
            {draft.blocked ? null : (
              <>
                <label className="field">고객<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="field">휴대폰<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
                <label className="field">메뉴
                  <select value={draft.menuId} onChange={(event) => {
                    const menu = menus.find((item) => item.id === event.target.value);
                    setDraft({ ...draft, menuId: event.target.value, end: menu ? plusMinutes(draft.start, menu.duration_min) : draft.end });
                  }}>
                    <option value="">선택 안 함</option>
                    {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
                  </select>
                </label>
              </>
            )}
            <label className="field">메모<textarea value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} /></label>
            <button className="btn primary" type="submit">저장</button>
            <button className="btn" type="button" onClick={() => setDraft(null)}>닫기</button>
          </form>
        </div>
      ) : null}
      {picked ? (
        <div className="cal-sheet" onClick={() => setPicked(null)}>
          <div className="card" onClick={(event) => event.stopPropagation()}>
            <h3>{picked.customers?.name || "예약"}</h3>
            <p>{bookingStatusLabel[picked.status]} · {clock(minutesOf(picked.starts_at))}</p>
            <p>{picked.booking_items?.map((item) => item.name).join("+")}</p>
            <div className="stack">
              {(NEXT[picked.status] ?? []).map(([status, label]) => (
                <button key={status} className="btn" type="button" onClick={() => setStatus(picked.id, status)}>{label}</button>
              ))}
              <button className="btn" type="button" onClick={() => setPicked(null)}>닫기</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
