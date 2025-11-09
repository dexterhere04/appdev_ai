"use client";

import { useEffect, useState } from "react";
import { useBuild } from "@/context/BuildContext"; // ✅ Import global build state

const DEVICES = {
  "iPhone 14": { width: 430 / 2, height: 932 / 2 },
  "Pixel 7": { width: 412 / 2, height: 915 / 2 },
  "iPad Mini": { width: 768 / 2, height: 1024 / 2 },
  "Desktop": { width: 1280 / 2, height: 800 / 2 },
};

export function PreviewPane() {
  const { workspaceId, isBuilding, logs, error } = useBuild(); // ✅ Use context
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<keyof typeof DEVICES>("iPhone 14");

  // ✅ Automatically refresh preview when build completes
  useEffect(() => {
    if (!workspaceId) return;
    if (!isBuilding) {
      setPreviewUrl(
        `http://localhost:8000/preview/${workspaceId}/build/web/index.html?t=${Date.now()}`
      );
    }
  }, [workspaceId, isBuilding]);

  const { width, height } = DEVICES[device];
  const aspectRatio = width / height;

  // 🏗️ Build progress screen
  if (isBuilding) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-gray-300 px-6 bg-[#0a0a0a]">
        <p className="text-sm font-medium mb-3">Building Flutter app...</p>
        <div className="w-full max-h-[70%] overflow-y-auto text-xs font-mono bg-black/40 border border-gray-700 rounded-lg p-3 text-gray-200 whitespace-pre-wrap">
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    );
  }

  // 🖼️ Live responsive preview
  if (previewUrl && !error) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full w-full bg-[#0a0a0a] overflow-hidden">
        {/* Device selector */}
        <div className="absolute top-3 right-3 z-10 bg-black/40 px-2 py-1 rounded-md border border-gray-700 text-gray-300 text-xs">
          <select
            value={device}
            onChange={(e) => setDevice(e.target.value as keyof typeof DEVICES)}
            className="bg-transparent border-none text-xs outline-none"
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
          <iframe
            key={previewUrl}
            src={previewUrl}
            title="Flutter Preview"
            className="absolute inset-0 border-0 overflow-hidden"
            style={{
              width: `${width * 2}px`,
              height: `${height * 2}px`,
              transform: "scale(0.5)",
              transformOrigin: "top left",
            }}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>

        {/* Caption */}
        <p className="text-xs text-gray-500 mt-3">
          {device} — {width}×{height}
        </p>
      </div>
    );
  }

  // ⚠️ Build error or missing preview
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#0a0a0a] text-gray-400">
      <p className="text-sm">
        ⚠️ {error ? "Build failed or preview unavailable." : "No preview yet."}
      </p>
    </div>
  );
}
