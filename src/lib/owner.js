import { dbErrorMessage, inviteCode } from "@/src/lib/format";

const DRAFT_KEY = "salonai-signup";

export function saveSignupDraft(draft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function readSignupDraft() {
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSignupDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

async function uploadDoc(supabase, userId, storeId, file, kind) {
  if (!file) return null;
  const path = `${userId}/${storeId}/${kind}-${file.name}`;
  const { error } = await supabase.storage.from("store-docs").upload(path, file, { upsert: true });
  if (error) return null;
  return path;
}

export async function createOwnerStore(supabase, user, draft, files) {
  const { data: existing } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);
  if (existing?.length) return existing[0];

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    phone: draft.phone,
  });
  if (profileError) throw new Error(dbErrorMessage(profileError));

  let store = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const inserted = await supabase
      .from("stores")
      .insert({
        owner_id: user.id,
        form: draft.form,
        category: draft.category,
        name: draft.name.trim(),
        address: draft.address.trim(),
        designer_count: draft.form === "solo" ? 1 : Number(draft.designerCount),
        owner_also_designs: Boolean(draft.ownerAlsoDesigns),
        phone: draft.phone,
        biz_name: draft.bizName.trim(),
        representative: draft.representative.trim(),
        biz_number: draft.bizNumber,
        biz_file_name: files.biz?.name ?? draft.bizFileName ?? null,
        permit_file_name: files.permit?.name ?? draft.permitFileName ?? null,
        status: "pending",
        invite_code: inviteCode(),
      })
      .select("*")
      .single();
    if (!inserted.error) {
      store = inserted.data;
      break;
    }
    lastError = inserted.error;
    if (!/invite_code|duplicate/i.test(inserted.error.message)) break;
  }
  if (!store) throw new Error(dbErrorMessage(lastError));

  const members = [
    {
      store_id: store.id,
      user_id: user.id,
      role: "owner",
      display_name: draft.representative.trim() || draft.name.trim(),
    },
  ];
  if (draft.ownerAlsoDesigns) {
    members.push({
      store_id: store.id,
      user_id: user.id,
      role: "staff",
      display_name: draft.representative.trim() || "원장",
    });
  }
  const { error: memberError } = await supabase.from("store_members").insert(members);
  if (memberError) throw new Error(dbErrorMessage(memberError));

  const { data: hoursRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "default_hours")
    .maybeSingle();
  const hours = hoursRow?.value ?? {};
  const week = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const { error: hoursError } = await supabase.from("store_hours").insert(
    week.map((day) => ({
      store_id: store.id,
      weekday: day,
      opens: hours[day]?.[0] ?? "10:00",
      closes: hours[day]?.[1] ?? "20:00",
      closed: false,
    })),
  );
  if (hoursError) throw new Error(dbErrorMessage(hoursError));

  const { data: templates, error: templateError } = await supabase
    .from("menu_templates")
    .select("id, name, duration_min, price_krw, revisit_cycle_days, sort_order")
    .eq("category_id", draft.category)
    .order("sort_order");
  if (templateError) throw new Error(dbErrorMessage(templateError));
  if (templates?.length) {
    const { error: menuError } = await supabase.from("store_menus").insert(
      templates.map((item) => ({
        store_id: store.id,
        template_id: item.id,
        name: item.name,
        duration_min: item.duration_min,
        price_krw: item.price_krw,
        revisit_cycle_days: item.revisit_cycle_days,
        sort_order: item.sort_order,
      })),
    );
    if (menuError) throw new Error(dbErrorMessage(menuError));
  }

  const { error: setupError } = await supabase.from("store_setup").insert({ store_id: store.id });
  if (setupError) throw new Error(dbErrorMessage(setupError));

  const { data: consents } = await supabase
    .from("consent_documents")
    .select("code, version")
    .eq("timing", "signup");
  if (consents?.length) {
    await supabase.from("consent_acceptances").insert(
      consents.map((item) => ({
        user_id: user.id,
        store_id: store.id,
        code: item.code,
        version: item.version,
      })),
    );
  }

  const bizPath = await uploadDoc(supabase, user.id, store.id, files.biz, "biz");
  const permitPath = await uploadDoc(supabase, user.id, store.id, files.permit, "permit");
  if (bizPath || permitPath) {
    await supabase
      .from("stores")
      .update({
        biz_file_path: bizPath,
        permit_file_path: permitPath,
      })
      .eq("id", store.id);
  }

  clearSignupDraft();
  return store;
}

export async function loadDesk(supabase, userId) {
  const { data: stores, error } = await supabase
    .from("stores")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at");
  if (error) throw new Error(dbErrorMessage(error));
  let picked = null;
  try { picked = localStorage.getItem("salonai_shop"); } catch { /* 저장 불가 환경 */ }
  const store = stores?.find((row) => row.id === picked) ?? stores?.[0] ?? null;
  if (!store) return { store: null, setup: null, stores: [] };
  const { data: setup } = await supabase
    .from("store_setup")
    .select("*")
    .eq("store_id", store.id)
    .maybeSingle();
  return { store, setup, stores };
}
