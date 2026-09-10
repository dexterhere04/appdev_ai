"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileNode } from "@/types/file";
import { FileExplorerItem } from "@/components/FileExplorer";
import { MonacoEditor } from "@/components/CodeEditor";
import { useBuild, subscribeTreeReload } from "@/context/BuildContext";
import { filesApi, describeError } from "@/lib/api";
import {
  X,
  PanelLeftClose,
  PanelLeft,
  File,
  FilePlus2,
  FolderPlus,
  RefreshCw,
  ChevronsDownUp,
  Pencil,
  Trash2,
  Image as ImageIcon,
  FileX2,
  Download,
  Loader2,
} from "lucide-react";

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|bmp|tiff|svg)$/i;

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

function parentPath(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

interface BinaryInfo {
  size: number;
  image: boolean;
}

type CtxMenu = { x: number; y: number; node: FileNode | null } | null;
type NameModal =
  | { kind: "newfile" | "newfolder" | "rename"; node: FileNode | null }
  | null;

export default function IDE() {
  const { project, registerBuildFlush, schedulePreviewRefresh } = useBuild();
  const pid = project?.id ?? null;

  const [tree, setTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [binaryInfo, setBinaryInfo] = useState<Record<string, BinaryInfo>>({});
  const [rawUrls, setRawUrls] = useState<Record<string, string>>({});
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  const [nameModal, setNameModal] = useState<NameModal>(null);

  const activeFileRef = useRef<FileNode | null>(null);
  const fileContentsRef = useRef<Record<string, string>>({});
  const binaryInfoRef = useRef<Record<string, BinaryInfo>>({});
  const rawUrlsRef = useRef<Record<string, string>>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  const openFilesRef = useRef<FileNode[]>(openFiles);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);
  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);
  useEffect(() => {
    fileContentsRef.current = fileContents;
  }, [fileContents]);
  useEffect(() => {
    binaryInfoRef.current = binaryInfo;
  }, [binaryInfo]);
  useEffect(() => {
    rawUrlsRef.current = rawUrls;
  }, [rawUrls]);
  useEffect(() => {
    dirtyRef.current = dirtyPaths;
  }, [dirtyPaths]);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  // Revoke blob URLs owned by the IDE (avoid leaking object URLs).
  const releaseUrls = useCallback((paths: string[]) => {
    setRawUrls((prev) => {
      const next = { ...prev };
      for (const p of paths) {
        const url = next[p];
        if (url) URL.revokeObjectURL(url);
        delete next[p];
      }
      return next;
    });
  }, []);

  // ---- Tree ----
  const refreshTree = useCallback(async () => {
    if (!pid) return;
    try {
      const nodes = await filesApi.tree(pid);
      setTree(nodes);
    } catch (err) {
      console.error("Failed to fetch file tree:", err);
      showNotice(
        `Could not load file tree: ${err instanceof Error ? describeError(err) : "unknown error"}`
      );
    }
  }, [pid, showNotice]);

  useEffect(() => {
    if (!pid) return;
    const timer = setTimeout(() => {
      void refreshTree().finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [pid, refreshTree]);

  // AI or other external edits should refresh the tree. The IDE remounts per
  // project (see WorkspaceLayout), so subscribing here is per-project.
  useEffect(() => {
    if (!pid) return;
    const unsubscribe = subscribeTreeReload(() => {
      void refreshTree();
    });
    return unsubscribe;
  }, [pid, refreshTree]);

  // Fetch binary/image bytes (authed) and expose them as an object URL.
  const loadRawUrl = useCallback(
    async (path: string) => {
      if (!pid || rawUrlsRef.current[path]) return;
      try {
        const blob = await filesApi.rawBlob(pid, path);
        if (!pid || !openFilesRef.current.some((f) => f.path === path)) {
          URL.revokeObjectURL(URL.createObjectURL(blob));
          return;
        }
        const url = URL.createObjectURL(blob);
        setRawUrls((prev) => ({ ...prev, [path]: url }));
      } catch (err) {
        console.error("Failed to load image bytes:", err);
        showNotice(`Could not load image ${path}.`);
      }
    },
    [pid, showNotice]
  );

  // ---- Open / load a file ----
  const loadFile = useCallback(
    async (file: FileNode) => {
      if (file.type !== "file" || !pid) return;

      if (!openFilesRef.current.some((f) => f.path === file.path)) {
        setOpenFiles((prev) => [...prev, file]);
      }
      setActiveFile(file);

      const hasContent =
        fileContentsRef.current[file.path] !== undefined ||
        binaryInfoRef.current[file.path] !== undefined;
      if (hasContent) return;

      try {
        const data = await filesApi.read(pid, file.path);
        if ("binary" in data && data.binary) {
          setBinaryInfo((prev) => ({
            ...prev,
            [file.path]: {
              size: data.size,
              image: data.image === true || IMAGE_EXTENSIONS.test(file.path),
            },
          }));
          if (data.image) {
            void loadRawUrl(file.path);
          }
        } else if ("content" in data) {
          setFileContents((prev) => ({ ...prev, [file.path]: data.content }));
        }
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 404) {
          showNotice(`File no longer exists (${file.path}).`);
          setOpenFiles((prev) => prev.filter((f) => f.path !== file.path));
        } else {
          console.error("Failed to load file:", err);
          showNotice(
            `Failed to load ${file.path}: ${err instanceof Error ? describeError(err) : "unknown error"}`
          );
          setOpenFiles((prev) => prev.filter((f) => f.path !== file.path));
        }
      }
    },
    [pid, showNotice, loadRawUrl]
  );


  const downloadRaw = useCallback(
    async (path: string) => {
      if (!pid) return;
      try {
        const blob = await filesApi.rawBlob(pid, path);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = baseName(path);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (err) {
        console.error("Failed to download raw file:", err);
        showNotice(
          `Download failed: ${err instanceof Error ? describeError(err) : "unknown error"}`
        );
      }
    },
    [pid, showNotice]
  );

  // ---- Save ----
  const persistFile = useCallback(
    async (path: string): Promise<void> => {
      if (!pid) return;
      if (binaryInfoRef.current[path]) {
        throw new Error(`${path} is binary and cannot be saved.`);
      }
      const content = fileContentsRef.current[path];
      if (content === undefined) return;
      await filesApi.write(pid, path, content);
      setDirtyPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    },
    [pid]
  );

  const saveActiveFile = useCallback(async () => {
    const file = activeFileRef.current;
    if (!file || !pid) return;
    setSaveState("saving");
    try {
      await persistFile(file.path);
      setSaveState("saved");
      // Auto-refresh the preview once the change is on disk.
      schedulePreviewRefresh();
    } catch (err) {
      console.error("Failed to save file:", err);
      setSaveState("error");
      showNotice(
        `Save failed for ${file.path}: ${err instanceof Error ? describeError(err) : "unknown error"}`
      );
    }
  }, [pid, persistFile, showNotice, schedulePreviewRefresh]);

  const saveAllDirty = useCallback(async () => {
    const paths = [...dirtyRef.current];
    if (paths.length === 0) return;
    setSaveState("saving");
    let failed = false;
    for (const p of paths) {
      try {
        await persistFile(p);
      } catch (err) {
        failed = true;
        console.error("Failed to save file:", err);
        showNotice(
          `Save failed for ${p}: ${err instanceof Error ? describeError(err) : "unknown error"}`
        );
      }
    }
    setSaveState(failed ? "error" : "saved");
  }, [persistFile, showNotice]);

  // Let the build flow flush unsaved edits before running a build.
  useEffect(() => {
    registerBuildFlush(saveAllDirty);
  }, [registerBuildFlush, saveAllDirty]);

  const handleCodeChange = useCallback(
    (value: string) => {
      const file = activeFileRef.current;
      if (!file) return;
      if (binaryInfoRef.current[file.path]) return;

      setFileContents((prev) => ({ ...prev, [file.path]: value }));
      setDirtyPaths((prev) => {
        const next = new Set(prev);
        next.add(file.path);
        return next;
      });
      setSaveState("idle");

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveActiveFile(), 1500);
    },
    [saveActiveFile]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      for (const url of Object.values(rawUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
      registerBuildFlush(async () => {});
    };
  }, [registerBuildFlush]);

  // ---- Close a tab ----
  const closeFile = useCallback((file: FileNode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (dirtyRef.current.has(file.path)) {
      const ok = window.confirm(
        `"${file.path}" has unsaved changes. Close without saving?`
      );
      if (!ok) return;
    }
    const remaining = openFilesRef.current.filter((f) => f.path !== file.path);
    setOpenFiles(remaining);
    releaseUrls([file.path]);
    setActiveFile((prev) =>
      prev && prev.path === file.path
        ? remaining.length
          ? remaining[0]
          : null
        : prev
    );
  }, [releaseUrls]);

  // ---- Tab bookkeeping helpers ----
  const dropTabsAt = useCallback(
    (path: string, onlyChildren: boolean) => {
      const match = (p: string) =>
        onlyChildren
          ? p.startsWith(path + "/")
          : p === path || p.startsWith(path + "/");
      const remaining = openFilesRef.current.filter((f) => !match(f.path));
      const removedPaths = openFilesRef.current
        .filter((f) => match(f.path))
        .map((f) => f.path);
      releaseUrls(removedPaths);
      setOpenFiles(remaining);
      setActiveFile((prev) =>
        prev && !remaining.some((f) => f.path === prev.path)
          ? remaining.length
            ? remaining[0]
            : null
          : prev
      );
      setFileContents((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (match(k)) delete next[k];
        return next;
      });
      setBinaryInfo((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (match(k)) delete next[k];
        return next;
      });
      setDirtyPaths((prev) => {
        const next = new Set(prev);
        for (const p of prev) if (match(p)) next.delete(p);
        return next;
      });
    },
    [releaseUrls]
  );

  const remapTab = useCallback((oldPath: string, newPath: string) => {
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === oldPath
          ? { ...f, path: newPath, name: baseName(newPath) }
          : f
      )
    );
    setActiveFile((prev) =>
      prev && prev.path === oldPath
        ? { ...prev, path: newPath, name: baseName(newPath) }
        : prev
    );
    setFileContents((prev) => {
      if (!(oldPath in prev)) return prev;
      const next = { ...prev };
      next[newPath] = next[oldPath];
      delete next[oldPath];
      return next;
    });
    setBinaryInfo((prev) => {
      if (!(oldPath in prev)) return prev;
      const next = { ...prev };
      next[newPath] = next[oldPath];
      delete next[oldPath];
      return next;
    });
    setRawUrls((prev) => {
      if (!(oldPath in prev)) return prev;
      const next = { ...prev };
      next[newPath] = next[oldPath];
      delete next[oldPath];
      return next;
    });
    setDirtyPaths((prev) => {
      if (!prev.has(oldPath)) return prev;
      const next = new Set(prev);
      next.delete(oldPath);
      next.add(newPath);
      return next;
    });
  }, []);

  // ---- File operations ----
  const doCreate = useCallback(
    async (kind: "newfile" | "newfolder", name: string, dir: string) => {
      if (!pid || !name.trim()) return;
      const clean = name.trim();
      if (clean.includes("/") || clean === "." || clean === "..") {
        showNotice("Invalid name.");
        return;
      }
      const path = dir ? `${dir}/${clean}` : clean;
      try {
        if (kind === "newfile") {
          await filesApi.write(pid, path, "");
        } else {
          await filesApi.createFolder(pid, path);
        }
        await refreshTree();
        if (kind === "newfile") {
          const node: FileNode = {
            id: path,
            path,
            name: clean,
            type: "file",
          };
          await loadFile(node);
        }
      } catch (err) {
        console.error("create failed", err);
        showNotice(
          `Create failed: ${err instanceof Error ? describeError(err) : "error"}`
        );
      }
    },
    [pid, refreshTree, loadFile, showNotice]
  );

  const doRename = useCallback(
    async (node: FileNode, name: string) => {
      if (!pid || !name.trim()) return;
      const clean = name.trim();
      if (
        clean.includes("/") ||
        clean === "." ||
        clean === ".." ||
        clean === node.name
      ) {
        if (clean !== node.name) showNotice("Invalid name.");
        return;
      }
      const parent = node.type === "dir" ? node.path : parentPath(node.path);
      const newPath = parent ? `${parent}/${clean}` : clean;
      // Folder rename: any dirty child would lose its path reference — confirm then close.
      if (node.type === "dir") {
        const affectedDirty = [...dirtyRef.current].some((p) =>
          p.startsWith(node.path + "/")
        );
        if (affectedDirty) {
          const ok = window.confirm(
            `Renaming a folder closes open files inside it. Unsaved changes will be lost. Continue?`
          );
          if (!ok) return;
        }
      }
      try {
        await filesApi.rename(pid, node.path, newPath);
        if (node.type === "file") {
          remapTab(node.path, newPath);
        } else {
          dropTabsAt(node.path, false);
        }
        await refreshTree();
      } catch (err) {
        console.error("rename failed", err);
        showNotice(
          `Rename failed: ${err instanceof Error ? describeError(err) : "error"}`
        );
      }
    },
    [pid, refreshTree, remapTab, dropTabsAt, showNotice]
  );

  const doDelete = useCallback(
    async (node: FileNode) => {
      if (!pid) return;
      const dirtyInside = [...dirtyRef.current].some(
        (p) => p === node.path || p.startsWith(node.path + "/")
      );
      if (dirtyInside) {
        const ok = window.confirm(
          `Deleting "${node.path}" also removes open files under it. Unsaved changes will be lost. Continue?`
        );
        if (!ok) return;
      } else {
        const ok = window.confirm(`Delete "${node.path}"?`);
        if (!ok) return;
      }
      try {
        await filesApi.remove(pid, node.path);
        dropTabsAt(node.path, false);
        await refreshTree();
      } catch (err) {
        console.error("delete failed", err);
        showNotice(
          `Delete failed: ${err instanceof Error ? describeError(err) : "error"}`
        );
      }
    },
    [pid, refreshTree, dropTabsAt, showNotice]
  );

  // ---- Context menu / modal wiring ----
  const openCtxMenu = useCallback(
    (e: React.MouseEvent, node: FileNode | null) => {
      e.preventDefault();
      const x = Math.min(e.clientX, window.innerWidth - 180);
      setCtxMenu({ x, y: e.clientY, node });
    },
    []
  );

  const targetDir = useCallback((node: FileNode | null): string => {
    if (!node) return "";
    return node.type === "dir" ? node.path : parentPath(node.path);
  }, []);

  const toggleCollapse = useCallback((node: FileNode) => {
    if (node.type !== "dir") return;
    setCollapsed((prev) => {
      const next = { ...prev };
      if (next[node.path]) delete next[node.path];
      else next[node.path] = true;
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsed((prev) => {
      const next = { ...prev };
      const walk = (nodes: FileNode[]) => {
        for (const n of nodes) {
          if (n.type === "dir") {
            next[n.path] = true;
            walk(n.children ?? []);
          }
        }
      };
      walk(tree);
      return next;
    });
  }, [tree]);

  const submitModal = useCallback(
    async (name: string) => {
      if (!nameModal) return;
      const { kind, node } = nameModal;
      setNameModal(null);
      if (kind === "rename" && node) {
        await doRename(node, name);
      } else if (kind === "newfile" || kind === "newfolder") {
        await doCreate(kind, name, targetDir(node));
      }
    },
    [nameModal, doRename, doCreate, targetDir]
  );

  const activeBinary: BinaryInfo | undefined = activeFile
    ? binaryInfo[activeFile.path]
    : undefined;
  const activeImageUrl = activeFile ? rawUrls[activeFile.path] : undefined;

  return (
    <div className="flex h-full min-h-0 bg-[#1e1e1e] text-gray-200 overflow-hidden relative">
      {/* File Explorer */}
      <div
        className={`bg-[#252526] border-r border-[#3e3e42] flex flex-col min-h-0 transition-all duration-300 ${
          explorerCollapsed ? "w-0 overflow-hidden" : "w-64"
        }`}
      >
        {/* Header */}
        <div className="px-3 py-2 text-xs font-semibold border-b border-[#3e3e42] flex items-center justify-between">
          <span>Explorer</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setNameModal({ kind: "newfile", node: null })}
              className="hover:bg-[#3e3e42] p-1 rounded"
              title="New file"
            >
              <FilePlus2 size={14} />
            </button>
            <button
              onClick={refreshTree}
              className="hover:bg-[#3e3e42] p-1 rounded"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => collapseAll()}
              className="hover:bg-[#3e3e42] p-1 rounded"
              title="Collapse all"
            >
              <ChevronsDownUp size={14} />
            </button>
            <button
              onClick={() => setExplorerCollapsed(true)}
              className="hover:bg-[#3e3e42] p-1 rounded"
              title="Collapse Explorer"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable File Tree */}
        <div
          className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          onContextMenu={(e) => openCtxMenu(e, null)}
        >
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
                collapsed={collapsed}
                onToggle={toggleCollapse}
                onSelect={loadFile}
                onContextMenu={openCtxMenu}
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
      <div className="flex flex-col flex-1 min-h-0 relative">
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
            openFiles.map((file) => {
              const active = activeFile?.path === file.path;
              const dirty = dirtyPaths.has(file.path);
              const isBinary = !!binaryInfo[file.path];
              return (
                <div
                  key={file.path}
                  className={`group flex items-center gap-2 px-4 py-2 cursor-pointer border-r transition-colors ${
                    active
                      ? "bg-[#1e1e1e] text-white"
                      : "bg-[#2d2d30] text-gray-400 hover:bg-[#34363a]"
                  }`}
                  onClick={() => setActiveFile(file)}
                >
                  {isBinary ? (
                    <ImageIcon size={14} className="text-purple-400 shrink-0" />
                  ) : (
                    <File size={14} className="shrink-0" />
                  )}
                  <span className="whitespace-nowrap">{file.name}</span>
                  {dirty && (
                    <span
                      className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                      title="Unsaved changes"
                    />
                  )}
                  <button
                    onClick={(e) => closeFile(file, e)}
                    className="p-0.5 rounded hover:bg-[#3e3e42] opacity-0 group-hover:opacity-100"
                    title="Close"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Notice banner */}
        {notice && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-3 py-1.5 bg-red-900/80 border border-red-600 text-red-100 text-xs rounded-md shadow-lg max-w-[80%]">
            <span className="truncate">{notice}</span>
            <button onClick={() => setNotice(null)} className="shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

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

        {/* Content: Monaco | image preview | binary placeholder | empty */}
        <div className="flex-1 overflow-hidden min-h-0">
          {!activeFile ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <File size={40} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select a file to start editing</p>
              </div>
            </div>
          ) : activeBinary?.image ? (
            <div className="h-full w-full flex flex-col items-center justify-center bg-[#1a1a1a] p-6 overflow-auto">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
                <ImageIcon size={14} className="text-purple-400" />
                <span className="truncate max-w-full">{activeFile.path}</span>
                <span className="text-gray-600">
                  ({activeBinary.size} bytes)
                </span>
                <button
                  onClick={() => void downloadRaw(activeFile.path)}
                  className="flex items-center gap-1 underline hover:text-gray-200"
                >
                  <Download size={12} />
                  download
                </button>
              </div>
              {activeImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={activeImageUrl}
                  src={activeImageUrl}
                  alt={activeFile.path}
                  className="max-h-[85%] max-w-[90%] object-contain border border-[#3e3e42] rounded bg-white"
                />
              ) : (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 size={18} className="animate-spin" />
                  Loading image...
                </div>
              )}
            </div>
          ) : activeBinary ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center px-6">
                <FileX2 size={40} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Binary file — not editable</p>
                <p className="text-sm text-gray-600 mt-1">
                  {activeFile.path} ({activeBinary.size} bytes). This asset is
                  shown in the project but can only be edited on disk.
                </p>
                <button
                  onClick={() => void downloadRaw(activeFile.path)}
                  className="flex items-center gap-1 text-sm underline hover:text-gray-300 mt-2 inline-flex"
                >
                  <Download size={13} />
                  download raw
                </button>
              </div>
            </div>
          ) : (
            <MonacoEditor
              file={activeFile}
              value={fileContents[activeFile.path] ?? ""}
              onChange={handleCodeChange}
              onSave={saveActiveFile}
            />
          )}
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div
            className="fixed z-50 bg-[#252526] border border-[#3e3e42] rounded-md shadow-xl py-1 text-sm min-w-[160px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#3e3e42] text-left"
              onClick={() => {
                setCtxMenu(null);
                setNameModal({ kind: "newfile", node: ctxMenu.node });
              }}
            >
              <FilePlus2 size={14} /> New file
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#3e3e42] text-left"
              onClick={() => {
                setCtxMenu(null);
                setNameModal({ kind: "newfolder", node: ctxMenu.node });
              }}
            >
              <FolderPlus size={14} /> New folder
            </button>
            {ctxMenu.node && (
              <>
                <div className="my-1 border-t border-[#3e3e42]" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#3e3e42] text-left"
                  onClick={() => {
                    setCtxMenu(null);
                    setNameModal({ kind: "rename", node: ctxMenu.node });
                  }}
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#3e3e42] text-left text-red-400"
                  onClick={() => {
                    setCtxMenu(null);
                    if (ctxMenu.node) void doDelete(ctxMenu.node);
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Name modal */}
      {nameModal && (
        <NameEntryModal
          kind={nameModal.kind}
          initial={
            nameModal.kind === "rename" && nameModal.node
              ? nameModal.node.name
              : ""
          }
          onCancel={() => setNameModal(null)}
          onSubmit={(name) => void submitModal(name)}
        />
      )}
    </div>
  );
}

function NameEntryModal({
  kind,
  initial,
  onCancel,
  onSubmit,
}: {
  kind: "newfile" | "newfolder" | "rename";
  initial: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const label =
    kind === "rename" ? "Rename" : kind === "newfolder" ? "New folder" : "New file";

  const submit = () => {
    if (value.trim()) onSubmit(value.trim());
    else onCancel();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-[#252526] border border-[#3e3e42] rounded-lg shadow-2xl p-4 w-80">
        <p className="text-sm font-medium text-gray-200 mb-3">{label}</p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          className="w-full bg-[#1e1e1e] border border-[#3e3e42] rounded px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/60"
          placeholder="name"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-[#3e3e42] hover:bg-[#1e1e1e]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 font-medium"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
