"use client";
// @ts-nocheck

import { supabase as raw } from "@/src/lib/browser";
import { previewShopMembers } from "@/src/lib/preview-designers";
import { applyQuery, dropOverlay, localRows, overlayOf, patchOverlay, runLocal, saveLocalRows, uid, type Filter } from "./local-db";
import { localRpc } from "./local-rpc";

const TO_DB: Record<string, string> = {
  shop_id: "store_id",
  start_at: "starts_at",
  end_at: "ends_at",
  designer_id: "member_id",
  shop_customer_id: "customer_id",
  menu_item_id: "menu_id",
  assigned_designer_id: "member_id",
  paid_at: "created_at",
};
const METHOD_TO: Record<string, string> = {
  card: "card_terminal", npay: "naver_pay", cash: "cash", transfer: "transfer", prepaid: "other", app: "other",
};
const METHOD_FROM: Record<string, string> = {
  card_terminal: "card", naver_pay: "npay", cash: "cash", transfer: "transfer", other: "cash",
};

const TABLES: Record<string, string> = {
  bookings: "bookings",
  booking_items: "booking_items",
  shop_members: "store_members",
  menu_items: "store_menus",
  shop_customers: "customers",
  v_shop_customers: "customers",
  payments: "payment_entries",
  customers: "customers",
};

function kindOfName(name = "") {
  if (name.includes("컷") || name.includes("커트")) return "cut";
  if (name.includes("열펌") || name.includes("매직")) return "heat_perm";
  if (name.includes("펌")) return "perm";
  if (name.includes("염색") || name.includes("탈색")) return "color";
  if (name.includes("클리닉")) return "clinic";
  if (name.includes("드라이")) return "dry";
  return "etc";
}

function mapBooking(row: Record<string, unknown>) {
  const items = (row.booking_items as Record<string, unknown>[] | null) ?? [];
  const customer = row.customers as { name?: string; phone?: string } | null;
  return {
    ...row,
    designer_id: row.member_id,
    start_at: row.starts_at,
    end_at: row.ends_at,
    shop_customer_id: row.customer_id,
    customer_request: row.customer_request ?? null,
    deposit_amount: row.deposit_amount ?? 0,
    customer: customer ? { name: customer.name ?? null, phone: customer.phone ?? null } : undefined,
    booking_items: items.map((item) => ({
      menu_item_id: item.menu_id,
      name: item.name,
      price: item.price_krw,
      menu_items: { menu_categories: { kind: kindOfName(String(item.name ?? "")) } },
    })),
    pre_surveys: null,
  };
}

function mapCustomer(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? null,
    grade_id: null,
    points: 0,
    memo: row.memo ?? null,
    visit_count: 0,
    first_visit_at: null,
    last_visit_at: null,
    created_at: row.created_at,
    assigned_designer_id: row.member_id ?? null,
    prepaid_balance: 0,
    marketing_agree: null,
    marketing_basis: null,
    revisit_due_at: null,
    survey_flags: null,
    survey_pending: false,
  };
}

/** 역할별 기본 권한 (구성원 · 권한 표의 기본값) */
function presetPerms(role: string) {
  const all = ["bk_view", "bk_edit", "bk_ok", "cust", "phone", "rec", "msg", "pay", "refund", "sales", "settle", "export", "menu", "invite", "report", "perm", "settings"];
  if (role === "owner") return Object.fromEntries(all.map((k) => [k, "all"]));
  if (role === "desk") return { bk_view: "all", bk_edit: "all", bk_ok: "all", cust: "all", pay: "all" };
  if (role === "designer") return { bk_view: "own", bk_edit: "own", bk_ok: "own", cust: "own", rec: "own", msg: "own", pay: "own", refund: "own" };
  return {};
}

function mapMember(row: Record<string, unknown>) {
  const role = row.role === "staff" ? "designer" : row.role === "assistant" ? "desk" : row.role === "owner" ? "owner" : "custom";
  const perms = row.permissions && Object.keys(row.permissions as object).length ? row.permissions : presetPerms(role);
  return {
    ...row,
    user_id: row.user_id ?? null,
    title: row.title || (role === "owner" ? "원장" : "디자이너"),
    role,
    permissions: perms,
    status: row.status ?? "active",
    is_designer: row.is_designer ?? (row.role === "staff" || row.role === "owner"),
    invite_code: row.invite_code ?? null,
    invited_phone: row.invited_phone ?? null,
    sort_order: row.sort_order ?? 0,
  };
}

function mapMenu(row: Record<string, unknown>) {
  const kind = kindOfName(String(row.name ?? ""));
  return {
    id: row.id,
    name: row.name,
    price: row.price_krw,
    price_m: null,
    price_l: null,
    duration_min: row.duration_min,
    status: row.paused ? "paused" : "active",
    sort_order: row.sort_order ?? 0,
    category_id: "menu",
    menu_categories: { name: "메뉴", kind, default_duration_min: row.duration_min, sort_order: row.sort_order ?? 0 },
  };
}

function mapPayment(row: Record<string, unknown>) {
  const refund = row.entry_type === "refund" || row.entry_type === "partial_refund";
  return {
    id: row.id,
    paid_amount: row.amount_krw,
    refunded_amount: refund ? row.amount_krw : 0,
    calculated_total: row.amount_krw,
    status: refund ? "refunded" : "paid",
    method: METHOD_FROM[String(row.method_label)] ?? "cash",
    designer_id: null,
    paid_at: row.created_at,
    is_overridden: false,
    override_reason: null,
    shop_customer_id: null,
    booking_id: row.booking_id,
    bookings: null,
    payment_items: [{ name: row.service_name, unit_price: row.amount_krw, qty: 1, menu_items: null }],
  };
}

