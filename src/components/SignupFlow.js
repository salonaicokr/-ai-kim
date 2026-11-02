"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/browser";
import { dbErrorMessage, digits } from "@/src/lib/format";
import { createOwnerStore, readSignupDraft, saveSignupDraft } from "@/src/lib/owner";

const steps = ["역할", "업종", "인증", "매장 정보", "승인"];
const aside = [
  ["시술이 끝난 뒤에도 고객과 이어지는 매장", "예약 화면은 그대로 두고, 시술 기록과 다시 올 날을 남깁니다."],
  ["업종을 고르면 화면이 맞춰집니다", "지금은 헤어와 네일만 열립니다. 속눈썹, 피부, 증모, 펫은 오픈 예정입니다."],
  ["서류는 사진만 찍어 주세요", "사업자등록증과 영업신고증을 올리면 상호, 대표자, 번호를 확인합니다. 본인인증 업체 연결 전에는 이메일로 계정을 만듭니다."],
];

const forms = [
  ["solo", "1인샵", "혼자 운영해요", "원장 = 디자이너 · 화면 하나", "필요 서류 사업자등록증 · 영업신고증"],
  ["shop", "매장", "디자이너와 함께 운영해요", "원장이 마스터 · 디자이너 초대", "필요 서류 사업자등록증 · 영업신고증"],
  ["multi", "다매장 · 다중포", "여러 지점을 운영해요", "한 계정으로 지점 전환", "필요 서류 지점별 사업자등록증"],
];

const soon = [
  ["속눈썹", "오픈 예정"],
  ["피부", "오픈 예정"],
  ["증모", "오픈 예정"],
  ["펫", "오픈 예정"],
];

const empty = {
  form: "solo",
  category: "hair",
  email: "",
  password: "",
  phone: "",
  name: "",
  address: "",
  designerCount: "3",
  ownerAlsoDesigns: true,
  bizName: "",
  representative: "",
  bizNumber: "",
  consents: {},
};

