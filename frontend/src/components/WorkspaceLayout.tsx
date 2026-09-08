"use client";

import { useState } from "react";
import { BuildProvider } from "@/context/BuildContext";
import {
  FolderOpen,
  Code2,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Logo } from "./Logo";

export function ChatWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"projects" | "ide">("ide");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <BuildProvider>
      <div className="flex h-screen w-screen bg-[#0a0a0a] text-gray-200 overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${
            sidebarCollapsed ? "w-16" : "w-72"
          } bg-gradient-to-b from-[#111115] to-[#0d0d0f] border-r border-gray-800/50 flex flex-col transition-all duration-300 relative`}
        >
          {/* Header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-gray-800/50">
            {!sidebarCollapsed ? (
              <Logo className="scale-[0.95]" showText />
            ) : (
              <Logo className="scale-90" showText={false} />
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 hover:bg-white/5 rounded-md transition-colors ml-auto"
            >
              {sidebarCollapsed ? (
                <ChevronRight size={18} />
              ) : (
                <ChevronLeft size={18} />
              )}
            </button>
          </div>

          {/* Navigation */}
          <div className="p-3 space-y-1">
            <button
              onClick={() => setView("ide")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                view === "ide"
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                  : "hover:bg-white/5 text-gray-400"
              }`}
            >
              <Code2 size={20} />
              {!sidebarCollapsed && <span className="font-medium">Workspace</span>}
            </button>

            <button
              onClick={() => setView("projects")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                view === "projects"
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                  : "hover:bg-white/5 text-gray-400"
              }`}
            >
              <FolderOpen size={20} />
              {!sidebarCollapsed && <span className="font-medium">Projects</span>}
            </button>
          </div>

          {/* Content Area */}
          {!sidebarCollapsed && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 px-3 py-4 overflow-auto">
                {view === "projects" && (
                  <div className="space-y-3">
                    <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 rounded-lg transition-all font-medium">
                      <Plus size={18} />
                      New Project
                    </button>

                    <div className="text-xs text-gray-500 px-2 mt-6">
                      YOUR PROJECTS
                    </div>

                    <div className="space-y-2">
                      {["my-flutter-app", "ecommerce-app", "weather-widget", "todo-list"].map(
                        (name, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                              i === 0
                                ? "bg-emerald-600/10 border-emerald-500/20 hover:bg-emerald-600/15"
                                : "hover:bg-white/5 border-transparent hover:border-gray-700/50"
                            }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <p className="text-sm font-medium text-gray-200">{name}</p>
                              <span
                                className={`text-xs ${
                                  i === 0 ? "text-emerald-400" : "text-gray-500"
                                }`}
                              >
                                {i === 0 ? "Active" : "Idle"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              Flutter • Updated {i === 0 ? "5m" : `${i * 2} days`} ago
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          {!sidebarCollapsed && (
            <div className="p-3 border-t border-gray-800/50">
              <div className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                  JD
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-300 truncate">
                    John Doe
                  </p>
                  <p className="text-xs text-gray-500 truncate">Free Plan</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />

          <div className="flex-1 overflow-hidden bg-[#0d0d0f] flex">
            {view === "ide" ? (
              <>
                {/* IDE Editor Area */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex-1 overflow-hidden">{children}</div>
                </div>
              </>
            ) : (
              /* Projects View */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md px-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto">
                    <FolderOpen size={32} className="text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-200">
                    Your Projects
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Select a project from the sidebar to start editing, or create
                    a new one to begin building.
                  </p>
                  <button
                    onClick={() => setView("ide")}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors text-sm font-medium"
                  >
                    Go to Workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </BuildProvider>
  );
}
