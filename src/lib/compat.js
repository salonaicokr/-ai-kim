"use client";

import { createElement, useEffect, useState } from "react";

/** 서버 컴포넌트였던 화면을 브라우저에서 그대로 쓰기 위한 도우미 */

export class RedirectSignal extends Error {
  constructor(to) {
    super(`redirect:${to}`);
    this.to = to;
  }
}

/** next/navigation 의 redirect 대신: 현재 비동기 컴포넌트를 멈추고 이동 */
export function redirect(to) {
  throw new RedirectSignal(to);
}

/** next/server 의 connection: 브라우저에서는 필요 없음 */
export async function connection() {}

export function notFound() {
  throw new RedirectSignal("/desk");
}

/**
 * async 서버 컴포넌트(`async function Body(props)`)를 클라이언트 컴포넌트로 바꿔요.
 * 반환된 JSX 를 효과 안에서 불러와 그려요. props 가 바뀌면 다시 불러와요.
 */
export function asyncComp(fn, fallback = null) {
  function Wrapped(props) {
    const [out, setOut] = useState(fallback);
    const [tick, setTick] = useState(0);
    const key = safeKey(props);
    // router.refresh() 대신: 저장 뒤 화면을 다시 불러오라는 신호
    useEffect(() => {
      const on = () => setTick((n) => n + 1);
      window.addEventListener("salonai:refresh", on);
      return () => window.removeEventListener("salonai:refresh", on);
    }, []);
    useEffect(() => {
      let alive = true;
      Promise.resolve()
        .then(() => fn(props))
        .then((el) => { if (alive) setOut(el ?? null); })
        .catch((error) => {
          if (!alive) return;
          if (error instanceof RedirectSignal) { window.location.assign(error.to); return; }
          setOut(createElement("p", { className: "msg err", role: "alert" }, `화면을 불러오지 못했어요: ${error?.message ?? error}`));
        });
      return () => { alive = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, tick]);
    return out;
  }
  Wrapped.displayName = `Async(${fn.name || "Component"})`;
  return Wrapped;
}

function safeKey(props) {
  try {
    return JSON.stringify(props, (k, v) => (typeof v === "function" || (v && typeof v.then === "function") ? undefined : v));
  } catch {
    return "";
  }
}
