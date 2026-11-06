/** S-03 영업코드: 영업소 4(지역 약어 영문 2 · I · O 허용 + 일련 2) + 일련 4 + 체크 1(I · O 없음) (예 IC01-0217-K). 서버 app_private.code_check_char 와 같은 계산 */
const CHECK = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // I · O 없음
export function checkChar(body: string) {
  const s = body.toUpperCase().replace(/[^0-9A-Z]/g, "");
  let sum = 0;
  [...s].forEach((ch, i) => { sum += (/[0-9]/.test(ch) ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 55) * (i + 2); });
  return CHECK[sum % 24];
}
export const REP_RE = /^[A-Z]{2}[0-9]{2}-[0-9]{4}-[A-HJ-NP-Z]$/;
export const validRepCode = (c: string) => { const v = c.trim().toUpperCase(); return REP_RE.test(v) && v.slice(-1) === checkChar(v.slice(0, 9)); };
