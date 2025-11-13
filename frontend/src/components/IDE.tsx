"use client";

import { useState, useEffect } from "react";
import { FileNode } from "@/types/file";
import { FileExplorerItem } from "@/components/FileExplorer";
import { MonacoEditor } from "@/components/CodeEditor";
import { X, PanelLeftClose, PanelLeft, File } from "lucide-react";

const API_BASE = "http://13.235.89.215:5051";

export default function IDE() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Build hierarchical tree from flat file list
  const buildTree = (flatFiles: Array<{ path: string; type: string }>): FileNode[] => {
    const root: any = { children: {} };

    flatFiles.forEach((file) => {
      const parts = file.path.split("/");
      let current = root;

      parts.forEach((part, idx) => {
        const isLastPart = idx === parts.length - 1;
        const currentPath = parts.slice(0, idx + 1).join("/");

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: currentPath,
            type: isLastPart ? file.type : "folder",
            children: {},
          };
        }

        current = current.children[part];
      });
    });

    // Convert nested object structure to array structure
    const convertToArray = (obj: any): FileNode[] => {
      const items = Object.values(obj) as any[];
      return items.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        children: item.children && Object.keys(item.children).length > 0
          ? convertToArray(item.children)
          : undefined,
      })).sort((a, b) => {
        // Sort: folders first, then files, alphabetically within each group
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === "folder" ? -1 : 1;
      });
    };

    return convertToArray(root.children);
  };

  // Load file tree on mount
  useEffect(() => {
    const loadTree = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/tree`);
        if (!res.ok) throw new Error("Failed to load file tree");
        const data = await res.json();
        const treeData = buildTree(data.files || []);
        setTree(treeData);
      } catch (err) {
        console.error("Failed to fetch file tree:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTree();
  }, []);

  // Load a file's content
  const loadFile = async (file: FileNode) => {
    if (file.type !== "file") return;

    // Add to open files if not already open
    if (!openFiles.some((f) => f.path === file.path)) {
      setOpenFiles((prev) => [...prev, file]);
    }
    setActiveFile(file);

    // Return if already loaded
    if (fileContents[file.path] !== undefined) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/file?path=${encodeURIComponent(file.path)}`
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

  // Handle Monaco code changes
  const handleCodeChange = (value: string) => {
    if (activeFile) {
      setFileContents((prev) => ({ ...prev, [activeFile.path]: value }));
    }
  };

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
            tree.map((node, index) => (
              <FileExplorerItem
                key={`${node.path}-${index}`}
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
            openFiles.map((file, index) => (
              <div
                key={`${file.path}-${index}`}
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