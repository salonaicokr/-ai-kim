"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { digits, fmtPhone, msgOf, sb, shrinkImage } from "@/src/lib/customer/api";
import { Loading, Page, SignedImg, Toggle, Top, useGuard } from "../../ui";

const STYLES = ["단발", "중단발", "장발", "숏컷", "레이어드", "웨이브", "스트레이트", "볼륨", "내추럴", "트렌디", "시크", "단정한"];

export default function Edit() {
  const g = useGuard();
  const router = useRouter();
  const [f, setF] = useState<any>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => { if (g.profile && !f) setF({ ...g.profile, phone: fmtPhone(g.profile.phone ?? ""), style_prefs: g.profile.style_prefs ?? [] }); }, [g.profile, f]);

  async function pickAvatar(file: File | undefined) {
    if (!file || !g.uid) return;
    setBusy(true); setErr(null);
    try {
      const blob = await shrinkImage(file, 600);
      const path = `${g.uid}/avatar-${Date.now()}.jpg`;
      const { error } = await sb.storage.from("customer-avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      setF((x: any) => ({ ...x, avatar_path: path }));
    } catch (e) { setErr(msgOf(e)); }
    setBusy(false);
  }
  async function save() {
    setErr(null); setOk(null);
    if (!f.name?.trim()) { setErr("이름을 입력해주세요"); return; }
    if (digits(f.phone).length < 10) { setErr("연락처를 확인해주세요"); return; }
    setBusy(true);
    try {
      const { error } = await sb.from("customer_profiles").update({
        name: f.name.trim(), nickname: f.nickname?.trim() || null, phone: digits(f.phone), address: f.address?.trim() || null,
        avatar_path: f.avatar_path ?? null, style_prefs: f.style_prefs, location_agree: !!f.location_agree, marketing_agree: !!f.marketing_agree,
      }).eq("user_id", g.uid);
      if (error) throw error;
      if (pw) {
        if (pw.length < 8) throw new Error("비밀번호는 8자 이상이어야 해요");
        const { error: e2 } = await sb.auth.updateUser({ password: pw });
        if (e2) throw e2;
        setPw("");
      }
      setOk("저장했어요");
      g.reload();
    } catch (e) { setErr(msgOf(e)); }
    setBusy(false);
  }

  if (!g.ready || !f) return <main className="cpage"><Top back="/c/my" title="내 정보" /><Loading /></main>;
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  return (
    <Page tabbed={false}>
      <Top back="/c/my" title="내 정보 수정" />
      <div className="crow" style={{ justifyContent: "center", flexDirection: "column", gap: 8 }}>
        {f.avatar_path ? <SignedImg bucket="customer-avatars" path={f.avatar_path} className="cavatar" style={{ width: 88, height: 88, borderRadius: 44, objectFit: "cover" }} /> : <div className="cavatar" aria-hidden style={{ width: 88, height: 88, fontSize: 32 }}>{(f.name ?? "?").slice(0, 1)}</div>}
        <label className="cbtn sm" style={{ cursor: "pointer" }}>사진 변경<input type="file" accept="image/*" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} /></label>
      </div>
      <label className="clabel">이름<input className="cin" value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} maxLength={20} /></label>
      <label className="clabel">닉네임<input className="cin" value={f.nickname ?? ""} onChange={(e) => set("nickname", e.target.value)} maxLength={20} placeholder="선택" /></label>
      <label className="clabel">연락처<input className="cin" inputMode="numeric" value={f.phone} onChange={(e) => set("phone", fmtPhone(e.target.value))} /></label>
      <label className="clabel">주소<input className="cin" value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="선택 · 내 주변 매장 찾기에 써요" /></label>
      <div className="clabel">선호 스타일
        <div className="cchips">{STYLES.map((s) => { const on = f.style_prefs.includes(s); return <button key={s} type="button" aria-pressed={on} className={`cchip${on ? " on" : ""}`} onClick={() => set("style_prefs", on ? f.style_prefs.filter((x: string) => x !== s) : [...f.style_prefs, s])}>{s}</button>; })}</div>
      </div>
      <div className="ccard">
        <div className="crow"><span>위치 정보 활용 동의</span><span className="csp" /><Toggle on={!!f.location_agree} label="위치 정보 동의" onChange={(v) => set("location_agree", v)} /></div>
        <div className="crow"><span>마케팅 정보 수신 동의</span><span className="csp" /><Toggle on={!!f.marketing_agree} label="마케팅 수신 동의" onChange={(v) => set("marketing_agree", v)} /></div>
      </div>
      {f.login_id && <label className="clabel">새 비밀번호 (바꿀 때만)<input className="cin" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8자 이상" /></label>}
      {err && <p className="cmsg err" role="alert">{err}</p>}
      {ok && <p className="cmsg" role="status">{ok}</p>}
      <div className="cfoot"><button type="button" className="cbtn pri" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button></div>
    </Page>
  );
}
