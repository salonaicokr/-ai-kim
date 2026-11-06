// @ts-nocheck
"use client";
// @ts-nocheck

/**
 * 본사(/hq) 동작 모음.
 * 매장 · 결제 · 예약은 실제 클라우드 데이터를 읽고, 본사 전용 설정(영업조직 · 요금표 · 정산 · 공지 · 운영 계정 등)은
 * 클라우드에 테이블이 아직 없어서 이 브라우저(localStorage)에 저장해요. 매장 화면과는 같은 값을 공유해요.
 */

import { supabase as raw } from "@/src/lib/browser";
import { checkChar, validRepCode } from "@/src/lib/sales-code";
import { kv, localRows, patchOverlay, saveLocalRows, uid } from "./local-db";

type Res = { data: unknown; error: { message: string } | null };
const ok = (data: unknown = null): Res => ({ data, error: null });
const fail = (message: string): Res => ({ data: null, error: { message } });

const now = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const BY = "마스터 (테스트 입장)";

/* ───── 저장 상태 ───── */
type ShopMeta = {
  status?: "pending" | "active" | "suspended"; code?: string | null; plan?: string; addons?: Record<string, string>;
  billing?: string; billing_day?: number | null; billing_log?: unknown[]; log?: unknown[]; naver_verified?: boolean;
  assignments?: unknown[]; referral?: string | null;
};
type State = {
  admins: { email: string; role: string; created: string }[];
  orgs: Record<string, unknown>[];
  reps: Record<string, unknown>[];
  regions: { name: string; prefix: string }[];
  rules: Record<string, unknown>[];
  billing: { plans: Record<string, unknown>[]; addons: Record<string, unknown>[]; prices: Record<string, unknown>[]; mode: string; log: Record<string, unknown>[] };
  settle: Record<string, Record<string, unknown>>;
  shops: Record<string, ShopMeta>;
};

function seed(): State {
  const t = now();
  return {
    admins: [{ email: "master@salonai.local", role: "hq_master", created: t }],
    orgs: [{ id: "org-hq", parent: null, code: "HQ01", name: "본사 직영", type: "본부", active: true, opened: today(), closed: null }],
    reps: [],
    regions: [{ name: "서울", prefix: "SL" }, { name: "인천", prefix: "IC" }, { name: "부산", prefix: "BS" }, { name: "대구", prefix: "DG" }, { name: "분당", prefix: "BD" }],
    rules: [{ version: 1, base: "영업매출", rate: 0.1, months: null, from: today(), to: null, note: "초기 정책 (임시값)", by: null, at: t }],
    billing: {
      plans: [{ code: "standard", name: "스탠다드", monthly_fee: 49000, included_msgs: 0, active: true, note: "매장 ERP 전체와 고객 앱 예약" }],
      addons: [
        { code: "naver_booking", name: "네이버 예약 연동", monthly_fee: 19000, available: false, note: "네이버와 절차 진행 중" },
        { code: "kakao_alimtalk", name: "카카오 알림톡", monthly_fee: 9900, available: false, note: "준비 중" },
        { code: "ai_retouch", name: "AI 보정 사진", monthly_fee: 14900, available: true, note: "" },
      ],
      prices: [{ kind: "sms", unit_price: null }, { kind: "lms", unit_price: null }, { kind: "alimtalk", unit_price: null }],
      mode: "signup", log: [],
    },
    settle: {},
    shops: {},
  };
}

export const hqState = (): State => {
  let s = kv.get("hq.state", null) as State | null;
  if (!s) { s = seed(); kv.set("hq.state", s); }
  return structuredClone(s);
};
const save = (s: State) => kv.set("hq.state", s);
function edit(fn: (s: State) => Res | void): Res {
  const s = hqState();
  const r = fn(s);
  if (r && r.error) return r;
  save(s);
  return r ?? ok();
}
const metaOf = (s: State, id: string): ShopMeta => (s.shops[id] ??= {});

/** 매장 화면(이용료 예상 · 부가서비스 신청현황)이 읽는 값 */
export function shopBilling(shopId: string) {
  const s = hqState();
  const m = s.shops[shopId] ?? {};
  const plan = s.billing.plans.find((p) => p.code === (m.plan ?? s.billing.plans[0]?.code)) ?? s.billing.plans[0];
  const addons = s.billing.addons.map((a) => ({ code: a.code, name: a.name, fee: a.monthly_fee, available: a.available, status: (m.addons ?? {})[a.code as string] ?? "none" }));
  return { plan, addons, state: m.billing ?? "normal", day: m.billing_day ?? null };
}

