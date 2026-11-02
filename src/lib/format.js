const WEEKDAYS = [
  ["mon", "월"],
  ["tue", "화"],
  ["wed", "수"],
  ["thu", "목"],
  ["fri", "금"],
  ["sat", "토"],
  ["sun", "일"],
];

export const weekdayRows = WEEKDAYS;

export function won(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

export function seoulDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function seoulStamp(date, time) {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

export function seoulTimeRange(start, end) {
  const format = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${format.format(new Date(start))} – ${format.format(new Date(end))}`;
}

export function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function dbErrorMessage(error) {
  const msg = error?.message ?? "";
  if (/relation|schema cache|does not exist/i.test(msg)) {
    return "클라우드에 매장 테이블이 아직 없습니다. 저장 SQL을 한 번 실행해야 합니다.";
  }
  if (/row-level security|permission/i.test(msg)) {
    return "저장 권한이 없습니다. 로그인 상태를 확인해 주세요.";
  }
  if (/already registered|already been registered/i.test(msg)) {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }
  if (/password/i.test(msg)) {
    return "비밀번호는 8자 이상으로 정해 주세요.";
  }
  if (/invalid login/i.test(msg)) {
    return "이메일 또는 비밀번호가 맞지 않습니다.";
  }
  if (/email not confirmed/i.test(msg)) {
    return "메일에서 가입을 확인한 뒤 로그인해 주세요.";
  }
  return "요청을 끝내지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export const formLabel = { solo: "1인샵", shop: "매장", multi: "다매장" };
export const categoryLabel = { hair: "헤어", nail: "네일" };
export const sourceLabel = { naver: "네이버", phone: "전화", other: "기타" };
export const repeatLabel = { none: "반복 없음", weekly: "매주" };
export const entryLabel = { paid: "수납", refund: "환불", partial_refund: "부분 환불" };
export const methodLabel = {
  cash: "현금",
  card_terminal: "카드 단말기",
  naver_pay: "네이버페이(매장 수기)",
  transfer: "계좌이체",
  other: "기타",
};
