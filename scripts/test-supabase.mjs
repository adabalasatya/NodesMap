// End-to-end probe: signs up a throwaway user, writes a folder + file,
// reads them back through RLS, then signs out.
// Run with: node scripts/test-supabase.mjs

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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("✗ Missing env vars in .env.local");
  process.exit(1);
}

console.log("→ URL:", url);
console.log("→ Key:", key.slice(0, 20) + "…\n");

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = `probe+${Date.now()}@noteflow.test`;
const password = "ProbeTest123!";

async function step(label, fn) {
  try {
    const r = await fn();
    console.log(`✓ ${label}`);
    return r;
  } catch (e) {
    console.log(`✗ ${label} → ${e.message ?? e}`);
    if (e.hint) console.log("  hint:", e.hint);
    throw e;
  }
}

(async () => {
  // 1. Schema exists?
  let { error: foldersErr } = await sb.from("folders").select("id").limit(1);
  let { error: filesErr } = await sb.from("files").select("id").limit(1);
  if (foldersErr?.code === "42P01" || filesErr?.code === "42P01" ||
      (foldersErr?.message?.includes("Could not find the table"))) {
    console.log(
      "✗ Tables missing. Paste supabase-schema.sql into Supabase → SQL Editor and run, then retry."
    );
    process.exit(2);
  }
  console.log("✓ Tables reachable");

  // 2. Sign up
  let userId;
  try {
    const r = await step("Sign up throwaway user", async () => {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    });
    userId = r.user?.id;
    if (!r.session) {
      // Email confirmation is on. Try sign-in (will fail). Tell user.
      console.log(
        "⚠ Sign-up created the user but no session was returned — email confirmation is enabled in Supabase. Turn it OFF for full testing:\n  Authentication → Sign In / Up → 'Confirm email' = off."
      );
      process.exit(3);
    }
  } catch {
    process.exit(4);
  }
  console.log("  user_id:", userId);

  // 3. Insert folder
  const folderId = crypto.randomUUID();
  await step("Insert folder", async () => {
    const { error } = await sb.from("folders").insert({
      id: folderId,
      user_id: userId,
      name: "Probe folder",
      color: "#16a34a",
    });
    if (error) throw error;
  });

  // 4. Insert file
  const fileId = crypto.randomUUID();
  await step("Insert file", async () => {
    const { error } = await sb.from("files").insert({
      id: fileId,
      user_id: userId,
      folder_id: folderId,
      title: "Probe note",
      content: "# Hello from probe",
      is_completed: false,
    });
    if (error) throw error;
  });

  // 5. Read back
  await step("Read folders (own only)", async () => {
    const { data, error } = await sb.from("folders").select("*");
    if (error) throw error;
    if (!data.find((f) => f.id === folderId))
      throw new Error("Inserted folder not visible to its owner");
    console.log("  rows:", data.length);
  });
  await step("Read files (own only)", async () => {
    const { data, error } = await sb.from("files").select("*");
    if (error) throw error;
    if (!data.find((f) => f.id === fileId))
      throw new Error("Inserted file not visible to its owner");
    console.log("  rows:", data.length);
  });

  // 6. Update completion
  await step("Mark file done", async () => {
    const { error } = await sb
      .from("files")
      .update({ is_completed: true, updated_at: new Date().toISOString() })
      .eq("id", fileId);
    if (error) throw error;
  });

  // 7. Delete
  await step("Delete file", async () => {
    const { error } = await sb.from("files").delete().eq("id", fileId);
    if (error) throw error;
  });
  await step("Delete folder", async () => {
    const { error } = await sb.from("folders").delete().eq("id", folderId);
    if (error) throw error;
  });

  await sb.auth.signOut();
  console.log("\n✓ End-to-end Supabase probe passed");
})().catch(() => {
  console.log("\n✗ Probe failed — see errors above");
  process.exit(1);
});
