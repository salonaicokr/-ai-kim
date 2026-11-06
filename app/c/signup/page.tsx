"use client";
// @ts-nocheck

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { digits, fmtPhone, msgOf, rpc, sb } from "@/src/lib/customer/api";
import { Top } from "../ui";

const ITEMS = [
  { k: "service", req: true, t: "서비스 이용약관", d: "", body: ["SALONAI 고객 앱의 이용 조건을 정한 약관이에요.", "[약관 전문 · 법무 검토 후 게시]"] },
  { k: "privacy", req: true, t: "개인정보 수집 · 이용", d: "시술 기록은 서비스 제공을 위해 저장돼요", body: [
    "수집 항목: 이름, 휴대폰 번호, 시술 · 예약 · 결제 기록, 시술 사진, 예약 때 보낸 사진",
    "이용 목적: 본인 확인, 예약 · 시술 기록 관리, 매장 상담 지원, 분쟁 대응",
    "보유 · 이용 기간: 회원 탈퇴 또는 삭제 시까지. 고객이 앱에서 삭제한 시술 기록 · 사진은 앱에서 즉시 보이지 않게 되고, 시술 관련 분쟁 대응을 위해 삭제일로부터 3개월간 분리 보관 후 파기합니다. 결제 · 거래 기록은 관계 법령에서 정한 기간 동안 보관합니다.",
    "동의를 거부할 수 있으나, 필수 항목이라 거부하면 서비스를 이용할 수 없어요.",
  ] },
  { k: "age", req: true, t: "만 14세 이상입니다", d: "", body: ["만 14세 미만은 법정대리인의 동의 없이 가입할 수 없어요."] },
  { k: "location", req: false, t: "위치 기반 서비스", d: "내 주변 매장 · 날씨 케어에 사용해요", body: ["현재 위치를 날씨 · 매장 검색에만 쓰고 저장하지 않아요."] },
  { k: "marketing", req: false, t: "마케팅 정보 수신", d: "이벤트 · 혜택 소식을 알려드려요", body: ["이벤트 · 혜택 소식을 앱 알림으로 보내요.", "동의하지 않아도 가입할 수 있고, 계정에서 언제든 끌 수 있어요."] },
] as const;

