"use client";

import { Eye, EyeOff, Loader2, Play, RefreshCw, Save, Wrench } from "lucide-react";
import { useBuild } from "@/context/BuildContext";

export function Navbar() {
  const {
    project,
    previewVisible,
    requestSave,
    triggerBuild,
    togglePreview,
    runMode,
    setRunMode,
    isBuilding,
    devUrl,
  } = useBuild();

  const inDev = runMode === "dev";
  const actionLabel = inDev
    ? devUrl
      ? "Reload"
      : isBuilding
      ? "Starting..."
      : "Run"
    : isBuilding
    ? "Building..."
    : "Build";

  return (
    <div className="h-14 bg-[#0d0d0d] border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
      {/* Left: project info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
          <span className="text-sm font-medium text-gray-300 truncate">
            {project ? project.name : "Workspace"}
          </span>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Run-mode segmented control */}
        <div className="flex items-center bg-[#1a1a1c] border border-gray-700 rounded-md p-0.5">
          <button
            onClick={() => setRunMode("dev")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors ${
              inDev
                ? "bg-emerald-600/80 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
            title="Hot reload — edits appear in seconds"
          >
            <RefreshCw size={12} />
            Hot reload
          </button>
          <button
            onClick={() => setRunMode("release")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors ${
              !inDev
                ? "bg-blue-600/80 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
            title="Release build — flutter build web"
          >
            <Wrench size={12} />
            Build
          </button>
        </div>

        <button
          onClick={requestSave}
          disabled={!project}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#1a1a1c] hover:bg-[#252527] disabled:opacity-50 rounded-md transition-colors border border-gray-700"
          title="Save all (Ctrl/Cmd+S in the editor)"
        >
          <Save size={16} />
          Save
        </button>

        <button
          onClick={triggerBuild}
          disabled={!project || isBuilding}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md transition-colors font-medium"
          title={inDev ? "Run the dev server / reload preview" : "Run a release build"}
        >
          {isBuilding ? (
            <Loader2 size={16} className="animate-spin" />
          ) : inDev && devUrl ? (
            <RefreshCw size={16} />
          ) : (
            <Play size={16} />
          )}
          {actionLabel}
        </button>

        <button
          onClick={togglePreview}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#1a1a1c] hover:bg-[#252527] rounded-md transition-colors border border-gray-700"
          title="Toggle the preview panel"
        >
          {previewVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          Preview
        </button>
      </div>
    </div>
  );
}
