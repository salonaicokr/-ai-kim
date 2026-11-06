/** 미리보기 매장에 붙여 두는 디자이너. 로그인 계정 없이는 store_members에 넣을 수 없어 조회 결과에만 합친다. */
export const PREVIEW_DESIGNERS = [
  { id: "c0ffee00-0000-4000-8000-0000000000d1", display_name: "김하늘", title: "디자이너" },
  { id: "c0ffee00-0000-4000-8000-0000000000d2", display_name: "이도윤", title: "디자이너" },
];

function missing(rows) {
  const names = new Set((rows ?? []).map((row) => String(row.display_name ?? "").trim()));
  const ids = new Set((rows ?? []).map((row) => row.id));
  return PREVIEW_DESIGNERS.filter((designer) => !ids.has(designer.id) && !names.has(designer.display_name));
}

export function previewStaffRows(rows) {
  return missing(rows).map((designer) => ({
    id: designer.id,
    user_id: null,
    role: "staff",
    display_name: designer.display_name,
    title: designer.title,
  }));
}

export function previewShopMembers(rows) {
  return missing(rows).map((designer) => ({
    id: designer.id,
    store_id: rows?.[0]?.store_id ?? rows?.[0]?.shop_id ?? null,
    user_id: null,
    display_name: designer.display_name,
    role: "designer",
    title: designer.title,
    permissions: { bk_view: "own", bk_edit: "own", bk_ok: "own", cust: "own", rec: "own", msg: "own", pay: "own", refund: "own" },
    status: "active",
    is_designer: true,
    invite_code: null,
    invited_phone: null,
    sort_order: 10,
  }));
}
