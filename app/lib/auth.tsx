"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, hasSupabaseConfig } from "./supabase";

type AuthState = "initializing" | "unauthenticated" | "authenticated" | "disabled";

interface AuthCtx {
  status: AuthState;
  user: User | null;
  session: Session | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  /** Logs in if the account exists, otherwise creates it. */
  continueWithPassword: (
    email: string,
    password: string
  ) => Promise<{ created: boolean; needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState>("initializing");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setStatus("disabled");
      return;
    }
    const sb = getSupabase();
    let mounted = true;

    // If we just came back from Google, the URL carries ?code=... — exchange
    // it for a session *before* deciding auth state, so the user lands inside
    // on the first attempt instead of bouncing back to the landing page.
    const finishOAuthRedirect = async () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const hasOAuthParams =
        !!code || params.has("error") || params.has("error_description");
      if (code) {
        try {
          // exchangeCodeForSession expects the raw code value, not the query.
          await sb.auth.exchangeCodeForSession(code);
        } catch {
          // Fall through — getSession() below resolves the real state.
        }
      }
      if (hasOAuthParams) {
        const clean = window.location.pathname + window.location.hash;
        window.history.replaceState({}, "", clean);
      }
    };

    (async () => {
      await finishOAuthRedirect();
      const { data } = await sb.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setStatus(data.session ? "authenticated" : "unauthenticated");
    })();

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setStatus(s ? "authenticated" : "unauthenticated");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const { error } = await getSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
    []
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) throw error;
      return { needsConfirmation: !data.session };
    },
    []
  );

  const continueWithPassword = useCallback(
    async (email: string, password: string) => {
      const sb = getSupabase();
      // Try to log in first.
      const { error: signInError } = await sb.auth.signInWithPassword({
        email,
        password,
      });
      if (!signInError) return { created: false, needsConfirmation: false };

      // Only fall through to account creation when the credentials didn't match
      // any existing account; surface any other error (rate limits, etc.).
      const code = (signInError as { code?: string }).code;
      const msg = signInError.message?.toLowerCase() ?? "";
      const noSuchAccount =
        code === "invalid_credentials" ||
        msg.includes("invalid login credentials");
      if (!noSuchAccount) throw signInError;

      const { data, error: signUpError } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (signUpError) {
        const upMsg = signUpError.message?.toLowerCase() ?? "";
        // The account exists after all — the password was simply wrong.
        if (
          upMsg.includes("already registered") ||
          upMsg.includes("already exists") ||
          upMsg.includes("already been registered")
        ) {
          throw new Error("Incorrect password for this account.");
        }
        throw signUpError;
      }
      return { created: true, needsConfirmation: !data.session };
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        // Always show Google's account picker so the user can choose which
        // account to continue with (existing → sign in, new → account created).
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      signInWithPassword,
      signUpWithPassword,
      continueWithPassword,
      signInWithGoogle,
      signOut,
    }),
    [
      status,
      session,
      signInWithPassword,
      signUpWithPassword,
      continueWithPassword,
      signInWithGoogle,
      signOut,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
