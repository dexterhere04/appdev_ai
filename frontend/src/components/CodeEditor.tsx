"use client";

import { getLanguageFromFileName } from "@/app/page";
import { FileNode } from "@/types/file";
import { useRef, useEffect } from "react";

export function MonacoEditor({ 
  file, 
  value, 
  onChange 
}: { 
  file: FileNode | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMonaco = async () => {
      if (typeof window === 'undefined') return;

      // Load Monaco loader script
      if (!(window as any).require) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js';
        
        script.onload = () => {
          if (!isMounted) return;
          
          (window as any).require.config({
            paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }
          });

          (window as any).require(['vs/editor/editor.main'], () => {
            if (!isMounted || !containerRef.current) return;
            
            monacoRef.current = (window as any).monaco;
            
            editorRef.current = monacoRef.current.editor.create(containerRef.current, {
              value: value,
              language: file ? getLanguageFromFileName(file.name) : 'plaintext',
              theme: 'vs-dark',
              automaticLayout: true,
              fontSize: 14,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderWhitespace: 'selection',
              tabSize: 2,
            });

            editorRef.current.onDidChangeModelContent(() => {
              if (editorRef.current) {
                onChange(editorRef.current.getValue());
              }
            });
          });
        };

        document.head.appendChild(script);
      } else {
        (window as any).require(['vs/editor/editor.main'], () => {
          if (!isMounted || !containerRef.current) return;
          
          monacoRef.current = (window as any).monaco;
          
          editorRef.current = monacoRef.current.editor.create(containerRef.current, {
            value: value,
            language: file ? getLanguageFromFileName(file.name) : 'plaintext',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            tabSize: 2,
          });

          editorRef.current.onDidChangeModelContent(() => {
            if (editorRef.current) {
              onChange(editorRef.current.getValue());
            }
          });
        });
      }
    };

    loadMonaco();

    return () => {
      isMounted = false;
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (editorRef.current && file) {
      const currentValue = editorRef.current.getValue();
      if (currentValue !== value) {
        editorRef.current.setValue(value);
      }
      
      const language = getLanguageFromFileName(file.name);
      const model = editorRef.current.getModel();
      if (model && monacoRef.current) {
        monacoRef.current.editor.setModelLanguage(model, language);
      }
    }
  }, [file, value]);

  return <div ref={containerRef} className="w-full h-full" />;
}
