"use client";

import { useEffect, useMemo, useState } from "react";
import AddressField, { addrError } from "@/src/components/address-field";
import { isNaverUrl, parsePlaceId } from "@/src/lib/naver";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { saveDocPaths, submitSignup, type SignupInput } from "@/src/lib/onboarding";
import { validRepCode } from "@/src/lib/sales-code";
import "./wizard.css";

const STEPS = ["역할", "업종", "인증", "매장 정보", "승인"];
const SIDE: { title: string; body: string }[] = [
  { title: "시술이 끝난 뒤에도\n고객과 이어지는 매장", body: "매장 형태를 먼저 알려 주세요.\n형태에 맞는 화면과 권한으로 시작합니다." },
  { title: "업종을 고르면\n화면이 맞춰집니다", body: "기본 시술 메뉴도 업종에 맞게 미리 만들어 드려요." },
  { title: "원장님 본인\n확인", body: "가입 결과와 예약 알림을 받을 휴대폰 번호예요." },
  { title: "서류는 사진만\n찍어 주세요", body: "사업자등록증 · 영업신고증 사진을 올리면\n확인 후 승인해 드려요." },
];
type Doc = { file: File | null; preview: string | null };

export default function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const addBranch = params.get("add") === "1";
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(addBranch ? 3 : 0);
  const [f, setF] = useState<SignupInput>({
    shopType: "shop", industry: "hair", ownerName: "", ownerPhone: "", shopName: "", address: "", postcode: "", addressDetail: "", shopPhone: "", bizNo: "",
    expectedDesigners: 3, ownerDoesService: true, naverUrl: "", naverLogin: "", naverLater: false, referralCode: (params.get("ref") ?? "").toUpperCase(), ...(addBranch ? { shopType: "multi" as const } : {}),
  });
  // 로그인 화면에서 넣은 휴대폰 번호 이어받기 (테스트 버전)
  useEffect(() => {
    try {
      const p = sessionStorage.getItem("salonai.login.phone");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (p) setF((x) => ({ ...x, ownerPhone: x.ownerPhone || p }));
    } catch { /* 저장소 없음 */ }
  }, []);
  const [invite, setInvite] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [docs, setDocs] = useState<{ biz: Doc; license: Doc }>({ biz: { file: null, preview: null }, license: { file: null, preview: null } });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SignupInput>(k: K, v: SignupInput[K]) => setF((x) => ({ ...x, [k]: v }));

  function next() {
    setErr(null);
    if (step === 2) {
      if (!f.ownerName.trim()) return setErr("대표자(원장님) 이름을 입력해주세요.");
      if (f.ownerPhone.replace(/[^0-9]/g, "").length < 10) return setErr("휴대폰 번호를 확인해주세요.");
    }
    setStep((s) => Math.min(3, s + 1));
  }
  function pick(kind: "biz" | "license", file: File | null) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErr("사진은 10MB 이하로 올려주세요."); return; }
    setDocs((d) => ({ ...d, [kind]: { file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null } }));
  }
  async function submit() {
    setErr(null);
    if (!f.shopName.trim()) return setErr("매장 이름을 입력해주세요.");
    const ae = addrError({ postcode: f.postcode, address: f.address, detail: f.addressDetail });
    if (ae) return setErr(ae);
    // 네이버 플레이스: 입력을 권하되 '나중에 할게요'도 허용 (Jina님 결정 11/6)
    if (!f.naverLater && !f.naverUrl?.trim()) return setErr("네이버 플레이스 주소를 넣거나 ‘아직 없어요 · 나중에 할게요’를 눌러주세요.");
    if (f.naverUrl?.trim() && !isNaverUrl(f.naverUrl)) return setErr("네이버 플레이스 · 지도 주소(naver.com · naver.me)를 붙여넣어 주세요.");
    setBusy(true);
    const res = await submitSignup(f);
    if (res.error || !res.shopId) { setBusy(false); setErr(res.error ?? "가입 신청에 실패했어요."); return; }
    // 서류 사진: 매장이 생긴 뒤 원장 권한으로 비공개 보관함에 올림
    const paths: { biz?: string | null; license?: string | null } = {};
    for (const kind of ["biz", "license"] as const) {
      const file = docs[kind].file;
      if (!file) continue;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${res.shopId}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("shop-docs").upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (!error) paths[kind] = path;
    }
    await saveDocPaths(res.shopId, paths);
    setStep(4);
    router.replace("/desk/home");
    
  }

  const side = SIDE[Math.min(step, 3)];
  return (
    <div className="wz">
      <aside className="wz-side">
        <p className="wz-brand">SALONAI <span>매장 · 디자이너</span></p>
        <div className="wz-copy">
          <h2>{side.title.split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}</h2>
          <p>{side.body.split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}</p>
        </div>
        <p className="wz-count">가입 {step + 1} / 5 단계</p>
      </aside>

      <main className="wz-main">
        <ol className="wz-steps" aria-label="가입 단계">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? "done" : i === step ? "cur" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="dot">{i < step ? "✓" : i + 1}</span>{s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="wz-sec">
            <h1 className="h1">어떤 매장을 운영하시나요?</h1>
            <p className="lbl">원장님(매장 운영자) · 가입하면 매장의 마스터 권한을 가져요</p>
            <div className="wz-cards three">
              {([
                ["solo", "1인샵", "혼자 운영해요", "원장 = 디자이너 · 화면 하나로", "사업자등록증 · 영업신고증"],
                ["shop", "매장", "디자이너와 함께 운영해요", "원장이 마스터 · 디자이너 초대", "사업자등록증 · 영업신고증"],
                ["multi", "다매장 · 다점포", "여러 지점을 운영해요", "한 계정으로 지점 전환", "지점별 사업자등록증"],
              ] as const).map(([v, t, sub, desc, docs]) => (
                <button key={v} type="button" className={`wz-card${f.shopType === v ? " on" : ""}`} aria-pressed={f.shopType === v} onClick={() => set("shopType", v)}>
                  <span className="row"><b className="t">{t}</b><span className="sp" /><span className="pick">{f.shopType === v ? "✓ 선택" : "선택"}</span></span>
                  <b className="sub">{sub}</b>
                  <span className="sm">{desc}</span>
                  <span className="docs sm"><b>필요 서류</b> {docs}</span>
                </button>
              ))}
            </div>
            <div className="wz-invite">
              <span className="pill p-gray">디자이너</span>
              <div className="grow">
                <b>소속 디자이너이신가요?</b>
                <span className="sm">원장님이 보낸 초대 링크로 가입하면 매장에 바로 연결돼요. 권한은 원장님이 정해요.</span>
              </div>
              {showInvite ? (
                <form className="row" onSubmit={(e) => { e.preventDefault(); const code = invite.trim().split("/").pop(); if (code) router.push(`/invite/${code}`); }}>
                  <input id="wz-invite" className="input" placeholder="초대 코드 또는 링크" value={invite} onChange={(e) => setInvite(e.target.value)} autoFocus />
                  <button className="btn pri" type="submit">연결</button>
                </form>
              ) : (
                <button type="button" className="btn" onClick={() => setShowInvite(true)}>초대 코드 입력</button>
              )}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="wz-sec">
            <h1 className="h1">어떤 매장인가요?</h1>
            <div className="wz-cards two">
              {([["hair", "헤어", "/onboarding/hair_shop_luxury.jpg"], ["nail", "네일", "/onboarding/nail_shop_luxury.jpg"]] as const).map(([v, t, img]) => (
                <button key={v} type="button" className={`wz-card photo${f.industry === v ? " on" : ""}`} aria-pressed={f.industry === v} onClick={() => set("industry", v)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" />
                  <span className="row cap"><b className="t big">{t}</b><span className="sp" /><span className="pick">{f.industry === v ? "✓ 선택" : "선택"}</span></span>
                </button>
              ))}
            </div>
            <p className="lbl">곧 열려요</p>
            <div className="wz-soon">{["속눈썹", "피부", "증모", "펫"].map((x) => <div key={x}><b>{x}</b><span className="sm">오픈 예정</span></div>)}</div>
          </section>
        )}

        {step === 2 && (
          <section className="wz-sec narrow">
            <h1 className="h1">원장님 정보</h1>
            <label className="field"><span className="lbl">대표자(원장님) 이름</span>
              <input id="wz-owner" className="input" value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} maxLength={20} placeholder="김하늘" /></label>
            <label className="field"><span className="lbl">휴대폰 번호</span>
              <input id="wz-phone" className="input" inputMode="tel" value={f.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} placeholder="010-0000-0000" /></label>
            <p className="msg note">문자 인증번호 확인은 정식 오픈 때 붙어요. 지금은 번호만 저장되고, 승인 결과를 이 번호로 안내해 드려요.</p>
          </section>
        )}

        {step === 3 && (
          <section className="wz-sec">
            <h1 className="h1">{addBranch ? "지점 추가 · 매장 정보" : "매장 정보"}</h1>
            {addBranch && <p className="sm">원장님 정보는 처음 가입 때 것을 그대로 써요. 테스트 단계에서는 승인 절차 없이 바로 운영을 시작해요.</p>}
            <div className="wz-info">
              <div className="col">
                <label className="field"><span className="lbl">매장명</span>
                  <input id="wz-shop" className="input" value={f.shopName} onChange={(e) => set("shopName", e.target.value)} maxLength={40} placeholder="살롱 드 하늘" /></label>
                <div className="field"><span className="lbl">주소</span>
                  <AddressField idPrefix="wz-addr" value={{ postcode: f.postcode, address: f.address, detail: f.addressDetail }}
                    onChange={(a) => setF((x) => ({ ...x, postcode: a.postcode, address: a.address, addressDetail: a.detail }))} /></div>
                <div className="two">
                  <label className="field"><span className="lbl">매장 전화 (선택)</span>
                    <input id="wz-shopphone" className="input" inputMode="tel" value={f.shopPhone} onChange={(e) => set("shopPhone", e.target.value)} placeholder="02-000-0000" /></label>
                  <label className="field"><span className="lbl">사업자등록번호</span>
                    <input id="wz-biz" className="input" inputMode="numeric" value={f.bizNo} onChange={(e) => set("bizNo", e.target.value)} placeholder="123-45-67890" /></label>
                </div>
                {!addBranch && (
                  <label className="field"><span className="lbl">추천 코드 (선택 · 영업 담당자에게 받은 코드)</span>
                    <input id="wz-ref" className="input" value={f.referralCode ?? ""} maxLength={11} placeholder="IC01-0217-T" autoCapitalize="characters"
                      onChange={(e) => set("referralCode", e.target.value.toUpperCase())} aria-invalid={!!f.referralCode && f.referralCode.length >= 11 && !validRepCode(f.referralCode)} />
                    {!!f.referralCode && f.referralCode.length >= 11 && !validRepCode(f.referralCode) && <span className="sm" style={{ color: "#B42318" }}>코드를 다시 확인해주세요 (한 글자가 틀린 것 같아요)</span>}
                  </label>
                )}
                <fieldset className="wz-naver">
                  <legend><b>네이버 플레이스 연결</b> <span className="pill p-amb">중요</span></legend>
                  <p className="sm">네이버 예약을 SALONAI 캘린더로 받으려면 꼭 필요해요. 네이버 지도에서 우리 매장 → <b>공유</b> → 링크 복사 후 붙여넣어 주세요.</p>
                  <label className="field"><span className="lbl">네이버 플레이스 주소</span>
                    <input id="wz-naver" className="input" inputMode="url" value={f.naverUrl ?? ""} disabled={f.naverLater} maxLength={300}
                      placeholder="https://naver.me/… 또는 https://map.naver.com/…/place/1234567" onChange={(e) => set("naverUrl", e.target.value)} />
                    {!!f.naverUrl?.trim() && (parsePlaceId(f.naverUrl)
                      ? <span className="sm" style={{ color: "#0F766E" }}>플레이스 번호 {parsePlaceId(f.naverUrl)} 확인됐어요</span>
                      : isNaverUrl(f.naverUrl) ? <span className="sm">짧은 링크는 저장할 때 번호를 찾아요</span> : <span className="sm" style={{ color: "#B42318" }}>네이버 주소가 아닌 것 같아요</span>)}
                  </label>
                  <label className="field"><span className="lbl">네이버 아이디 (스마트플레이스 관리 계정 · 선택)</span>
                    <input id="wz-naverid" className="input" value={f.naverLogin ?? ""} disabled={f.naverLater} maxLength={60} autoComplete="off" placeholder="비밀번호는 절대 입력하지 마세요"
                      onChange={(e) => set("naverLogin", e.target.value)} /></label>
                  <label className="row wz-later"><input type="checkbox" checked={!!f.naverLater} onChange={(e) => setF((x) => ({ ...x, naverLater: e.target.checked }))} />
                    <span>아직 없어요 · 나중에 할게요 <span className="sm">(설정 › 네이버 · 연동에서 언제든 넣을 수 있어요)</span></span></label>
                </fieldset>
                <div className="two">
                  {f.shopType !== "solo" && (
                    <label className="field"><span className="lbl">디자이너 수</span>
                      <select id="wz-count" className="input" value={f.expectedDesigners} onChange={(e) => set("expectedDesigners", Number(e.target.value))}>
                        {[2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}명{n === 20 ? " 이상" : ""}</option>)}
                      </select></label>
                  )}
                  <label className="field"><span className="lbl">업종</span>
                    <input className="input" value={f.industry === "hair" ? "헤어" : "네일"} readOnly /></label>
                </div>
                {f.shopType !== "solo" && (
                  <div className="wz-toggle">
                    <div><b>저도 직접 시술해요</b><span className="sm">켜면 원장님 계정에 디자이너 화면이 함께 열려요 (예약 캘린더에 원장 열)</span></div>
                    <button type="button" role="switch" aria-checked={f.ownerDoesService} aria-label="원장 직접 시술" className={`sw${f.ownerDoesService ? " on" : ""}`} onClick={() => set("ownerDoesService", !f.ownerDoesService)}><i /></button>
                  </div>
                )}
              </div>
              <div className="col">
                <span className="lbl">서류 업로드 (사진 또는 PDF)</span>
                {([["biz", "사업자등록증"], ["license", "영업신고증"]] as const).map(([k, label]) => (
                  <label key={k} className={`wz-doc${docs[k].file ? " has" : ""}`}>
                    <input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => pick(k, e.target.files?.[0] ?? null)} />
                    <span className="thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {docs[k].preview ? <img src={docs[k].preview!} alt="" /> : docs[k].file ? "PDF" : "+"}
                    </span>
                    <span className="grow"><b>{label}</b><span className="sm">{docs[k].file ? `${docs[k].file!.name} · 다시 누르면 바꿔요` : "사진 촬영 또는 파일 선택"}</span></span>
                    {docs[k].file && <span className="pill p-teal">첨부됨</span>}
                  </label>
                ))}
                <p className="sm">서류는 원장님과 SALONAI 승인 담당만 볼 수 있어요. 나중에 올려도 되지만, 승인은 서류 확인 후 진행돼요.</p>
              </div>
            </div>
          </section>
        )}

        {err && <p className="msg err">{err}</p>}
        <div className="wz-foot">
          {addBranch && <a className="btn ghost" href="/desk/home">취소</a>}
          {!addBranch && step > 0 && step < 4 && <button type="button" className="btn ghost" onClick={() => { setErr(null); setStep(step - 1); }}>이전</button>}
          <span className="sp" />
          {step < 3 && <button type="button" className="btn pri wide" onClick={next}>다음</button>}
          {step === 3 && <button type="button" className="btn pri wide" disabled={busy} onClick={submit}>{busy ? "신청하는 중…" : addBranch ? "지점 추가 신청" : "가입 신청"}</button>}
        </div>
      </main>
    </div>
  );
}
