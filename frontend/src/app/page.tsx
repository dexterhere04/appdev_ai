"use client";

import IDE from "@/components/IDE";
import { PreviewPane } from "@/components/PreviewPane";
import { Sparkles, Send } from "lucide-react";
import { useState } from "react";

export default function Page() {
  const [previewVisible, setPreviewVisible] = useState(true);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    console.log("AI Prompt:", input);
    setInput("");
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ✅ Left: IDE + Terminal Section */}
      <div
        className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ${
          previewVisible ? "border-r border-gray-800/50" : "w-full"
        }`}
      >
        {/* IDE Editor */}
        <div className="flex-1 overflow-hidden">
          <IDE />
        </div>

        {/* Terminal Input Bar (matches IDE width exactly) */}
        <div className="h-14 border-t border-gray-800/50 bg-[#0a0a0a] px-4 flex items-center gap-2">
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
            className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* ✅ Right: Preview Panel (fills entire right side) */}
      {previewVisible && (
        <div className="flex flex-col flex-[0.4] min-w-[360px] max-w-[720px] bg-[#0a0a0a] transition-all duration-300">
          <PreviewPane />
        </div>
      )}
    </div>
  );
}
