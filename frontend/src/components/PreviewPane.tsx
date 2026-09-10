"use client";

import { useState } from "react";
import { useBuild } from "@/context/BuildContext";
import { Loader2, Play, RefreshCw, Wrench } from "lucide-react";

const DEVICES = {
  "iPhone 14": { width: 430 / 2, height: 932 / 2 },
  "Pixel 7": { width: 412 / 2, height: 915 / 2 },
  "iPad Mini": { width: 768 / 2, height: 1024 / 2 },
  Desktop: { width: 1280 / 2, height: 800 / 2 },
};

export function PreviewPane() {
  const {
    previewUrl,
    devUrl,
    project,
    runMode,
    isBuilding,
    triggerBuild,
    logs,
    error,
  } = useBuild();
  const [device, setDevice] = useState<keyof typeof DEVICES>("iPhone 14");

  const isDevPreview = !!devUrl && previewUrl?.startsWith(devUrl);
  const { width, height } = DEVICES[device];
  const aspectRatio = width / height;

  if (previewUrl) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full w-full bg-[#0a0a0a] overflow-hidden">
        {/* Top bar */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded-md border text-xs ${
              isDevPreview
                ? "border-emerald-600/60 bg-emerald-900/40 text-emerald-300"
                : "border-blue-600/60 bg-blue-900/40 text-blue-300"
            }`}
          >
            {isDevPreview ? "Hot reload" : "Release build"}
          </span>
          <select
            value={device}
            onChange={(e) => setDevice(e.target.value as keyof typeof DEVICES)}
            className="bg-black/40 px-2 py-1 rounded-md border border-gray-700 text-gray-300 text-xs outline-none"
          >
            {Object.keys(DEVICES).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Device frame wrapper */}
        <div
          className="relative border-[6px] border-gray-700 rounded-[24px] shadow-xl overflow-hidden bg-black"
          style={{
            width: `${width}px`,
            height: `${height}px`,
            transform: `scale(${Math.min(1, 0.9 / aspectRatio)})`,
            transformOrigin: "center",
          }}
        >
          {/* Release build: cross-origin static app, keep it opaque.
              Dev preview: served from its OWN origin (host:port) for the DWDS
              hot-reload WebSocket, so allow-same-origin only grants that
              origin — never the app's. */}
          <iframe
            key={previewUrl}
            src={previewUrl}
            title={isDevPreview ? "Flutter Dev Preview" : "Flutter Preview"}
            className="absolute inset-0 border-0 overflow-hidden"
            style={{
              width: `${width * 2}px`,
              height: `${height * 2}px`,
              transform: "scale(0.5)",
              transformOrigin: "top left",
            }}
            sandbox={isDevPreview ? "allow-scripts allow-same-origin" : "allow-scripts"}
          />
        </div>

        {isDevPreview && (
          <p className="text-xs text-gray-600 mt-3 max-w-full px-4 text-center">
            Edits hot-reload into this preview after each save.
          </p>
        )}
        {!isDevPreview && (
          <p className="text-xs text-gray-600 mt-3 max-w-full px-4 text-center">
            {device} — {width}×{height}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#0a0a0a] text-gray-400 px-6 text-center">
      {error && logs.length > 0 && (
        <p className="text-xs text-red-400 mb-4 max-h-16 overflow-auto whitespace-pre-wrap">
          {logs[logs.length - 1]}
        </p>
      )}
      {isBuilding && (
        <Loader2 size={22} className="animate-spin text-gray-500 mb-3" />
      )}
      <p className="text-sm mb-4">
        {isBuilding
          ? runMode === "dev"
            ? "Starting the dev server..."
            : "Building your app..."
          : project
          ? runMode === "dev"
            ? "No dev preview yet."
            : "No release build yet."
          : "Open a project to preview it."}
      </p>
      {project && !isBuilding && (
        <button
          onClick={triggerBuild}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium"
        >
          {runMode === "dev" ? (
            devUrl ? (
              <>
                <RefreshCw size={15} /> Reload preview
              </>
            ) : (
              <>
                <Play size={15} /> Start preview
              </>
            )
          ) : (
            <>
              <Wrench size={15} /> Run release build
            </>
          )}
        </button>
      )}
    </div>
  );
}
