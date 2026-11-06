/**
 * AI 보정: 시술 사진의 얼굴만 다른 사람으로 바꾼 '게시용' 사본 (Gemini 이미지 모델).
 * 이 앱은 사진 보관소(비공개 버킷)가 아직 연결되지 않아서 원본을 읽을 수 없어요.
 * 그래서 { fallback: "no_key" } 를 돌려주고, 화면이 임시 모자이크로 대신 처리해요.
 * (사진 보관소 + GEMINI_API_KEY 연결 후 salonai-app 의 route.ts 를 그대로 옮기면 돼요)
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { photoId } = await request.json().catch(() => ({}));
  if (!photoId) return Response.json({ error: "photoId 가 필요해요." }, { status: 400 });
  return Response.json({ fallback: "no_key" }, { status: 200 });
}
