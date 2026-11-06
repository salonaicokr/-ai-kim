"use client";
// @ts-nocheck

/**
 * 고객 앱(/c) 전용 클라이언트.
 * 고객 로그인 · 프로필 · c_* 동작을 이 브라우저에서 처리해요 (체험 버전).
 * 매장 쪽 데이터(고객 · 메뉴 · 디자이너 · 영업시간 · 예약)는 실제 매장 클라이언트(client.ts)를 거쳐 읽고 써서
 * 고객이 요청한 예약이 매장 캘린더에 그대로 나타나요.
 */

import { createClient as createShopClient } from "./client";
import { kv, localRows, saveLocalRows, uid } from "./local-db";
import { openRanges, toHm, toMin } from "@/src/lib/hours";

type Session = { id: string; method: string; created_at: string } | null;
type Profile = {
  name: string | null; phone: string | null; nickname: string | null; style_prefs: string[];
  terms_agreed_at: string | null; location_agree: boolean | null; marketing_agree: boolean | null; night_push_agree: boolean | null;
  verified: boolean; share: boolean;
};
type Link = { sc: string; shop_id: string; linked_at: string; ack: string | null };

const BLANK: Profile = { name: null, phone: null, nickname: null, style_prefs: [], terms_agreed_at: null, location_agree: null, marketing_agree: null, night_push_agree: null, verified: false, share: true };
const ACTIVE = ["requested", "confirmed", "in_service"];
const DAY = 86_400_000;

const session = () => kv.get("c.session", null) as Session;
const profile = () => ({ ...BLANK, ...(kv.get("c.profile", {}) as Partial<Profile>) }) as Profile;
const saveProfile = (patch: Partial<Profile>) => kv.set("c.profile", { ...profile(), ...patch });
const links = () => kv.get("c.links", []) as Link[];
const digits = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
const ok = (data: unknown = null) => ({ data, error: null });
const fail = (message: string) => ({ data: null, error: { message } });

const sb = () => createShopClient();

async function shopMap() {
  const { data } = await sb().from("shops").select("*");
  return new Map<string, Record<string, unknown>>((data ?? []).map((s: Record<string, unknown>) => [String(s.id), s]));
}
async function storeCustomers() {
  const { data } = await sb().from("shop_customers").select("*");
  return (data ?? []) as Record<string, unknown>[];
}
async function allBookings() {
  const { data } = await sb().from("bookings").select("*");
  return (data ?? []) as Record<string, unknown>[];
}
function visitsOf(bookings: Record<string, unknown>[], sc: string) {
  const done = bookings.filter((b) => b.shop_customer_id === sc && b.status === "completed").sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)));
  return { count: done.length, last: (done[0]?.start_at as string) ?? null, lastItems: ((done[0]?.booking_items as { menu_item_id: string | null; name: string }[]) ?? []).map((i) => ({ id: i.menu_item_id, name: i.name })) };
}

async function designersOf(shopId: string) {
  const { data } = await sb().from("shop_members").select("*").eq("shop_id", shopId);
  const rows = (data ?? []) as Record<string, unknown>[];
  // 캘린더와 같은 규칙: 같은 사람이 디자이너로도 등록돼 있으면 원장 행은 빼요
  const staffUsers = new Set(rows.filter((m) => m.role === "designer" && m.user_id).map((m) => m.user_id));
  return rows
    .filter((m) => (m.is_designer || m.role === "owner") && !(m.role === "owner" && staffUsers.has(m.user_id)) && m.status !== "left" && m.status !== "invited")
    .map((m) => ({ id: String(m.id), name: String(m.display_name ?? "디자이너"), title: String(m.title ?? "디자이너") }));
}