function mapRow(table: string, row: Record<string, unknown>) {
  if (table === "bookings") return mapBooking(row);
  if (table === "customers" || table === "shop_customers" || table === "v_shop_customers") return mapCustomer(row);
  if (table === "shop_members") return mapMember(row);
  if (table === "menu_items") return mapMenu(row);
  if (table === "payments") return mapPayment(row);
  return row;
}

function dbKey(key: string) {
  return TO_DB[key] ?? key;
}

function dbPayload(table: string, payload: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) next[dbKey(key)] = value;
      if ((table === "booking_items" || table === "menu_items") && "price" in payload) next.price_krw = payload.price;
  if (table === "menu_items" && payload.status) next.paused = payload.status === "paused";
  if (table === "shop_members") {
    if (payload.role === "designer") next.role = "staff";
    if (payload.role === "desk") next.role = "assistant";
    if (payload.role === "owner") next.role = "owner";
    delete next.permissions;
    delete next.is_designer;
    delete next.status;
    delete next.invite_code;
    delete next.sort_order;
  }
  if (table === "payments") {
    return {
      amount_krw: payload.paid_amount ?? payload.amount_krw,
      service_name: payload.service_name ?? "시술",
      entry_type: payload.status === "refunded" ? "refund" : "paid",
      method_label: METHOD_TO[String(payload.method ?? "card")] ?? "card_terminal",
      booking_id: payload.booking_id ?? null,
      note: payload.override_reason ?? payload.note ?? null,
      store_id: payload.shop_id ?? payload.store_id,
    };
  }
  return next;
}



async function createBooking(args: Record<string, unknown>) {
  const storeId = String(args.p_shop);
  const blocked = Boolean(args.p_blocked);
  let customerId = (args.p_customer_id as string | null) ?? null;
  let createdCustomer = false;
  if (!blocked && !customerId) {
    const phone = String(args.p_customer_phone ?? "").replace(/\D/g, "");
    if (phone) {
      const found = await raw.from("customers").select("id").eq("store_id", storeId).eq("phone", phone).limit(1);
      customerId = found.data?.[0]?.id ?? null;
    }
    if (!customerId && String(args.p_customer_name ?? "").trim()) {
      const created = await raw.from("customers").insert({
        store_id: storeId,
        name: String(args.p_customer_name).trim(),
        phone: phone || null,
      }).select("id").single();
      if (created.error) return { data: null, error: created.error };
      customerId = created.data.id;
      createdCustomer = true;
    }
  }
  const inserted = await raw.from("bookings").insert({
    store_id: storeId,
    member_id: args.p_designer,
    customer_id: customerId,
    starts_at: args.p_start,
    ends_at: args.p_end,
    status: blocked ? "blocked" : "confirmed",
    source: args.p_source ?? "manual",
    memo: args.p_memo ?? null,
  }).select("id").single();
  if (inserted.error) {
    // 클라우드에 예약 테이블이 아직 없으면 이 브라우저에만 저장해요 (고객 앱 요청 · 캘린더가 같은 곳을 봐요)
    if (/bookings|relation|schema cache|does not exist/i.test(inserted.error.message ?? "")) {
      const items = [];
      for (const item of (args.p_items as { menu_item_id?: string }[] | null) ?? []) {
        if (!item.menu_item_id) continue;
        const menu = await raw.from("store_menus").select("id, name, price_krw").eq("id", item.menu_item_id).maybeSingle();
        if (menu.data) items.push({ menu_item_id: menu.data.id, name: menu.data.name, price: menu.data.price_krw, menu_items: { menu_categories: { kind: kindOfName(menu.data.name) } } });
      }
      let customer;
      if (customerId) {
        const c = await raw.from("customers").select("name, phone").eq("id", customerId).maybeSingle();
        if (c.data) customer = { name: c.data.name ?? null, phone: c.data.phone ?? null };
      }
      const id = uid();
      saveLocalRows("bookings", [...localRows("bookings"), {
        id, shop_id: storeId, designer_id: args.p_designer, start_at: args.p_start, end_at: args.p_end,
        status: blocked ? "blocked" : args.p_source === "customer_app" ? "requested" : "confirmed", source: args.p_source ?? "manual", memo: args.p_memo ?? null,
        customer_request: null, shop_customer_id: customerId, created_at: new Date().toISOString(), respond_by: null, designer_requested: false,
        customer, booking_items: items, pre_surveys: [],
      }]);
      return { data: id, error: null };
    }
    if (createdCustomer && customerId) await raw.from("customers").delete().eq("id", customerId);
    return { data: null, error: inserted.error };
  }
  const items = (args.p_items as { menu_item_id?: string }[] | null) ?? [];
  for (const item of items) {
    if (!item.menu_item_id) continue;
    const menu = await raw.from("store_menus").select("id, name, price_krw, duration_min").eq("id", item.menu_item_id).maybeSingle();
    if (menu.data) {
      await raw.from("booking_items").insert({
        booking_id: inserted.data.id,
        menu_id: menu.data.id,
        name: menu.data.name,
        price_krw: menu.data.price_krw,
        duration_min: menu.data.duration_min,
      });
    }
  }
  return { data: inserted.data.id, error: null };
}

