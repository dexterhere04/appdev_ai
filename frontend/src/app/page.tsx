"use client";

import IDE from "@/components/IDE";
import { PreviewPane } from "@/components/PreviewPane";
import { Sparkles, Send, Terminal, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { useBuild } from "@/context/BuildContext";
import { aiApi } from "@/lib/api";

interface AiStep {
  step: string;
  status: string;
}

const STEP_LABELS: Record<string, string> = {
  vision: "Vision",
  ux: "Architecture",
  ui: "UI design",
  critique: "Critique",
  code: "Writing code",
  style: "Applying style",
};

function stepTitle(step: string): string {
  return STEP_LABELS[step] ?? step;
}

export default function Page() {
  const {
    previewVisible,
    isBuilding,
    error,
    logs,
    previewUrl,
    project,
    requestTreeReload,
  } = useBuild();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [steps, setSteps] = useState<AiStep[]>([]);
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<string[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<"ai" | "fallback" | null>(null);

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || !project || sending) return;

    setInput("");
    setSending(true);
    setSteps([]);
    setDoneSteps(new Set());
    setApplied(null);
    setAiError(null);
    setAiSource(null);

    try {
      const result = await aiApi.generateStream(project.id, prompt, (step, status) => {
        if (!step) return;
        setSteps((prev) => {
          const idx = prev.findIndex((s) => s.step === step);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { step, status };
            return next;
          }
          return [...prev, { step, status }];
        });
        if (status === "run" || status === "start") {
          setDoneSteps((prev) => {
            const next = new Set(prev);
            next.delete(step);
            return next;
          });
        }
      });
      setApplied(result.applied);
      setAiSource(result.source);
      requestTreeReload();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setSending(false);
    }
  };

  const visibleLogs = logs.slice(-30);

  const aiBusy = sending;
  const noProject = !project;

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left: IDE + AI + Terminal Section */}
      <div
        className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ${
          previewVisible ? "border-r border-gray-800/50" : "w-full"
        }`}
      >
        {/* IDE Editor */}
        <div className="flex-1 overflow-hidden min-h-0">
          <IDE />
        </div>

        {/* AI progress / result area */}
        {(steps.length > 0 || applied || aiError || sending) && (
          <div className="border-t border-gray-800/50 bg-[#0d0d0f] px-4 py-2 max-h-44 overflow-auto">
            {aiError && (
              <div className="flex items-start gap-2 text-sm text-red-400 py-1">
                <XCircle size={15} className="mt-0.5 shrink-0" />
                <span>{aiError}</span>
              </div>
            )}
            {steps.map((s) => {
              const isDone = doneSteps.has(s.step) && s.status !== "run";
              const isActive = s.status === "run" || s.status === "start";
              return (
                <div
                  key={s.step}
                  className="flex items-center gap-2 text-xs py-0.5 text-gray-300"
                >
                  {isDone ? (
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                  ) : isActive ? (
                    <Sparkles size={13} className="text-purple-400 animate-pulse shrink-0" />
                  ) : (
                    <span className="w-[13px] shrink-0" />
                  )}
                  <span>{stepTitle(s.step)}</span>
                  {isActive && <span className="text-gray-500">…</span>}
                </div>
              );
            })}
            {sending && steps.length === 0 && (
              <div className="text-xs text-gray-500 py-1">
                Planning the changes...
              </div>
            )}
            {applied && (
              <div className="mt-1">
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 size={13} />
                  <span>
                    Applied {applied.length} file{applied.length === 1 ? "" : "s"}
                    {aiSource === "fallback" ? " (offline fallback)" : ""}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-1 font-mono">
                  {applied.join(", ")}
                </div>
              </div>
            )}
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
            {error && <div className="text-red-400 py-1">Build failed.</div>}
            {isBuilding && <div className="text-gray-400 py-1">Building...</div>}
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

        {/* AI Input Bar */}
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
            disabled={noProject || aiBusy}
            placeholder={
              noProject
                ? "Open a project to use AI"
                : "Ask AI to change your app... (e.g., 'Add a login screen')"
            }
            className="flex-1 bg-[#111115] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={aiBusy || noProject || !input.trim()}
            className="p-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition-colors flex-shrink-0"
            title="Send prompt to AI"
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
