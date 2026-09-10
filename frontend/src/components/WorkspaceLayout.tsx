"use client";

import { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BuildProvider, useBuild } from "@/context/BuildContext";
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  FolderOpen,
  Folder,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  CloudOff,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Logo } from "./Logo";
import { AuthGate } from "./AuthGate";
import type { Project } from "@/lib/api";

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 5) return "just now";
  const m = Math.floor(s / 60);
  if (m < 1) return `${s}s ago`;
  const h = Math.floor(m / 60);
  if (h < 1) return `${m}m ago`;
  const d = Math.floor(h / 24);
  if (d < 1) return `${h}h ago`;
  return `${d}d ago`;
}

export function ChatWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <BuildProvider>
        <WorkspaceApp>{children}</WorkspaceApp>
      </BuildProvider>
    </AuthProvider>
  );
}

function WorkspaceApp({ children }: { children: React.ReactNode }) {
  const { initializing, user } = useAuth();

  if (initializing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a] text-gray-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-gray-500" />
          <p className="text-sm">Checking session...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthGate />;

  return <WorkspaceShell>{children}</WorkspaceShell>;
}

type ProjectModal = { kind: "create" } | { kind: "rename"; project: Project } | null;

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const {
    project,
    projects,
    projectsLoading,
    initError,
    selectProject,
    createProject,
    renameProject,
    deleteProject,
    refreshProjects,
    retryInit,
  } = useBuild();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [projModal, setProjModal] = useState<ProjectModal>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (p: Project) => {
    const ok = window.confirm(
      `Delete project "${p.name}"? This removes its files and previews.`
    );
    if (!ok) return;
    setDeletingId(p.id);
    try {
      await deleteProject(p.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#0a0a0a] text-gray-200 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? "w-16" : "w-72"
        } bg-gradient-to-b from-[#111115] to-[#0d0d0f] border-r border-gray-800/50 flex flex-col transition-all duration-300 relative shrink-0`}
      >
        <div className="h-14 flex items-center justify-between px-3 border-b border-gray-800/50 shrink-0">
          {!collapsed ? (
            <Logo className="scale-[0.95]" showText />
          ) : (
            <Logo className="scale-90" showText={false} />
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 hover:bg-white/5 rounded-md transition-colors ml-auto"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* New project */}
        <div className="p-3 border-b border-gray-800/50">
          {collapsed ? (
            <button
              onClick={() => setProjModal({ kind: "create" })}
              className="w-full flex items-center justify-center p-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-400 transition-colors"
              title="New project"
            >
              <Plus size={18} />
            </button>
          ) : (
            <button
              onClick={() => setProjModal({ kind: "create" })}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            >
              <FolderPlus size={16} />
              New Project
            </button>
          )}
        </div>

        {/* Project list */}
        {!collapsed && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 tracking-wide">
                PROJECTS
              </span>
              <button
                onClick={() => void refreshProjects()}
                className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-gray-300"
                title="Refresh projects"
              >
                <RefreshCw size={13} />
              </button>
            </div>
            <div className="flex-1 px-3 pb-3 overflow-y-auto space-y-1.5 min-h-0">
              {projectsLoading && projects.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 px-2 py-3">
                  <Loader2 size={13} className="animate-spin" />
                  Loading projects...
                </div>
              ) : projects.length === 0 ? (
                <p className="text-xs text-gray-500 px-2 py-3">
                  No projects yet. Create one to start building.
                </p>
              ) : (
                projects.map((p) => {
                  const active = project?.id === p.id;
                  const deleting = deletingId === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => void selectProject(p.id)}
                      className={`group cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                        active
                          ? "bg-blue-600/10 border-blue-500/25"
                          : "border-transparent hover:bg-white/5 hover:border-gray-700/60"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {deleting ? (
                          <Loader2 size={15} className="animate-spin text-gray-400 shrink-0" />
                        ) : (
                          <Folder
                            size={15}
                            className={`shrink-0 ${
                              active ? "text-blue-400" : "text-gray-500"
                            }`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm truncate ${
                              active ? "text-blue-300" : "text-gray-200"
                            }`}
                          >
                            {p.name}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Updated {timeAgo(p.updated_at) || "recently"}
                          </p>
                        </div>
                        {!deleting && (
                          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjModal({ kind: "rename", project: p });
                              }}
                              className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-gray-200"
                              title="Rename"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDelete(p);
                              }}
                              className="p-1 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* User footer */}
        <div className="p-3 border-t border-gray-800/50 shrink-0">
          {collapsed ? (
            <button
              onClick={() => void logout()}
              className="w-full flex items-center justify-center p-2 hover:bg-white/5 rounded-lg text-gray-400"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
                {user?.email?.charAt(0) ?? "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => void logout()}
                className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-gray-200"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />

        <div className="flex-1 overflow-hidden bg-[#0d0d0f] flex min-h-0">
          {initError ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto">
                  <CloudOff size={30} className="text-red-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-200">
                  Can&apos;t reach the backend
                </h3>
                <p className="text-gray-400 text-sm">{initError}</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={retryInit}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
                  >
                    <RefreshCw size={15} />
                    Retry
                  </button>
                </div>
              </div>
            </div>
          ) : project ? (
            <div
              key={project.id}
              className="flex-1 flex flex-col min-w-0 overflow-hidden"
            >
              {children}
            </div>
          ) : (
            <NoProjectView onOpenProject={(id) => void selectProject(id)} />
          )}
        </div>
      </div>

      {projModal && (
        <ProjectModalView
          kind={projModal.kind}
          project={projModal.kind === "rename" ? projModal.project : null}
          onCancel={() => setProjModal(null)}
          onSubmit={async (name) => {
            if (projModal.kind === "rename" && projModal.project) {
              await renameProject(projModal.project.id, name);
            } else {
              await createProject(name);
            }
          }}
        />
      )}
    </div>
  );
}

function NoProjectView({
  onOpenProject,
}: {
  onOpenProject: (id: string) => void;
}) {
  const { projects, projectsLoading, createProject, renameProject } = useBuild();
  const [projModal, setProjModal] = useState<ProjectModal>(null);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-6">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto">
          <FolderOpen size={30} className="text-white" />
        </div>
        {projectsLoading ? (
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" />
            Loading your projects...
          </div>
        ) : projects.length > 0 ? (
          <>
            <h3 className="text-xl font-semibold text-gray-200">
              Select a project
            </h3>
            <p className="text-gray-400 text-sm">
              Choose a project below to open its workspace.
            </p>
            <div className="space-y-2 mt-2 text-left max-h-64 overflow-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-800 bg-white/5 hover:bg-white/10 transition-colors text-left"
                >
                  <Folder size={16} className="text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">
                      {p.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Updated {timeAgo(p.updated_at) || "recently"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h3 className="text-xl font-semibold text-gray-200">
              Create your first project
            </h3>
            <p className="text-gray-400 text-sm">
              You don&apos;t have any projects yet. Scaffold a fresh Flutter app
              in seconds and start building with AI.
            </p>
          </>
        )}
        <div>
          <button
            onClick={() => setProjModal({ kind: "create" })}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            New Project
          </button>
        </div>
      </div>

      {projModal && (
        <ProjectModalView
          kind={projModal.kind}
          project={projModal.kind === "rename" ? projModal.project : null}
          onCancel={() => setProjModal(null)}
          onSubmit={async (name) => {
            if (projModal.kind === "rename" && projModal.project) {
              await renameProject(projModal.project.id, name);
            } else {
              await createProject(name);
            }
          }}
        />
      )}
    </div>
  );
}

function ProjectModalView({
  kind,
  project,
  onCancel,
  onSubmit,
}: {
  kind: "create" | "rename";
  project: Project | null;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(project?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-[#252526] border border-[#3e3e42] rounded-lg shadow-2xl p-4 w-96">
        <p className="text-sm font-medium text-gray-200 mb-1">
          {kind === "create" ? "New project" : "Rename project"}
        </p>
        {kind === "create" && (
          <p className="text-xs text-gray-500 mb-3">
            A Flutter project is scaffolded on the server. First creation can
            take a little while.
          </p>
        )}
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") onCancel();
          }}
          disabled={busy}
          className="w-full bg-[#1e1e1e] border border-[#3e3e42] rounded px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/60 disabled:opacity-60"
          placeholder="My Flutter App"
        />
        {error && (
          <p className="text-xs text-red-400 mt-2 bg-red-950/40 border border-red-900 rounded px-2 py-1.5">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded border border-[#3e3e42] hover:bg-[#1e1e1e] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 font-medium"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy ? (kind === "create" ? "Scaffolding..." : "Saving...") : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
