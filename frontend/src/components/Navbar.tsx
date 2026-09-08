import { Save, Play, Eye, EyeOff, Settings, Share2 } from "lucide-react";
import { useBuild } from "@/context/BuildContext";

export function Navbar() {
  const { workspaceId, previewVisible, requestSave, triggerBuild, togglePreview } =
    useBuild();

  return (
    <div className="h-14 bg-[#0d0d0d] border-b border-gray-800 flex items-center justify-between px-4">
      {/* Left section - Project info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-gray-300">
            {workspaceId ?? "Initializing..."}
          </span>
        </div>
      </div>

      {/* Right section - Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={requestSave}
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
          onClick={togglePreview}
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
