/**
 * 내 주변 샵: 카카오 로컬 키워드 검색 (좌표 · 반경 3km · 거리순)
 * - 환경 변수 KAKAO_REST_API_KEY 가 없으면 { fallback: "no_key" } → 화면이 샘플을 보여줌
 * - 좌표는 검색에만 쓰고 저장 · 기록하지 않음
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { lat, lng } = await request.json().catch(() => ({}));
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "위치를 확인하지 못했어요." }, { status: 400 });
  }
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return Response.json({ fallback: "no_key" });

  const search = async (query) => {
    const q = new URLSearchParams({ query, x: String(lng), y: String(lat), radius: "3000", sort: "distance", size: "10" });
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${q}`, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()).documents;
  };
  try {
    const lists = await Promise.all(["미용실", "네일샵"].map(search));
    const seen = new Set();
    const shops = lists.flat()
      .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
      .sort((a, b) => Number(a.distance) - Number(b.distance))
      .slice(0, 15)
      .map((d) => ({ id: d.id, name: d.place_name, cat: d.category_name.split(" > ").pop() ?? "", phone: d.phone, addr: d.road_address_name || d.address_name, distance: Number(d.distance), url: d.place_url }));
    return Response.json({ shops });
  } catch {
    return Response.json({ error: "주변 샵을 불러오지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 502 });
  }
}
