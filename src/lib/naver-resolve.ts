import { isNaverUrl } from "./naver";

/** naver.me 짧은 링크 → 실제 주소로 풀어서 플레이스 번호 찾기 (서버 경로 /api/naver-resolve 가 네이버 주소만 따라가요) */
export async function resolveNaverPlace(url: string): Promise<{ url: string; id: string | null; error?: string }> {
  const s = url.trim();
  if (!s) return { url: "", id: null };
  if (!isNaverUrl(s)) return { url: s, id: null, error: "네이버 플레이스 · 지도 주소(naver.com · naver.me)를 붙여넣어 주세요." };
  try {
    const res = await fetch("/api/naver-resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: s }) });
    return (await res.json()) as { url: string; id: string | null; error?: string };
  } catch {
    return { url: s, id: null };
  }
}