const RPC: Record<string, (a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>> = {
  async start_demo_customer({ p_method }) {
    const id = (session()?.id ?? `demo-${uid().slice(0, 8)}`) as string;
    kv.set("c.pending_session", { id, method: String(p_method ?? "kakao"), created_at: new Date().toISOString() });
    return ok({ email: `${id}@demo.salonai.local`, password: "demo" });
  },

  async c_demo_people() {
    const bookings = await allBookings();
    const rows = (await storeCustomers()).filter((c) => digits(c.phone as string).length >= 9);
    return ok(rows.map((c) => ({ name: String(c.name), phone: String(c.phone), visits: visitsOf(bookings, String(c.id)).count })));
  },

  async c_verify_link({ p_name, p_phone }) {
    const phone = digits(p_phone as string);
    if (phone.length < 9) return ok({ found: 0 });
    const rows = (await storeCustomers()).filter((c) => digits(c.phone as string) === phone);
    saveProfile({ name: String(p_name || rows[0]?.name || "") || null, phone: String(p_phone), verified: true });
    return ok({ found: rows.length });
  },

  async c_pending_links() {
    const p = profile();
    if (!p.verified || !p.phone) return ok([]);
    const shops = await shopMap();
    const bookings = await allBookings();
    const have = new Set(links().map((l) => l.sc));
    const rows = (await storeCustomers()).filter((c) => digits(c.phone as string) === digits(p.phone) && !have.has(String(c.id)));
    const out = [];
    for (const c of rows) {
      const d = c.assigned_designer_id ? (await designersOf(String(c.shop_id))).find((x) => x.id === c.assigned_designer_id) : null;
      out.push({ sc: String(c.id), shop: String(shops.get(String(c.shop_id))?.name ?? "매장"), visits: visitsOf(bookings, String(c.id)).count, designer: d?.name ?? null });
    }
    return ok(out);
  },

  async c_link_shop({ p_sc }) {
    const sc = String(p_sc);
    const row = (await storeCustomers()).find((c) => String(c.id) === sc);
    if (!row) return fail("매장 기록을 찾지 못했어요.");
    if (!links().some((l) => l.sc === sc)) kv.set("c.links", [...links(), { sc, shop_id: String(row.shop_id), linked_at: new Date().toISOString(), ack: null }]);
    return ok(true);
  },

  async c_revisit_ack({ p_sc }) {
    kv.set("c.links", links().map((l) => (l.sc === p_sc ? { ...l, ack: new Date().toISOString() } : l)));
    return ok(true);
  },

  async c_home() {
    const p = profile();
    const shops = await shopMap();
    const bookings = await allBookings();
    const custs = await storeCustomers();
    const mine = links();
    const shopsOut = [];
    for (const l of mine) {
      const c = custs.find((x) => String(x.id) === l.sc);
      const v = visitsOf(bookings, l.sc);
      const dList = await designersOf(l.shop_id);
      const d = c?.assigned_designer_id ? dList.find((x) => x.id === c.assigned_designer_id) ?? null : null;
      shopsOut.push({
        shop_id: l.shop_id, shop: String(shops.get(l.shop_id)?.name ?? "매장"), sc: l.sc, visits: v.count, last: v.last,
        due: v.last ? new Date(new Date(v.last).getTime() + 35 * DAY).toISOString() : null, ack: l.ack, designer: d, last_items: v.lastItems.length ? v.lastItems : null,
      });
    }
    const scs = new Set(mine.map((l) => l.sc));
    const now = Date.now();
    const upcoming = [];
    for (const b of bookings.filter((x) => scs.has(String(x.shop_customer_id)) && ACTIVE.includes(String(x.status)) && new Date(String(x.end_at)).getTime() > now).sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))) {
      const shopId = mine.find((l) => l.sc === b.shop_customer_id)?.shop_id ?? "";
      const dName = (await designersOf(shopId)).find((x) => x.id === b.designer_id)?.name ?? null;
      const ps = ((b.pre_surveys as { id: string; status: string }[] | null) ?? [])[0] ?? null;
      upcoming.push({
        id: String(b.id), shop: String(shops.get(shopId)?.name ?? "매장"), start: String(b.start_at), end: String(b.end_at), status: String(b.status), deposit: null, designer: dName,
        items: ((b.booking_items as { name: string }[]) ?? []).map((i) => i.name), survey: ps ? { id: ps.id, status: ps.status } : null,
      });
    }
    return ok({
      profile: { name: p.name, phone: p.phone, nickname: p.nickname, style: p.style_prefs, terms: !!p.terms_agreed_at, verified: p.verified, share: p.share, marketing: p.marketing_agree, location: p.location_agree, night: p.night_push_agree },
      shops: shopsOut, upcoming,
    });
  },

  async c_catalog({ p_shop }) {
    const shopId = String(p_shop);
    const shops = await shopMap();
    const shop = shops.get(shopId);
    if (!shop) return fail("매장을 찾지 못했어요.");
    const { data } = await sb().from("menu_items").select("*").eq("shop_id", shopId);
    const menus = ((data ?? []) as Record<string, unknown>[])
      .filter((m) => m.status !== "paused")
      .map((m) => {
        const cat = (m.menu_categories as { name?: string; kind?: string; sort_order?: number } | null) ?? {};
        return { id: String(m.id), name: String(m.name), price: Number(m.price ?? 0), minutes: Number(m.duration_min ?? 60), cat: cat.name ?? "메뉴", kind: cat.kind ?? "etc", cat_order: Number(cat.sort_order ?? 0) };
      })
      .sort((a, b) => a.cat_order - b.cat_order);
    return ok({ shop: { id: shopId, name: String(shop.name) }, designers: await designersOf(shopId), menus });
  },

  async c_slots({ p_shop, p_designer, p_date, p_minutes }) {
    const shopId = String(p_shop), day = String(p_date), minutes = Number(p_minutes) || 60;
    const hoursRes = await sb().from("shop_business_hours").select("*").eq("shop_id", shopId);
    const holRes = await sb().from("shop_holidays").select("*").eq("shop_id", shopId);
    const ranges = openRanges(day, hoursRes.data ?? [], holRes.data ?? []) ?? [[10 * 60, 20 * 60]];
    const designers = p_designer ? [String(p_designer)] : (await designersOf(shopId)).map((d) => d.id);
    const busy = (await allBookings()).filter((b) => ["requested", "confirmed", "in_service", "blocked"].includes(String(b.status)));
    const dayStart = new Date(`${day}T00:00:00+09:00`).getTime();
    const out: string[] = [];
    for (const [a, b] of ranges) {
      for (let s = Math.ceil(a / 30) * 30; s + minutes <= b; s += 30) {
        const st = dayStart + s * 60_000, en = st + minutes * 60_000;
        if (st < Date.now() + 30 * 60_000) continue;
        const free = designers.some((id) => !busy.some((x) => x.designer_id === id && new Date(String(x.start_at)).getTime() < en && new Date(String(x.end_at)).getTime() > st));
        if (free || designers.length === 0) out.push(toHm(s));
      }
    }
    return ok([...new Set(out)]);
  },

  async c_request_booking({ p_shop, p_designer, p_start, p_items, p_request }) {
    const shopId = String(p_shop);
    const p = profile();
    const link = links().find((l) => l.shop_id === shopId);
    let sc = link?.sc ?? null;
    const client = sb();
    if (!sc) {
      // 아직 연결되지 않은 매장이면 이 번호의 고객 기록을 새로 만들어요
      const made = await client.from("shop_customers").insert({ shop_id: shopId, name: p.name || p.nickname || "앱 고객", phone: digits(p.phone) || null }).select("id").single();
      if (made.error || !made.data) return fail(made.error?.message ?? "예약을 만들지 못했어요.");
      sc = String(made.data.id);
      kv.set("c.links", [...links(), { sc, shop_id: shopId, linked_at: new Date().toISOString(), ack: null }]);
    }
    const ids = (p_items as string[]) ?? [];
    const menus = ((await client.from("menu_items").select("*").eq("shop_id", shopId)).data ?? []).filter((m: Record<string, unknown>) => ids.includes(String(m.id)));
    const minutes = menus.reduce((n: number, m: Record<string, unknown>) => n + Number(m.duration_min ?? 60), 0) || 60;
    const startMs = new Date(String(p_start)).getTime();
    let designer = p_designer ? String(p_designer) : null;
    const busy = (await allBookings()).filter((b) => ["requested", "confirmed", "in_service", "blocked"].includes(String(b.status)));
    const isFree = (id: string) => !busy.some((x) => x.designer_id === id && new Date(String(x.start_at)).getTime() < startMs + minutes * 60_000 && new Date(String(x.end_at)).getTime() > startMs);
    if (!designer) designer = (await designersOf(shopId)).find((d) => isFree(d.id))?.id ?? null;
    if (!designer) return fail("그 시간에 가능한 디자이너가 없어요. 다른 시간을 골라주세요.");
    if (!isFree(designer)) return fail("방금 다른 예약이 들어왔어요. 다른 시간을 골라주세요.");
    const made = await client.rpc("create_booking", {
      p_shop: shopId, p_designer: designer, p_start: new Date(startMs).toISOString(), p_end: new Date(startMs + minutes * 60_000).toISOString(),
      p_items: ids.map((id) => ({ menu_item_id: id })), p_customer_id: sc, p_source: "customer_app", p_memo: null,
    });
    if (made.error) return fail(made.error.message);
    const booking = String(made.data);
    const kinds = [...new Set(menus.map((m: Record<string, unknown>) => (m.menu_categories as { kind?: string } | null)?.kind ?? "etc"))];
    await client.from("bookings").update({ status: "requested", customer_request: p_request ?? null }).eq("id", booking);
    const made2 = await client.from("pre_surveys").insert({ shop_id: shopId, booking_id: booking, shop_customer_id: sc, status: "sent", answers: [], flags: [], summary: { safety: [], style: [] }, guides: [], sent_at: new Date().toISOString(), answered_at: null, is_sample: false, kinds, items: menus.map((m: Record<string, unknown>) => m.name), topic: menus[0]?.name ?? null, start: new Date(startMs).toISOString() }).select("id").single();
    const survey = String(made2.data?.id ?? uid());
    const localList = localRows("bookings");
    if (localList.some((r) => r.id === booking)) saveLocalRows("bookings", localList.map((r) => (r.id === booking ? { ...r, pre_surveys: [{ id: survey, status: "sent", flags: [] }] } : r)));
    return ok({ booking, survey });
  },

  async c_attach_style_photos() { return ok(true); },

  async c_survey({ p_id }) {
    const found = await sb().from("pre_surveys").select("*").eq("id", String(p_id)).maybeSingle();
    const s = found.data as Record<string, unknown> | null;
    if (!s) return fail("문진을 찾지 못했어요.");
    const shops = await shopMap();
    let start = (s.start as string) ?? null;
    if (!start && s.booking_id) start = ((await sb().from("bookings").select("start_at").eq("id", String(s.booking_id)).maybeSingle()).data?.start_at as string) ?? null;
    return ok({ id: s.id, status: s.status, topic: s.topic ?? null, shop: String(shops.get(String(s.shop_id))?.name ?? "매장"), start, kinds: s.kinds ?? null, items: s.items ?? null });
  },

  async c_answer_survey({ p_id, p_answers, p_flags, p_summary, p_guides }) {
    const found = await sb().from("pre_surveys").select("id, booking_id").eq("id", String(p_id)).maybeSingle();
    const s = found.data as Record<string, unknown> | null;
    if (!s) return fail("문진을 찾지 못했어요.");
    const saved = await sb().from("pre_surveys").update({ status: "answered", answers: p_answers, flags: p_flags, summary: p_summary, guides: p_guides, answered_at: new Date().toISOString() }).eq("id", String(p_id));
    if (saved.error) return fail(saved.error.message);
    saveLocalRows("bookings", localRows("bookings").map((r) => (r.id === s.booking_id ? { ...r, pre_surveys: [{ id: p_id, status: "answered", flags: p_flags ?? [] }] } : r)));
    return ok(true);
  },

  async c_diary() {
    const hidden = new Set(kv.get("c.diary_hidden", []) as string[]);
    const shops = await shopMap();
    const mine = links();
    const scs = new Set(mine.map((l) => l.sc));
    const rows = (await allBookings()).filter((b) => scs.has(String(b.shop_customer_id)) && b.status === "completed" && !hidden.has(String(b.id)));
    const out = [];
    for (const b of rows.sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)))) {
      const shopId = mine.find((l) => l.sc === b.shop_customer_id)?.shop_id ?? "";
      const items = ((b.booking_items as { name: string; price: number; menu_items?: { menu_categories?: { kind?: string } } }[]) ?? []);
      const designer = (await designersOf(shopId)).find((d) => d.id === b.designer_id)?.name;
      out.push({
        id: String(b.id), shop: String(shops.get(shopId)?.name ?? "매장"), sent: String(b.start_at), summary: null,
        kinds: [...new Set(items.map((i) => i.menu_items?.menu_categories?.kind ?? "etc"))],
        snapshot: { date: String(b.start_at), designer, items: items.map((i) => ({ name: i.name, price: i.price })), payment: null, summary: null }, photos: [],
      });
    }
    return ok(out);
  },

  async c_delete_diary({ p_records }) {
    kv.set("c.diary_hidden", [...(kv.get("c.diary_hidden", []) as string[]), ...((p_records as string[]) ?? [])]);
    return ok(true);
  },

  async c_set_share({ p_on }) { saveProfile({ share: !!p_on }); return ok(true); },
  async c_requests() { return ok([]); },
  async c_approve_payment() { return ok(true); },
  async c_read_notification({ p_id }) {
    saveLocalRows("customer_notifications", localRows("customer_notifications").map((r) => (r.id === p_id ? { ...r, read_at: new Date().toISOString() } : r)));
    return ok(true);
  },
};

