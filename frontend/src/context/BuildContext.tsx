"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
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
  setWorkspaceId: (id: string) => void;
  togglePreview: () => void;
  requestSave: () => void;
  triggerBuild: () => void;
  bootstrap: () => void;
}

const BuildContext = createContext<BuildContextType | null>(null);

export const BuildProvider = ({ children }: { children: React.ReactNode }) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saveSignal, setSaveSignal] = useState(0);

  const togglePreview = useCallback(() => {
    setPreviewVisible((prev) => !prev);
  }, []);

  const requestSave = useCallback(() => {
    setSaveSignal((prev) => prev + 1);
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

  const triggerBuild = useCallback(async () => {
    if (!workspaceId) {
      console.warn("No workspaceId set, cannot build");
      setError(true);
      return;
    }

    setIsBuilding(true);
    setError(false);
    setLogs([]);
    setPreviewUrl(null);

    try {
      const buildRes = await fetch(
        `${API_BASE}/api/workspaces/${workspaceId}/build`,
        { method: "POST" }
      );

      if (!buildRes.ok) {
        throw new Error(`Build request failed with status ${buildRes.status}`);
      }

      const data = await buildRes.json();
      const preview: string = data.preview;

      const eventSrc = new EventSource(`${API_BASE}${data.logs}`);

      eventSrc.onmessage = (e) => {
        const line: string = e.data;
        if (line.startsWith("__EXIT__")) {
          const code = line.split(" ")[1];
          eventSrc.close();

          if (code === "0") {
            setLogs((prev) => [...prev, "Build complete!"]);
            setPreviewUrl(API_BASE + preview);
            setIsBuilding(false);
            setError(false);
          } else {
            setLogs((prev) => [...prev, `Build failed (exit ${code})`]);
            setIsBuilding(false);
            setError(true);
          }
        } else {
          setLogs((prev) => [...prev, line]);
        }
      };

      eventSrc.onerror = () => {
        eventSrc.close();
        setLogs((prev) => [...prev, "Build stream disconnected."]);
        setIsBuilding(false);
        setError(true);
      };
    } catch (err) {
      console.error("Build request failed:", err);
      setLogs((prev) => [...prev, `Build error: ${String(err)}`]);
      setIsBuilding(false);
      setError(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

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
        setWorkspaceId,
        togglePreview,
        requestSave,
        triggerBuild,
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
