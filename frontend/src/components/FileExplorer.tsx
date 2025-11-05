import { File, Folder, ChevronRight, ChevronDown} from "lucide-react";
import { FileNode } from "@/types/file";
import { useState } from "react";
export function FileExplorerItem({ 
  node, 
  level = 0, 
  onSelect 
}: { 
  node: FileNode; 
  level?: number; 
  onSelect: (file: FileNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const handleClick = () => {
    if (node.type === "dir") {
      setExpanded(!expanded);
    } else {
      onSelect(node);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className="flex items-center gap-1 px-2 py-1 hover:bg-[#2a2d2e] cursor-pointer text-sm"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {node.type === "dir" && (
          <span className="text-gray-400">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
        {node.type === "dir" ? (
          <Folder size={16} className="text-blue-400" />
        ) : (
          <File size={16} className="text-gray-400" />
        )}
        <span className="text-gray-200">{node.name}</span>
      </div>
      {node.type === "dir" && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileExplorerItem
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}