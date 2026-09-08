"use client";

import { useState } from "react";
import { useBuild } from "@/context/BuildContext";
import { ExternalLink } from "lucide-react";

const DEVICES = {
  "iPhone 14": { width: 430 / 2, height: 932 / 2 },
  "Pixel 7": { width: 412 / 2, height: 915 / 2 },
  "iPad Mini": { width: 768 / 2, height: 1024 / 2 },
  "Desktop": { width: 1280 / 2, height: 800 / 2 },
};

export function PreviewPane() {
  const { previewUrl, devUrl } = useBuild();
  const [device, setDevice] = useState<keyof typeof DEVICES>("iPhone 14");

  const isDevPreview = !!devUrl && previewUrl?.startsWith(devUrl);
  const { width, height } = DEVICES[device];
  const aspectRatio = width / height;

  if (previewUrl) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full w-full bg-[#0a0a0a] overflow-hidden">
        {/* Top bar */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {isDevPreview && (
            <a
              href={devUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-600/60 bg-emerald-900/50 text-emerald-300 text-xs hover:bg-emerald-900"
              title="Open in a new tab (recommended for hot reload)"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">open tab</span>
            </a>
          )}
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
          {isDevPreview ? (
            /* Dev server needs same-origin so its hot-reload WebSocket works. */
            <iframe
              key={previewUrl}
              src={previewUrl}
              title="Flutter Dev Preview"
              className="absolute inset-0 border-0 overflow-hidden"
              style={{
                width: `${width * 2}px`,
                height: `${height * 2}px`,
                transform: "scale(0.5)",
                transformOrigin: "top left",
              }}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
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
              sandbox="allow-scripts"
            />
          )}
        </div>

        {/* Caption */}
        <p className="text-xs text-gray-500 mt-3">
          {device} — {width}×{height}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#0a0a0a] text-gray-400">
      <p className="text-sm">No preview available — build the project</p>
    </div>
  );
}