/* ───── 매장 목록 ───── */
const REFUND = ["refund", "partial_refund"];
async function stores() {
  const { data } = await raw.from("stores").select("*");
  return (data ?? []) as Record<string, unknown>[];
}
/** 승인 때: 추천 코드가 있으면 그 영업소 코드로 매장코드를 발급하고 담당 영업을 자동 배정해요 */
function codeFor(s: State, shopId: string) {
  const m = metaOf(s, shopId);
  if (m.code) return m.code;
  const rep = m.referral ? s.reps.find((r) => r.code === m.referral && r.active) : null;
  const seq = Object.values(s.shops).filter((x) => x.code).length + 1;
  m.code = `${(rep?.org_code as string) ?? "HQ01"}-S${String(seq).padStart(4, "0")}`;
  if (rep && !((m.assignments ?? []) as unknown[]).length) {
    m.assignments = [{ id: uid(), code: rep.code, name: rep.name, org: rep.org, role: "주담당", share: 100, start: today(), end: null, reason: "가입 추천 코드로 자동 배정" }];
  }
  return m.code;
}

/** 가입할 때 입력한 추천 코드를 기억해둬요 (승인할 때 사용) */
export function setReferral(shopId: string, code: string) {
  edit((s) => { metaOf(s, shopId).referral = code; });
}
function currentAssignments(s: State, shopId: string) {
  return ((s.shops[shopId]?.assignments ?? []) as Record<string, unknown>[]).filter((a) => a.end == null);
}
function statusOf(row: Record<string, unknown>, m?: ShopMeta) {
  return m?.status ?? (row.status === "approved" ? "active" : "pending");
}

