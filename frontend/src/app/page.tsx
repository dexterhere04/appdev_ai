"use client";

import IDE from "@/components/IDE";
import { PreviewPane } from "@/components/PreviewPane";
import { Sparkles, Send, Terminal } from "lucide-react";
import { useState } from "react";
import { useBuild } from "@/context/BuildContext";
import { API_BASE } from "@/lib/api";

export default function Page() {
  const { previewVisible, isBuilding, error, logs, previewUrl } = useBuild();
  const [input, setInput] = useState("");
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt) return;

    setInput("");
    setSending(true);
    setChatResponse(null);

    try {
      const res = await fetch(`${API_BASE}/api/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        if (res.status === 503) {
          setChatResponse("AI is currently unavailable. Please try again later.");
        } else {
          setChatResponse(`AI request failed with status ${res.status}.`);
        }
        return;
      }

      const data = await res.json();
      setChatResponse(data.result ?? "No result returned.");
    } catch (err) {
      setChatResponse(
        `Failed to reach AI service: ${
          err instanceof Error ? err.message : "Network error"
        }`
      );
    } finally {
      setSending(false);
    }
  };

  const visibleLogs = logs.slice(-30);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left: IDE + Terminal Section */}
      <div
        className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ${
          previewVisible ? "border-r border-gray-800/50" : "w-full"
        }`}
      >
        {/* IDE Editor */}
        <div className="flex-1 overflow-hidden">
          <IDE />
        </div>

        {/* Chat response area */}
        {chatResponse && (
          <div className="px-4 py-2 border-t border-gray-800/50 bg-[#0a0a0a] text-sm text-gray-300 max-h-24 overflow-auto">
            {chatResponse}
          </div>
        )}

        {/* Build status / logs panel */}
        {terminalOpen && (
          <div className="border-t border-gray-800/50 bg-[#0a0a0a] max-h-48 overflow-auto px-4 py-2 font-mono text-xs">
            {previewUrl && (
              <div className="text-emerald-400 py-1">
                Preview ready:{" "}
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {previewUrl}
                </a>
              </div>
            )}
            {error && (
              <div className="text-red-400 py-1">Build failed.</div>
            )}
            {isBuilding && (
              <div className="text-gray-400 py-1">Building...</div>
            )}
            {visibleLogs.map((line, i) => (
              <div key={i} className="text-gray-400 whitespace-pre-wrap">
                {line}
              </div>
            ))}
            {!isBuilding && !error && logs.length === 0 && !previewUrl && (
              <div className="text-gray-500 py-1">No build yet.</div>
            )}
          </div>
        )}

        {/* Terminal Input Bar (matches IDE width exactly) */}
        <div className="h-14 border-t border-gray-800/50 bg-[#0a0a0a] px-4 flex items-center gap-2">
          <button
            onClick={() => setTerminalOpen((o) => !o)}
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
              terminalOpen ? "bg-blue-600/20 text-blue-400" : "hover:bg-white/5"
            }`}
            title="Toggle build logs"
          >
            <Terminal size={16} />
          </button>
          <Sparkles size={16} className="text-purple-400 flex-shrink-0" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask AI anything... (e.g., 'Add a login button')"
            className="flex-1 bg-[#111115] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
          />
          <button
            onClick={handleSend}
            disabled={sending}
            className="p-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition-colors flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Right: Preview Panel (fills entire right side) */}
      {previewVisible && (
        <div className="flex flex-col flex-[0.4] min-w-[360px] max-w-[720px] bg-[#0a0a0a] transition-all duration-300">
          <PreviewPane />
        </div>
      )}
    </div>
  );
}