export function SignupFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(empty);
  const [files, setFiles] = useState({ biz: null, permit: null });
  const [consents, setConsents] = useState([]);
  const [sessionUser, setSessionUser] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user) {
        const saved = readSignupDraft();
        if (saved) setDraft((current) => ({ ...current, ...saved }));
        return;
      }
      const { data: stores } = await supabase.from("stores").select("id").eq("owner_id", user.id).limit(1);
      if (stores?.length) {
        router.replace("/desk");
        return;
      }
      setSessionUser(user);
      setDraft((current) => ({ ...current, email: user.email ?? current.email }));
      setStep(2);
    });
    supabase
      .from("consent_documents")
      .select("code, title, body, required, version")
      .eq("timing", "signup")
      .then(({ data }) => {
        const order = ["terms", "privacy", "service_notice"];
        const rows = (data ?? []).slice().sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
        setConsents(rows);
      });
  }, [router]);

  function patch(partial) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function chooseForm(form) {
    patch({ form, ownerAlsoDesigns: form === "solo" });
  }

  async function submit() {
    setError("");
    setNotice("");
    const phone = digits(draft.phone);
    const bizNumber = digits(draft.bizNumber);
    if (!draft.email.includes("@") || draft.password.length < 8) {
      setError("로그인 이메일과 8자 이상 비밀번호를 입력해 주세요.");
      return;
    }
    if (phone.length < 10 || phone.length > 11) {
      setError("휴대폰 번호 10자리 또는 11자리를 입력해 주세요.");
      return;
    }
    if (!draft.name.trim() || !draft.address.trim() || !draft.representative.trim() || !draft.bizName.trim()) {
      setError("매장명, 주소, 상호, 대표자를 입력해 주세요.");
      return;
    }
    if (bizNumber.length !== 10) {
      setError("사업자등록번호 10자리를 입력해 주세요.");
      return;
    }
    if (draft.form !== "solo" && Number(draft.designerCount) < 1) {
      setError("디자이너 수를 입력해 주세요.");
      return;
    }
    if (!files.biz || !files.permit) {
      setError("사업자등록증과 영업신고증 사진을 각각 선택해 주세요.");
      return;
    }
    const missing = consents.filter((item) => item.required && !draft.consents[item.code]);
    if (missing.length) {
      setError("가입에 필요한 동의 항목을 확인해 주세요.");
      return;
    }

    const nextDraft = { ...draft, phone, bizNumber, bizFileName: files.biz.name, permitFileName: files.permit.name };
    setBusy(true);
    try {
      let user = sessionUser;
      if (!user) {
        const { data, error: signError } = await supabase.auth.signUp({
          email: nextDraft.email.trim(),
          password: nextDraft.password,
        });
        if (signError) throw new Error(dbErrorMessage(signError));
        user = data.user;
        if (!data.session) {
          saveSignupDraft(nextDraft);
          setNotice("확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요. 서류 사진은 로그인 후 다시 선택합니다.");
          setBusy(false);
          return;
        }
      }
      await createOwnerStore(supabase, user, nextDraft, files);
      router.replace("/desk");
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  }

  const copy = aside[step] ?? aside[2];
  return (
    <div className="signup-screen">
      <aside className="signup-aside">
        <div>
          <div className="brand">SALONAI<span>매장 · 디자이너</span></div>
          <div className="aside-copy" style={{ marginTop: 72 }}>
            <h1>{copy[0]}</h1>
            <p>{copy[1]}</p>
          </div>
        </div>
        <div className="aside-foot">가입 {step + 1} / 3단계</div>
      </aside>
      <main className="signup-main">
        <div className="steps">
          {steps.map((label, index) => (
            <div key={label} className={index === Math.min(step, 3) ? "step on" : index < step ? "step done" : "step"}>
              <i>{index < step ? "✓" : index + 1}</i>
              {label}
            </div>
          ))}
        </div>
        <div className="panel">
          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="note">{notice}</p> : null}
          {step === 0 ? <FormStep draft={draft} onChoose={chooseForm} onNext={() => setStep(1)} /> : null}
          {step === 1 ? (
            <CategoryStep
              category={draft.category}
              onChoose={(category) => patch({ category })}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          ) : null}
          {step === 2 ? (
            <StoreStep
              draft={draft}
              files={files}
              consents={consents}
              lockedEmail={Boolean(sessionUser)}
              busy={busy}
              onPatch={patch}
              onConsent={(code, checked) => patch({ consents: { ...draft.consents, [code]: checked } })}
              onFile={(kind, file) => setFiles((current) => ({ ...current, [kind]: file }))}
              onBack={() => setStep(1)}
              onSubmit={submit}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function FormStep({ draft, onChoose, onNext }) {
  return (
    <>
      <h2>어떤 매장을 운영하시나요?</h2>
      <p className="lede">원장님 계정입니다. 디자이너는 초대 코드로 들어옵니다.</p>
      <div className="choice-grid">
        {forms.map(([id, title, line, detail, docs]) => (
          <button key={id} type="button" className={draft.form === id ? "choice on" : "choice"} onClick={() => onChoose(id)}>
            <div className="choice-top">
              <h3>{title}</h3>
              {draft.form === id ? <span className="pill">선택됨</span> : null}
            </div>
            <p><b style={{ color: "var(--ink)" }}>{line}</b><br />{detail}<br />{docs}</p>
          </button>
        ))}
      </div>
      <div className="hint-row">
        <span>소속 디자이너이신가요? 원장님이 보낸 초대로 가입합니다.</span>
        <Link href="/join" className="linkish">초대 코드 입력</Link>
      </div>
      <div className="actions">
        <Link href="/login" className="btn">로그인</Link>
        <button className="btn primary" type="button" onClick={onNext}>다음</button>
      </div>
    </>
  );
}

function CategoryStep({ category, onChoose, onBack, onNext }) {
  return (
    <>
      <h2>어떤 매장인가요?</h2>
      <p className="lede">헤어와 네일만 지금 가입할 수 있습니다.</p>
      <div className="choice-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button type="button" className={category === "hair" ? "trade on" : "trade"} onClick={() => onChoose("hair")}>
          <div className="scene hair">헤어</div>
          <div className="trade-top"><h3>헤어</h3>{category === "hair" ? <span className="pill">선택</span> : null}</div>
        </button>
        <button type="button" className={category === "nail" ? "trade on" : "trade"} onClick={() => onChoose("nail")}>
          <div className="scene nail">네일</div>
          <div className="trade-top"><h3>네일</h3>{category === "nail" ? <span className="pill">선택</span> : null}</div>
        </button>
      </div>
      <div className="soon-grid">
        {soon.map(([name, label]) => (
          <button key={name} type="button" className="soon" disabled>
            <b>{name}</b>{label}
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn" type="button" onClick={onBack}>이전</button>
        <button className="btn primary" type="button" onClick={onNext} disabled={!category}>다음</button>
      </div>
    </>
  );
}

function StoreStep({ draft, files, consents, lockedEmail, busy, onPatch, onConsent, onFile, onBack, onSubmit }) {
  return (
    <>
      <h2>매장 정보</h2>
      <p className="lede">휴대폰 본인인증은 통신사 계약 뒤에 연결됩니다. 지금은 이메일로 로그인 계정을 만듭니다.</p>
      <div className="form-grid">
        <section className="card">
          <label className="field">로그인 이메일<input type="email" autoComplete="email" value={draft.email} disabled={lockedEmail} onChange={(event) => onPatch({ email: event.target.value })} /></label>
          {lockedEmail ? null : (
            <label className="field">비밀번호<input type="password" autoComplete="new-password" value={draft.password} onChange={(event) => onPatch({ password: event.target.value })} /></label>
          )}
          <label className="field">휴대폰 번호<input inputMode="numeric" value={draft.phone} onChange={(event) => onPatch({ phone: event.target.value })} placeholder="01012345678" /></label>
          <label className="field">매장명<input value={draft.name} onChange={(event) => onPatch({ name: event.target.value })} /></label>
          <label className="field">주소<input value={draft.address} onChange={(event) => onPatch({ address: event.target.value })} /></label>
          <div className="split">
            {draft.form === "solo" ? null : (
              <label className="field">디자이너 수<input inputMode="numeric" value={draft.designerCount} onChange={(event) => onPatch({ designerCount: event.target.value })} /></label>
            )}
            <label className="field">업종<input value={draft.category === "nail" ? "네일" : "헤어"} disabled /></label>
          </div>
          <div className="toggle">
            <div><b>저도 직접 시술해요</b><small>이 계정에 디자이너 역할을 함께 둡니다.</small></div>
            <button type="button" className={draft.ownerAlsoDesigns ? "switch on" : "switch"} aria-pressed={draft.ownerAlsoDesigns} onClick={() => onPatch({ ownerAlsoDesigns: !draft.ownerAlsoDesigns })}>
              <i />
            </button>
          </div>
        </section>
        <section className="card">
          <h3>서류</h3>
          <label className="upload">사업자등록증<br />{files.biz ? files.biz.name : "사진 선택"}<input type="file" accept="image/*,.pdf" onChange={(event) => onFile("biz", event.target.files?.[0] ?? null)} /></label>
          <div className="split" style={{ marginTop: 12 }}>
            <label className="field">상호<input value={draft.bizName} onChange={(event) => onPatch({ bizName: event.target.value })} /></label>
            <label className="field">대표자<input value={draft.representative} onChange={(event) => onPatch({ representative: event.target.value })} /></label>
          </div>
          <label className="field">사업자등록번호<input inputMode="numeric" value={draft.bizNumber} onChange={(event) => onPatch({ bizNumber: event.target.value })} /></label>
          <label className="upload">영업신고증<br />{files.permit ? files.permit.name : "사진 선택"}<input type="file" accept="image/*,.pdf" onChange={(event) => onFile("permit", event.target.files?.[0] ?? null)} /></label>
          {consents.map((item) => (
            <div className="consent" key={item.code}>
              <label>
                <input type="checkbox" checked={Boolean(draft.consents[item.code])} onChange={(event) => onConsent(item.code, event.target.checked)} />
                {item.title}{item.required ? " (필수)" : ""}
              </label>
              <details>
                <summary>내용 보기</summary>
                <p>{item.body}</p>
              </details>
            </div>
          ))}
        </section>
      </div>
      <div className="actions">
        <button className="btn" type="button" onClick={onBack}>이전</button>
        <button className="btn primary" type="button" onClick={onSubmit} disabled={busy}>{busy ? "접수 중" : "가입 신청"}</button>
      </div>
    </>
  );
}
