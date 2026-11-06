// @ts-nocheck
"use client";
// @ts-nocheck

/**
 * 클라우드 DB(djtuwvzppfhfacejcwst)에 아직 테이블이 없는 기능용 임시 저장소.
 * 같은 브라우저 localStorage 에만 저장돼요 (다른 기기와 공유되지 않음).
 * 테이블이 클라우드에 적용되면 client.ts 의 TABLES 에 연결하면 같은 코드가 그대로 동작해요.
 */

const PREFIX = "salonai.local.";
const mem: Record<string, unknown> = {};

function read(key: string, fallback: unknown) {
  if (key in mem) return mem[key];
  try {
    const raw = localStorage.getItem(PREFIX + key);
    mem[key] = raw ? JSON.parse(raw) : fallback;
  } catch {
    mem[key] = fallback;
  }
  return mem[key];
}
function write(key: string, value: unknown) {
  mem[key] = value;
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
}

export const localRows = (table: string): Record<string, unknown>[] => read(`t.${table}`, []) as Record<string, unknown>[];
export const saveLocalRows = (table: string, rows: Record<string, unknown>[]) => write(`t.${table}`, rows);

/** 실제 테이블 행에 덧붙는 추가 칸 (클라우드에 없는 컬럼) */
export const overlayOf = (table: string): Record<string, Record<string, unknown>> => read(`o.${table}`, {}) as Record<string, Record<string, unknown>>;
export function patchOverlay(table: string, id: string, patch: Record<string, unknown>) {
  const all = { ...overlayOf(table) };
  all[id] = { ...(all[id] ?? {}), ...patch };
  write(`o.${table}`, all);
}
export function dropOverlay(table: string, id: string) {
  const all = { ...overlayOf(table) };
  delete all[id];
  write(`o.${table}`, all);
}

/** 단순 키-값 (설정 등) */
export const kv = {
  get: (key: string, fallback: unknown = null) => read(`kv.${key}`, fallback),
  set: (key: string, value: unknown) => write(`kv.${key}`, value),
};

export const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export type Filter = ["eq" | "neq" | "in" | "gte" | "gt" | "lt" | "lte" | "is" | "ilike" | "like" | "contains" | "not", string, unknown];

const cmp = (a: unknown, b: unknown) => (a == null || b == null ? NaN : a < (b as never) ? -1 : a > (b as never) ? 1 : 0);

export function matches(row: Record<string, unknown>, [op, key, value]: Filter) {
  const v = row[key];
  switch (op) {
    case "eq": return v === value || (v != null && value != null && String(v) === String(value));
    case "neq": return !(v === value || (v != null && value != null && String(v) === String(value)));
    case "in": return (value as unknown[]).some((x) => x === v || String(x) === String(v));
    case "gte": return cmp(v, value) >= 0;
    case "gt": return cmp(v, value) > 0;
    case "lt": return cmp(v, value) < 0;
    case "lte": return cmp(v, value) <= 0;
    case "is": return value === null ? v == null : v === value;
    case "ilike":
    case "like": {
      const pattern = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`, "i").test(String(v ?? ""));
    }
    case "not": return !matches(row, [(value as { op: Filter[0] }).op, key, (value as { value: unknown }).value]);
    case "contains": return Array.isArray(v) && (value as unknown[]).every((x) => v.includes(x));
    default: return true;
  }
}

export function applyQuery(rows: Record<string, unknown>[], state: { filters: Filter[]; orders: [string, boolean, boolean?][]; limit: number | null; from?: number | null; to?: number | null }) {
  let out = rows.filter((row) => state.filters.every((f) => matches(row, f)));
  for (const [key, asc, nullsFirst] of [...state.orders].reverse()) {
    out = [...out].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return nullsFirst ? -1 : 1;
      if (bv == null) return nullsFirst ? 1 : -1;
      const c = av < bv ? -1 : av > bv ? 1 : 0;
      return asc ? c : -c;
    });
  }
  if (state.from != null && state.to != null) out = out.slice(state.from, state.to + 1);
  if (state.limit) out = out.slice(0, state.limit);
  return out;
}

/** 아무 테이블이나 localStorage 로 처리 (insert · update · delete · select) */
export function runLocal(table: string, state: {
  op: "select" | "insert" | "update" | "delete" | "upsert";
  filters: Filter[]; orders: [string, boolean, boolean?][]; limit: number | null; single: "" | "one" | "maybe";
  payload: Record<string, unknown> | Record<string, unknown>[] | null; head: boolean; from?: number | null; to?: number | null;
}) {
  const rows = localRows(table);
  const wrap = (data: Record<string, unknown>[], count = data.length) => {
    if (state.head) return { data: null, error: null, count };
    if (state.single === "one") return data[0] ? { data: data[0], error: null, count } : { data: null, error: { message: "행을 찾지 못했어요." }, count };
    if (state.single === "maybe") return { data: data[0] ?? null, error: null, count };
    return { data, error: null, count };
  };
  if (state.op === "insert" || state.op === "upsert") {
    const list = Array.isArray(state.payload) ? state.payload : [state.payload ?? {}];
    const made = list.map((p) => ({ id: uid(), created_at: new Date().toISOString(), ...p }));
    if (state.op === "upsert") {
      const next = [...rows];
      for (const m of made) {
        const at = next.findIndex((r) => r.id === m.id || (m.shop_id && r.shop_id === m.shop_id && ("weekday" in m ? r.weekday === m.weekday : false)));
        if (at >= 0) next[at] = { ...next[at], ...m, id: next[at].id }; else next.push(m);
      }
      saveLocalRows(table, next);
    } else saveLocalRows(table, [...rows, ...made]);
    return wrap(made);
  }
  if (state.op === "update") {
    const hit: Record<string, unknown>[] = [];
    const next = rows.map((r) => {
      if (!state.filters.every((f) => matches(r, f))) return r;
      const merged = { ...r, ...(state.payload as Record<string, unknown>) };
      hit.push(merged);
      return merged;
    });
    saveLocalRows(table, next);
    return wrap(hit);
  }
  if (state.op === "delete") {
    const gone = rows.filter((r) => state.filters.every((f) => matches(r, f)));
    saveLocalRows(table, rows.filter((r) => !gone.includes(r)));
    return wrap(gone);
  }
  const out = applyQuery(rows, state);
  return wrap(out, rows.filter((r) => state.filters.every((f) => matches(r, f))).length);
}
