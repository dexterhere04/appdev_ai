"use client";

import { useEffect, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import type { FileNode } from "@/types/file";
import { configureMonacoWorkers } from "@/lib/monacoSetup";

function getLanguageFromFileName(fileName?: string): string {
  if (!fileName || typeof fileName !== "string") return "plaintext";

  const ext = fileName.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    dart: "dart",
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    html: "html",
    css: "css",
    md: "markdown",
    py: "python",
  };

  return langMap[ext || ""] || "plaintext";
}

const CDN_MONACO_VERSION = "0.54.0";

type MonacoStatus = "loading" | "ready" | "cdn";

interface MonacoEditorProps {
  file: FileNode | null;
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
}

export function MonacoEditor({ file, value, onChange, onSave }: MonacoEditorProps) {
  const lang = file ? getLanguageFromFileName(file.name) : "plaintext";
  const [status, setStatus] = useState<MonacoStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Bundled monaco (includes its web workers). Loaded dynamically so the
        // heavy ESM never runs during SSR and no CDN is needed at runtime.
        const mod = await import("monaco-editor");
        if (cancelled) return;
        configureMonacoWorkers();
        loader.config({ monaco: mod });
        setStatus("ready");
      } catch (err) {
        console.error("Bundled Monaco failed to load:", err);
        if (cancelled) return;
        loader.config({
          paths: {
            vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${CDN_MONACO_VERSION}/min/vs`,
          },
        });
        setStatus("cdn");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="h-full w-full bg-[#1e1e1e] flex items-center justify-center text-sm text-gray-500">
        Loading editor...
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#1e1e1e]">
      {status === "cdn" && (
        <div className="px-3 py-1.5 bg-amber-950/70 border-b border-amber-700 text-amber-200 text-xs flex items-center justify-between">
          <span>
            Bundled editor failed to load — fell back to a CDN build of Monaco.
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          path={file?.path ?? ""}
          language={lang}
          value={value}
          theme="vs-dark"
          onChange={(v) => onChange(v ?? "")}
          onMount={(editor, monaco) =>
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
              onSave?.()
            )
          }
          options={{
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
          }}
        />
      </div>
    </div>
  );
}
