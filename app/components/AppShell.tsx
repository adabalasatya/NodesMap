"use client";

import { useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "../lib/store";
import { AuthProvider, useAuth } from "../lib/auth";
import { syncStaleDrafts } from "../lib/draftSync";
import Sidebar from "./Sidebar";
import Dashboard from "./Dashboard";
import FolderView from "./FolderView";
import Editor from "./Editor";
import ProgressView from "./ProgressView";
import MindMap from "./MindMap";
import PlannerView from "./PlannerView";
import TopBar from "./TopBar";
import Auth from "./Auth";
import Onboarding, { onboardingKey } from "./Onboarding";
import { DialogProvider } from "./Dialog";
import { LoadingOverlayProvider } from "./LoadingOverlay";
import { ThemeProvider } from "../lib/theme";
import QuickAdd from "./QuickAdd";

function Workspace() {
  const { state } = useStore();
  // `view` keyed wrapper re-mounts on every switch so the CSS view-fade
  // animation replays — giving a small transition between screens.
  return (
    <main className="flex-1 min-w-0 flex flex-col h-screen relative">
      {/* Hide the workspace top bar while writing — the editor has its
          own sticky header with Back/Save/Delete, so hiding this frees
          up ~60px of vertical space. */}
      {state.view !== "editor" && <TopBar />}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div key={state.view} className="view-fade min-h-full">
          {state.view === "dashboard" && <Dashboard />}
          {state.view === "folder" && <FolderView />}
          {state.view === "editor" && <Editor />}
          {state.view === "progress" && <ProgressView />}
          {state.view === "mindmap" && <MindMap />}
          {state.view === "planner" && <PlannerView />}
        </div>
      </div>
    </main>
  );
}

/**
 * On app start (after auth + file list are ready), push any crash-survivor
 * `file_draft_*` entries to Supabase. See [app/lib/draftSync.ts].
 */
function StaleDraftSyncer() {
  const { state } = useStore();
  const { user } = useAuth();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    if (!user) return;
    // Wait until the local state is materialized so we can match drafts
    // against real file rows (orphan drafts get dropped).
    if (state.files.length === 0 && state.folders.length === 0) return;
    ran.current = true;
    syncStaleDrafts(state.files).catch((e) =>
      console.warn("syncStaleDrafts:", e)
    );
  }, [user, state.files, state.folders]);
  return null;
}

function App() {
  return (
    <StoreProvider>
      <StaleDraftSyncer />
      <div className="flex h-screen w-screen bg-[var(--background)] text-[var(--foreground)]">
        <Sidebar />
        <Workspace />
      </div>
      <QuickAdd />
    </StoreProvider>
  );
}

function AuthedApp() {
  const { user } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(onboardingKey(user?.id)) === "1";
    } catch {
      return false;
    }
  });

  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;
  return <App />;
}

function AuthGate() {
  const { status } = useAuth();
  if (status === "initializing")
    return (
      <div className="min-h-screen grid place-items-center fade-in">
        <div className="flex flex-col items-center gap-3 text-sm text-[var(--muted)]">
          <span className="loading-spinner" />
          Loading your workspace…
        </div>
      </div>
    );
  if (status === "disabled")
    return (
      <div className="min-h-screen grid place-items-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Supabase not configured</h1>
          <p className="text-sm text-[var(--muted)]">
            Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your{" "}
            <code>.env.local</code>, then restart the dev server.
          </p>
        </div>
      </div>
    );
  if (status === "unauthenticated") return <Auth />;
  return <AuthedApp />;
}

export default function AppShell() {
  return (
    <ThemeProvider>
      <DialogProvider>
        <LoadingOverlayProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </LoadingOverlayProvider>
      </DialogProvider>
    </ThemeProvider>
  );
}
