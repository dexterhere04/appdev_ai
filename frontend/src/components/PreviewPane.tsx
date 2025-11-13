"use client";

import { useEffect, useState } from "react";

const DEVICES = {
  "iPhone 14": { width: 430 / 2, height: 932 / 2 },
  "Pixel 7": { width: 412 / 2, height: 915 / 2 },
  "iPad Mini": { width: 768 / 2, height: 1024 / 2 },
  "Desktop": { width: 1280 / 2, height: 800 / 2 },
};

const REMOTE_PREVIEW_URL = "http://13.235.89.215:3000";

export function PreviewPane() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<keyof typeof DEVICES>("iPhone 14");

  // ✅ Set preview URL to remote server
  useEffect(() => {
    setPreviewUrl(REMOTE_PREVIEW_URL);
  }, []);

  const { width, height } = DEVICES[device];
  const aspectRatio = width / height;

  // 🖼️ Live responsive preview
  if (previewUrl) {
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

  // ⚠️ No preview available
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#0a0a0a] text-gray-400">
      <p className="text-sm">⚠️ No preview available.</p>
    </div>
  );
}