"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { API_BASE } from "@/lib/api";

interface BuildContextType {
  workspaceId: string | null;
  previewVisible: boolean;
  isBuilding: boolean;
  logs: string[];
  error: boolean;
  previewUrl: string | null;
  saveSignal: number;
  devMode: boolean;
  devUrl: string | null;
  setWorkspaceId: (id: string) => void;
  togglePreview: () => void;
  requestSave: () => void;
  registerBuildFlush: (fn: () => Promise<void>) => void;
  triggerBuild: () => void;
  schedulePreviewRefresh: () => void;
  bootstrap: () => void;
}

const AUTO_REFRESH_DELAY_MS = 1500;

// Inlined by Next.js: "development" for `next dev`, "production" for builds.
const IS_DEV = process.env.NODE_ENV === "development";

const BuildContext = createContext<BuildContextType | null>(null);

export const BuildProvider = ({ children }: { children: React.ReactNode }) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [saveSignal, setSaveSignal] = useState(0);
  const buildFlushRef = useRef<(() => Promise<void>) | null>(null);
  const buildBusyRef = useRef(false);
  const hasPreviewRef = useRef(false);
  const devStartingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const togglePreview = useCallback(() => {
    setPreviewVisible((prev) => !prev);
  }, []);

  const requestSave = useCallback(() => {
    setSaveSignal((prev) => prev + 1);
  }, []);

  const registerBuildFlush = useCallback((fn: () => Promise<void>) => {
    buildFlushRef.current = fn;
  }, []);

  const bootstrap = useCallback(async () => {
    const existing = sessionStorage.getItem("workspaceId");
    if (existing) {
      setWorkspaceId(existing);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/workspaces`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Failed to create workspace (${res.status})`);
      const data = await res.json();
      const id: string = data.workspaceId;
      setWorkspaceId(id);
      sessionStorage.setItem("workspaceId", id);
    } catch (err) {
      console.error("Failed to bootstrap workspace:", err);
    }
  }, []);

  // ---- Dev-mode hot-reload server ----

  const ensureDevServer = useCallback(async () => {
    if (!workspaceId) return null;
    if (devUrl) return devUrl;
    if (devStartingRef.current) return null;
    devStartingRef.current = true;
    setIsBuilding(true);
    setError(false);
    setLogs(["Starting dev server (first compile may take ~30-60s)..."]);
    try {
      const res = await fetch(
        `${API_BASE}/api/workspaces/${workspaceId}/dev/start`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `status ${res.status}`);
      }
      const data = await res.json();
      setDevUrl(data.url);
      setPreviewUrl(data.url);
      setLogs([`Dev server ready: ${data.url}`]);
      return data.url as string;
    } catch (err) {
      console.error("Dev server start failed:", err);
      setLogs([
        `Dev server failed to start: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ]);
      setError(true);
      return null;
    } finally {
      devStartingRef.current = false;
      setIsBuilding(false);
    }
  }, [workspaceId, devUrl]);

  const hotReloadDev = useCallback(async () => {
    if (!workspaceId || !devUrl) return;
    setLogs(["Hot reload triggered..."]);
    try {
      const res = await fetch(
        `${API_BASE}/api/workspaces/${workspaceId}/dev/hot-reload`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setLogs([`Hot reload: ${data.note ?? "ok"}`]);
    } catch (err) {
      console.error("Hot reload failed:", err);
      setLogs([
        `Hot reload failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ]);
      setError(true);
    }
  }, [workspaceId, devUrl]);

  // ---- Release build (flutter build web -> /preview) ----

  const performBuild = useCallback(async () => {
    if (!workspaceId) {
      console.warn("No workspaceId set, cannot build");
      setError(true);
      return;
    }
    if (buildBusyRef.current) return;
    buildBusyRef.current = true;

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    setIsBuilding(true);
    setError(false);
    setLogs([]);

    let succeeded = false;
    try {
      if (buildFlushRef.current) {
        try {
          await buildFlushRef.current();
        } catch (err) {
          console.warn("Flush before build failed; building anyway:", err);
        }
      }

      const buildRes = await fetch(
        `${API_BASE}/api/workspaces/${workspaceId}/build`,
        { method: "POST" }
      );
      if (!buildRes.ok) {
        throw new Error(`Build request failed with status ${buildRes.status}`);
      }

      const data = await buildRes.json();
      const preview: string = data.preview;

      succeeded = await new Promise<boolean>((resolve) => {
        const eventSrc = new EventSource(`${API_BASE}${data.logs}`);
        eventSrc.onmessage = (e) => {
          const line: string = e.data;
          if (!line.startsWith("__EXIT__")) {
            setLogs((prev) => [...prev, line]);
            return;
          }
          const code = line.split(" ")[1];
          eventSrc.close();
          if (code === "0") {
            setLogs((prev) => [...prev, "Build complete!"]);
            hasPreviewRef.current = true;
            setPreviewUrl(`${API_BASE}${preview}?b=${Date.now()}`);
            resolve(true);
          } else {
            setLogs((prev) => [...prev, `Build failed (exit ${code})`]);
            resolve(false);
          }
        };
        eventSrc.onerror = () => {
          eventSrc.close();
          setLogs((prev) => [...prev, "Build stream disconnected."]);
          resolve(false);
        };
      });
    } catch (err) {
      console.error("Build request failed:", err);
      setLogs((prev) => [...prev, `Build error: ${String(err)}`]);
    } finally {
      buildBusyRef.current = false;
      setIsBuilding(false);
      setError(!succeeded);
    }
  }, [workspaceId]);

  // Build button: dev = run/reload the dev server; prod = release web build.
  const triggerBuild = useCallback(() => {
    if (IS_DEV) {
      if (devUrl) void hotReloadDev();
      else void ensureDevServer();
    } else {
      void performBuild();
    }
  }, [devUrl, hotReloadDev, ensureDevServer, performBuild]);

  // After a save: dev = hot reload; prod = debounced release rebuild.
  const schedulePreviewRefresh = useCallback(() => {
    if (IS_DEV) {
      if (!devUrl) return;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void hotReloadDev();
      }, AUTO_REFRESH_DELAY_MS);
      return;
    }
    if (!previewVisible) return;
    if (!hasPreviewRef.current) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      if (buildBusyRef.current) {
        schedulePreviewRefresh();
        return;
      }
      void performBuild();
    }, AUTO_REFRESH_DELAY_MS);
  }, [devUrl, previewVisible, hotReloadDev, performBuild]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Clear any pending auto-refresh timer on unmount.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  return (
    <BuildContext.Provider
      value={{
        workspaceId,
        previewVisible,
        isBuilding,
        logs,
        error,
        previewUrl,
        saveSignal,
        devMode: IS_DEV,
        devUrl,
        setWorkspaceId,
        togglePreview,
        requestSave,
        registerBuildFlush,
        triggerBuild,
        schedulePreviewRefresh,
        bootstrap,
      }}
    >
      {children}
    </BuildContext.Provider>
  );
};

export const useBuild = () => {
  const ctx = useContext(BuildContext);
  if (!ctx) throw new Error("useBuild must be used inside BuildProvider");
  return ctx;
};
