"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required");
}

export const supabase = createClient(url, key);
