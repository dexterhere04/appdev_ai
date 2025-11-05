"use client";
import Editor from "@monaco-editor/react";
import { FileNode } from "@/types/file";

export default function EditorPane({
  activeFile,
  onChange,
}: {
  activeFile: FileNode | null;
  onChange: (value: string) => void;
}) {
  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Select a file to start editing
      </div>
    );
  }

  return (
    <Editor
      height="calc(100vh - 40px)"
      language={activeFile.name.endsWith(".dart") ? "dart" : "yaml"}
      theme="vs-dark"
      value={activeFile.content}
      onChange={(value) => onChange(value || "")}
    />
  );
}