/** 이미 승인된 매장에는 매장코드가 없으면 한 번 발급해요 (한 번 발급한 코드는 바뀌지 않아요) */
async function ensureCodes() {
  const rows = await stores();
  const s = hqState();
  let changed = false;
  for (const r of [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const id = String(r.id);
    if (statusOf(r, s.shops[id]) === "active" && !s.shops[id]?.code) { codeFor(s, id); changed = true; }
  }
  if (changed) save(s);
}

async function storeRows() {
  await ensureCodes();
  const s = hqState();
  const rows = await stores();
  const out = [];
  for (const r of rows) {
    const id = String(r.id);
    const m = s.shops[id] ?? {};
    const members = (await raw.from("store_members").select("id").eq("store_id", id)).data?.length ?? 0;
    const asg = currentAssignments(s, id).find((a) => a.role === "주담당");
    const plan = s.billing.plans.find((p) => p.code === (m.plan ?? s.billing.plans[0]?.code));
    out.push({
      id, name: r.name, owner: r.representative ?? null, industries: [r.category ?? "hair"], type: r.form === "solo" ? "solo" : r.form === "multi" ? "multi" : "shop",
      brand: null, branches: 1, created: r.created_at, status: statusOf(r, m), plan: plan?.name ?? "스탠다드", members,
      code: m.code ?? null, referral: m.referral ?? null, rep: (asg?.code as string) ?? null, billing: m.billing ?? "normal", naver: r.naver_status ?? "none",
    });
  }
  return out;
}

/* ───── 영업조직 · 영업사원 ───── */
const HANGUL_INITIAL = "GGNDDRMBBSSIJJCKTPH";
const initialsOf = (name: string) => {
  const map = ["G", "G", "N", "D", "D", "R", "M", "B", "B", "S", "S", "I", "J", "J", "C", "K", "T", "P", "H"];
  return [...name].filter((c) => /[가-힣]/.test(c)).map((c) => map[Math.floor((c.charCodeAt(0) - 0xac00) / 588)]).join("");
};
function prefixFor(s: State, region: string) {
  const known = s.regions.find((r) => r.name === region);
  if (known) return { prefix: known.prefix, known: true };
  const base = /[가-힣]/.test(region) ? initialsOf(region) : region.replace(/[^A-Za-z]/g, "").toUpperCase();
  const used = new Set(s.regions.map((r) => r.prefix));
  let p = (base + "XX").slice(0, 2);
  for (let i = 0; used.has(p) && i < 26; i += 1) p = p[0] + String.fromCharCode(65 + i);
  return { prefix: p, known: false };
}
const seqOfOrg = (s: State, prefix: string) => s.orgs.filter((o) => String(o.code).startsWith(prefix)).length + 1;
function overview(s: State) {
  const assigned = (repCode: string) => Object.values(s.shops).filter((m) => ((m.assignments ?? []) as Record<string, unknown>[]).some((a) => a.end == null && a.code === repCode)).length;
  return {
    orgs: s.orgs.map((o) => ({ ...o, reps: s.reps.filter((r) => r.org_id === o.id && r.active).length })),
    reps: s.reps.map((r) => ({ ...r, stores: assigned(String(r.code)) })),
  };
}

/* ───── 정산 ───── */
const monthBounds = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${period}-01T00:00:00+09:00`, `${next}-01T00:00:00+09:00`];
};
async function settleCompute(s: State, period: string) {
  const [from, to] = monthBounds(period);
  const pays = (await raw.from("payment_entries").select("store_id, amount_krw, entry_type, created_at").gte("created_at", new Date(from).toISOString()).lt("created_at", new Date(to).toISOString())).data ?? [];
  const rule = [...s.rules].reverse().find((r) => String(r.from) <= `${period}-31`) ?? s.rules[0];
  const rate = Number(rule?.rate ?? 0.1);
  const rows = await stores();
  const storesOut = [];
  for (const r of rows.filter((x) => statusOf(x, s.shops[String(x.id)]) === "active")) {
    const id = String(r.id), m = s.shops[id] ?? {};
    const mine = pays.filter((p) => p.store_id === id);
    const service = mine.filter((p) => !REFUND.includes(p.entry_type)).reduce((n, p) => n + p.amount_krw, 0);
    const refund = mine.filter((p) => REFUND.includes(p.entry_type)).reduce((n, p) => n + p.amount_krw, 0);
    const net = service - refund;
    const excluded = ["blocked", "terminated"].includes(m.billing ?? "normal");
    const lines = ((m.assignments ?? []) as Record<string, unknown>[]).filter((a) => String(a.start) <= `${period}-31` && (a.end == null || String(a.end) >= `${period}-01`));
    storesOut.push({
      code: m.code ?? "-", name: r.name, service, refund, prepaid: 0, prepaid_refund: 0, net, excluded, reason: excluded ? "미납 · 해지 매장" : null,
      reps: lines.map((a) => ({ code: a.code, name: a.name, share: a.share, amount: excluded ? 0 : Math.floor((net * rate) / 100 * (Number(a.share) / 100)) })),
    });
  }
  const repMap = new Map<string, Record<string, unknown>>();
  for (const st of storesOut) for (const l of st.reps) {
    const rep = s.reps.find((x) => x.code === l.code);
    const cur = repMap.get(l.code) ?? { code: l.code, name: l.name, org: rep?.org_code ?? "", org_name: rep?.org ?? "", stores: 0, sales: 0, amount: 0 };
    cur.stores += 1; cur.sales += Math.round(st.net * (l.share / 100)); cur.amount += l.amount;
    repMap.set(l.code, cur);
  }
  const reps = [...repMap.values()];
  const orgMap = new Map<string, Record<string, unknown>>();
  for (const r of reps) {
    const org = s.orgs.find((o) => o.code === r.org) ?? { code: r.org, name: r.org_name, type: "영업소" };
    const cur = orgMap.get(String(org.code)) ?? { org: org.code, name: org.name, type: org.type, reps: 0, stores: 0, sales: 0, amount: 0 };
    cur.reps += 1; cur.stores += r.stores; cur.sales += r.sales; cur.amount += r.amount;
    orgMap.set(String(org.code), cur);
  }
  return {
    period, status: "calculated", rule: { version: rule?.version ?? 1, rate, months: rule?.months ?? null }, calculated_at: now(), confirmed_at: null, paid_at: null, pay_note: null,
    by: { calc: BY, confirm: null, pay: null },
    totals: { stores: storesOut.filter((x) => !x.excluded).length, sales: storesOut.filter((x) => !x.excluded).reduce((n, x) => n + x.net, 0), excluded: storesOut.filter((x) => x.excluded).length, amount: reps.reduce((n, r) => n + r.amount, 0) },
    stores: storesOut, branches: [...orgMap.values()], reps,
  };
}

/* ───── RPC ───── */
const sessionOn = () => !!kv.get("hq.session", null);

export const HQ_RPC: Record<string, (a: Record<string, unknown>) => Promise<Res> | Res> = {
  hq_open: () => ok(true),
  hq_me: () => ok(sessionOn()),

  async hq_stores() { return ok(await storeRows()); },

  async hq_store({ p_shop }) {
    const id = String(p_shop);
    await ensureCodes();
    const row = (await stores()).find((r) => String(r.id) === id);
    if (!row) return fail("매장을 찾지 못했어요.");
    const s = hqState();
    const m = s.shops[id] ?? {};
    const since = Date.now() - 30 * 86_400_000;
    const bookings = (await raw.from("bookings").select("id, status, created_at").eq("store_id", id)).data ?? [];
    const local = localRows("bookings").filter((b) => b.shop_id === id);
    const pays = (await raw.from("payment_entries").select("amount_krw, entry_type, created_at").eq("store_id", id).gte("created_at", new Date(since).toISOString())).data ?? [];
    const all = [...bookings, ...local].filter((b) => new Date(String(b.created_at ?? now())).getTime() >= since);
    const members = (await raw.from("store_members").select("id, display_name, role").eq("store_id", id)).data ?? [];
    const customers = (await raw.from("customers").select("id").eq("store_id", id)).data?.length ?? 0;
    const asg = currentAssignments(s, id).find((a) => a.role === "주담당");
    return ok({
      shop: {
        id, name: row.name, owner: row.representative ?? null, owner_phone: row.phone ?? null, phone: row.phone ?? null, address: row.address ?? null, biz_no: row.biz_number ?? null,
        industries: [row.category ?? "hair"], type: row.form === "solo" ? "solo" : row.form === "multi" ? "multi" : "shop", status: statusOf(row, m),
        plan: s.billing.plans.find((p) => p.code === (m.plan ?? s.billing.plans[0]?.code))?.name ?? "스탠다드", created: row.created_at,
        biz_doc: !!row.biz_file_name, license_doc: !!row.permit_file_name, brand: null, code: m.code ?? null, referral: m.referral ?? null, referral_rep: m.referral ? ((s.reps.find((x) => x.code === m.referral)?.name as string) ?? null) : null, customers,
        billing: m.billing ?? "normal", billing_day: m.billing_day ?? null, naver: row.naver_status ?? "none",
        naver_url: row.naver_place_url ?? null, naver_id: row.naver_place_id ?? null, naver_login: row.naver_login_id ?? null,
        main_rep: asg?.code ?? null,
      },
      billing_log: [...((m.billing_log ?? []) as unknown[])].reverse(),
      branches: [],
      members: { active: members.length, invited: 0, manager: members.find((x) => x.role === "branch_manager")?.display_name ?? null },
      last30: {
        bookings: all.length, completed: all.filter((b) => b.status === "completed").length,
        sales: pays.reduce((n, p) => n + (REFUND.includes(p.entry_type) ? -p.amount_krw : p.amount_krw), 0),
      },
      log: [...((m.log ?? []) as unknown[])].reverse(),
    });
  },

  async hq_set_status({ p_shop, p_status, p_reason }) {
    const id = String(p_shop), to = String(p_status);
    const row = (await stores()).find((r) => String(r.id) === id);
    if (!row) return fail("매장을 찾지 못했어요.");
    if (to === "suspended" && !String(p_reason ?? "").trim()) return fail("정지 사유를 입력해주세요.");
    if (to === "active") await raw.from("stores").update({ status: "approved" }).eq("id", id);
    return edit((s) => {
      const m = metaOf(s, id);
      const from = statusOf(row, m);
      m.status = to;
      if (to === "active") codeFor(s, id);
      m.log = [...(m.log ?? []), { from, to, reason: p_reason || null, at: now(), by: BY }];
    });
  },

  hq_set_billing({ p_shop, p_state, p_day, p_reason }) {
    return edit((s) => {
      const m = metaOf(s, String(p_shop));
      const from = m.billing ?? "normal";
      m.billing = String(p_state);
      if (p_day != null) m.billing_day = Number(p_day);
      m.billing_log = [...(m.billing_log ?? []), { from, to: p_state, reason: p_reason || null, auto: false, at: now(), by: BY }];
    });
  },

  async hq_set_naver({ p_shop, p_verified }) {
    patchOverlay("shops", String(p_shop), { naver_status: p_verified ? "verified" : "entered" });
    return ok();
  },

  async hq_shop_addons({ p_shop }) {
    const s = hqState();
    const b = shopBilling(String(p_shop));
    return ok({ plan: b.plan?.code, plans: s.billing.plans.filter((p) => p.active).map((p) => ({ code: p.code, name: p.name, fee: p.monthly_fee })), addons: b.addons });
  },
  hq_set_shop_plan({ p_shop, p_plan }) { return edit((s) => { metaOf(s, String(p_shop)).plan = String(p_plan); }); },
  hq_set_shop_addon({ p_shop, p_code, p_status }) {
    return edit((s) => { const m = metaOf(s, String(p_shop)); m.addons = { ...(m.addons ?? {}), [String(p_code)]: String(p_status) }; });
  },

  hq_store_assignments({ p_store }) {
    const list = ((hqState().shops[String(p_store)]?.assignments ?? []) as Record<string, unknown>[]);
    return ok([...list].reverse());
  },
  hq_assign_store({ p_store, p_lines, p_start, p_reason }) {
    const lines = (p_lines as { code: string; role: string; share: number }[]) ?? [];
    const sum = lines.reduce((n, l) => n + Number(l.share), 0);
    if (sum !== 100) return fail("배정 비율의 합이 100%가 아니에요.");
    if (lines.filter((l) => l.role === "주담당").length !== 1) return fail("주담당은 한 명이어야 해요.");
    return edit((s) => {
      for (const l of lines) {
        if (!validRepCode(l.code)) throw new Error(`영업코드를 확인해주세요: ${l.code}`);
        if (!s.reps.some((r) => r.code === l.code && r.active)) throw new Error(`없는 영업코드예요: ${l.code}`);
      }
      const m = metaOf(s, String(p_store));
      const list = (m.assignments ?? []) as Record<string, unknown>[];
      m.assignments = list.map((a) => (a.end == null ? { ...a, end: p_start } : a));
      for (const l of lines) {
        const rep = s.reps.find((r) => r.code === l.code)!;
        (m.assignments as unknown[]).push({ id: uid(), code: l.code, name: rep.name, org: rep.org, role: l.role, share: Number(l.share), start: p_start, end: null, reason: p_reason || null });
      }
    });
  },

  hq_sales_overview() { return ok(overview(hqState())); },
  hq_regions() {
    const s = hqState();
    return ok(s.regions.map((r) => ({ ...r, orgs: s.orgs.filter((o) => String(o.code).startsWith(r.prefix)).length })));
  },
  hq_region_preview({ p_region }) {
    const s = hqState();
    const region = String(p_region ?? "").trim();
    if (!/^[가-힣A-Za-z]+$/.test(region)) return ok({ ok: false, region });
    const { prefix, known } = prefixFor(s, region);
    const seq = seqOfOrg(s, prefix);
    return ok({ ok: true, region, prefix, known, seq, next: `${prefix}${String(seq).padStart(2, "0")}` });
  },
  hq_create_org({ p_region, p_type, p_parent, p_name }) {
    const region = String(p_region ?? "").trim();
    if (!/^[가-힣A-Za-z]+$/.test(region)) return fail("지역명은 한글(또는 영문)로만 써주세요.");
    let code = "";
    const r = edit((s) => {
      const { prefix, known } = prefixFor(s, region);
      if (!known) s.regions.push({ name: region, prefix });
      code = `${prefix}${String(seqOfOrg(s, prefix)).padStart(2, "0")}`;
      s.orgs.push({ id: uid(), parent: p_parent || null, code, name: String(p_name || `${region} ${p_type}`), type: p_type, active: true, opened: today(), closed: null });
    });
    return r.error ? r : ok(code);
  },
  hq_close_org({ p_org }) {
    return edit((s) => { s.orgs = s.orgs.map((o) => (o.id === p_org ? { ...o, active: false, closed: today() } : o)); });
  },
  hq_create_rep({ p_name, p_org, p_type, p_joined, p_emp_no }) {
    let code = "";
    const r = edit((s) => {
      const org = s.orgs.find((o) => o.id === p_org);
      if (!org) throw new Error("영업소를 찾지 못했어요.");
      const seq = s.reps.length + 1;
      const body = `${org.code}-${String(seq).padStart(4, "0")}`;
      code = `${body}-${checkChar(body)}`;
      s.reps.push({ id: uid(), code, name: String(p_name).trim(), org: org.name, org_code: org.code, org_id: org.id, type: p_type, joined: p_joined || today(), emp_no: p_emp_no || null, active: true });
    });
    return r.error ? r : ok(code);
  },
  hq_void_rep({ p_rep, p_reason }) {
    return edit((s) => { s.reps = s.reps.map((r) => (r.id === p_rep ? { ...r, active: false, void_reason: p_reason || null } : r)); });
  },
  hq_code_lookup({ p_code }) {
    const s = hqState();
    const code = String(p_code).trim().toUpperCase();
    const rep = s.reps.find((r) => r.code === code);
    const org = s.orgs.find((o) => o.code === code);
    const valid = validRepCode(code) || !!org;
    const assignments = Object.entries(s.shops).flatMap(([storeId, m]) => ((m.assignments ?? []) as Record<string, unknown>[]).filter((a) => a.code === code).map((a) => ({ store_id: storeId, store: storeId, role: a.role, share: a.share, start: a.start, end: a.end, rep: a.name, rep_code: a.code })));
    if (rep) return ok({ found: true, valid, code, type: "REP", status: rep.active ? "active" : "void", void_reason: rep.void_reason ?? null, rep: { name: rep.name, type: rep.type, org: rep.org, joined: rep.joined, active: rep.active }, assignments });
    if (org) return ok({ found: true, valid, code, type: "ORG", status: org.active ? "active" : "closed", org: { name: org.name, type: org.type, active: org.active }, assignments: [] });
    return ok({ found: false, valid, code });
  },

  hq_commission_rules() { return ok([...hqState().rules].reverse()); },
  hq_add_commission_rule({ p_rate, p_months, p_from, p_note }) {
    const rate = Number(p_rate);
    if (!(rate >= 0 && rate <= 100)) return fail("요율은 0~100 사이로 써주세요.");
    return edit((s) => {
      const cur = s.rules.find((r) => !r.to);
      if (cur) cur.to = p_from;
      s.rules.push({ version: s.rules.length + 1, base: "영업매출", rate, months: p_months ?? null, from: p_from, to: null, note: p_note || null, by: BY, at: now() });
    });
  },

  hq_billing_config() { return ok(hqState().billing); },
  hq_save_billing_item({ p }) {
    const item = p as Record<string, unknown>;
    return edit((s) => {
      const log = (name: string, field: string, old: unknown, next: unknown) => s.billing.log.unshift({ item: name, field, old: old == null ? null : String(old), new: next == null ? null : String(next), at: now(), by: BY });
      if (item.kind === "plan") {
        s.billing.plans = s.billing.plans.map((x) => {
          if (x.code !== item.code) return x;
          if (x.monthly_fee !== item.fee) log(String(x.name), "월 요금", x.monthly_fee, item.fee);
          return { ...x, name: item.name, monthly_fee: item.fee, included_msgs: item.included, active: item.active };
        });
      } else if (item.kind === "addon") {
        s.billing.addons = s.billing.addons.map((x) => {
          if (x.code !== item.code) return x;
          if (x.monthly_fee !== item.fee) log(String(x.name), "월액", x.monthly_fee, item.fee);
          if (x.available !== item.available) log(String(x.name), "판매", x.available, item.available);
          return { ...x, name: item.name, monthly_fee: item.fee, available: item.available };
        });
      } else if (item.kind === "price") {
        s.billing.prices = s.billing.prices.map((x) => {
          if (x.kind !== item.code) return x;
          const next = item.unit_price === "" ? null : Number(item.unit_price);
          if (x.unit_price !== next) log(String(item.code), "단가", x.unit_price, next);
          return { ...x, unit_price: next };
        });
      } else if (item.kind === "mode") {
        if (s.billing.mode !== item.mode) log("결제일 방식", "방식", s.billing.mode, item.mode);
        s.billing.mode = String(item.mode);
      }
    });
  },
  hq_add_billing_addon({ p_name, p_fee, p_available, p_note }) {
    return edit((s) => {
      const code = `addon_${uid().slice(0, 6)}`;
      s.billing.addons.push({ code, name: String(p_name).trim(), monthly_fee: Number(p_fee) || 0, available: !!p_available, note: p_note || null });
    });
  },
  hq_delete_billing_addon({ p_code }) {
    return edit((s) => { s.billing.addons = s.billing.addons.filter((a) => a.code !== p_code); });
  },

  hq_admins() {
    const me = kv.get("hq.session", null) as { email?: string } | null;
    return ok(hqState().admins.map((a) => ({ ...a, account: false, me: !!me?.email && me.email === a.email })));
  },
  hq_add_admin({ p_email, p_role }) {
    const email = String(p_email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail("이메일 형식을 확인해주세요.");
    return edit((s) => {
      if (s.admins.some((a) => a.email === email)) throw new Error("이미 있는 관리자예요.");
      s.admins.push({ email, role: String(p_role), created: now() });
    });
  },
  hq_set_admin_role({ p_email, p_role }) {
    return edit((s) => {
      const masters = s.admins.filter((a) => a.role === "hq_master");
      if (masters.length === 1 && masters[0].email === p_email && p_role !== "hq_master") throw new Error("마스터는 최소 1명 있어야 해요.");
      s.admins = s.admins.map((a) => (a.email === p_email ? { ...a, role: String(p_role) } : a));
    });
  },
  hq_remove_admin({ p_email }) {
    return edit((s) => {
      const target = s.admins.find((a) => a.email === p_email);
      if (target?.role === "hq_master" && s.admins.filter((a) => a.role === "hq_master").length === 1) throw new Error("마스터는 최소 1명 있어야 해요.");
      s.admins = s.admins.filter((a) => a.email !== p_email);
    });
  },

  hq_save_notice({ p_id, p_title, p_body, p_important }) {
    if (!String(p_title ?? "").trim()) return fail("제목을 입력해주세요.");
    const rows = localRows("hq_notices");
    if (p_id) saveLocalRows("hq_notices", rows.map((r) => (r.id === p_id ? { ...r, title: String(p_title).trim(), body: String(p_body ?? ""), important: !!p_important } : r)));
    else saveLocalRows("hq_notices", [...rows, { id: uid(), no: rows.reduce((n, r) => Math.max(n, Number(r.no) || 0), 0) + 1, title: String(p_title).trim(), body: String(p_body ?? ""), important: !!p_important, published_at: now() }]);
    return ok();
  },
  hq_delete_notice({ p_id }) {
    saveLocalRows("hq_notices", localRows("hq_notices").filter((r) => r.id !== p_id));
    return ok();
  },

  hq_settlement_runs() {
    const s = hqState();
    return ok(Object.values(s.settle).map((v) => ({ period: v.period, status: v.status, amount: (v.totals as { amount: number }).amount })).sort((a, b) => String(b.period).localeCompare(String(a.period))));
  },
  hq_settlement_view({ p_period }) {
    const v = hqState().settle[String(p_period)];
    return ok(v ?? { period: p_period, status: null });
  },
  async hq_settlement_close({ p_period }) {
    const period = String(p_period);
    await ensureCodes();
    const s0 = hqState();
    if (["confirmed", "paid"].includes(String(s0.settle[period]?.status))) return fail("확정한 달은 다시 계산할 수 없어요.");
    const view = await settleCompute(s0, period);
    const s = hqState();
    s.settle[period] = view;
    save(s);
    return ok(view);
  },
  hq_settlement_confirm({ p_period }) {
    const s = hqState();
    const v = s.settle[String(p_period)];
    if (!v || v.status !== "calculated") return fail("먼저 월 마감(계산)을 해주세요.");
    s.settle[String(p_period)] = { ...v, status: "confirmed", confirmed_at: now(), by: { ...(v.by as object), confirm: BY } };
    save(s);
    return ok(s.settle[String(p_period)]);
  },
  hq_settlement_pay({ p_period, p_note }) {
    const s = hqState();
    const v = s.settle[String(p_period)];
    if (!v || v.status !== "confirmed") return fail("확정한 달만 지급완료로 바꿀 수 있어요.");
    s.settle[String(p_period)] = { ...v, status: "paid", paid_at: now(), pay_note: p_note || null, by: { ...(v.by as object), pay: BY } };
    save(s);
    return ok(s.settle[String(p_period)]);
  },
};

export async function hqRpc(name: string, args: Record<string, unknown>): Promise<Res> {
  const handler = HQ_RPC[name];
  if (!handler) return fail("이 동작은 아직 연결되지 않았습니다.");
  try { return await handler(args); } catch (error) { return fail(error instanceof Error ? error.message : "처리하지 못했어요."); }
}
