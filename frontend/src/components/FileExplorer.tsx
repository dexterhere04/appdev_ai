"use client";

import React from "react";
import { Tree, NodeApi } from "react-arborist";

type FileNode = {
  id: string;
  name: string;
  children?: FileNode[];
};

const initialData: FileNode[] = [
  {
    id: "1",
    name: "src",
    children: [
      { id: "2", name: "index.js" },
      { id: "3", name: "App.js" },
    ],
  },
  { id: "4", name: "package.json" },
];

export function FileExplorer({
  onSelect,
}: {
  onSelect: (file: string) => void;
}) {
  return (
    <div className="bg-[#252526] text-sm text-gray-300 w-60 h-full border-r border-gray-700 overflow-auto">
      <Tree<FileNode>
        data={initialData}
        openByDefault={true}
        width={240}
        height={500}
        indent={16}
        children={(props) => <FileNodeItem {...props} onSelect={onSelect} />}
      />
    </div>
  );
}

function FileNodeItem({
  node,
  style,
  onSelect,
}: {
  node: NodeApi<FileNode>;
  style: React.CSSProperties;
  onSelect: (file: string) => void;
}) {
  const isFolder = !!node.children?.length;

  return (
    <div
      style={style}
      className={`flex items-center gap-2 px-2 py-1 cursor-pointer ${
        node.isSelected ? "bg-[#37373d]" : "hover:bg-[#2a2a2a]"
      }`}
      onClick={() => {
        if (isFolder) node.toggle();
        else onSelect(node.data.name);
      }}
    >
      {isFolder ? (
        <span>{node.isOpen ? "📂" : "📁"}</span>
      ) : (
        <span>📄</span>
      )}
      <span>{node.data.name}</span>
    </div>
  );
}
