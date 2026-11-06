"use client";
// @ts-nocheck

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { msgOf, rpc, when } from "@/src/lib/customer/api";
import { Loading, Page, Top, useGuard } from "../../ui";

type Q = { id: string; q: string; type: "single" | "multi" | "text"; options?: string[]; only?: string[] };

/** 문진 질문 · kinds 는 예약한 시술 종류 (color, perm, heat_perm, clinic, cut, dry) */
const QUESTIONS: Q[] = [
  { id: "scalp", q: "두피 상태는 어떤가요?", type: "single", options: ["건강해요", "민감해요", "가렵거나 붉어요", "상처 · 염증이 있어요"] },
  { id: "allergy", q: "미용 제품 알레르기가 있나요?", type: "multi", options: ["없어요", "염모제", "펌제", "샴푸 · 트리트먼트", "기타"] },
  { id: "pregnant", q: "임신 중이거나 수유 중인가요?", type: "single", options: ["아니요", "임신 중", "수유 중"], only: ["color", "perm", "heat_perm"] },
  { id: "prev_color", q: "최근 3개월 안에 염색 · 탈색을 했나요?", type: "single", options: ["안 했어요", "염색", "탈색", "둘 다"], only: ["color", "perm", "heat_perm"] },
  { id: "prev_perm", q: "최근 6개월 안에 펌 · 매직을 했나요?", type: "single", options: ["안 했어요", "펌", "매직 · 열펌"], only: ["perm", "heat_perm", "color"] },
  { id: "damage", q: "머릿결이 얼마나 상했다고 느끼나요?", type: "single", options: ["거의 없어요", "보통이에요", "많이 상했어요"], only: ["color", "perm", "heat_perm", "clinic"] },
  { id: "color_pref", q: "원하는 색이나 분위기를 적어주세요", type: "text", only: ["color"] },
  { id: "perm_pref", q: "원하는 컬 느낌을 적어주세요", type: "text", only: ["perm", "heat_perm"] },
  { id: "length", q: "원하는 길이는요?", type: "single", options: ["많이 자르고 싶어요", "조금만 다듬어요", "길이 유지해요"], only: ["cut"] },
  { id: "note", q: "디자이너에게 전하고 싶은 말이 있나요? (선택)", type: "text" },
];

function analyze(qs: Q[], ans: Record<string, string[] | string>) {
  const get = (id: string) => ans[id];
  const has = (id: string, s: string) => (Array.isArray(get(id)) ? (get(id) as string[]).includes(s) : get(id) === s);
  const flags: { level: string; label: string }[] = [];
  const safety: { k: string; v: string; note?: string }[] = [];
  const style: { k: string; v: string }[] = [];
  const guides: { flag: string; text: string }[] = [];
  const add = (level: string, label: string, guide?: string) => { if (!flags.some((f) => f.label === label)) { flags.push({ level, label }); if (guide) guides.push({ flag: label, text: guide }); } };

  const al = (get("allergy") as string[] | undefined)?.filter((x) => x !== "없어요") ?? [];
  if (al.length) { add("safety", "알레르기", "패치 테스트 후 시술하고, 해당 제품은 사용하지 마세요"); safety.push({ k: "알레르기", v: al.join(", ") }); }
  if (has("scalp", "가렵거나 붉어요") || has("scalp", "상처 · 염증이 있어요")) { add("safety", "두피 이상", "두피 상태를 먼저 확인하고 화학 시술 여부를 판단하세요"); safety.push({ k: "두피", v: String(get("scalp")) }); }
  else if (has("scalp", "민감해요")) { add("safety", "민감성 두피", "약제 농도를 낮추고 두피에 닿지 않게 시술하세요"); safety.push({ k: "두피", v: "민감해요" }); }
  if (has("pregnant", "임신 중") || has("pregnant", "수유 중")) { add("safety", String(get("pregnant")), "약제 사용 전 고객과 상의하세요"); safety.push({ k: "임신 · 수유", v: String(get("pregnant")) }); }
  if (has("prev_color", "탈색") || has("prev_color", "둘 다")) { add("cost", "탈색 이력", "모발 손상 확인 후 시술 시간 · 비용을 안내하세요"); safety.push({ k: "최근 염색 · 탈색", v: String(get("prev_color")) }); }
  else if (has("prev_color", "염색")) { safety.push({ k: "최근 염색 · 탈색", v: "염색" }); }
  if (get("prev_perm") && !has("prev_perm", "안 했어요")) { add("cost", "최근 펌", "기존 펌 상태에 따라 시술 가능 여부를 확인하세요"); safety.push({ k: "최근 펌 · 매직", v: String(get("prev_perm")) }); }
  if (has("damage", "많이 상했어요")) { add("cost", "손상 모발", "클리닉 병행이나 시술 강도 조절을 안내하세요"); safety.push({ k: "모발 손상", v: "많이 상했어요" }); }
  for (const [id, label] of [["color_pref", "원하는 색"], ["perm_pref", "원하는 컬"], ["length", "원하는 길이"], ["note", "전하고 싶은 말"]] as const) {
    const v = get(id);
    if (typeof v === "string" && v.trim()) { style.push({ k: label, v: v.trim() }); if (id !== "note") add("pref", label === "원하는 길이" ? String(v) : label); }
    else if (Array.isArray(v) && v.length) style.push({ k: label, v: v.join(", ") });
  }
  const answers = qs.map((q) => ({ q: q.q, type: q.type, a: Array.isArray(ans[q.id]) ? (ans[q.id] as string[]).join(", ") : String(ans[q.id] ?? "") }));
  return { answers, flags, summary: { safety, style }, guides };
}