async function completeCheckout(args: Record<string, unknown>) {
  let booking = await raw.from("bookings").select("id, store_id").eq("id", args.p_booking).maybeSingle();
  const localBooking = localRows("bookings").find((r) => r.id === args.p_booking);
  if (!booking.data && localBooking) booking = { data: { id: localBooking.id, store_id: localBooking.shop_id }, error: null };
  if (!booking.data) return { data: null, error: { message: "예약을 찾지 못했습니다." } };
  const lines = (args.p_lines as { name: string }[]) ?? [];
  const saved = await raw.from("payment_entries").insert({
    store_id: booking.data.store_id,
    booking_id: booking.data.id,
    amount_krw: args.p_paid_amount,
    service_name: lines.map((line) => line.name).join("+") || "시술",
    entry_type: "paid",
    method_label: METHOD_TO[String(args.p_method ?? "card")] ?? "card_terminal",
    note: args.p_override_reason ?? args.p_memo ?? null,
  });
  if (saved.error && /booking_id/.test(saved.error.message)) {
    const retry = await raw.from("payment_entries").insert({
      store_id: booking.data.store_id,
      amount_krw: args.p_paid_amount,
      service_name: lines.map((line) => line.name).join("+") || "시술",
      entry_type: "paid",
      method_label: METHOD_TO[String(args.p_method ?? "card")] ?? "card_terminal",
      note: args.p_memo ?? null,
    });
    if (retry.error) return { data: null, error: retry.error };
  } else if (saved.error) return { data: null, error: saved.error };
  if (localBooking) saveLocalRows("bookings", localRows("bookings").map((r) => (r.id === localBooking.id ? { ...r, status: "completed" } : r)));
  else await raw.from("bookings").update({ status: "completed" }).eq("id", booking.data.id);
  return { data: booking.data.id, error: null };
}

async function exportCustomers(args: Record<string, unknown>) {
  const storeId = String(args.p_shop);
  let customers = await raw.from("customers").select("id, name, phone, memo, member_id, created_at").eq("store_id", storeId).order("name");
  if (customers.error && /memo|member_id/.test(customers.error.message)) {
    customers = await raw.from("customers").select("id, name, phone, created_at").eq("store_id", storeId).order("name");
  }
  if (customers.error) return { data: null, error: customers.error };
  const members = await raw.from("store_members").select("id, display_name").eq("store_id", storeId);
  const names = new Map((members.data ?? []).map((member) => [member.id, member.display_name]));
  return {
    data: (customers.data ?? []).map((row) => ({
      name: row.name,
      phone: row.phone ?? null,
      designer: names.get(row.member_id) ?? null,
      visit_count: 0,
      last_visit_at: null,
      points: 0,
      prepaid_balance: 0,
      memo: row.memo ?? null,
      created_at: row.created_at,
    })),
    error: null,
  };
}

async function importCustomers(args: Record<string, unknown>) {
  const storeId = String(args.p_shop);
  const rows = (args.p_rows as { name?: string; phone?: string; designer?: string; memo?: string }[]) ?? [];
  const existing = await raw.from("customers").select("id, phone").eq("store_id", storeId);
  if (existing.error) return { data: null, error: existing.error };
  const byPhone = new Map<string, string>();
  for (const row of existing.data ?? []) {
    const phone = String(row.phone ?? "").replace(/\D/g, "");
    if (phone) byPhone.set(phone, row.id);
  }
  const members = await raw.from("store_members").select("id, display_name").eq("store_id", storeId);
  const byName = new Map((members.data ?? []).map((member) => [String(member.display_name).trim(), member.id]));
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    if (!name) { skipped += 1; continue; }
    const phone = String(row.phone ?? "").replace(/\D/g, "");
    const memberId = row.designer ? byName.get(String(row.designer).trim()) ?? null : null;
    const id = phone ? byPhone.get(phone) : null;
    if (id) {
      let saved = await raw.from("customers").update({ name, phone: phone || null, memo: row.memo || null, member_id: memberId }).eq("id", id);
      if (saved.error && /memo|member_id/.test(saved.error.message)) {
        saved = await raw.from("customers").update({ name, phone: phone || null }).eq("id", id);
      }
      if (saved.error) return { data: null, error: saved.error };
      updated += 1;
    } else {
      let saved = await raw.from("customers").insert({ store_id: storeId, name, phone: phone || null, memo: row.memo || null, member_id: memberId }).select("id").single();
      if (saved.error && /memo|member_id/.test(saved.error.message)) {
        saved = await raw.from("customers").insert({ store_id: storeId, name, phone: phone || null }).select("id").single();
      }
      if (saved.error) return { data: null, error: saved.error };
      if (phone && saved.data) byPhone.set(phone, saved.data.id);
      inserted += 1;
    }
  }
  return { data: { inserted, updated, skipped }, error: null };
}

