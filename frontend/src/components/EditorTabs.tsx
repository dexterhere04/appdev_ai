"use client";
import { X } from "lucide-react";
import { FileNode } from "@/types/file";

interface Props {
  openFiles: FileNode[];
  activeFile: FileNode | null;
  onSelect: (file: FileNode) => void;
  onClose: (file: FileNode) => void;
}

export default function EditorTabs({ openFiles, activeFile, onSelect, onClose }: Props) {
  return (
    <div className="flex border-b border-gray-700 bg-gray-900">
      {openFiles.map((file) => (
        <div
          key={file.id}
          onClick={() => onSelect(file)}
          className={`flex items-center px-3 py-2 cursor-pointer ${
            file.id === activeFile?.id ? "bg-gray-800" : ""
          }`}
        >
          <span className="mr-2">{file.name}</span>
          <X size={14} onClick={() => onClose(file)} className="cursor-pointer" />
        </div>
      ))}
    </div>
  );
}
