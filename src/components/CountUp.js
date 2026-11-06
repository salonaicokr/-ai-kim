"use client";

import { useEffect, useState } from "react";
import { animate } from "animejs";

function reduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CountUp({ value, suffix = "" }) {
  const [shown, setShown] = useState(reduced() ? value : 0);

  useEffect(() => {
    if (reduced()) {
      setShown(value);
      return undefined;
    }
    const state = { n: 0 };
    const run = animate(state, {
      n: value,
      duration: 900,
      ease: "out(4)",
      onRender: () => setShown(Math.round(state.n)),
    });
    return () => run.cancel();
  }, [value]);

  return <>{shown.toLocaleString("ko-KR")}{suffix}</>;
}
