"use client";

import { useState, useEffect } from "react";
import { FileNode } from "@/types/file";
import { FileExplorerItem } from "@/components/FileExplorer";
import { MonacoEditor } from "@/components/CodeEditor";
import { X, PanelLeftClose, PanelLeft, File } from "lucide-react";

export default function IDE() {
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [tree, setTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);

  /** ✅ Create or reuse workspace on mount */
  useEffect(() => {
    const saved = sessionStorage.getItem("workspaceId");
    if (saved) {
      setWorkspaceId(saved);
      return;
    }

    const createWorkspace = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/workspaces", {
          method: "POST",
        });
        const data = await res.json();
        setWorkspaceId(data.workspaceId);
        sessionStorage.setItem("workspaceId", data.workspaceId);
      } catch (err) {
        console.error("Failed to create workspace:", err);
      }
    };

    createWorkspace();
  }, []);

  /** ✅ Load file tree */
  useEffect(() => {
    if (!workspaceId) return;

    const loadTree = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}`);
        const data = await res.json();
        setTree(data.files || []);
      } catch (err) {
        console.error("Failed to fetch workspace tree:", err);
      }
    };

    loadTree();
  }, [workspaceId]);

  /** ✅ Load a file’s content */
  const loadFile = async (file: FileNode) => {
    if (!workspaceId || file.type !== "file") return;

    // Add to open files if not already open
    if (!openFiles.some((f) => f.path === file.path)) {
      setOpenFiles((prev) => [...prev, file]);
    }
    setActiveFile(file);

    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/file?path=${encodeURIComponent(file.path)}`
      );
      const data = await res.json();
      setFileContents((prev) => ({ ...prev, [file.path]: data.content }));
    } catch (err) {
      console.error("Failed to load file:", err);
    }
  };

  const saveFile = async (latestValue?: string) => {
    if (!workspaceId || !activeFile) return;

    const contentToSave =
      latestValue ?? fileContents[activeFile.path] ?? "";

    // 🧠 Log the content that will be saved
    console.log(`💾 Saving file: ${activeFile.path}`);
    console.log("📄 File content being sent:\n--------------------------\n");
    console.log(contentToSave+'helo');
    console.log("\n--------------------------\n");

    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/file`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: activeFile.path,
            content: contentToSave,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      console.log(`✅ Saved successfully: ${activeFile.path}`);
    } catch (err) {
      console.error("❌ Save failed:", err);
    }
  };


  /** ✅ Handle Monaco code changes */
  const handleCodeChange = (value: string) => {
    if (activeFile) {
      setFileContents((prev) => ({ ...prev, [activeFile.path]: value }));
    }
  };

  /** ✅ Close open tab */
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
      {/* ✅ File Explorer */}
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
          {tree.length > 0 ? (
            tree.map((node, index) => (
              <FileExplorerItem
                key={`${workspaceId}-${node.path}-${index}`}
                node={node}
                level={0}
                onSelect={loadFile}
              />
            ))
          ) : (
            <div className="text-gray-500 text-sm p-3 italic">
              Loading project files...
            </div>
          )}
        </div>
      </div>

      {/* ✅ Editor Pane */}
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
            openFiles.map((file, index) => (
              <div
                key={`${workspaceId}-${file.path}-${index}`}
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

        {/* Monaco Editor */}
        <div className="flex-1 overflow-hidden min-h-0">
          {activeFile ? (
            <MonacoEditor
              file={activeFile}
              value={fileContents[activeFile.path] ?? ""}
              onChange={handleCodeChange}
              onSave={(latestValue) => saveFile(latestValue)} // ✅ pass current editor value
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
