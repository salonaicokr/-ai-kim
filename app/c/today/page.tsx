"use client";
// @ts-nocheck

import { useEffect, useState } from "react";
import { daysSince, msgOf, rpc } from "@/src/lib/customer/api";
import { damageAdvice, damageColor, damageHeadline, fetchWeather, weatherAdvice } from "@/src/lib/customer/care";
import { Loading, Page, Top, useGuard } from "../ui";

export default function Today() {
  const g = useGuard();
  const [bks, setBks] = useState<any[] | null>(null);
  const [wx, setWx] = useState<any>(null);
  const [wxErr, setWxErr] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);

  useEffect(() => { if (g.ready) { rpc<any[]>("c_my_bookings").then(setBks).catch(() => setBks([])); fetchWeather(false).then(setWx).catch((e) => setWxErr(msgOf(e))); } }, [g.ready]);
  async function useMyLocation() {
    setLocBusy(true); setWxErr(null);
    try { setWx(await fetchWeather(true)); } catch (e) { setWxErr(msgOf(e)); }
    setLocBusy(false);
  }
  if (!g.ready || !bks) return <main className="cpage"><Top back="/c/home" title="오늘의 케어" /><Loading /></main>;
  const last = bks.find((b) => b.status === "completed" && b.damage != null);
  const damage = last?.damage ?? null;
  const adv = wx ? weatherAdvice(wx, damage) : null;
  const tone = adv?.level === "high" ? "#E5484D" : adv?.level === "medium" ? "#E8A100" : "#00A88F";
  return (
    <Page tabbed={false}>
      <Top back="/c/home" title="오늘의 케어" />
      <div className="ccard dark">
        <span className="ck">오늘 날씨</span>
        {wx ? (<>
          <b style={{ fontSize: 28 }}>{wx.temp}° <span style={{ fontSize: 16, fontWeight: 600 }}>{wx.label}</span></b>
          <span className="cmt">{wx.city} · 습도 {wx.humidity}% · 바람 {wx.wind}km/h</span>
        </>) : <span className="cmt">{wxErr ?? "날씨를 불러오는 중…"}</span>}
        <button type="button" className="cbtn sm" disabled={locBusy} onClick={useMyLocation} style={{ alignSelf: "flex-start" }}>{locBusy ? "확인 중…" : "내 위치로 보기"}</button>
      </div>
      {adv && (
        <div className="ccard" style={{ borderColor: tone }}>
          <b style={{ color: tone, fontSize: 18 }}>{adv.headline}</b>
          {adv.tips.map((t) => <p key={t} className="cmt" style={{ color: "var(--k)" }}>• {t}</p>)}
        </div>
      )}
      <div className="ccard">
        <span className="ck">내 모발 상태</span>
        {damage != null ? (<>
          <div className="crow"><b style={{ fontSize: 18 }}>{damageHeadline(damage)}</b><span className="csp" /><b style={{ color: damageColor(damage), fontSize: 22 }}>{damage}/10</b></div>
          <div className="cbar"><i style={{ width: `${damage * 10}%`, background: damageColor(damage) }} /></div>
          <span className="cmt">{damageAdvice(damage)}</span>
          <span className="cmt" style={{ fontSize: 12 }}>{last.store} · {daysSince(last.start)}일 전 기록 기준</span>
        </>) : <span className="cmt">아직 손상도 기록이 없어요. 디자이너가 시술 기록을 보내면 맞춤 케어를 알려드려요.</span>}
      </div>
    </Page>
  );
}