/** 클라우드 테이블이 있는 부가 기능 (앱 이름 → 실제 테이블 · 쓸 수 있는 칸) */
const SIMPLE: Record<string, { table: string; cols: string[] }> = {
  shop_business_hours: { table: "store_business_hours", cols: ["store_id", "weekday", "is_closed", "open_time", "close_time", "break_start", "break_end"] },
  shop_holidays: { table: "store_holidays", cols: ["id", "store_id", "start_date", "end_date", "reason"] },
  shop_events: { table: "store_events", cols: ["id", "store_id", "event_date", "title"] },
  member_offs: { table: "member_offs", cols: ["id", "store_id", "member_id", "off_date", "kind", "memo"] },
  pre_surveys: { table: "pre_surveys", cols: ["id", "store_id", "booking_id", "customer_id", "status", "topic", "kinds", "items", "answers", "flags", "summary", "guides", "is_sample", "sent_at", "answered_at"] },
  audit_logs: { table: "audit_logs", cols: ["id", "store_id", "actor_id", "action", "target_id", "before", "after", "created_at"] },
  showcase_grace: { table: "showcase_grace", cols: ["id", "store_id", "ai_path", "title", "remove_after", "resolved_at"] },
  hq_notices: { table: "hq_notices", cols: ["id", "title", "body", "important", "published_at"] },
  // 고객 앱(/c)과 공유하는 테이블
  treatment_records: { table: "treatment_records", cols: ["id", "store_id", "booking_id", "customer_id", "member_id", "customer_name", "service_label", "service_snapshot", "payment_id", "ai_summary", "shared", "is_sample", "sent_at", "products", "damage_level", "designer_diagnosis", "home_care", "created_at"] },
  treatment_photos: { table: "treatment_photos", cols: ["id", "store_id", "record_id", "member_id", "customer_id", "kind", "path", "ai_path", "ai_status", "ai_engine", "showcase", "showcase_channels", "send_to_customer", "created_at"] },
  payment_requests: { table: "payment_requests", cols: ["id", "store_id", "booking_id", "customer_id", "member_id", "lines", "subtotal", "points_used", "deposit_applied", "amount", "booked_total", "memo", "status", "payment_entry_id", "approved_at", "created_at"] },
  booking_style_photos: { table: "booking_style_photos", cols: ["id", "store_id", "booking_id", "customer_id", "kind", "source", "path", "title", "created_at"] },
  consult_logs: { table: "consult_logs", cols: ["id", "store_id", "booking_id", "survey_id", "member_id", "kind", "detail", "created_at"] },
  customer_consents: { table: "customer_consents", cols: ["id", "store_id", "customer_id", "type", "agreed", "channels", "source", "agreed_at"] },
  prepaid_ledger: { table: "prepaid_ledger", cols: ["id", "store_id", "customer_id", "kind", "amount", "pay_method", "memo", "created_at"] },
  booking_change_requests: { table: "booking_change_requests", cols: ["id", "store_id", "booking_id", "user_id", "kind", "message", "status", "created_at", "handled_at"] },
  treatment_ratings: { table: "treatment_ratings", cols: ["id", "booking_id", "store_id", "member_id", "user_id", "score", "comment", "created_at"] },
};

const HYBRID = new Set(["shop_members", "menu_items", "shop_customers", "v_shop_customers", "customers"]);
const canon = (table: string) => (table === "v_shop_customers" || table === "customers" ? "shop_customers" : table);

/** 실제 테이블 칸으로 보낼 값 / 브라우저 추가 칸(overlay)으로 보낼 값 나누기 */
function splitPayload(table: string, p: Record<string, unknown>) {
  const phys: Record<string, unknown> = {};
  const used = new Set<string>();
  const take = (appKey: string, dbCol = appKey, value = p[appKey]) => { if (appKey in p) { phys[dbCol] = value; used.add(appKey); } };
  if (table === "menu_items") {
    take("shop_id", "store_id"); take("name"); take("duration_min"); take("sort_order"); take("price", "price_krw");
    if ("status" in p) { phys.paused = p.status === "paused"; used.add("status"); }
  } else if (table === "shop_customers") {
    take("shop_id", "store_id"); take("name"); take("phone"); take("memo"); take("assigned_designer_id", "member_id");
  } else if (table === "shop_members") {
    take("shop_id", "store_id"); take("display_name"); take("title"); take("status"); take("invite_code"); take("invited_phone");
    take("permissions"); take("is_designer"); take("sort_order"); take("user_id");
    if ("role" in p) {
      const r = p.role;
      phys.role = r === "designer" ? "staff" : r === "desk" ? "assistant" : r === "owner" ? "owner" : r === "branch_manager" ? "manager" : "custom";
      used.add("role");
    }
  }
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!used.has(k)) extras[k] = v;
  return { phys, extras };
}

async function hybridRows(table: string, filters: Filter[]) {
  const t = canon(table);
  const physical = TABLES[t === "shop_customers" ? "customers" : t];
  let q = raw.from(physical).select("*");
  for (const [op, key, value] of filters) if (op === "eq" && key === "shop_id") q = q.eq("store_id", value);
  const res = await q;
  if (res.error) return { rows: null, error: res.error };
  const over = overlayOf(t);
  const mapped = (res.data ?? []).map((r) => {
    const m = mapRow(t === "shop_customers" ? "customers" : t, r);
    m.shop_id = r.store_id;
    return { ...m, ...(over[m.id] ?? {}) };
  });
  const local = localRows(t).map((r) => ({ ...r, ...(over[r.id as string] ?? {}) }));
  let rows = [...mapped, ...local];
  if (t === "shop_members") {
    const shopId = filters.find(([op, k]) => op === "eq" && k === "shop_id")?.[2] ?? mapped[0]?.shop_id ?? null;
    rows = [...rows, ...previewShopMembers(rows).map((r) => ({ ...r, shop_id: shopId, ...(over[r.id] ?? {}) }))];
  }
  return { rows, error: null };
}

