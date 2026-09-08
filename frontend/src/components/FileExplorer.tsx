"use client";

import { File, Folder, ChevronRight, ChevronDown } from "lucide-react";
import { FileNode } from "@/types/file";
import { useCallback } from "react";

export function FileExplorerItem({
  node,
  level = 0,
  collapsed = {},
  onToggle,
  onSelect,
  onContextMenu,
}: {
  node: FileNode;
  level?: number;
  collapsed?: Record<string, boolean>;
  onToggle?: (node: FileNode) => void;
  onSelect: (file: FileNode) => void;
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void;
}) {
  const isDir = node.type === "dir";
  const expanded = isDir ? !collapsed[node.path] : false;

  const handleClick = useCallback(() => {
    if (isDir) {
      onToggle?.(node);
    } else {
      onSelect(node);
    }
  }, [isDir, onToggle, onSelect, node]);

  const handleCtx = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu?.(e, node);
    },
    [onContextMenu, node]
  );

  return (
    <div>
      <div
        onClick={handleClick}
        onContextMenu={handleCtx}
        className="flex items-center gap-1 px-2 py-1 hover:bg-[#2a2d2e] cursor-pointer text-sm select-none"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        title={node.path}
      >
        {isDir && (
          <span className="text-gray-400">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
        {isDir ? (
          <Folder size={16} className="text-blue-400 shrink-0" />
        ) : (
          <File size={16} className="text-gray-400 shrink-0" />
        )}
        <span className="text-gray-200 truncate">{node.name}</span>
      </div>

      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileExplorerItem
              key={child.id || child.path}
              node={child}
              level={level + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
