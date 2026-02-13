'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/common/Button';
import { PROJECT_NORMS, parseProjectNorms } from '@/lib/project-norm';
import type { ProjectNorm } from '@/lib/project-norm';

interface ProjectSettingsProject {
  name: string;
  description?: string | null;
  norm: string;
  minRoleToView: string;
}

type ProjectMemberRole = 'Viewer' | 'Editor' | 'Admin';

interface ProjectMember {
  userId: string;
  role: ProjectMemberRole;
  isCreator: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface ProjectSettingsProps {
  projectId: string;
  project: ProjectSettingsProject;
  canManageSettings?: boolean;
  onProjectUpdated?: (updates: Partial<ProjectSettingsProject>) => void;
}

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private (members only)' },
  { value: 'viewer', label: 'Members (Viewer+)' },
  { value: 'editor', label: 'Editors+' },
  { value: 'admin', label: 'Admin only' },
  { value: 'any', label: 'Public (anyone)' },
] as const;

const MEMBER_ROLE_OPTIONS: Array<{ value: ProjectMemberRole; label: string }> = [
  { value: 'Viewer', label: 'Viewer' },
  { value: 'Editor', label: 'Editor' },
  { value: 'Admin', label: 'Project Admin' },
];

function normalizeNormsForForm(rawNorm: string): ProjectNorm[] {
  const parsed = parseProjectNorms(rawNorm).filter(
    (value): value is ProjectNorm => PROJECT_NORMS.includes(value as ProjectNorm)
  );
  return parsed.length > 0 ? parsed : ['IEC 62443'];
}

function normalizeVisibilityForForm(rawValue: string | null | undefined): 'private' | 'viewer' | 'editor' | 'admin' | 'any' {
  const value = (rawValue || '').toLowerCase();
  if (value === 'private') return 'private';
  if (value === 'viewer') return 'viewer';
  if (value === 'editor') return 'editor';
  if (value === 'user') return 'editor';
  if (value === 'admin') return 'admin';
  if (value === 'any') return 'any';
  return 'viewer';
}

function getUserDisplayName(member: ProjectMember): string {
  const firstName = member.user.firstName?.trim() || '';
  const lastName = member.user.lastName?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) {
    return fullName;
  }
  return member.user.name || member.user.email;
}

