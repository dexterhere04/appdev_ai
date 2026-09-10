"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import {
  API_BASE,
  api,
  authedFetch,
  consumeSSE,
  describeError,
  type Project,
} from "@/lib/api";

export type RunMode = "dev" | "release";

interface BuildContextType {
  project: Project | null;
  projects: Project[];
  projectsLoading: boolean;
  initError: string | null;
  previewVisible: boolean;
  isBuilding: boolean;
  logs: string[];
  error: boolean;
  previewUrl: string | null;
  devUrl: string | null;
  runMode: RunMode;
  selectProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<Project>;
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  retryInit: () => void;
  setRunMode: (mode: RunMode) => void;
  togglePreview: () => void;
  requestSave: () => void;
  registerBuildFlush: (fn: () => Promise<void>) => void;
  triggerBuild: () => void;
  schedulePreviewRefresh: () => void;
  requestTreeReload: () => void;
}

const AUTO_REFRESH_DELAY_MS = 1500;
const ACTIVE_KEY_PREFIX = "fcb_active_project_";

const BuildContext = createContext<BuildContextType | null>(null);

// Tiny pub/sub so the IDE can refresh its file tree after the AI writes files
// (the page and the IDE are siblings under the same provider).
type ReloadListener = () => void;
const reloadListeners = new Set<ReloadListener>();

export function subscribeTreeReload(listener: ReloadListener): () => void {
  reloadListeners.add(listener);
  return () => {
    reloadListeners.delete(listener);
  };
}

function notifyTreeReload(): void {
  for (const listener of reloadListeners) listener();
}

