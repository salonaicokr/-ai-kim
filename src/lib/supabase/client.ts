"use client";
// @ts-nocheck

import { supabase as raw } from "@/src/lib/browser";

const TO_DB: Record<string, string> = {
  shop_id: "store_id",
  start_at: "starts_at",
  end_at: "ends_at",
  designer_id: "member_id",
  shop_customer_id: "customer_id",
  menu_item_id: "menu_id",
  assigned_designer_id: "member_id",
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
  if (name.includes("컷")) return "cut";
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
    customer_request: null,
    deposit_amount: 0,
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

function mapMember(row: Record<string, unknown>) {
  const role = row.role === "staff" ? "designer" : row.role === "assistant" ? "desk" : row.role === "owner" ? "owner" : "custom";
  return {
    ...row,
    user_id: row.user_id ?? null,
    title: row.title || (role === "owner" ? "원장" : "디자이너"),
    role,
    permissions: {},
    status: "active",
    is_designer: row.role === "staff" || row.role === "owner",
    invite_code: null,
    invited_phone: null,
    sort_order: 0,
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

type Filter = ["eq" | "neq" | "in" | "gte" | "lt" | "not", string, unknown];

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
  const booking = await raw.from("bookings").select("id, store_id").eq("id", args.p_booking).maybeSingle();
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
  await raw.from("bookings").update({ status: "completed" }).eq("id", booking.data.id);
  return { data: booking.data.id, error: null };
}

function builder(table: string) {
  const state: {
    op: "select" | "insert" | "update" | "delete";
    filters: Filter[];
    orders: [string, boolean][];
    limit: number | null;
    single: "" | "one" | "maybe";
    payload: Record<string, unknown> | Record<string, unknown>[] | null;
    head: boolean;
  } = { op: "select", filters: [], orders: [], limit: null, single: "", payload: null, head: false };
  const run = async () => {
    const physical = TABLES[table];
    if (!physical) return { data: state.single ? null : [], error: null, count: 0 };
    let query = raw.from(physical);
    const select = table === "bookings"
      ? "id, member_id, starts_at, ends_at, status, source, memo, customer_id, created_at, customers(name, phone), booking_items(menu_id, name, price_krw)"
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
      if (op === "lt") query = query.lt(column, value);
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
      return api;
    },
    insert(payload: Record<string, unknown> | Record<string, unknown>[]) { state.op = "insert"; state.payload = payload; return api; },
    update(payload: Record<string, unknown>) { state.op = "update"; state.payload = payload; return api; },
    delete() { state.op = "delete"; return api; },
    eq(key: string, value: unknown) { state.filters.push(["eq", key, value]); return api; },
    neq(key: string, value: unknown) { state.filters.push(["neq", key, value]); return api; },
    in(key: string, value: unknown) { state.filters.push(["in", key, value]); return api; },
    gte(key: string, value: unknown) { state.filters.push(["gte", key, value]); return api; },
    lt(key: string, value: unknown) { state.filters.push(["lt", key, value]); return api; },
    not() { return api; },
    or() { return api; },
    order(key: string, options?: { ascending?: boolean }) { state.orders.push([key, options?.ascending !== false]); return api; },
    limit(value: number) { state.limit = value; return api; },
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
      const run = name === "create_booking" ? createBooking(args) : name === "complete_checkout" ? completeCheckout(args) : Promise.resolve({ data: null, error: { message: "이 동작은 아직 연결되지 않았습니다." } });
      return { then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => run.then(resolve, reject) };
    },
    channel() {
      const channel = { on() { return channel; }, subscribe() { return channel; } };
      return channel;
    },
    removeChannel() { return Promise.resolve("ok"); },
    storage: { from() { return { upload: async () => ({ error: { message: "사진 보관은 연결 전입니다." } }), createSignedUrls: async () => ({ data: [] }), remove: async () => ({ error: null }) }; } },
  };
}
