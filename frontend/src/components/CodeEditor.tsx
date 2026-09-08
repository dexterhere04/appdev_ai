"use client";

import Editor from "@monaco-editor/react";
import { FileNode } from "@/types/file";

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

interface MonacoEditorProps {
  file: FileNode | null;
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
}

export function MonacoEditor({ file, value, onChange, onSave }: MonacoEditorProps) {
  const lang = file ? getLanguageFromFileName(file.name) : "plaintext";

  return (
    <Editor
      height="100%"
      defaultLanguage="plaintext"
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
  );
}