export const BuildProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [runMode, setRunModeState] = useState<RunMode>("dev");

  const buildFlushRef = useRef<(() => Promise<void>) | null>(null);
  const buildBusyRef = useRef(false);
  const devStartingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devUrlRef = useRef<string | null>(null);
  const projectRef = useRef<Project | null>(null);
  const runModeRef = useRef<RunMode>("dev");
  const previewVisibleRef = useRef(true);
  const releaseBuiltRef = useRef(false);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  useEffect(() => {
    devUrlRef.current = devUrl;
  }, [devUrl]);
  useEffect(() => {
    runModeRef.current = runMode;
  }, [runMode]);
  useEffect(() => {
    previewVisibleRef.current = previewVisible;
  }, [previewVisible]);

  const clearPreview = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    releaseBuiltRef.current = false;
    setPreviewUrl(null);
    setDevUrl(null);
    setLogs([]);
    setError(false);
  }, []);

  const stopDev = useCallback(async (pid: string) => {
    await api.dev.stop(pid);
  }, []);

  const togglePreview = useCallback(() => {
    setPreviewVisible((prev) => !prev);
  }, []);

  const requestSave = useCallback(() => {
    // Saves every dirty buffer via the editor's registered flush handler.
    void buildFlushRef.current?.();
  }, []);

  const registerBuildFlush = useCallback((fn: () => Promise<void>) => {
    buildFlushRef.current = fn;
  }, []);

  const requestTreeReload = useCallback(() => {
    notifyTreeReload();
  }, []);

  const activeKey = ACTIVE_KEY_PREFIX + (userId ?? "anon");

  const activateProject = useCallback(
    (p: Project) => {
      setProject(p);
      clearPreview();
      try {
        window.localStorage.setItem(activeKey, p.id);
      } catch {
        // ignore storage failures (private mode, etc.)
      }
    },
    [clearPreview, activeKey]
  );

  // Reset state whenever the signed-in user changes (login / logout / switch).
  useEffect(() => {
    const prev = projectRef.current;
    if (prev) {
      void stopDev(prev.id);
    }
    clearPreview();
    setProjects([]);
    setProject(null);
    setInitError(null);

    if (!userId) return;

    let cancelled = false;
    const load = async () => {
      setInitError(null);
      setProjectsLoading(true);
      try {
        const list = await api.projects.list();
        if (cancelled) return;
        setProjects(list);
      } catch (err) {
        if (cancelled) return;
        setInitError(describeError(err));
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, clearPreview, stopDev]);

  // Keep the active project in sync with the fetched list (resume last active).
  useEffect(() => {
    if (!userId || projectsLoading) return;
    const prev = projectRef.current;
    let desired: Project | null = null;
    try {
      const stored = window.localStorage.getItem(activeKey);
      desired = projects.find((p) => p.id === stored) ?? null;
    } catch {
      desired = null;
    }
    if (!desired) desired = projects[0] ?? null;

    if (desired && desired.id !== prev?.id) {
      if (prev) void stopDev(prev.id);
      activateProject(desired);
    } else if (!desired && prev) {
      void stopDev(prev.id);
      clearPreview();
      setProject(null);
    }
  }, [userId, projects, projectsLoading, activeKey, activateProject, stopDev, clearPreview]);

  // Auto-start the dev server (hot-reload preview) when a project becomes active.
  const ensureDevServer = useCallback(async (pid: string) => {
    if (!pid || devStartingRef.current) return;
    devStartingRef.current = true;
    setIsBuilding(true);
    setError(false);
    setLogs(["Starting Flutter dev server (first compile can take ~30-60s)..."]);
    try {
      const data = await api.dev.start(pid);
      // dev/start returns an absolute http://host:port/ URL — the dev server
      // must be reached at its own origin for Flutter's hot-reload WebSocket.
      const url = data.url.startsWith("http") ? data.url : `${API_BASE}${data.url}`;
      setDevUrl(url);
      setPreviewUrl(url);
      setLogs(["Dev server ready. Edits hot-reload into the preview."]);
    } catch (err) {
      setLogs([`Dev server failed to start: ${describeError(err)}`]);
      setError(true);
    } finally {
      devStartingRef.current = false;
      setIsBuilding(false);
    }
  }, []);

  const pid = project?.id ?? null;
  useEffect(() => {
    if (!pid) return;
    if (runModeRef.current !== "dev") return;
    if (devUrlRef.current || devStartingRef.current) return;
    void ensureDevServer(pid);
  }, [pid, ensureDevServer]);

  const hotReloadDev = useCallback(async (pidToReload: string) => {
    if (!pidToReload) return;
    setLogs(["Hot reload triggered..."]);
    try {
      const res = await api.dev.hotReload(pidToReload);
      setLogs([`Hot reload: ${res.note ?? "ok"}`]);
    } catch (err) {
      setLogs([`Hot reload failed: ${describeError(err)}`]);
      setError(true);
    }
  }, []);

  const performReleaseBuild = useCallback(async () => {
    const pidForBuild = projectRef.current?.id;
    if (!pidForBuild) {
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
        } catch {
          // a failed flush should not abort the build
        }
      }

      const startData = await api.build.start(pidForBuild);
      let exitCode = -1;
      const res = await authedFetch(startData.logs);
      if (!res.ok) {
        throw new Error(`Build log stream failed (${res.status})`);
      }
      await consumeSSE(res, (line) => {
        if (line.startsWith("__EXIT__")) {
          exitCode = parseInt((line.split(" ")[1] ?? "-1").trim(), 10);
          return;
        }
        setLogs((prev) => [...prev, line]);
      });

      if (exitCode === 0) {
        releaseBuiltRef.current = true;
        succeeded = true;
        setLogs((prev) => [...prev, "Build complete!"]);
        setPreviewUrl(`${API_BASE}${startData.preview}`);
      } else {
        setLogs((prev) => [...prev, `Build failed (exit ${exitCode})`]);
      }
    } catch (err) {
      setLogs((prev) => [...prev, `Build error: ${describeError(err)}`]);
    } finally {
      buildBusyRef.current = false;
      setIsBuilding(false);
      setError(!succeeded);
    }
  }, []);

  const triggerBuild = useCallback(() => {
    const pidToBuild = projectRef.current?.id;
    if (!pidToBuild) {
      setError(true);
      return;
    }
    if (runModeRef.current === "dev") {
      if (devUrlRef.current) void hotReloadDev(pidToBuild);
      else void ensureDevServer(pidToBuild);
    } else {
      void performReleaseBuild();
    }
  }, [hotReloadDev, ensureDevServer, performReleaseBuild]);

  const schedulePreviewRefresh = useCallback(() => {
    const pidToRefresh = projectRef.current?.id;
    if (!pidToRefresh) return;

    if (runModeRef.current === "dev") {
      if (!devUrlRef.current) return;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void hotReloadDev(pidToRefresh);
      }, AUTO_REFRESH_DELAY_MS);
      return;
    }

    // release: rebuild after an explicit build already produced a preview
    if (!previewVisibleRef.current || !releaseBuiltRef.current) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      if (buildBusyRef.current) {
        schedulePreviewRefresh();
        return;
      }
      void performReleaseBuild();
    }, AUTO_REFRESH_DELAY_MS);
  }, [hotReloadDev, performReleaseBuild]);

  const setRunMode = useCallback(
    (mode: RunMode) => {
      setRunModeState(mode);
      if (mode === "dev") {
        const pidActive = projectRef.current?.id;
        if (pidActive && !devUrlRef.current && !devStartingRef.current) {
          void ensureDevServer(pidActive);
        }
      }
    },
    [ensureDevServer]
  );

  const selectProject = useCallback(
    async (id: string) => {
      let list = projects;
      if (!list.some((p) => p.id === id)) {
        try {
          const fresh = await api.projects.list();
          setProjects(fresh);
          list = fresh;
        } catch (err) {
          setInitError(describeError(err));
          return;
        }
      }
      const picked = list.find((p) => p.id === id);
      if (!picked) return;

      const prev = projectRef.current;
      if (prev?.id === id) {
        if (runModeRef.current === "dev" && !devUrlRef.current) {
          void ensureDevServer(id);
        }
        return;
      }
      if (prev) void stopDev(prev.id);
      activateProject(picked);
    },
    [projects, activateProject, stopDev, ensureDevServer]
  );

  const createProject = useCallback(
    async (name: string) => {
      const created = await api.projects.create(name);
      setProjects((prev) => [...prev, created]);
      const prev = projectRef.current;
      if (prev && prev.id !== created.id) void stopDev(prev.id);
      if (projectRef.current?.id !== created.id) {
        activateProject(created);
      }
      return created;
    },
    [activateProject, stopDev]
  );

  const renameProject = useCallback(async (id: string, name: string) => {
    const updated = await api.projects.rename(id, name);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    if (projectRef.current?.id === id) {
      setProject(updated);
    }
  }, []);

  const deleteProject = useCallback(
    async (id: string) => {
      await api.projects.remove(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (projectRef.current?.id === id) {
        void stopDev(id);
        clearPreview();
        setProject(null);
      }
    },
    [stopDev, clearPreview]
  );

  const refreshProjects = useCallback(async () => {
    try {
      const list = await api.projects.list();
      setInitError(null);
      setProjects(list);
    } catch (err) {
      setInitError(describeError(err));
    }
  }, []);

  const retryInit = useCallback(() => {
    void refreshProjects();
  }, [refreshProjects]);

  // Clear any pending auto-refresh timer on unmount.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  return (
    <BuildContext.Provider
      value={{
        project,
        projects,
        projectsLoading,
        initError,
        previewVisible,
        isBuilding,
        logs,
        error,
        previewUrl,
        devUrl,
        runMode,
        selectProject,
        createProject,
        renameProject,
        deleteProject,
        refreshProjects,
        retryInit,
        setRunMode,
        togglePreview,
        requestSave,
        registerBuildFlush,
        triggerBuild,
        schedulePreviewRefresh,
        requestTreeReload,
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
