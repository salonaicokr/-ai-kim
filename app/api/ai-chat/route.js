/**
 * 고객 AI 상담
 * - 로그인한 고객의 토큰(Authorization: Bearer)으로 DB를 읽어서, 본인 시술 기록만 참고해요
 * - 하루 5회 · 한 달 30회 제한 (customer_ai_messages 에서 셈)
 * - GEMINI_API_KEY 가 있으면 Gemini, 없으면 규칙 기반 답변
 */
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const DAY_LIMIT = 5;
const MONTH_LIMIT = 30;

function fallbackAnswer(q, ctx) {
  const last = ctx[0];
  const t = q.replace(/\s/g, "");
  const head = last ? `최근 ${last.date}${last.title ? ` ${last.title}` : ""} 시술 기록을 참고했어요. ` : "";
  if (/염색|컬러|탈색|색/.test(t)) return `${head}염색 후 48시간은 샴푸를 미루고, 이후엔 색 빠짐 방지 샴푸와 미지근한 물을 쓰면 색이 오래가요. 뜨거운 드라이는 피해 주세요.`;
  if (/펌|웨이브|컬/.test(t)) return `${head}펌 후 48시간은 묶거나 세게 빗지 마세요. 샴푸 뒤엔 자연 건조 후 컬 크림이나 에센스를 소량 발라 주세요.`;
  if (/푸석|건조|손상|끊|갈라|트리트먼트|클리닉/.test(t)) return `${head}손상 모발은 주 1~2회 헤어 마스크, 젖은 머리 빗질 줄이기, 드라이 전 열 보호제가 기본이에요. 심하면 디자이너와 클리닉 상담을 권해요.`;
  if (/두피|비듬|가려|기름/.test(t)) return `${head}두피 고민은 샴푸를 충분히 헹구고 저녁에 감는 게 좋아요. 가려움이 계속되면 피부과 진료도 고려해 주세요.`;
  if (/언제|주기|다음|재방문/.test(t)) return `${head}커트는 5~6주, 염색 뿌리는 6~8주, 펌은 3~4개월이 일반적인 주기예요.`;
  return `${head}자세한 상태는 담당 디자이너가 가장 정확해요. 홈케어는 순한 샴푸, 주 1~2회 트리트먼트, 낮은 온도 드라이부터 시작해 보세요.`;
}

async function gemini(key, q, ctx) {
  const history = ctx.length
    ? ctx.slice(0, 5).map((c) => `- ${c.date} ${c.title ?? ""} / 손상도 ${c.damage ?? "?"} / 진단: ${c.diagnosis ?? "-"} / 홈케어: ${c.home_care ?? "-"}`).join("\n")
    : "(시술 기록 없음)";
  const prompt = `너는 미용실 고객 앱의 헤어 케어 상담 AI야. 한국어로 3~5문장, 친절하고 구체적으로 답해. 의료 진단은 하지 말고 심하면 전문가 상담을 권해.\n\n[고객의 최근 시술 기록]\n${history}\n\n[질문]\n${q}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 500 } }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const j = await res.json();
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
  if (!text) throw new Error("empty");
  return text;
}

export async function POST(request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const q = String(body.message ?? "").trim().slice(0, 500);
  const usageOnly = body.usage === true;

  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600000);
  const dayStart = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600000).toISOString();
  const monthStart = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1) - 9 * 3600000).toISOString();
  const [{ count: day }, { count: month }] = await Promise.all([
    sb.from("customer_ai_messages").select("id", { count: "exact", head: true }).gte("created_at", dayStart),
    sb.from("customer_ai_messages").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
  ]);
  const usage = { day: day ?? 0, month: month ?? 0, dayLimit: DAY_LIMIT, monthLimit: MONTH_LIMIT };
  if (usageOnly) return Response.json({ usage });
  if (!q) return Response.json({ error: "질문을 입력해주세요" }, { status: 400 });
  if (usage.day >= DAY_LIMIT) return Response.json({ error: `오늘은 ${DAY_LIMIT}번까지 상담할 수 있어요. 내일 다시 이용해 주세요.`, usage }, { status: 429 });
  if (usage.month >= MONTH_LIMIT) return Response.json({ error: `이번 달 ${MONTH_LIMIT}번을 모두 사용했어요.`, usage }, { status: 429 });

  const { data: ctx } = await sb.rpc("c_ai_context");
  const list = Array.isArray(ctx) ? ctx : [];
  let answer;
  let engine = "rules";
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    try { answer = await gemini(key, q, list); engine = "gemini"; } catch { answer = null; }
  }
  if (!answer) answer = fallbackAnswer(q, list);

  await sb.from("customer_ai_messages").insert({ user_id: u.user.id, user_message: q, ai_response: answer, context: { engine, records: list.length } });
  return Response.json({ answer, engine, usage: { ...usage, day: usage.day + 1, month: usage.month + 1 } });
}
