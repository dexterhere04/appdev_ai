"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface BuildContextType {
  workspaceId: string | null;
  setWorkspaceId: (id: string) => void;
  isBuilding: boolean;
  logs: string[];
  error: boolean;
  triggerBuild: () => void;
}

const BuildContext = createContext<BuildContextType | null>(null);

export const BuildProvider = ({ children }: { children: React.ReactNode }) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState(false);

  const triggerBuild = useCallback(async () => {
    if (!workspaceId) {
      console.warn("⚠️ No workspaceId set, cannot build");
      return;
    }

    console.log("⚙️ Triggering build for:", workspaceId);
    setIsBuilding(true);
    setError(false);
    setLogs(["🚀 Starting build..."]);

    try {
      const buildRes = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/build`, {
        method: "POST",
      });

      if (!buildRes.ok) throw new Error(`Build failed with status ${buildRes.status}`);

      const eventSrc = new EventSource(`http://localhost:8000/api/workspaces/${workspaceId}/build/logs`);

      eventSrc.onmessage = (e) => {
        if (e.data.startsWith("__EXIT__")) {
          const code = e.data.split(" ")[1];
          eventSrc.close();

          if (code === "0") {
            setLogs((prev) => [...prev, "✅ Build complete!"]);
            setIsBuilding(false);
            setError(false);
          } else {
            setLogs((prev) => [...prev, `❌ Build failed (exit ${code})`]);
            setIsBuilding(false);
            setError(true);
          }
        } else {
          setLogs((prev) => [...prev, e.data]);
        }
      };

      eventSrc.onerror = () => {
        eventSrc.close();
        setLogs((prev) => [...prev, "❌ Build stream disconnected."]);
        setIsBuilding(false);
        setError(true);
      };
    } catch (err) {
      console.error("❌ Build request failed:", err);
      setLogs((prev) => [...prev, `❌ ${String(err)}`]);
      setIsBuilding(false);
      setError(true);
    }
  }, [workspaceId]);

  return (
    <BuildContext.Provider
      value={{
        workspaceId,
        setWorkspaceId,
        isBuilding,
        logs,
        error,
        triggerBuild,
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
