'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import Image from 'next/image';
import Button from '@/components/common/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { canManageUserRoles, isGlobalAdmin } from '@/lib/user-role';

interface Project {
  id: string;
  name: string;
  description?: string;
  norm: string;
  minRoleToView: string;
  updatedAt: string;
  canDelete?: boolean;
  completionPercent?: number;
  totalMeasures?: number;
  completedMeasures?: number;
}

interface TrashedProject {
  id: string;
  name: string;
  description?: string;
  norm: string;
  minRoleToView: string;
  deletedAt: string;
  expiresAt: string;
  daysRemaining: number;
  retentionDays: number;
  canRestore?: boolean;
}

type ProjectMinRole = 'any' | 'viewer' | 'editor' | 'admin' | 'private';
type ProjectNorm = 'IEC 62443' | 'IEC 61508' | 'ISO 27001' | 'NIST CSF' | 'None';
type GlobalUserRole = 'Viewer' | 'Editor' | 'Admin';

interface ManagedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  role: GlobalUserRole;
  createdAt: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [trashedProjects, setTrashedProjects] = useState<TrashedProject[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    norm: 'IEC 62443' as ProjectNorm,
    minRoleToView: 'private' as ProjectMinRole,
  });
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedTrashedProjectIds, setSelectedTrashedProjectIds] = useState<string[]>([]);
  const [isExportingProjects, setIsExportingProjects] = useState(false);
  const [isImportingProjects, setIsImportingProjects] = useState(false);
  const [isDeletingSelectedProjects, setIsDeletingSelectedProjects] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [pendingProjectDelete, setPendingProjectDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [restoringProjectId, setRestoringProjectId] = useState<string | null>(null);
  const [permanentlyDeletingProjectId, setPermanentlyDeletingProjectId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const hasFetchedProjectsOnStartRef = useRef(false);
  const hasFetchedUsersOnStartRef = useRef(false);
  const canManageRoles = canManageUserRoles(session?.user?.role);
  const isGlobalAdminUser = isGlobalAdmin(session?.user?.role);
  const normalizedProjectSearch = projectSearch.trim().toLowerCase();
  const filteredProjects = useMemo(() => {
    if (!normalizedProjectSearch) {
      return projects;
    }

    return projects.filter((project) => {
      const searchable = [
        project.name,
        project.description || '',
        project.norm,
        project.minRoleToView,
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(normalizedProjectSearch);
    });
  }, [normalizedProjectSearch, projects]);
  const selectedProjectIdSet = useMemo(() => new Set(selectedProjectIds), [selectedProjectIds]);
  const selectedTrashedProjectIdSet = useMemo(
    () => new Set(selectedTrashedProjectIds),
    [selectedTrashedProjectIds]
  );
  const selectedDeletableProjectIds = useMemo(() => {
    const deletableById = new Map(
      projects.filter((project) => project.canDelete).map((project) => [project.id, project])
    );
    return selectedProjectIds.filter((projectId) => deletableById.has(projectId));
  }, [projects, selectedProjectIds]);
  const selectedDeletableTrashedProjectIds = useMemo(() => {
    const deletableById = new Map(
      trashedProjects
        .filter((project) => project.canRestore)
        .map((project) => [project.id, project])
    );
    return selectedTrashedProjectIds.filter((projectId) => deletableById.has(projectId));
  }, [selectedTrashedProjectIds, trashedProjects]);
  const totalSelectedProjectsCount = selectedProjectIds.length + selectedTrashedProjectIds.length;
  const totalSelectedDeletableProjectsCount =
    selectedDeletableProjectIds.length + selectedDeletableTrashedProjectIds.length;
  const hasProjects = projects.length > 0;

  useEffect(() => {
    if (status === 'unauthenticated') {
      hasFetchedProjectsOnStartRef.current = false;
      hasFetchedUsersOnStartRef.current = false;
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated' && !hasFetchedProjectsOnStartRef.current) {
      hasFetchedProjectsOnStartRef.current = true;
      void fetchProjects();
    }
  }, [status]);

  useEffect(() => {
    if (status === 'authenticated' && canManageRoles && !hasFetchedUsersOnStartRef.current) {
      hasFetchedUsersOnStartRef.current = true;
      void fetchUsers();
    }
  }, [status, canManageRoles]);

  useEffect(() => {
    setSelectedProjectIds((previous) => {
      const existingProjectIds = new Set(projects.map((project) => project.id));
      const nextSelection = previous.filter((projectId) => existingProjectIds.has(projectId));
      return nextSelection.length === previous.length ? previous : nextSelection;
    });
  }, [projects]);

  useEffect(() => {
    setSelectedTrashedProjectIds((previous) => {
      const existingProjectIds = new Set(trashedProjects.map((project) => project.id));
      const nextSelection = previous.filter((projectId) => existingProjectIds.has(projectId));
      return nextSelection.length === previous.length ? previous : nextSelection;
    });
  }, [trashedProjects]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      setError('');
      const activeResponse = await fetch('/api/projects');
      if (!activeResponse.ok) {
        const payload = (await activeResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Failed to fetch projects');
      }

      const activeData = (await activeResponse.json()) as Project[];
      let trashData: TrashedProject[] = [];
      const trashResponse = await fetch('/api/project-recycle-bin');
      if (trashResponse.ok) {
        trashData = (await trashResponse.json()) as TrashedProject[];
      }

      setProjects(activeData);
      setTrashedProjects(trashData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setIsUsersLoading(true);
      setUsersError('');
      const response = await fetch('/api/users');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch users');
      }
      const data = (await response.json()) as ManagedUser[];
      setUsers(data);
    } catch (err) {
      setUsersError((err as Error).message);
    } finally {
      setIsUsersLoading(false);
    }
  };

  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (isCreatingProject) {
      return;
    }

    const normalizedName = newProject.name.trim();
    if (!normalizedName) {
      setError('Project name is required.');
      return;
    }

    try {
      setIsCreatingProject(true);
      setError('');
      setSuccessMessage('');
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          description: newProject.description.trim(),
          norm: newProject.norm,
          minRoleToView: newProject.minRoleToView,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to create project');
      }
      const project = (await response.json()) as Project;
      if (!project?.id) {
        throw new Error('Project was created but no project id was returned');
      }
      setShowNewProjectForm(false);
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (deletingProjectId) {
      return;
    }

    try {
      setDeletingProjectId(projectId);
      setError('');
      setSuccessMessage('');
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to delete project');
      }

      await fetchProjects();
      setPendingProjectDelete(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleRestoreProject = async (projectId: string) => {
    if (restoringProjectId) {
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      setRestoringProjectId(projectId);
      const response = await fetch(`/api/projects/${projectId}/restore`, {
        method: 'POST',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to restore project');
      }

      await fetchProjects();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoringProjectId(null);
    }
  };

  const handleDeleteProjectPermanently = async (projectId: string) => {
    if (permanentlyDeletingProjectId) {
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      setPermanentlyDeletingProjectId(projectId);
      const response = await fetch(`/api/projects/${projectId}?permanent=true`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to permanently delete project');
      }

      await fetchProjects();
      setSuccessMessage('Project permanently deleted.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPermanentlyDeletingProjectId(null);
    }
  };

  const handleUpdateUserRole = async (userId: string, role: GlobalUserRole) => {
    try {
      setUsersError('');
      setUpdatingUserId(userId);

      const response = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to update user role');
      }

      const updatedUser = (await response.json()) as ManagedUser;
      setUsers((prev) => prev.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
    } catch (err) {
      setUsersError((err as Error).message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!isGlobalAdminUser) {
      return;
    }

    try {
      setUsersError('');
      setDeletingUserId(userId);

      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to delete user');
      }

      setUsers((prev) => prev.filter((user) => user.id !== userId));
    } catch (err) {
      setUsersError((err as Error).message);
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleConfirmProjectDelete = async () => {
    if (!pendingProjectDelete) {
      return;
    }
    await handleDeleteProject(pendingProjectDelete.id);
  };

  const handleToggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((previous) =>
      previous.includes(projectId)
        ? previous.filter((selectedProjectId) => selectedProjectId !== projectId)
        : [...previous, projectId]
    );
  };

  const handleToggleTrashedProjectSelection = (projectId: string) => {
    setSelectedTrashedProjectIds((previous) =>
      previous.includes(projectId)
        ? previous.filter((selectedProjectId) => selectedProjectId !== projectId)
        : [...previous, projectId]
    );
  };

  const handleExportSelectedProjects = async () => {
    if (!hasProjects || isExportingProjects || selectedProjectIds.length === 0) {
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      setIsExportingProjects(true);

      const response = await fetch('/api/project-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: selectedProjectIds }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            projects?: unknown[];
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to export selected projects');
      }

      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const fileName = `secudo-project-export-${timestamp}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      const exportedCount = Array.isArray(payload?.projects) ? payload.projects.length : selectedProjectIds.length;
      setSuccessMessage(`Exported ${exportedCount} project(s).`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExportingProjects(false);
    }
  };

  const handleImportButtonClick = () => {
    if (isImportingProjects || isExportingProjects || isDeletingSelectedProjects) {
      return;
    }
    importFileInputRef.current?.click();
  };

  const handleImportProjects = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0 || isImportingProjects) {
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      setIsImportingProjects(true);

      const importedProjectPayloads: unknown[] = [];

      for (const file of files) {
        const fileText = await file.text();
        let parsed: unknown;

        try {
          parsed = JSON.parse(fileText);
        } catch {
          throw new Error(`Invalid JSON in file "${file.name}"`);
        }

        if (Array.isArray(parsed)) {
          importedProjectPayloads.push(...parsed);
          continue;
        }

        if (!parsed || typeof parsed !== 'object') {
          throw new Error(`Unsupported import format in file "${file.name}"`);
        }

        const parsedRecord = parsed as Record<string, unknown>;
        if (!Array.isArray(parsedRecord.projects) || parsedRecord.projects.length === 0) {
          throw new Error(`No projects found in file "${file.name}"`);
        }

        importedProjectPayloads.push(...parsedRecord.projects);
      }

      if (importedProjectPayloads.length === 0) {
        throw new Error('No projects found to import');
      }

      const response = await fetch('/api/project-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'secudo-project-export',
          version: 1,
          projects: importedProjectPayloads,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            importedCount?: number;
            failedCount?: number;
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to import project bundle');
      }

      const importedCount = typeof payload?.importedCount === 'number' ? payload.importedCount : 0;
      const failedCount = typeof payload?.failedCount === 'number' ? payload.failedCount : 0;

      if (failedCount > 0) {
        setError(`Imported ${importedCount} project(s), ${failedCount} failed.`);
      } else {
        setSuccessMessage(`Imported ${importedCount} project(s).`);
      }

      await fetchProjects();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      event.target.value = '';
      setIsImportingProjects(false);
    }
  };

  const handleDeleteSelectedProjects = async () => {
    if (isDeletingSelectedProjects || totalSelectedProjectsCount === 0) {
      return;
    }

    if (totalSelectedDeletableProjectsCount === 0) {
      setError('None of the selected projects can be deleted.');
      return;
    }

    const confirmationLines = ['Delete selected project(s)?'];
    if (selectedDeletableProjectIds.length > 0) {
      confirmationLines.push(
        `- Move ${selectedDeletableProjectIds.length} active project(s) to Recycle Bin`
      );
    }
    if (selectedDeletableTrashedProjectIds.length > 0) {
      confirmationLines.push(
        `- Permanently delete ${selectedDeletableTrashedProjectIds.length} project(s) from Recycle Bin`
      );
    }
    const confirmationText = confirmationLines.join('\n');

    if (!window.confirm(confirmationText)) {
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      setIsDeletingSelectedProjects(true);

      const [activeDeleteResults, trashDeleteResults] = await Promise.all([
        Promise.allSettled(
          selectedDeletableProjectIds.map(async (projectId) => {
            const response = await fetch(`/api/projects/${projectId}`, {
              method: 'DELETE',
            });
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) {
              throw new Error(payload.error || `Failed to delete project ${projectId}`);
            }
            return projectId;
          })
        ),
        Promise.allSettled(
          selectedDeletableTrashedProjectIds.map(async (projectId) => {
            const response = await fetch(`/api/projects/${projectId}?permanent=true`, {
              method: 'DELETE',
            });
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) {
              throw new Error(payload.error || `Failed to permanently delete project ${projectId}`);
            }
            return projectId;
          })
        ),
      ]);

      await fetchProjects();
      const activeDeletedCount = activeDeleteResults.filter(
        (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled'
      ).length;
      const permanentlyDeletedCount = trashDeleteResults.filter(
        (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled'
      ).length;
      const failedResults = [...activeDeleteResults, ...trashDeleteResults].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      const skippedActiveCount = selectedProjectIds.length - selectedDeletableProjectIds.length;
      const skippedTrashedCount =
        selectedTrashedProjectIds.length - selectedDeletableTrashedProjectIds.length;
      const skippedCount = skippedActiveCount + skippedTrashedCount;

      const successParts: string[] = [];
      if (activeDeletedCount > 0) {
        successParts.push(`${activeDeletedCount} moved to Recycle Bin`);
      }
      if (permanentlyDeletedCount > 0) {
        successParts.push(`${permanentlyDeletedCount} permanently deleted`);
      }
      if (successParts.length > 0) {
        const skippedText = skippedCount > 0 ? ` ${skippedCount} skipped (no delete permission).` : '';
        setSuccessMessage(`Deleted projects: ${successParts.join(', ')}.${skippedText}`);
      }

      if (failedResults.length > 0) {
        const firstFailure = failedResults[0].reason;
        const firstFailureMessage =
          firstFailure instanceof Error ? firstFailure.message : 'Unknown deletion error';
        setError(`Failed to delete ${failedResults.length} project(s). ${firstFailureMessage}`);
      } else if (activeDeletedCount === 0 && permanentlyDeletedCount === 0) {
        setError('No selected projects were deleted.');
      }
    } catch (err) {
      setError((err as Error).message);
      await fetchProjects();
    } finally {
      setIsDeletingSelectedProjects(false);
    }
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/dashboard" className="inline-flex items-center gap-3">
            <Image src="/secudo-logo.png?v=20260212c" alt="Secudo logo" width={144} height={144} className="secudo-brand-logo h-36 w-36 object-contain" priority />
            <span className="secudo-brand-wordmark text-4xl font-bold">
              SECUDO
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Profile</p>
              <p className="text-sm text-slate-200">{session?.user?.name || session?.user?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ redirect: true, callbackUrl: '/login' })}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-4xl font-bold text-white mb-2">Projects</h2>
            <p className="text-slate-400">Manage your security assessment projects</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => void handleDeleteSelectedProjects()}
                disabled={
                  totalSelectedProjectsCount === 0 ||
                  totalSelectedDeletableProjectsCount === 0 ||
                  isDeletingSelectedProjects ||
                  isExportingProjects ||
                  isImportingProjects ||
                  Boolean(restoringProjectId) ||
                  Boolean(permanentlyDeletingProjectId)
                }
                className="rounded border border-red-500/40 bg-red-900/20 px-4 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-900/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingSelectedProjects ? 'Deleting...' : 'Delete Selected'}
              </button>
              <button
                type="button"
                onClick={() => void handleExportSelectedProjects()}
                disabled={
                  !hasProjects ||
                  selectedProjectIds.length === 0 ||
                  isExportingProjects ||
                  isImportingProjects ||
                  isDeletingSelectedProjects ||
                  Boolean(restoringProjectId) ||
                  Boolean(permanentlyDeletingProjectId)
                }
                className="rounded border border-cyan-500/40 bg-cyan-900/20 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExportingProjects ? 'Exporting...' : 'Export Selected'}
              </button>
              <button
                type="button"
                onClick={handleImportButtonClick}
                disabled={
                  isImportingProjects ||
                  isExportingProjects ||
                  isDeletingSelectedProjects ||
                  Boolean(restoringProjectId) ||
                  Boolean(permanentlyDeletingProjectId)
                }
                className="rounded border border-orange-500/40 bg-orange-900/20 px-4 py-2 text-sm font-semibold text-orange-200 transition-colors hover:bg-orange-900/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isImportingProjects ? 'Importing...' : 'Import JSON'}
              </button>
              <input
                ref={importFileInputRef}
                type="file"
                accept="application/json,.json"
                multiple
                onChange={(event) => void handleImportProjects(event)}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {error && projects.length > 0 && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-600/30 rounded text-red-200">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-6 rounded border border-emerald-600/30 bg-emerald-900/20 p-4 text-emerald-200">
            {successMessage}
          </div>
        )}

        {/* New Project Button */}
        {!showNewProjectForm && (
          <div className="mb-8">
            <Button onClick={() => setShowNewProjectForm(true)}>+ New Project</Button>
          </div>
        )}

        {/* New Project Form */}
        {showNewProjectForm && (
          <div className="mb-8 bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Create New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-slate-300 mb-1">Project Name *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-400"
                  placeholder="e.g. Manufacturing Line A"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-400"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Norm</label>
                <select
                  value={newProject.norm}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      norm: e.target.value as ProjectNorm,
                    })
                  }
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-400"
                >
                  <option value="IEC 62443">IEC 62443</option>
                  <option value="IEC 61508">IEC 61508</option>
                  <option value="ISO 27001">ISO 27001</option>
                  <option value="NIST CSF">NIST CSF</option>
                  <option value="None">None</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Minimum Role to View</label>
                <select
                  value={newProject.minRoleToView}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      minRoleToView: e.target.value as ProjectMinRole,
                    })
                  }
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-orange-400"
                >
                  <option value="any">Any authenticated user</option>
                  <option value="viewer">Viewer or higher</option>
                  <option value="editor">Editor or higher</option>
                  <option value="admin">Admin only</option>
                  <option value="private">Private (members only)</option>
                </select>
              </div>

              <div className="flex gap-4">
                <Button type="submit" disabled={isCreatingProject}>
                  {isCreatingProject ? 'Creating...' : 'Create Project'}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowNewProjectForm(false)}
                  disabled={isCreatingProject}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {!isLoading && projects.length > 0 && (
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="w-full md:max-w-md">
              <input
                type="text"
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder="Search projects..."
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white placeholder-slate-400 focus:border-orange-400 focus:outline-none"
              />
            </div>
            <p className="text-xs text-slate-400">
              {filteredProjects.length} of {projects.length} projects
            </p>
          </div>
        )}

        {/* Projects Grid */}
        {isLoading ? (
          <div className="text-center text-slate-400">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center text-slate-400">
            <p>No projects yet. Create one to get started!</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center text-slate-400">
            <p>
              No projects found for <span className="font-medium text-slate-300">{projectSearch.trim()}</span>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="group relative bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-orange-400 transition-colors hover:shadow-lg"
              >
                <label
                  className={`absolute left-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded border border-slate-500/70 bg-slate-900/85 transition-opacity ${
                    selectedProjectIdSet.has(project.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title="Select project"
                >
                  <input
                    type="checkbox"
                    checked={selectedProjectIdSet.has(project.id)}
                    onChange={() => handleToggleProjectSelection(project.id)}
                    onClick={(event) => event.stopPropagation()}
                    disabled={isExportingProjects || isImportingProjects || isDeletingSelectedProjects}
                    className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-orange-500 focus:ring-orange-400"
                    aria-label={`Select project ${project.name}`}
                  />
                </label>
                <Link href={`/projects/${project.id}`} className="block">
                  <h3 className="mb-2 inline-block text-xl font-semibold text-white transition-transform duration-200 group-hover:scale-105">
                    {project.name}
                  </h3>
                </Link>
                <p className="mb-4 min-h-[1.25rem] text-sm text-slate-400">
                  {project.description?.trim() ? project.description : <span className="invisible">No description</span>}
                </p>
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Completion</span>
                    <span className="font-semibold text-slate-200">{project.completionPercent ?? 0}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded bg-slate-700">
                    <div
                      className="h-1.5 rounded bg-emerald-400 transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, project.completionPercent ?? 0))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {project.completedMeasures ?? 0}/{project.totalMeasures ?? 0} measures done
                  </p>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-700 px-2 py-1 rounded">{project.norm}</span>
                    <span className="bg-slate-700 px-2 py-1 rounded">
                      {project.minRoleToView === 'any' && 'Public (Any)'}
                      {project.minRoleToView === 'viewer' && 'Viewer+'}
                      {project.minRoleToView === 'editor' && 'Editor+'}
                      {project.minRoleToView === 'admin' && 'Admin'}
                      {project.minRoleToView === 'private' && 'Private'}
                    </span>
                  </div>
                  <span>Last updated: {new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="mt-4 flex items-center justify-end gap-3">
                  {project.canDelete && (
                    <button
                      type="button"
                      onClick={() => setPendingProjectDelete({ id: project.id, name: project.name })}
                      disabled={Boolean(deletingProjectId)}
                        className="rounded border border-red-500/40 bg-red-900/20 px-3 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && (
          <section className="mt-10">
            <div className="mb-4">
              <h3 className="text-2xl font-bold text-white">Recycle Bin</h3>
              <p className="text-slate-400">
                Deleted projects stay here for 30 days and can be restored or permanently deleted.
              </p>
            </div>
            {trashedProjects.length === 0 ? (
              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-5 text-sm text-slate-400">
                Recycle Bin is empty.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {trashedProjects.map((project) => (
                  <div
                    key={project.id}
                    className="group relative rounded-lg border border-slate-700 bg-slate-800/40 p-5"
                  >
                    <label
                      className={`absolute left-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded border border-slate-500/70 bg-slate-900/85 transition-opacity ${
                        selectedTrashedProjectIdSet.has(project.id)
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title={project.canRestore ? 'Select recycle bin project' : 'No delete permission'}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTrashedProjectIdSet.has(project.id)}
                        onChange={() => handleToggleTrashedProjectSelection(project.id)}
                        onClick={(event) => event.stopPropagation()}
                        disabled={
                          !project.canRestore ||
                          isExportingProjects ||
                          isImportingProjects ||
                          isDeletingSelectedProjects ||
                          Boolean(restoringProjectId) ||
                          Boolean(permanentlyDeletingProjectId)
                        }
                        className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-orange-500 focus:ring-orange-400"
                        aria-label={`Select recycle bin project ${project.name}`}
                      />
                    </label>
                    <h4 className="text-lg font-semibold text-white">{project.name}</h4>
                    <p className="mt-1 text-sm text-slate-400">
                      {project.description?.trim() || 'No description'}
                    </p>
                    <div className="mt-3 space-y-1 text-xs text-slate-400">
                      <p>Deleted: {new Date(project.deletedAt).toLocaleString()}</p>
                      <p>Permanently deleted in: {project.daysRemaining} day(s)</p>
                    </div>
                    {project.canRestore ? (
                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          onClick={() => void handleRestoreProject(project.id)}
                          disabled={
                            Boolean(restoringProjectId) ||
                            Boolean(permanentlyDeletingProjectId) ||
                            isDeletingSelectedProjects
                          }
                          className="w-full rounded border border-cyan-500/40 bg-cyan-900/20 px-3 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {restoringProjectId === project.id ? 'Restoring...' : 'Restore Project'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProjectPermanently(project.id)}
                          disabled={
                            Boolean(restoringProjectId) ||
                            Boolean(permanentlyDeletingProjectId) ||
                            isDeletingSelectedProjects
                          }
                          className="w-full rounded border border-red-500/40 bg-red-900/25 px-3 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {permanentlyDeletingProjectId === project.id ? 'Deleting...' : 'Delete Permanently'}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-slate-500">No restore permission.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {canManageRoles && (
          <section className="mt-14">
            <div className="mb-5">
              <h2 className="text-3xl font-bold text-white mb-2">User Role Management</h2>
              <p className="text-slate-400">Assign global roles for all users.</p>
            </div>

            {usersError && (
              <div className="mb-4 rounded border border-red-600/30 bg-red-900/20 p-3 text-sm text-red-200">
                {usersError}
              </div>
            )}

            {isUsersLoading ? (
              <div className="text-slate-400">Loading users...</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-800/50">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-slate-300">
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      {isGlobalAdminUser && <th className="px-4 py-3 font-semibold">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-700/60 text-slate-200">
                        <td className="px-4 py-3">
                          {user.firstName || user.lastName
                            ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                            : user.name || '-'}
                        </td>
                        <td className="px-4 py-3">{user.email}</td>
                        <td className="px-4 py-3">
                          <select
                            value={user.role}
                            disabled={updatingUserId === user.id || deletingUserId === user.id}
                            onChange={(event) =>
                              void handleUpdateUserRole(user.id, event.target.value as GlobalUserRole)
                            }
                            className="rounded border border-slate-600 bg-slate-700 px-3 py-1 text-white focus:border-orange-400 focus:outline-none disabled:opacity-60"
                          >
                            <option value="Viewer">Viewer</option>
                            <option value="Editor">Editor</option>
                            <option value="Admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        {isGlobalAdminUser && (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={deletingUserId === user.id || user.id === session?.user?.id}
                              onClick={() => void handleDeleteUser(user.id)}
                              className="rounded border border-red-500/40 bg-red-900/20 px-3 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-900/35 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingUserId === user.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      <Dialog
        open={pendingProjectDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingProjectId) {
            setPendingProjectDelete(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                {`Move project "${pendingProjectDelete?.name || ''}" to the Recycle Bin?`}
              </DialogDescription>
            </DialogHeader>
          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => setPendingProjectDelete(null)}
              disabled={Boolean(deletingProjectId)}
              className="rounded border border-slate-600 bg-slate-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmProjectDelete()}
              disabled={Boolean(deletingProjectId)}
              className="rounded border border-red-500/40 bg-red-900/30 px-4 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-900/45 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingProjectId ? 'Deleting...' : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

