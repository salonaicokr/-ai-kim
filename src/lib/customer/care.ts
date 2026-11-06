"use client";
// @ts-nocheck

/** 오늘의 케어 · 날씨 케어 (Open-Meteo 무료 API, 키 없이 사용) */
export type Weather = { city: string; temp: number; humidity: number; code: number; label: string; wind: number };

const SEOUL = { city: "서울", latitude: 37.5665, longitude: 126.978 };

function label(code: number) {
  if (code === 0) return "맑음";
  if (code <= 2) return "대체로 맑음";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if (code >= 61 && code <= 67) return "비";
  if (code >= 71 && code <= 77) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (code >= 95) return "뇌우";
  return "변덕스러운 날씨";
}

function position(): Promise<{ city: string; latitude: number; longitude: number }> {
  return new Promise((res) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { res(SEOUL); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => res({ city: "내 위치", latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => res(SEOUL),
      { timeout: 4000, maximumAge: 600000 },
    );
  });
}

export async function fetchWeather(useLocation = false): Promise<Weather> {
  const c = useLocation ? await position() : SEOUL;
  const q = new URLSearchParams({ latitude: String(c.latitude), longitude: String(c.longitude), current: "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m", timezone: "Asia/Seoul", forecast_days: "1" });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error("날씨 정보를 가져오지 못했어요");
  const cur = (await r.json()).current;
  if (typeof cur?.temperature_2m !== "number") throw new Error("날씨 데이터를 읽지 못했어요");
  const code = cur.weather_code ?? 3;
  return { city: c.city, temp: Math.round(cur.temperature_2m), humidity: Math.round(cur.relative_humidity_2m), code, label: label(code), wind: Math.round(cur.wind_speed_10m ?? 0) };
}

export function weatherAdvice(w: Weather, damage: number | null) {
  let score = 0;
  if (w.temp >= 30 || w.temp <= 5) score += 2;
  if (w.humidity >= 75) score += 2; else if (w.humidity <= 30) score += 1;
  if (w.code >= 51) score += 1;
  if (damage != null && damage >= 7) score += 2; else if (damage != null && damage >= 5) score += 1;
  const level = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  const tips: string[] = [];
  if (w.temp >= 28) tips.push("자외선 · 열로 모발이 건조해지기 쉬워요. UV 차단 스프레이와 낮은 온도 드라이를 권장해요.");
  if (w.temp <= 8) tips.push("찬 공기에 정전기 · 건조가 올 수 있어요. 보습 오일과 실크 수건 드라이를 추천해요.");
  if (w.humidity >= 70) tips.push("습도가 높아 뿌리가 처지거나 부스스해질 수 있어요. 가벼운 스타일링 제품으로 결을 정돈하세요.");
  if (w.humidity <= 35) tips.push("건조한 공기로 끝머리가 거칠어질 수 있어요. 헤어 미스트로 수분을 보충하세요.");
  if (w.code >= 61 && w.code <= 82) tips.push("비 오는 날 습기가 모발 표면에 닿으면 컬러 · 펌 유지력이 떨어질 수 있어요.");
  if (!tips.length) tips.push("오늘 날씨는 비교적 안정적이에요. 평소 홈케어 루틴을 유지하면 좋아요.");
  const headline = level === "high" ? "오늘 날씨, 모발에 주의가 필요해요" : level === "medium" ? "오늘 날씨가 모발에 영향을 줄 수 있어요" : "오늘 날씨는 모발에 비교적 안정적이에요";
  const hint = damage != null ? `최근 손상도 ${damage}/10을 고려하면 ` : "";
  return { level, headline, tips, message: `${hint}${w.city} ${w.label} · ${w.temp}°C · 습도 ${w.humidity}%. ${tips[0]}` };
}

export function damageColor(d: number) {
  if (d <= 3) return "#00A88F";
  if (d <= 6) return "#E8A100";
  if (d <= 8) return "#E5484D";
  return "#B4121F";
}
export function damageHeadline(d: number | null) {
  if (d == null) return "시술 기록을 쌓아 보세요";
  if (d <= 3) return "모발 상태가 좋아요";
  if (d <= 6) return "관리가 필요한 시기예요";
  if (d <= 8) return "집중 케어가 필요해요";
  return "전문가 상담이 필요해요";
}
export function damageAdvice(d: number) {
  if (d <= 3) return "현재 상태가 좋아요. 평소 관리 잘 하고 계세요.";
  if (d <= 6) return "정기적인 트리트먼트로 모발 건강을 유지하세요.";
  if (d <= 8) return "헤어 마스크를 주 2회 사용해 보세요.";
  return "디자이너 상담을 통한 집중 케어가 필요해요.";
}
export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