const PROFILE_KEYS = ["nickname", "style_prefs", "terms_agreed_at", "location_agree", "marketing_agree", "night_push_agree", "name", "phone"];

function profileTable() {
  let patch: Record<string, unknown> | null = null;
  const run = async () => {
    if (patch) saveProfile(Object.fromEntries(Object.entries(patch).filter(([k]) => PROFILE_KEYS.includes(k))) as Partial<Profile>);
    return { data: patch ? null : { id: session()?.id ?? null, ...profile() }, error: null };
  };
  const api: Record<string, unknown> = {
    update(p: Record<string, unknown>) { patch = p; return api; },
    upsert(p: Record<string, unknown>) { patch = p; return api; },
    select() { return api; },
    eq() { return api; },
    single() { return api; },
    maybeSingle() { return api; },
    then(resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) { return run().then(resolve, reject); },
  };
  return api;
}

export function createClient() {
  const shop = sb();
  return {
    from(table: string) { return table === "customers" ? profileTable() : shop.from(table); },
    rpc(name: string, args: Record<string, unknown> = {}) {
      const handler = RPC[name];
      const run = handler ? handler(args) : shop.rpc(name, args);
      return { then: (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) => Promise.resolve(run).then(resolve, reject) };
    },
    auth: {
      async getUser() { const s = session(); return { data: { user: s ? { id: s.id, email: `${s.id}@demo.salonai.local` } : null }, error: null }; },
      async getSession() { const s = session(); return { data: { session: s ? { user: { id: s.id } } : null }, error: null }; },
      async signInWithPassword() {
        const next = (kv.get("c.pending_session", null) as Session) ?? { id: `demo-${uid().slice(0, 8)}`, method: "kakao", created_at: new Date().toISOString() };
        if (!session()) { kv.set("c.profile", BLANK); kv.set("c.links", []); }
        kv.set("c.session", session() ?? next);
        return { data: { user: { id: (session() as NonNullable<Session>).id } }, error: null };
      },
      async signOut() { kv.set("c.session", null); return { error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },
    channel: shop.channel,
    removeChannel: shop.removeChannel,
    storage: {
      from() {
        return {
          upload: async (path: string) => ({ data: { path }, error: null }),
          createSignedUrls: async () => ({ data: [] }),
          createSignedUrl: async () => ({ data: null, error: { message: "사진 보관은 연결 전입니다." } }),
          getPublicUrl: () => ({ data: { publicUrl: "" } }),
          remove: async () => ({ error: null }),
        };
      },
    },
  };
}
