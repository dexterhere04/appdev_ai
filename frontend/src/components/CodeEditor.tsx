"use client";

import { FileNode } from "@/types/file";
import { useRef, useEffect } from "react";

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
  onSave?: () => void; // ✅ added save callback
}

export function MonacoEditor({ file, value, onChange, onSave }: MonacoEditorProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUpdating = useRef(false); // prevent feedback loops

  useEffect(() => {
    let isMounted = true;

    const initializeMonaco = () => {
      if (!isMounted || !containerRef.current) return;

      monacoRef.current = (window as any).monaco;
      const monaco = monacoRef.current;

      // Create editor instance
      editorRef.current = monaco.editor.create(containerRef.current, {
        value,
        language: file ? getLanguageFromFileName(file.name) : "plaintext",
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        lineNumbers: "on",
        renderWhitespace: "selection",
        tabSize: 2,
      });

      // Change listener
      editorRef.current.onDidChangeModelContent(() => {
        if (isUpdating.current) return;
        const val = editorRef.current.getValue();
        onChange(val);
      });

      // ✅ Add save shortcut (Ctrl+S / Cmd+S)
      editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (onSave) onSave();
      });
    };

    // Load Monaco from CDN if not already loaded
    const loadMonaco = () => {
      if (typeof window === "undefined") return;
      const w = window as any;

      if (!w.require) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js";
        script.onload = () => {
          if (!isMounted) return;

          w.require.config({
            paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" },
          });

          w.require(["vs/editor/editor.main"], initializeMonaco);
        };
        document.head.appendChild(script);
      } else {
        w.require(["vs/editor/editor.main"], initializeMonaco);
      }
    };

    loadMonaco();

    // Cleanup
    return () => {
      isMounted = false;
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, []); // only once

  /** ✅ Update content or language when file/value changes */
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    isUpdating.current = true;

    // Update text content if changed externally
    const currentValue = editor.getValue();
    if (currentValue !== value) {
      editor.setValue(value ?? "");
    }

    // Update language if file changes
    const model = editor.getModel();
    if (model && file) {
      const lang = getLanguageFromFileName(file.name);
      monaco.editor.setModelLanguage(model, lang);
    }

    isUpdating.current = false;
  }, [file, value]);

  return <div ref={containerRef} className="w-full h-full" />;
}
