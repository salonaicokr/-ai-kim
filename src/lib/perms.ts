import type { Perm } from "@/src/lib/session";

export type Role = "owner" | "branch_manager" | "vice" | "chief" | "designer" | "desk" | "custom";

export const ROLES: { value: Exclude<Role, "owner">; label: string; hint: string; ownerOnly?: boolean }[] = [
  { value: "branch_manager", label: "지점장", hint: "이 지점에서 원장과 같은 권한 · 지점당 1명", ownerOnly: true },
  { value: "vice", label: "부원장", hint: "권한 · 설정 빼고 전부" },
  { value: "chief", label: "실장", hint: "예약 · 고객 전체, 매출 · 환불은 본인" },
  { value: "designer", label: "디자이너", hint: "본인 손님 예약 · 고객 · 결제 · 환불" },
  { value: "desk", label: "데스크", hint: "예약 · 결제 접수" },
  { value: "custom", label: "직접 설정", hint: "표에서 하나씩" },
];
export const roleLabel = (r: string) => (r === "owner" ? "원장 · 마스터" : ROLES.find((x) => x.value === r)?.label ?? r);

/** 권한 표 열: 키 · 이름 · 고를 수 있는 값 (own 이 의미 없는 항목은 none/all 만) */
export const PERM_GROUPS: { group: string; tone: string; keys: { key: string; label: string; own: boolean }[] }[] = [
  { group: "예약", tone: "bk", keys: [
    { key: "bk_view", label: "예약 보기", own: true },
    { key: "bk_edit", label: "예약 등록 · 변경", own: true },
    { key: "bk_ok", label: "예약 확정", own: true },
  ] },
  { group: "고객", tone: "cu", keys: [
    { key: "cust", label: "고객 카드", own: true },
    { key: "phone", label: "전화번호 전체 보기", own: false },
    { key: "rec", label: "시술 기록", own: true },
    { key: "msg", label: "알림 발송", own: true },
  ] },
  { group: "결제 · 매출", tone: "pa", keys: [
    { key: "pay", label: "결제 처리", own: true },
    { key: "refund", label: "환불 · 취소", own: true },
    { key: "sales", label: "매출 보기", own: true },
    { key: "settle", label: "정산 조회", own: true },
    { key: "export", label: "엑셀 내보내기", own: false },
  ] },
  { group: "매장 운영", tone: "op", keys: [
    { key: "menu", label: "시술 메뉴 · 가격", own: false },
    { key: "invite", label: "구성원 초대", own: false },
    { key: "report", label: "주간 리포트", own: false },
    { key: "perm", label: "권한 설정", own: false },
    { key: "settings", label: "설정 (고객 DB 등)", own: false },
  ] },
];
/** 표 칸마다 소속 그룹 색(tone) · 그룹 첫 칸 여부(start) */
export const PERM_KEYS = PERM_GROUPS.flatMap((g) => g.keys.map((k, i) => ({ ...k, tone: g.tone, start: i === 0 })));

export const PERM_LABEL: Record<Perm, string> = { all: "전체", own: "본인 담당", none: "—" };
export const nextPerm = (cur: Perm, own: boolean): Perm =>
  own ? (cur === "none" ? "own" : cur === "own" ? "all" : "none") : cur === "all" ? "none" : "all";

