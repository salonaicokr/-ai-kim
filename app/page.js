"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/browser";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? "/desk" : "/signup");
    });
  }, [router]);
  return <main className="desk-main">SALONAI를 여는 중입니다.</main>;
}
