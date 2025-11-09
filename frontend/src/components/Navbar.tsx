import { Save, Play, Eye, EyeOff, Settings, Share2 } from "lucide-react";
import { useBuild } from "@/context/BuildContext";
interface NavbarProps {
  workspaceId: string;
  onSave: () => void;
  onBuild: () => void;
  onTogglePreview: () => void;
  previewVisible?: boolean;
}

export function Navbar({
  workspaceId,
  onSave,
  onTogglePreview,
  previewVisible = true,
}: NavbarProps) {
  const { triggerBuild } = useBuild();

  return (
    <div className="h-14 bg-[#0d0d0d] border-b border-gray-800 flex items-center justify-between px-4">
      {/* Left section - Project info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-gray-300">
            {workspaceId}
          </span>
        </div>
        <div className="h-4 w-px bg-gray-700" />
        <span className="text-xs text-gray-500">Auto-saved 2m ago</span>
      </div>

      {/* Right section - Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#1a1a1c] hover:bg-[#252527] rounded-md transition-colors border border-gray-700"
        >
          <Save size={16} />
          Save
        </button>

        <button
          onClick={triggerBuild}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium"
        >
          <Play size={16} />
          Build
        </button>

        <button
          onClick={onTogglePreview}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#1a1a1c] hover:bg-[#252527] rounded-md transition-colors border border-gray-700"
        >
          {previewVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          Preview
        </button>

        <div className="h-6 w-px bg-gray-700 mx-1" />

        <button className="p-2 hover:bg-[#252527] rounded-md transition-colors">
          <Share2 size={18} />
        </button>

        <button className="p-2 hover:bg-[#252527] rounded-md transition-colors">
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}