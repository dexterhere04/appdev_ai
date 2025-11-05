"use client";

import Editor from "@monaco-editor/react";

export function CodeEditor({ file, code, onChange }: { file: string; code: string; onChange: (val: string) => void }) {
  return (
    <div className="flex-1 h-full">
      <Editor
        height="100%"
        theme="vs-dark"
        language="javascript"
        value={code}
        onChange={(value) => onChange(value || "")}
      />
    </div>
  );
}
