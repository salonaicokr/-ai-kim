/** 소요시간 선택지 (분) */
export const DURATIONS = [10, 20, 30, 40, 50, 60, 90, 120, 150, 180, 210, 240, 300, 360];

export type MenuKind = "cut" | "perm" | "heat_perm" | "color" | "clinic" | "dry" | "etc";

/** 1차 분류 종류: 캘린더 색 · 통계 기준 (S16 · S7 공통)
 *  저채도 유사색 팔레트 (구성원 권한 표와 같은 톤) · bg = 캘린더 블록 바탕 */
export const KINDS: { value: MenuKind; label: string; color: string; bg: string; minutes: number }[] = [
  { value: "cut", label: "컷", color: "#2A706A", bg: "#E6F1EF", minutes: 60 },
  { value: "perm", label: "펌", color: "#3E6A84", bg: "#E9F0F4", minutes: 180 },
  { value: "heat_perm", label: "열펌", color: "#5F5F86", bg: "#EEEEF5", minutes: 180 },
  { value: "color", label: "염색", color: "#A26A4E", bg: "#F6EEE9", minutes: 120 },
  { value: "clinic", label: "클리닉", color: "#4D7360", bg: "#EAF1EC", minutes: 60 },
  { value: "dry", label: "드라이", color: "#857150", bg: "#F3F0E8", minutes: 30 },
  { value: "etc", label: "기타", color: "#6B6F78", bg: "#F0F0F1", minutes: 60 },
];
export const kindOf = (k: string) => KINDS.find((x) => x.value === k) ?? KINDS[KINDS.length - 1];

/** 메뉴가 비어 있을 때 불러오는 헤어 기본 메뉴 (S5 템플릿 축약판) */
export const HAIR_TEMPLATE: { name: string; kind: MenuKind; items: [string, number, number?][] }[] = [
  { name: "컷", kind: "cut", items: [["여성 컷", 30000], ["남성 컷", 22000], ["앞머리 컷", 5000, 10], ["디자인 컷", 35000]] },
  { name: "펌", kind: "perm", items: [["일반펌", 60000], ["볼륨펌", 70000], ["다운펌", 30000, 60], ["애즈펌", 70000]] },
  { name: "열펌", kind: "heat_perm", items: [["셋팅펌", 80000], ["매직", 90000], ["볼륨매직", 90000], ["매직셋팅", 120000, 240]] },
  { name: "염색", kind: "color", items: [["전체 염색", 90000], ["뿌리 염색", 60000, 90], ["새치 염색", 55000, 90], ["탈색 1회", 80000]] },
  { name: "클리닉", kind: "clinic", items: [["클리닉", 50000], ["두피 클리닉", 50000]] },
  { name: "드라이", kind: "dry", items: [["드라이", 20000], ["업스타일", 50000, 60]] },
];

/** 네일 기본 메뉴 (업종 네일 가입 시) */
export const NAIL_TEMPLATE: { name: string; kind: MenuKind; items: [string, number, number?][] }[] = [
  { name: "케어", kind: "clinic", items: [["기본 케어", 15000, 30], ["큐티클 정리", 10000, 20], ["발 케어", 25000, 40]] },
  { name: "젤 컬러", kind: "color", items: [["원컬러 젤", 40000, 60], ["그라데이션", 50000, 70], ["프렌치", 50000, 70]] },
  { name: "아트", kind: "etc", items: [["포인트 아트(1개)", 5000, 10], ["풀 아트", 70000, 90]] },
  { name: "연장 · 제거", kind: "etc", items: [["젤 연장(10개)", 80000, 120], ["젤 제거", 10000, 20]] },
];

export type Category = {
  id: string;
  name: string;
  kind: MenuKind;
  point_earn: boolean;
  point_use: boolean;
  grade_discount: boolean;
  default_duration_min: number;
  sort_order: number;
};
export type Item = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  price_m: number | null;
  price_l: number | null;
  duration_min: number | null;
  status: "active" | "paused";
  sort_order: number;
};

export type LengthOption = "base" | "m" | "l";
/** 결제 단가 = 기본가 + 기장 추가금 (price_m · price_l 은 '추가금'). DB 함수 public.menu_item_price 와 같은 규칙 */
export function priceFor(item: Pick<Item, "price" | "price_m" | "price_l">, length: LengthOption = "base") {
  const extra = length === "m" ? item.price_m ?? 0 : length === "l" ? item.price_l ?? 0 : 0;
  return item.price + extra;
}
