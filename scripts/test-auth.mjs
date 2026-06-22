import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const email = `noteflow.probe.${Date.now()}@gmail.com`;
const password = "ProbeTest123!";

console.log("→ Attempting signUp:", email);
const { data, error } = await sb.auth.signUp({ email, password });

if (error) {
  console.log("✗ signUp error:");
  console.log("   status:", error.status);
  console.log("   code:", error.code);
  console.log("   message:", error.message);
} else {
  console.log("✓ signUp returned");
  console.log("   user:", data.user ? { id: data.user.id, email: data.user.email, confirmed: !!data.user.email_confirmed_at } : null);
  console.log("   session present:", !!data.session);
  if (!data.session) {
    console.log("   ⚠ No session returned — email confirmation is ENABLED.");
    console.log("   Fix: Supabase → Authentication → Sign In / Up → toggle 'Confirm email' OFF for testing.");
  }
}