export default function ProjectSettings({
  projectId,
  project,
  canManageSettings = false,
  onProjectUpdated,
}: ProjectSettingsProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [norms, setNorms] = useState<ProjectNorm[]>(normalizeNormsForForm(project.norm));
  const [minRoleToView, setMinRoleToView] = useState<string>(normalizeVisibilityForForm(project.minRoleToView));
  const [isSaving, setIsSaving] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [updatingMemberUserId, setUpdatingMemberUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(project.name);
    setDescription(project.description || '');
    setNorms(normalizeNormsForForm(project.norm));
    setMinRoleToView(normalizeVisibilityForForm(project.minRoleToView));
  }, [project.description, project.minRoleToView, project.name, project.norm]);

  const hasChanges = useMemo(() => {
    const originalNorms = normalizeNormsForForm(project.norm);
    const normChanged =
      norms.length !== originalNorms.length ||
      norms.some((value, index) => value !== originalNorms[index]);

    return (
      name.trim() !== project.name ||
      description.trim() !== (project.description || '') ||
      normChanged ||
      minRoleToView !== normalizeVisibilityForForm(project.minRoleToView)
    );
  }, [description, minRoleToView, name, norms, project.description, project.minRoleToView, project.name, project.norm]);

  const fetchMembers = async () => {
    if (!canManageSettings) {
      setMembers([]);
      return;
    }

    try {
      setIsMembersLoading(true);
      setMembersError('');
      const response = await fetch(`/api/projects/${projectId}/members`);
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        members?: ProjectMember[];
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch project members');
      }

      setMembers(Array.isArray(payload.members) ? payload.members : []);
    } catch (membersFetchError) {
      setMembersError((membersFetchError as Error).message);
    } finally {
      setIsMembersLoading(false);
    }
  };

  useEffect(() => {
    void fetchMembers();
  }, [projectId, canManageSettings]);

  const toggleProjectNormSelection = (norm: ProjectNorm) => {
    setNorms((previous) => {
      if (norm === 'None') {
        return ['None'];
      }

      const withoutNone = previous.filter((entry) => entry !== 'None');
      const alreadySelected = withoutNone.includes(norm);
      const nextNorms = alreadySelected
        ? withoutNone.filter((entry) => entry !== norm)
        : [...withoutNone, norm];

      return nextNorms.length > 0 ? nextNorms : ['IEC 62443'];
    });
  };

  const handleSave = async () => {
    if (!canManageSettings || isSaving) {
      return;
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      setError('Project name is required.');
      return;
    }

    if (norms.length === 0) {
      setError('Select at least one norm.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      setMessage('');

      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          description: description.trim(),
          norms,
          minRoleToView,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        name?: string;
        description?: string | null;
        norm?: string;
        minRoleToView?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save settings');
      }

      setMessage('Project settings saved.');
      onProjectUpdated?.({
        name: payload.name ?? normalizedName,
        description: payload.description ?? description.trim(),
        norm: payload.norm ?? project.norm,
        minRoleToView: normalizeVisibilityForForm(payload.minRoleToView ?? minRoleToView),
      });
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateMemberRole = async (memberUserId: string, role: ProjectMemberRole) => {
    if (!canManageSettings || updatingMemberUserId) {
      return;
    }

    try {
      setUpdatingMemberUserId(memberUserId);
      setMembersError('');
      setMessage('');
      const response = await fetch(`/api/projects/${projectId}/members/${memberUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        userId?: string;
        role?: ProjectMemberRole;
        isCreator?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update member role');
      }

      setMembers((previous) =>
        previous.map((member) =>
          member.userId === memberUserId
            ? {
                ...member,
                role: payload.role ?? role,
                isCreator: payload.isCreator ?? member.isCreator,
              }
            : member
        )
      );
      setMessage('Member role updated.');
    } catch (roleUpdateError) {
      setMembersError((roleUpdateError as Error).message);
    } finally {
      setUpdatingMemberUserId(null);
    }
  };

  return (
    <section className="space-y-6 rounded-lg border border-slate-700 bg-slate-800/50 p-6">
      <div>
        <h3 className="text-xl font-semibold text-white">Project Settings</h3>
        <p className="text-sm text-slate-400">
          Configure project metadata, norms, visibility, and member access roles.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-600/40 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      {message ? (
        <div className="rounded border border-emerald-600/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">{message}</div>
      ) : null}

      {!canManageSettings ? (
        <div className="rounded border border-slate-600/40 bg-slate-900/50 p-3 text-sm text-slate-300">
          Read-only mode: only the project creator and project admins can change settings.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-slate-300">Project Name *</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canManageSettings || isSaving}
            className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="e.g. Manufacturing Line A"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-slate-300">Description</label>
            <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!canManageSettings || isSaving}
            rows={3}
            className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Optional description"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-slate-300">Norms</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROJECT_NORMS.map((normOption) => {
              const isChecked = norms.includes(normOption);
              return (
                <label
                  key={normOption}
                  className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${
                    isChecked
                      ? 'border-orange-500/70 bg-orange-900/20 text-orange-100'
                      : 'border-slate-600 bg-slate-700 text-slate-200'
                  } ${canManageSettings && !isSaving ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!canManageSettings || isSaving}
                    onChange={() => toggleProjectNormSelection(normOption)}
                    className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-orange-500 focus:ring-orange-400"
                  />
                  <span>{normOption}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-400">You can select multiple norms. Choosing &quot;None&quot; clears all others.</p>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-slate-300">Visibility</label>
          <select
            value={minRoleToView}
            onChange={(event) => setMinRoleToView(normalizeVisibilityForForm(event.target.value))}
            disabled={!canManageSettings || isSaving}
            className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={!canManageSettings || isSaving || !hasChanges}
          onClick={() => void handleSave()}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
        {hasChanges ? <span className="text-xs text-slate-400">Unsaved changes</span> : null}
      </div>

      {canManageSettings ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-5">
          <div className="mb-4">
              <h4 className="text-lg font-semibold text-white">Project Member Roles</h4>
              <p className="text-sm text-slate-400">
              Assign Viewer, Editor, or Project Admin role.
              </p>
          </div>

          {membersError ? (
            <div className="mb-3 rounded border border-red-600/40 bg-red-900/20 p-3 text-sm text-red-200">
              {membersError}
            </div>
          ) : null}

          {isMembersLoading ? (
            <div className="text-sm text-slate-400">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="rounded border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-400">
              No project members found.
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.userId}
                  className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-800/60 px-3 py-2 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{getUserDisplayName(member)}</p>
                    <p className="truncate text-xs text-slate-400">{member.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.isCreator ? (
                      <span className="rounded bg-orange-900/30 px-2 py-0.5 text-xs font-semibold text-orange-200">
                        Creator
                      </span>
                    ) : null}
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void handleUpdateMemberRole(member.userId, event.target.value as ProjectMemberRole)
                      }
                      disabled={Boolean(updatingMemberUserId) || member.isCreator}
                      className="rounded border border-slate-600 bg-slate-700 px-3 py-1 text-xs text-white focus:border-orange-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {MEMBER_ROLE_OPTIONS.map((option) => (
                        <option key={`${member.userId}-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
