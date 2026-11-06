"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./address-field.css";

export type Addr = { postcode: string; address: string; detail: string };
type DaumData = { zonecode: string; roadAddress: string; jibunAddress: string; address: string; buildingName?: string };
type DaumPostcode = new (o: { oncomplete: (d: DaumData) => void; onclose?: () => void; width?: string; height?: string }) => { open: () => void; embed: (el: HTMLElement) => void };
declare global { interface Window { daum?: { Postcode: DaumPostcode }; kakao?: { Postcode?: DaumPostcode } } }

// 카카오 우편번호 서비스 공식 주소 (daumcdn → kakaocdn 이전, postcode.map.kakao.com/guide)
const SRC = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
const Postcode = () => (typeof window === "undefined" ? undefined : window.kakao?.Postcode ?? window.daum?.Postcode);
let loading: Promise<void> | null = null;
/** 우편번호 스크립트는 주소 검색을 처음 누를 때만 불러옴 (전역 head 삽입 금지) */
function loadPostcode() {
  if (Postcode()) return Promise.resolve();
  loading ??= new Promise<void>((ok, fail) => {
    const s = document.createElement("script");
    s.src = SRC; s.async = true;
    s.onload = () => ok(); s.onerror = () => { loading = null; fail(new Error("load")); };
    document.body.appendChild(s);
  });
  return loading;
}

/**
 * 주소 입력 (S-11): [우편번호][주소 검색] + 기본주소(읽기 전용) + 상세주소.
 * 카카오 우편번호 서비스 · 화면 안 레이어로 띄움 (팝업 창은 브라우저가 막는 경우가 있어 쓰지 않음).
 * 가입 · 설정 › 매장 정보 · 지점 추가에서 같이 씀.
 */
export default function AddressField({ value, onChange, idPrefix = "addr", required = false }: { value: Addr; onChange: (v: Addr) => void; idPrefix?: string; required?: boolean }) {
  const detailRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = (d: DaumData) => {
    const base = d.roadAddress || d.jibunAddress || d.address;
    onChange({ postcode: d.zonecode, address: base + (d.buildingName ? ` (${d.buildingName})` : ""), detail: value.detail });
    setLayer(false);
    setTimeout(() => detailRef.current?.focus(), 50);
  };

  async function search() {
    setErr(null);
    try { await loadPostcode(); } catch { setErr("주소 검색을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 눌러주세요."); return; }
    if (!Postcode()) { setErr("주소 검색을 불러오지 못했어요. 잠시 후 다시 눌러주세요."); return; }
    setLayer(true);
  }
  // 화면이 뜨면 미리 불러와 두기 (첫 클릭이 바로 열리게)
  useEffect(() => { const t = setTimeout(() => { loadPostcode().catch(() => {}); }, 800); return () => clearTimeout(t); }, []);

  // 레이어 안에 검색창을 붙임 (휴대폰 전체 화면 · 데스크톱 가운데 창) · Esc 로 닫기
  useEffect(() => {
    const P = Postcode();
    if (!layer || !layerRef.current || !P) return;
    layerRef.current.innerHTML = "";
    new P({ oncomplete: pick, width: "100%", height: "100%" }).embed(layerRef.current);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setLayer(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  return (
    <div className="addr">
      <div className="addr-row">
        <input id={`${idPrefix}-zip`} className="input addr-zip" readOnly placeholder="우편번호" value={value.postcode} aria-label="우편번호" onClick={search} />
        <button type="button" className="btn" onClick={search}>주소 검색</button>
      </div>
      <input id={`${idPrefix}-base`} className="input" readOnly placeholder="주소 검색을 눌러 찾아주세요" value={value.address} aria-label="기본주소" onClick={search} />
      <input id={`${idPrefix}-detail`} ref={detailRef} className="input" placeholder={required || value.address ? "상세주소 (층 · 호수) — 필수" : "상세주소 (층 · 호수)"} maxLength={80}
        value={value.detail} onChange={(e) => onChange({ ...value, detail: e.target.value })} aria-label="상세주소" />
      {err && <p className="msg err" role="alert">{err}</p>}
      {/* 상위 카드의 transform · overflow 에 갇히지 않게 body 로 띄움 */}
      {layer && createPortal(
        <div className="addr-layer" role="dialog" aria-modal="true" aria-label="주소 검색" onClick={(e) => { if (e.target === e.currentTarget) setLayer(false); }}>
          <div className="addr-layer-box"><div className="addr-layer-top"><b>주소 검색</b><button type="button" className="btn ghost sm-btn" onClick={() => setLayer(false)}>닫기</button></div>
          <div ref={layerRef} className="addr-layer-body" /></div>
        </div>, document.body
      )}
    </div>
  );
}

/** 저장 전 확인: 주소를 골랐으면 상세주소 필수 */
export const addrError = (a: Addr, required = false) =>
  (required && !a.address) ? "주소 검색으로 매장 주소를 찾아주세요." : a.address && !a.detail.trim() ? "상세주소(층 · 호수)를 입력해주세요. 없으면 ‘1층’처럼 적어주세요." : null;

/** 기본주소 + 상세주소 → 한 줄 (기존 address 칸 · 화면 표시용) */
export const addrLine = (a: Addr) => [a.address, a.detail.trim()].filter(Boolean).join(", ");