export default function Survey() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const g = useGuard();
  const [sv, setSv] = useState<any>(undefined);
  const [ans, setAns] = useState<Record<string, string[] | string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { if (g.ready) rpc("c_survey", { p_id: id }).then(setSv).catch((e) => { setErr(msgOf(e)); setSv(null); }); }, [g.ready, id]);
  const kinds: string[] = sv?.kinds ?? [];
  const qs = useMemo(() => QUESTIONS.filter((q) => !q.only || q.only.some((k) => kinds.includes(k))), [kinds.join(",")]);

  const required = qs.filter((q) => q.type !== "text");
  const ready = required.every((q) => (Array.isArray(ans[q.id]) ? ans[q.id].length > 0 : !!ans[q.id]));

  function pick(q: Q, o: string) {
    setAns((a) => {
      if (q.type === "single") return { ...a, [q.id]: o };
      const cur = (a[q.id] as string[]) ?? [];
      if (o === "없어요") return { ...a, [q.id]: cur.includes(o) ? [] : [o] };
      const next = cur.filter((x) => x !== "없어요");
      return { ...a, [q.id]: next.includes(o) ? next.filter((x) => x !== o) : [...next, o] };
    });
  }
  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = analyze(qs, ans);
      await rpc("c_answer_survey", { p_id: id, p_answers: r.answers, p_flags: r.flags, p_summary: r.summary, p_guides: r.guides });
      setDone(true);
    } catch (e) { setErr(msgOf(e)); }
    setBusy(false);
  }

  if (!g.ready || sv === undefined) return <main className="cpage"><Top back="/c/diary" title="사전 문진" /><Loading /></main>;
  if (!sv) return <main className="cpage"><Top back="/c/diary" title="사전 문진" /><p className="cmsg err">{err ?? "문진을 찾지 못했어요"}</p></main>;
  if (done || sv.status === "answered") return (
    <Page tabbed={false}>
      <Top back={sv.booking_id ? `/c/booking/${sv.booking_id}` : "/c/diary"} title="사전 문진" />
      <div className="ccard soft"><b style={{ fontSize: 18 }}>{done ? "문진을 보냈어요" : "이미 작성한 문진이에요"}</b><span className="cmt">매장이 시술 전에 확인해요. 더 알려드릴 게 있으면 매장에 직접 말씀해 주세요.</span></div>
      <button type="button" className="cbtn pri" onClick={() => router.replace(sv.booking_id ? `/c/booking/${sv.booking_id}` : "/c/diary")}>확인</button>
    </Page>
  );
  return (
    <Page tabbed={false}>
      <Top back={sv.booking_id ? `/c/booking/${sv.booking_id}` : "/c/diary"} title="사전 문진" />
      <p className="cmt">{sv.store}{sv.start ? ` · ${when(sv.start)}` : ""} 예약 · 안전한 시술을 위해 미리 알려주세요 ({qs.length}문항)</p>
      {qs.map((q, i) => (
        <fieldset key={q.id} className="ccard" style={{ border: "1.5px solid var(--ln)" }}>
          <legend style={{ fontWeight: 800, padding: "0 6px" }}>{i + 1}. {q.q}</legend>
          {q.type === "text" ? (
            <textarea className="cin" style={{ height: 80, padding: 12 }} maxLength={200} value={(ans[q.id] as string) ?? ""} onChange={(e) => setAns((a) => ({ ...a, [q.id]: e.target.value }))} aria-label={q.q} />
          ) : (
            <div className="cchips">{q.options!.map((o) => { const on = Array.isArray(ans[q.id]) ? ans[q.id].includes(o) : ans[q.id] === o; return <button key={o} type="button" aria-pressed={on} className={`cchip${on ? " on" : ""}`} onClick={() => pick(q, o)}>{o}</button>; })}</div>
          )}
          {q.type === "multi" && <span className="cmt" style={{ fontSize: 12 }}>여러 개 고를 수 있어요</span>}
        </fieldset>
      ))}
      {err && <p className="cmsg err" role="alert">{err}</p>}
      <div className="cfoot"><button type="button" className="cbtn pri" disabled={!ready || busy} onClick={submit}>{busy ? "보내는 중…" : "문진 보내기"}</button></div>
    </Page>
  );
}