const DEFAULT_INFLOWS = ["네이버", "인스타", "지인소개", "지나가다", "기타"];
const shopFromStore = (s: Record<string, unknown>) => ({
  id: s.id, name: s.name, phone: s.phone ?? null, address: s.address ?? null, postcode: s.postcode ?? null, address_detail: s.address_detail ?? null,
  status: s.status === "approved" ? "active" : s.status === "suspended" ? "suspended" : "pending", shop_type: s.form, industries: [s.category], brand_id: null,
  length_mode: s.length_mode && s.length_mode !== "none" ? s.length_mode : "item",
  inflow_sources: Array.isArray(s.inflow_sources) && s.inflow_sources.length ? s.inflow_sources : DEFAULT_INFLOWS,
  naver_place_url: s.naver_place_url ?? null, naver_place_id: s.naver_place_id ?? null, naver_login_id: s.naver_login_id ?? null, naver_status: s.naver_status ?? "none",
  created_at: s.created_at, ...(overlayOf("shops")[s.id as string] ?? {}),
});

async function shopsRows() {
  const res = await raw.from("stores").select("*");
  if (res.error) return { rows: null, error: res.error };
  return { rows: (res.data ?? []).map(shopFromStore), error: null };
}

function builder(table: string) {
  const state: {
    op: "select" | "insert" | "update" | "delete" | "upsert";
    filters: Filter[];
    orders: [string, boolean, boolean?][];
    limit: number | null;
    from: number | null;
    to: number | null;
    single: "" | "one" | "maybe";
    payload: Record<string, unknown> | Record<string, unknown>[] | null;
    head: boolean;
    returning: boolean;
  } = { op: "select", filters: [], orders: [], limit: null, from: null, to: null, single: "", payload: null, head: false, returning: false };

  const finish = (rows: Record<string, unknown>[], count = rows.length) => {
    if (state.head) return { data: null, error: null, count };
    if (state.single === "one") return rows[0] ? { data: rows[0], error: null, count } : { data: null, error: { message: "행을 찾지 못했어요.", code: "PGRST116" }, count };
    if (state.single === "maybe") return { data: rows[0] ?? null, error: null, count };
    return { data: rows, error: null, count };
  };

  const runHybrid = async () => {
    const t = canon(table);
    if (state.op === "select") {
      const { rows, error } = await hybridRows(table, state.filters);
      if (error) return { data: null, error, count: null };
      const matched = applyQuery(rows, { ...state, limit: null, from: null, to: null });
      return finish(applyQuery(matched, { filters: [], orders: [], limit: state.limit, from: state.from, to: state.to }), matched.length);
    }
    const list = Array.isArray(state.payload) ? state.payload : [state.payload ?? {}];
    if (state.op === "insert" || state.op === "upsert") {
      const made: Record<string, unknown>[] = [];
      for (const item of list) {
        const { phys, extras } = splitPayload(t, item);
        if (t === "shop_members") {
          const res = await raw.from("store_members").insert({ role: "custom", display_name: "구성원", ...phys }).select("*").single();
          if (!res.error && res.data) { made.push({ ...mapMember(res.data), shop_id: res.data.store_id }); continue; }
          // 클라우드에 넣지 못하면 이 브라우저에 임시 저장해요
          const row = { id: uid(), created_at: new Date().toISOString(), status: "active", permissions: {}, is_designer: false, sort_order: localRows(t).length + 10, ...item };
          saveLocalRows(t, [...localRows(t), row]);
          made.push(row);
          continue;
        }
        const physTable = t === "menu_items" ? "store_menus" : "customers";
        let ins = await raw.from(physTable).insert(t === "menu_items" ? { sort_order: 0, duration_min: 60, price_krw: 0, ...phys } : phys).select("*").single();
        const moved: Record<string, unknown> = {};
        if (ins.error && t === "shop_customers" && /memo|member_id/.test(ins.error.message ?? "")) {
          const { memo, member_id, ...rest } = phys;
          if (memo !== undefined) moved.memo = memo;
          if (member_id !== undefined) moved.assigned_designer_id = member_id;
          ins = await raw.from(physTable).insert(rest).select("*").single();
        }
        if (ins.error) return { data: null, error: ins.error, count: null };
        patchOverlay(t, ins.data.id, { ...extras, ...moved });
        made.push({ ...mapRow(t === "shop_customers" ? "customers" : t, ins.data), shop_id: ins.data.store_id, ...extras, ...moved });
      }
      return finish(made);
    }
    // update · delete
    const { rows, error } = await hybridRows(table, state.filters);
    if (error) return { data: null, error, count: null };
    const hit = applyQuery(rows, { filters: state.filters, orders: [], limit: null });
    const out: Record<string, unknown>[] = [];
    for (const row of hit) {
      const id = row.id as string;
      const isLocal = localRows(t).some((r) => r.id === id) || String(id).startsWith("c0ffee00");
      if (state.op === "delete") {
        if (localRows(t).some((r) => r.id === id)) saveLocalRows(t, localRows(t).filter((r) => r.id !== id));
        else if (!isLocal) {
          const del = await raw.from(t === "menu_items" ? "store_menus" : t === "shop_members" ? "store_members" : "customers").delete().eq("id", id);
          if (del.error) return { data: null, error: del.error, count: null };
        }
        dropOverlay(t, id);
        out.push(row);
        continue;
      }
      const patch = state.payload as Record<string, unknown>;
      if (localRows(t).some((r) => r.id === id)) {
        saveLocalRows(t, localRows(t).map((r) => (r.id === id ? { ...r, ...patch } : r)));
        out.push({ ...row, ...patch });
        continue;
      }
      if (isLocal) { patchOverlay(t, id, patch); out.push({ ...row, ...patch }); continue; }
      const { phys, extras } = splitPayload(t, patch);
      const moved: Record<string, unknown> = {};
      if (Object.keys(phys).length) {
        const physTable = t === "menu_items" ? "store_menus" : t === "shop_members" ? "store_members" : "customers";
        let up = await raw.from(physTable).update(phys).eq("id", id);
        if (up.error && t === "shop_customers" && /memo|member_id/.test(up.error.message ?? "")) {
          const { memo, member_id, ...rest } = phys;
          if (memo !== undefined) moved.memo = memo;
          if (member_id !== undefined) moved.assigned_designer_id = member_id;
          up = Object.keys(rest).length ? await raw.from(physTable).update(rest).eq("id", id) : { error: null };
        }
        if (up.error) return { data: null, error: up.error, count: null };
      }
      if (Object.keys(extras).length || Object.keys(moved).length) patchOverlay(t, id, { ...extras, ...moved });
      out.push({ ...row, ...patch });
    }
    return finish(out);
  };

  const runShops = async () => {
    if (state.op === "select") {
      const { rows, error } = await shopsRows();
      if (error) return { data: null, error, count: null };
      const out = applyQuery(rows, state);
      return finish(out, out.length);
    }
    if (state.op === "update") {
      const { rows } = await shopsRows();
      const hit = applyQuery(rows ?? [], { filters: state.filters, orders: [], limit: null });
      const patch = state.payload as Record<string, unknown>;
      for (const row of hit) {
        const phys: Record<string, unknown> = {};
        for (const k of ["name", "phone", "address", "postcode", "address_detail", "inflow_sources", "length_mode", "naver_place_url", "naver_place_id", "naver_login_id", "naver_status"]) if (k in patch) phys[k] = patch[k];
        let kept: Record<string, unknown> = patch;
        if (Object.keys(phys).length) {
          const up = await raw.from("stores").update(phys).eq("id", row.id);
          if (up.error && /column|schema cache/i.test(up.error.message ?? "")) {
            // 이 프로젝트에 칸이 아직 없으면 예전처럼 브라우저에 덧붙여 저장해요
            const base = Object.fromEntries(Object.entries(phys).filter(([k]) => ["name", "phone", "address"].includes(k)));
            if (Object.keys(base).length) { const again = await raw.from("stores").update(base).eq("id", row.id); if (again.error) return { data: null, error: again.error, count: null }; }
          } else if (up.error) return { data: null, error: up.error, count: null };
          else kept = Object.fromEntries(Object.entries(patch).filter(([k]) => !(k in phys)));
        }
        if (Object.keys(kept).length) patchOverlay("shops", row.id as string, kept);
      }
      return finish(hit.map((r) => ({ ...r, ...patch })));
    }
    return finish([]);
  };

  /** 예약: 클라우드 테이블 + 이 브라우저에만 저장된 예약(테이블이 아직 없을 때)을 함께 다뤄요 */
  const runBookings = async () => {
    const localAll = () => localRows("bookings");
    if (state.op === "select") {
      const keep = { single: state.single, head: state.head };
      state.single = ""; state.head = false;
      const res = await runPhysical();
      state.single = keep.single; state.head = keep.head;
      let phys = res.error || !Array.isArray(res.data) ? [] : res.data.map((r) => ({ ...r, shop_id: r.store_id }));
      if (phys.length) {
        const sv = await raw.from("pre_surveys").select("id, booking_id, status, flags").in("booking_id", phys.map((r) => r.id));
        if (!sv.error) {
          const by = new Map<string, Record<string, unknown>[]>();
          for (const s of sv.data ?? []) by.set(s.booking_id, [...(by.get(s.booking_id) ?? []), { id: s.id, status: s.status, flags: s.flags ?? [] }]);
          phys = phys.map((r) => ({ ...r, pre_surveys: by.get(r.id) ?? [] }));
        }
      }
      const mine = applyQuery(localAll(), { filters: state.filters, orders: [], limit: null });
      const merged = applyQuery([...phys, ...mine], { filters: [], orders: state.orders, limit: state.limit });
      return finish(merged, merged.length);
    }
    if (state.op === "insert" || state.op === "upsert") {
      const res = await runPhysical();
      if (!res.error) return res;
      const list = Array.isArray(state.payload) ? state.payload : [state.payload ?? {}];
      const made = list.map((p) => ({ id: uid(), created_at: new Date().toISOString(), booking_items: [], pre_surveys: [], ...p }));
      saveLocalRows("bookings", [...localAll(), ...made]);
      return finish(made);
    }
    const mine = applyQuery(localAll(), { filters: state.filters, orders: [], limit: null });
    if (!mine.length) return runPhysical();
    const ids = new Set(mine.map((r) => r.id));
    if (state.op === "delete") saveLocalRows("bookings", localAll().filter((r) => !ids.has(r.id)));
    else saveLocalRows("bookings", localAll().map((r) => (ids.has(r.id) ? { ...r, ...(state.payload as Record<string, unknown>) } : r)));
    return finish(mine.map((r) => ({ ...r, ...(state.op === "update" ? (state.payload as Record<string, unknown>) : {}) })));
  };

  /** 클라우드에 실제 테이블이 있는 부가 기능: 클라우드 우선, 이 브라우저에 남아 있던 옛 행도 함께 보여줘요 */
  const runSimple = async () => {
    const def = SIMPLE[table];
    const local = () => localRows(table);
    const alias = (r: Record<string, unknown>) => ({ ...r, ...(r.store_id ? { shop_id: r.store_id } : {}), ...(r.customer_id !== undefined ? { shop_customer_id: r.customer_id } : {}), ...(r.member_id !== undefined ? { designer_id: r.member_id } : {}) });
    const toDb = (p: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) { const c = dbKey(k); if (def.cols.includes(c)) out[c] = v; }
      return out;
    };
    const missing = (e: { message?: string; code?: string } | null) => !!e && e.code !== "23505" && /relation|does not exist|schema cache|permission denied|row-level security|JWT|violates/i.test(e.message ?? "");
    const fetchAll = async () => {
      let q = raw.from(def.table).select("*");
      for (const [op, key, value] of state.filters) {
        const c = dbKey(key);
        if (key.includes(".") || !def.cols.includes(c)) continue;
        if (op === "eq" && value != null) q = q.eq(c, value);
        if (op === "in") q = q.in(c, value as never[]);
      }
      const res = await q;
      if (res.error) return { rows: [] as Record<string, unknown>[], error: res.error };
      let rows = (res.data ?? []).map(alias);
      if (table === "pre_surveys" && rows.length) {
        const bk = await raw.from("bookings").select("id, starts_at, status, member_id").in("id", rows.map((r) => r.booking_id).filter(Boolean));
        const cu = await raw.from("customers").select("id, name").in("id", rows.map((r) => r.customer_id).filter(Boolean));
        const bm = new Map((bk.data ?? []).map((b) => [b.id, b]));
        const cm = new Map((cu.data ?? []).map((c) => [c.id, c]));
        rows = rows.map((r) => {
          const b = bm.get(r.booking_id as string);
          const c = cm.get(r.customer_id as string);
          return { ...r, bookings: b ? { start_at: b.starts_at, status: b.status, designer_id: b.member_id } : null, shop_customers: c ? { name: c.name } : null, "bookings.start_at": b?.starts_at ?? null };
        });
      }
      // 묶어서 보여주는 칸 (예: shop_members(display_name), treatment_photos(...))
      if ((table === "treatment_records" || table === "consult_logs") && rows.length) {
        const mem = await raw.from("store_members").select("id, display_name").in("id", rows.map((r) => r.member_id).filter(Boolean));
        const mm = new Map((mem.data ?? []).map((m) => [m.id, m]));
        rows = rows.map((r) => ({ ...r, designer_id: r.member_id, shop_members: mm.get(r.member_id as string) ?? null }));
      }
      if (table === "treatment_records" && rows.length) {
        const ph = await raw.from("treatment_photos").select("*").in("record_id", rows.map((r) => r.id));
        rows = rows.map((r) => ({ ...r, treatment_photos: (ph.data ?? []).filter((p) => p.record_id === r.id).map(alias) }));
      }
      return { rows, error: null };
    };
    if (state.op === "select") {
      const { rows, error } = await fetchAll();
      const all = [...rows, ...local().map((r) => (table === "pre_surveys" ? { ...r, "bookings.start_at": r.start ?? null } : r))];
      if (error && !missing(error)) return { data: null, error, count: null };
      const matched = applyQuery(all, { ...state, limit: null, from: null, to: null });
      return finish(applyQuery(matched, { filters: [], orders: [], limit: state.limit, from: state.from, to: state.to }), matched.length);
    }
    if (state.op === "insert" || state.op === "upsert") {
      const list = (Array.isArray(state.payload) ? state.payload : [state.payload ?? {}]).map(toDb);
      const q = def.table === "store_business_hours" && state.op === "upsert"
        ? raw.from(def.table).upsert(list, { onConflict: "store_id,weekday" })
        : raw.from(def.table).insert(list);
      const res = await q.select("*");
      if (!res.error) return finish((res.data ?? []).map(alias));
      if (!missing(res.error)) return { data: null, error: res.error, count: null };
      return runLocal(table, state);
    }
    const { rows, error } = await fetchAll();
    if (error && !missing(error)) return { data: null, error, count: null };
    const hit = applyQuery(rows, { filters: state.filters, orders: [], limit: null });
    const mine = applyQuery(local(), { filters: state.filters, orders: [], limit: null });
    let out = hit;
    if (hit.length) {
      const ids = hit.map((r) => r.id);
      if (state.op === "delete") {
        const del = await raw.from(def.table).delete().in("id", ids);
        if (del.error) return { data: null, error: del.error, count: null };
      } else {
        const up = await raw.from(def.table).update(toDb(state.payload as Record<string, unknown>)).in("id", ids);
        if (up.error) return { data: null, error: up.error, count: null };
        out = hit.map((r) => ({ ...r, ...(state.payload as Record<string, unknown>) }));
      }
    }
    if (mine.length) {
      const set = new Set(mine.map((r) => r.id));
      if (state.op === "delete") saveLocalRows(table, local().filter((r) => !set.has(r.id)));
      else saveLocalRows(table, local().map((r) => (set.has(r.id) ? { ...r, ...(state.payload as Record<string, unknown>) } : r)));
      out = [...out, ...mine.map((r) => ({ ...r, ...(state.op === "update" ? (state.payload as Record<string, unknown>) : {}) }))];
    }
    return finish(out);
  };

  const run = async () => {
    if (SIMPLE[table]) return runSimple();
    if (HYBRID.has(table)) return runHybrid();
    if (table === "shops") return runShops();
    if (table === "bookings") return runBookings();
    return runPhysical();
  };

  const runPhysical = async () => {
    const physical = TABLES[table];
    if (!physical) return runLocal(table, state);
    let query = raw.from(physical);
    const select = table === "bookings"
      ? "id, store_id, member_id, starts_at, ends_at, status, source, memo, customer_id, created_at, customer_request, deposit_amount, customers(name, phone), booking_items(menu_id, name, price_krw)"
      : table === "payments"
        ? "id, amount_krw, entry_type, method_label, service_name, note, booking_id, created_at, store_id"
        : "*";
    if (state.op === "select") query = query.select(select, state.head ? { count: "exact", head: true } : undefined);
    if (state.op === "insert") query = query.insert(Array.isArray(state.payload) ? state.payload.map((row) => dbPayload(table, row)) : dbPayload(table, state.payload ?? {}));
    if (state.op === "update") query = query.update(dbPayload(table, (state.payload ?? {}) as Record<string, unknown>));
    if (state.op === "delete") query = query.delete();
    for (const [op, key, value] of state.filters) {
      const column = dbKey(key);
      if (column === "status" || column === "is_designer") continue;
      if (op === "eq") query = query.eq(column, value);
      if (op === "neq") query = query.neq(column, value);
      if (op === "in") query = query.in(column, value as never[]);
      if (op === "gte") query = query.gte(column, value);
      if (op === "gt") query = query.gt(column, value);
      if (op === "lt") query = query.lt(column, value);
      if (op === "lte") query = query.lte(column, value);
    }
    for (const [key, ascending] of state.orders) query = query.order(dbKey(key), { ascending });
    if (state.limit) query = query.limit(state.limit);
    const result = state.single === "one" ? await query.single() : state.single === "maybe" ? await query.maybeSingle() : await query;
    if (result.error) return { data: null, error: result.error, count: result.count ?? null };
    const data = result.data;
    if (Array.isArray(data)) return { data: data.map((row) => mapRow(table, row)), error: null, count: result.count ?? null };
    if (data && typeof data === "object") return { data: mapRow(table, data as Record<string, unknown>), error: null };
    return { data, error: null, count: result.count ?? null };
  };

  const api = {
    select(_columns?: string, options?: { head?: boolean; count?: string }) {
      if (state.op === "select") state.head = Boolean(options?.head);
      else state.returning = true;
      return api;
    },
    insert(payload: Record<string, unknown> | Record<string, unknown>[]) { state.op = "insert"; state.payload = payload; return api; },
    upsert(payload: Record<string, unknown> | Record<string, unknown>[]) { state.op = "upsert"; state.payload = payload; return api; },
    update(payload: Record<string, unknown>) { state.op = "update"; state.payload = payload; return api; },
    delete() { state.op = "delete"; return api; },
    eq(key: string, value: unknown) { state.filters.push(["eq", key, value]); return api; },
    neq(key: string, value: unknown) { state.filters.push(["neq", key, value]); return api; },
    in(key: string, value: unknown) { state.filters.push(["in", key, value]); return api; },
    gte(key: string, value: unknown) { state.filters.push(["gte", key, value]); return api; },
    gt(key: string, value: unknown) { state.filters.push(["gt", key, value]); return api; },
    lt(key: string, value: unknown) { state.filters.push(["lt", key, value]); return api; },
    lte(key: string, value: unknown) { state.filters.push(["lte", key, value]); return api; },
    is(key: string, value: unknown) { state.filters.push(["is", key, value]); return api; },
    ilike(key: string, value: unknown) { state.filters.push(["ilike", key, value]); return api; },
    like(key: string, value: unknown) { state.filters.push(["like", key, value]); return api; },
    contains(key: string, value: unknown) { state.filters.push(["contains", key, value]); return api; },
    not(key: string, op: string, value: unknown) { state.filters.push(["not", key, { op, value }]); return api; },
    or() { return api; },
    match(obj: Record<string, unknown>) { Object.entries(obj).forEach(([k, v]) => state.filters.push(["eq", k, v])); return api; },
    order(key: string, options?: { ascending?: boolean; nullsFirst?: boolean }) { state.orders.push([key, options?.ascending !== false, options?.nullsFirst]); return api; },
    limit(value: number) { state.limit = value; return api; },
    range(from: number, to: number) { state.from = from; state.to = to; return api; },
    single() { state.single = "one"; return api; },
    maybeSingle() { state.single = "maybe"; return api; },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return run().then(resolve, reject); },
  };
  return api;
}

export function createClient() {
  return {
    from: builder,
    rpc(name: string, args: Record<string, unknown> = {}) {
      const run = name === "create_booking" ? createBooking(args) : name === "complete_checkout" ? completeCheckout(args) : name === "export_customers" ? exportCustomers(args) : name === "import_customers" ? importCustomers(args) : localRpc(name, args);
      return { then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => run.then(resolve, reject) };
    },
    auth: {
      getUser: () => raw.auth.getUser(),
      getSession: () => raw.auth.getSession(),
      signOut: () => raw.auth.signOut(),
      onAuthStateChange: (cb: never) => raw.auth.onAuthStateChange(cb),
    },
    channel() {
      const channel = { on() { return channel; }, subscribe() { return channel; } };
      return channel;
    },
    removeChannel() { return Promise.resolve("ok"); },
    storage: {
      from(bucket: string) {
        return raw.storage.from(bucket);
      },
    },
  };
}