function Signup() {
  const router = useRouter();
  const step2 = useSearchParams().get("step") === "2";
  const [step, setStep] = useState(step2 ? 2 : 1);
  const [f, setF] = useState({ loginId: "", email: "", pw: "", pw2: "", name: "", phone: "" });
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<string | null>(null);
  const [idOk, setIdOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!step2) return;
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/c/login"); return; }
      const m = data.user.user_metadata ?? {};
      setF((x) => ({ ...x, loginId: m.login_id ?? "", email: data.user.email ?? "", name: m.name ?? m.full_name ?? "" }));
    });
  }, [step2, router]);

  const idValid = /^[a-z0-9_]{4,20}$/.test(f.loginId);
  async function checkId() {
    if (!idValid) { setIdOk(null); return; }
    try { setIdOk(await rpc<boolean>("is_login_id_available", { p_login_id: f.loginId })); } catch { setIdOk(null); }
  }

  async function account(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setInfo(null);
    if (!idValid) { setErr("아이디는 영문 소문자 · 숫자 · _ 4~20자로 입력해 주세요"); return; }
    if (idOk === false) { setErr("이미 사용 중인 아이디예요"); return; }
    if (!/^\S+@\S+\.\S+$/.test(f.email)) { setErr("이메일을 확인해 주세요 (비밀번호 찾기에 써요)"); return; }
    if (f.pw.length < 8) { setErr("비밀번호는 8자 이상이어야 해요"); return; }
    if (f.pw !== f.pw2) { setErr("비밀번호가 서로 달라요"); return; }
    setBusy(true);
    const { data, error } = await sb.auth.signUp({ email: f.email.trim(), password: f.pw, options: { data: { login_id: f.loginId } } });
    setBusy(false);
    if (error) { setErr(/registered|already/i.test(error.message) ? "이미 가입된 이메일이에요. 로그인해 주세요" : error.message); return; }
    if (!data.session) { setInfo("인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요."); return; }
    setStep(2);
  }

  const allOn = ITEMS.every((i) => on[i.k]);
  const reqOk = ITEMS.filter((i) => i.req).every((i) => on[i.k]);
  async function profile(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (!f.name.trim()) { setErr("이름을 입력해 주세요"); return; }
    if (digits(f.phone).length < 10) { setErr("휴대폰 번호를 확인해 주세요"); return; }
    if (!reqOk) { setErr("[필수] 약관에 모두 동의해 주세요"); return; }
    setBusy(true);
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new Error("로그인이 필요해요");
      const { error } = await sb.from("customer_profiles").upsert({
        user_id: u.user.id, name: f.name.trim(), phone: fmtPhone(f.phone), nickname: f.name.trim(),
        login_id: f.loginId || u.user.user_metadata?.login_id || null, email: u.user.email,
        terms_agreed_at: new Date().toISOString(), location_agree: !!on.location, marketing_agree: !!on.marketing,
      });
      if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "이미 사용 중인 아이디예요" : error.message);
      const pend = await rpc<any[]>("c_pending_links").catch(() => []);
      router.replace(pend.length ? "/c/connect?from=signup" : "/c/home");
    } catch (x) { setErr(msgOf(x)); setBusy(false); }
  }

  return (
    <main className="cpage">
      <Top back={step === 2 && !step2 ? () => setStep(1) : "/c/login"} title="회원가입" />
      <div className="cdots" style={{ alignSelf: "center" }}>{[1, 2].map((n) => <i key={n} className={n === step ? "on" : ""} />)}</div>
      {step === 1 ? (
        <form onSubmit={account} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="ch1">계정을 만들어요</h1>
          <label className="clbl" htmlFor="lid">아이디</label>
          <input id="lid" className="cin" placeholder="영문 소문자 · 숫자 4~20자" autoCapitalize="none" autoComplete="username" value={f.loginId} onChange={(e) => { set("loginId", e.target.value.toLowerCase()); setIdOk(null); }} onBlur={checkId} />
          {idOk === true && <p className="chint" style={{ color: "#0B5F57" }}>사용할 수 있는 아이디예요</p>}
          {idOk === false && <p className="chint" style={{ color: "#9F1D17" }}>이미 사용 중인 아이디예요</p>}
          <label className="clbl" htmlFor="em">이메일</label>
          <input id="em" className="cin" type="email" placeholder="비밀번호 찾기에 사용해요" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          <label className="clbl" htmlFor="pw">비밀번호</label>
          <input id="pw" className="cin" type="password" placeholder="8자 이상" autoComplete="new-password" value={f.pw} onChange={(e) => set("pw", e.target.value)} />
          <input className="cin" type="password" placeholder="비밀번호 확인" autoComplete="new-password" aria-label="비밀번호 확인" value={f.pw2} onChange={(e) => set("pw2", e.target.value)} />
          {err && <p className="cmsg err" role="alert">{err}</p>}
          {info && <p className="cmsg" role="status">{info}</p>}
          <button type="submit" className="cbtn pri" disabled={busy}>{busy ? "만드는 중…" : "다음"}</button>
        </form>
      ) : (
        <form onSubmit={profile} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="ch1">내 정보와 약관</h1>
          <label className="clbl" htmlFor="nm">이름</label>
          <input id="nm" className="cin" placeholder="매장에 등록된 이름과 같게 적어주세요" autoComplete="name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          <label className="clbl" htmlFor="ph">휴대폰 번호</label>
          <input id="ph" className="cin" inputMode="tel" placeholder="010-0000-0000" autoComplete="tel" value={f.phone} onChange={(e) => set("phone", fmtPhone(e.target.value))} />
          <p className="chint">이전에 다닌 매장에 같은 이름 · 번호로 등록돼 있으면 시술 기록을 이어서 볼 수 있어요</p>
          <button type="button" className="ccheck" style={{ background: "#F3F5F8", borderRadius: 14, padding: "14px 16px", border: 0, fontWeight: 900, fontSize: 17 }} onClick={() => setOn(Object.fromEntries(ITEMS.map((i) => [i.k, !allOn])))} aria-pressed={allOn}>
            <span className={`cbox${allOn ? " y" : ""}`} aria-hidden>{allOn ? "✓" : ""}</span>전체 동의
          </button>
          <div>
            {ITEMS.map((i) => (
              <div key={i.k} style={{ borderTop: "1px solid var(--ln)" }}>
                <div className="crow" style={{ gap: 4 }}>
                  <button type="button" className="ccheck" style={{ flex: 1, borderTop: 0 }} aria-pressed={!!on[i.k]} onClick={() => setOn((o) => ({ ...o, [i.k]: !o[i.k] }))}>
                    <span className={`cbox${on[i.k] ? " y" : ""}`} aria-hidden>{on[i.k] ? "✓" : ""}</span>
                    <span style={{ flex: 1, fontSize: 16 }}><b style={{ color: i.req ? "var(--a2)" : "var(--mt)" }}>[{i.req ? "필수" : "선택"}]</b> {i.t}{i.d && <span className="cmt" style={{ display: "block", fontSize: 13 }}>{i.d}</span>}</span>
                  </button>
                  <button type="button" className="clink" onClick={() => setView(view === i.k ? null : i.k)} aria-expanded={view === i.k} style={{ padding: "13px 4px" }}>{view === i.k ? "닫기" : "보기"}</button>
                </div>
                {view === i.k && <div className="ccard soft" style={{ marginBottom: 12, gap: 6 }}>{i.body.map((t) => <p key={t} className="cmt" style={{ color: "var(--k)" }}>{t}</p>)}</div>}
              </div>
            ))}
          </div>
          {err && <p className="cmsg err" role="alert">{err}</p>}
          <button type="submit" className="cbtn pri" disabled={busy || !reqOk}>{busy ? "저장 중…" : "가입 완료"}</button>
        </form>
      )}
    </main>
  );
}

export default function Page() { return <Suspense fallback={null}><Signup /></Suspense>; }
