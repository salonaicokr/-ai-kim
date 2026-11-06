import { isNaverUrl, isShortNaver, parsePlaceId } from "@/src/lib/naver";

/** naver.me 짧은 링크를 따라가 플레이스 번호를 찾아요 (네이버 주소만) */
export async function POST(request) {
  const { url = "" } = await request.json().catch(() => ({}));
  const s = String(url).trim();
  if (!s) return Response.json({ url: "", id: null });
  if (!isNaverUrl(s)) return Response.json({ url: s, id: null, error: "네이버 플레이스 · 지도 주소(naver.com · naver.me)를 붙여넣어 주세요." });
  if (!isShortNaver(s)) return Response.json({ url: s, id: parsePlaceId(s) });
  try {
    let cur = s;
    for (let i = 0; i < 4; i++) {
      const r = await fetch(cur, { redirect: "manual", signal: AbortSignal.timeout(4000) });
      const loc = r.headers.get("location");
      if (!loc) break;
      cur = new URL(loc, cur).toString();
      const id = parsePlaceId(cur);
      if (id) return Response.json({ url: s, id });
      if (!isNaverUrl(cur)) break;
    }
  } catch {
    // 못 풀어도 주소는 저장 · 본사가 확인
  }
  return Response.json({ url: s, id: null });
}
