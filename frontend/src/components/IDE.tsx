"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileNode } from "@/types/file";
import { FileExplorerItem } from "@/components/FileExplorer";
import { MonacoEditor } from "@/components/CodeEditor";
import { useBuild } from "@/context/BuildContext";
import { API_BASE } from "@/lib/api";
import { X, PanelLeftClose, PanelLeft, File } from "lucide-react";

export default function IDE() {
  const { workspaceId, saveSignal } = useBuild();

  const [tree, setTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const activeFileRef = useRef<FileNode | null>(null);
  const fileContentsRef = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    fileContentsRef.current = fileContents;
  }, [fileContents]);

  // Load file tree on mount / workspace change
  useEffect(() => {
    if (!workspaceId) return;

    const loadTree = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/workspaces/${workspaceId}`);
        if (!res.ok) throw new Error("Failed to load file tree");
        const data = await res.json();
        setTree(data.files ?? []);
      } catch (err) {
        console.error("Failed to fetch file tree:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTree();
  }, [workspaceId]);

  // Save the active file
  const saveActiveFile = useCallback(async () => {
    const file = activeFileRef.current;
    if (!file || !workspaceId) return;

    const content = fileContentsRef.current[file.path];
    if (content === undefined) return;

    setSaveState("saving");
    try {
      const res = await fetch(
        `${API_BASE}/api/workspaces/${workspaceId}/file`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: file.path, content }),
        }
      );
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSaveState("saved");
    } catch (err) {
      console.error("Failed to save file:", err);
      setSaveState("error");
    }
  }, [workspaceId]);

  // Load a file's content
  const loadFile = async (file: FileNode) => {
    if (file.type !== "file") return;

    if (!openFiles.some((f) => f.path === file.path)) {
      setOpenFiles((prev) => [...prev, file]);
    }
    setActiveFile(file);

    if (fileContents[file.path] !== undefined) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/workspaces/${workspaceId}/file?path=${encodeURIComponent(
          file.path
        )}`
      );
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();
      setFileContents((prev) => ({ ...prev, [file.path]: data.content }));
    } catch (err) {
      console.error("Failed to load file:", err);
      setFileContents((prev) => ({
        ...prev,
        [file.path]: `// Error loading file: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      }));
    }
  };

  // Handle Monaco code changes (debounced autosave)
  const handleCodeChange = (value: string) => {
    if (activeFile) {
      setFileContents((prev) => ({ ...prev, [activeFile.path]: value }));
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveActiveFile();
    }, 1500);
  };

  // Wire Navbar save signal
  useEffect(() => {
    if (saveSignal > 0) {
      saveActiveFile();
    }
  }, [saveSignal, saveActiveFile]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Close open tab
  const handleCloseFile = (file: FileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = openFiles.filter((f) => f.path !== file.path);
    setOpenFiles(remaining);
    if (activeFile?.path === file.path) {
      setActiveFile(remaining.length ? remaining[0] : null);
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-[#1e1e1e] text-gray-200 overflow-hidden">
      {/* File Explorer */}
      <div
        className={`bg-[#252526] border-r border-[#3e3e42] flex flex-col min-h-0 transition-all duration-300 ${
          explorerCollapsed ? "w-0 overflow-hidden" : "w-64"
        }`}
      >
        {/* Header */}
        <div className="px-4 py-3 text-xs font-semibold border-b border-[#3e3e42] flex items-center justify-between">
          <span>Explorer</span>
          <button
            onClick={() => setExplorerCollapsed(true)}
            className="hover:bg-[#3e3e42] p-1 rounded"
            title="Collapse Explorer"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Scrollable File Tree */}
        <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {loading ? (
            <div className="text-gray-500 text-sm p-3 italic">
              Loading project files...
            </div>
          ) : tree.length > 0 ? (
            tree.map((node) => (
              <FileExplorerItem
                key={node.path || node.id}
                node={node}
                level={0}
                onSelect={loadFile}
              />
            ))
          ) : (
            <div className="text-gray-500 text-sm p-3 italic">
              No files found
            </div>
          )}
        </div>
      </div>

      {/* Editor Pane */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* File Tabs */}
        <div className="flex bg-[#252526] border-b border-[#3e3e42] overflow-x-auto min-h-[2.5rem]">
          {explorerCollapsed && (
            <button
              onClick={() => setExplorerCollapsed(false)}
              className="px-3 py-2 border-r border-[#3e3e42]"
              title="Show Explorer"
            >
              <PanelLeft size={16} />
            </button>
          )}

          {openFiles.length === 0 ? (
            <div className="px-4 py-2 text-xs text-gray-500">No files open</div>
          ) : (
            openFiles.map((file) => (
              <div
                key={file.path || file.id}
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer border-r transition-colors ${
                  activeFile?.path === file.path
                    ? "bg-[#1e1e1e] text-white"
                    : "bg-[#2d2d30] text-gray-400 hover:bg-[#34363a]"
                }`}
                onClick={() => setActiveFile(file)}
              >
                <File size={14} />
                <span className="whitespace-nowrap">{file.name}</span>
                <button
                  onClick={(e) => handleCloseFile(file, e)}
                  className="p-1 rounded hover:bg-[#3e3e42]"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Save status indicator */}
        {saveState !== "idle" && (
          <div
            className={`text-xs px-4 py-1 border-b border-[#3e3e42] ${
              saveState === "error"
                ? "text-red-400"
                : saveState === "saving"
                ? "text-gray-400"
                : "text-emerald-400"
            }`}
          >
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
              ? "All changes saved"
              : "Save failed"}
          </div>
        )}

        {/* Monaco Editor */}
        <div className="flex-1 overflow-hidden min-h-0">
          {activeFile ? (
            <MonacoEditor
              file={activeFile}
              value={fileContents[activeFile.path] ?? ""}
              onChange={handleCodeChange}
              onSave={saveActiveFile}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <File size={40} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select a file to start editing</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
