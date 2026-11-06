/** 아이디만 입력하면(예: owner) 내부 로그인용 이메일(owner@salonai.co.kr)로 바꿔요. 이메일을 쓰면 그대로 둬요. */
export function toLoginEmail(value) {
  const id = String(value ?? "").trim();
  if (!id) return "";
  return id.includes("@") ? id : `${id.toLowerCase()}@salonai.co.kr`;
}
