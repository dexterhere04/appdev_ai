"use client";

import { useEffect, useState } from "react";

const DEVICES = {
  "iPhone 14": { width: 430/2, height: 932/2 },
  "Pixel 7": { width: 412/2, height: 915/2 },
  "iPad Mini": { width: 768/2, height: 1024/2 },
  "Desktop": { width: 1280/2, height: 800/2 },
};

export function PreviewPane({ workspaceId }: { workspaceId: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [device, setDevice] = useState<keyof typeof DEVICES>("iPhone 14");

  useEffect(() => {
    if (!workspaceId) return;
    
    // Check if preview exists first
    const checkPreview = async () => {
      const preview = `http://localhost:8000/preview/${workspaceId}/build/web/index.html`;
      try {
        const res = await fetch(preview, { method: 'HEAD' });
        if (res.ok) {
          setPreviewUrl(preview);
        } else {
          console.log("Preview not found, will trigger build on mount");
          setError(true);
        }
      } catch (err) {
        console.log("Preview check failed, will trigger build on mount");
        setError(true);
      }
    };
    
    checkPreview();
  }, [workspaceId]);

  const handleBuild = async () => {
    console.log("⚙️ Triggering build...");
    setBuilding(true);
    setError(false);
    setLogs(["🚀 Starting build..."]);

    try {
      // Start the build
      const buildRes = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/build`, {
        method: "POST",
      });

      if (!buildRes.ok) {
        throw new Error(`Build failed with status ${buildRes.status}`);
      }

      // Connect to the logs stream
      const eventSrc = new EventSource(`http://localhost:8000/api/workspaces/${workspaceId}/build/logs`);
      
      eventSrc.onmessage = (e) => {
        if (e.data.startsWith("__EXIT__")) {
          const exitCode = e.data.split(" ")[1];
          eventSrc.close();
          
          if (exitCode === "0") {
            setLogs((prev) => [...prev, "✅ Build complete!"]);
            setBuilding(false);
            setError(false);
            // Refresh the preview URL
            setPreviewUrl(`http://localhost:8000/preview/${workspaceId}/build/web/index.html?t=${Date.now()}`);
          } else {
            setLogs((prev) => [...prev, `❌ Build failed with exit code ${exitCode}`]);
            setBuilding(false);
            setError(true);
          }
        } else {
          setLogs((prev) => [...prev, e.data]);
        }
      };

      eventSrc.onerror = () => {
        eventSrc.close();
        setLogs((prev) => [...prev, "❌ Build stream connection failed."]);
        setBuilding(false);
        setError(true);
      };
    } catch (err) {
      console.error("❌ Build request failed:", err);
      setLogs((prev) => [...prev, `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`]);
      setError(true);
      setBuilding(false);
    }
  };

  const handleIframeError = () => {
    console.log("⚙️ iframe error - Preview not loading, triggering build...");
    if (!building) {
      handleBuild();
    }
  };

  const { width, height } = DEVICES[device];
  const aspectRatio = width / height;

  // 🏗️ Building State
  if (building) {
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

  // 🖼️ Responsive Preview
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
            onError={handleIframeError}
            className="absolute inset-0 border-0 overflow-hidden"
            style={{
              width: `${width * 2}px`,
              height: `${height * 2}px`,
              transform: 'scale(0.5)',
              transformOrigin: 'top left',
            }}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>

        {/* Optional caption */}
        <p className="text-xs text-gray-500 mt-3">{device} — {width}×{height}</p>
      </div>
    );
  }

  // ⚠️ Error fallback
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#0a0a0a] text-gray-400">
      <p className="text-sm">⚠️ Couldn't load preview.</p>
      <button
        onClick={handleBuild}
        className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
      >
        Rebuild
      </button>
    </div>
  );
}