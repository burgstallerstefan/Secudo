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
type ProjectInviteRole = ProjectMemberRole;

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

interface InviteCandidateUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}

interface InviteCandidateGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

interface ProjectInviteUserSelection {
  userId: string;
  role: ProjectInviteRole;
}

interface ProjectInviteGroupSelection {
  groupId: string;
  role: ProjectInviteRole;
}

interface ProjectSettingsProps {
  projectId: string;
  project: ProjectSettingsProject;
  canManageSettings?: boolean;
  onProjectUpdated?: (updates: Partial<ProjectSettingsProject>) => void;
}

const PROJECT_INVITE_ROLE_SECTIONS: Array<{
  role: ProjectInviteRole;
  title: string;
  description: string;
}> = [
  {
    role: 'Admin',
    title: 'Invite Project Admins',
    description: 'Project Admins can edit everything including project settings.',
  },
  {
    role: 'Editor',
    title: 'Invite Editors',
    description: 'Editors can edit content, but cannot change project settings.',
  },
  {
    role: 'Viewer',
    title: 'Invite Viewers',
    description: 'Viewers can only view the project in read-only mode.',
  },
];

function normalizeNormsForForm(rawNorm: string): ProjectNorm[] {
  const parsed = parseProjectNorms(rawNorm).filter(
    (value): value is ProjectNorm => PROJECT_NORMS.includes(value as ProjectNorm)
  );
  return parsed.length > 0 ? parsed : ['IEC 62443'];
}

function getDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email: string;
}): string {
  const firstName = user.firstName?.trim() || '';
  const lastName = user.lastName?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) {
    return fullName;
  }
  return user.name || user.email;
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
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [creatorUserId, setCreatorUserId] = useState<string | null>(null);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');

  const [inviteUsers, setInviteUsers] = useState<InviteCandidateUser[]>([]);
  const [inviteGroups, setInviteGroups] = useState<InviteCandidateGroup[]>([]);
  const [isInviteCandidatesLoading, setIsInviteCandidatesLoading] = useState(false);
  const [inviteCandidatesError, setInviteCandidatesError] = useState('');

  const [invitedUsers, setInvitedUsers] = useState<ProjectInviteUserSelection[]>([]);
  const [invitedGroups, setInvitedGroups] = useState<ProjectInviteGroupSelection[]>([]);
  const [inviteSearchByRole, setInviteSearchByRole] = useState<Record<ProjectInviteRole, string>>({
    Admin: '',
    Editor: '',
    Viewer: '',
  });
  const [isSavingMemberAssignments, setIsSavingMemberAssignments] = useState(false);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description || '');
    setNorms(normalizeNormsForForm(project.norm));
  }, [project.description, project.name, project.norm]);

  const hasSettingsChanges = useMemo(() => {
    const originalNorms = normalizeNormsForForm(project.norm);
    const normChanged =
      norms.length !== originalNorms.length || norms.some((value, index) => value !== originalNorms[index]);

    return (
      name.trim() !== project.name ||
      description.trim() !== (project.description || '') ||
      normChanged
    );
  }, [description, name, norms, project.description, project.name, project.norm]);

  const membersByRole = useMemo<Record<ProjectInviteRole, ProjectMember[]>>(
    () => ({
      Admin: members.filter((member) => member.role === 'Admin'),
      Editor: members.filter((member) => member.role === 'Editor'),
      Viewer: members.filter((member) => member.role === 'Viewer'),
    }),
    [members]
  );

  const hasMemberSelectionChanges = useMemo(() => {
    if (!canManageSettings) {
      return false;
    }

    const currentRoleByUserId = new Map<string, ProjectMemberRole>();
    members.forEach((member) => {
      currentRoleByUserId.set(member.userId, member.role);
    });

    const selectedRoleByUserId = new Map<string, ProjectInviteRole>();
    invitedUsers.forEach((selection) => {
      selectedRoleByUserId.set(selection.userId, selection.role);
    });

    if (currentRoleByUserId.size !== selectedRoleByUserId.size) {
      return true;
    }

    for (const [userId, currentRole] of currentRoleByUserId.entries()) {
      if (selectedRoleByUserId.get(userId) !== currentRole) {
        return true;
      }
    }

    return invitedGroups.length > 0;
  }, [canManageSettings, invitedGroups.length, invitedUsers, members]);

  const fetchMembers = async () => {
    try {
      setIsMembersLoading(true);
      setMembersError('');
      const response = await fetch(`/api/projects/${projectId}/members`);
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        members?: ProjectMember[];
        creatorUserId?: string | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch project members');
      }

      const nextMembers = Array.isArray(payload.members) ? payload.members : [];
      setMembers(nextMembers);
      setCreatorUserId(payload.creatorUserId ?? null);

      if (canManageSettings) {
        setInvitedUsers(
          nextMembers.map((member) => ({
            userId: member.userId,
            role: member.role,
          }))
        );
        setInvitedGroups([]);
      }
    } catch (membersFetchError) {
      setMembersError((membersFetchError as Error).message);
    } finally {
      setIsMembersLoading(false);
    }
  };

  const fetchProjectInviteCandidates = async () => {
    if (!canManageSettings) {
      setInviteUsers([]);
      setInviteGroups([]);
      return;
    }

    try {
      setIsInviteCandidatesLoading(true);
      setInviteCandidatesError('');
      const response = await fetch('/api/project-invite-candidates');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch invitation candidates');
      }

      const data = (await response.json()) as {
        users: InviteCandidateUser[];
        groups: InviteCandidateGroup[];
      };
      setInviteUsers(Array.isArray(data.users) ? data.users : []);
      setInviteGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (candidatesError) {
      setInviteCandidatesError((candidatesError as Error).message);
    } finally {
      setIsInviteCandidatesLoading(false);
    }
  };

  useEffect(() => {
    void fetchMembers();
  }, [projectId, canManageSettings]);

  useEffect(() => {
    void fetchProjectInviteCandidates();
  }, [canManageSettings]);

  useEffect(() => {
    if (!canManageSettings) {
      return;
    }

    const availableUserIds = new Set(inviteUsers.map((user) => user.id));
    const availableGroupIds = new Set(inviteGroups.map((group) => group.id));
    setInvitedUsers((previous) => previous.filter((selection) => availableUserIds.has(selection.userId)));
    setInvitedGroups((previous) =>
      previous.filter((selection) => availableGroupIds.has(selection.groupId))
    );
  }, [canManageSettings, inviteGroups, inviteUsers]);

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

  const setInvitedUserRoleSelection = (userId: string, role: ProjectInviteRole, isSelected: boolean) => {
    setInvitedUsers((previous) =>
      isSelected
        ? [...previous.filter((invite) => invite.userId !== userId), { userId, role }]
        : previous.filter((invite) => invite.userId !== userId)
    );
  };

  const setInvitedGroupRoleSelection = (
    groupId: string,
    role: ProjectInviteRole,
    isSelected: boolean
  ) => {
    setInvitedGroups((previous) =>
      isSelected
        ? [...previous.filter((invite) => invite.groupId !== groupId), { groupId, role }]
        : previous.filter((invite) => invite.groupId !== groupId)
    );
  };

  const updateInviteSearch = (role: ProjectInviteRole, value: string) => {
    setInviteSearchByRole((previous) => ({
      ...previous,
      [role]: value,
    }));
  };

  const handleSaveSettings = async () => {
    if (!canManageSettings || isSavingSettings) {
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
      setIsSavingSettings(true);
      setError('');
      setMessage('');

      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          description: description.trim(),
          norms,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        name?: string;
        description?: string | null;
        norm?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save settings');
      }

      setMessage('Project settings saved.');
      onProjectUpdated?.({
        name: payload.name ?? normalizedName,
        description: payload.description ?? description.trim(),
        norm: payload.norm ?? project.norm,
      });
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveRoleAssignments = async () => {
    if (!canManageSettings || isSavingMemberAssignments) {
      return;
    }

    try {
      setIsSavingMemberAssignments(true);
      setMembersError('');
      setMessage('');
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitedUsers,
          invitedGroups,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        members?: ProjectMember[];
        creatorUserId?: string | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update project roles');
      }

      const nextMembers = Array.isArray(payload.members) ? payload.members : [];
      setMembers(nextMembers);
      setCreatorUserId(payload.creatorUserId ?? creatorUserId);
      setInvitedUsers(
        nextMembers.map((member) => ({
          userId: member.userId,
          role: member.role,
        }))
      );
      setInvitedGroups([]);
      setMessage('Project member roles updated.');
    } catch (saveRoleError) {
      setMembersError((saveRoleError as Error).message);
    } finally {
      setIsSavingMemberAssignments(false);
    }
  };

  return (
    <section className="space-y-6 rounded-lg border border-slate-700 bg-slate-800/50 p-6">
      <div>
        <h3 className="mb-1 text-xl font-semibold text-white">Project Settings</h3>
        <p className="text-sm text-slate-400">
          Configure project metadata, norms, and access roles.
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
          <label className="mb-1 block text-slate-300">Project Name *</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canManageSettings || isSavingSettings}
            className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white focus:border-orange-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="e.g. Manufacturing Line A"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-slate-300">Description</label>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!canManageSettings || isSavingSettings}
            className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white focus:border-orange-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Optional description"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-slate-300">Norms</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROJECT_NORMS.map((normOption) => {
              const isChecked = norms.includes(normOption);
              return (
                <label
                  key={normOption}
                  className={`flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors ${
                    isChecked
                      ? 'border-orange-500/70 bg-orange-900/20 text-orange-100'
                      : 'border-slate-600 bg-slate-700 text-slate-200 hover:border-slate-500'
                  } ${canManageSettings && !isSavingSettings ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!canManageSettings || isSavingSettings}
                    onChange={() => toggleProjectNormSelection(normOption)}
                    className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-orange-500 focus:ring-orange-400"
                  />
                  <span>{normOption}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            You can select multiple norms. Choosing &quot;None&quot; clears all others.
          </p>
        </div>

      </div>

      {canManageSettings ? (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={isSavingSettings || !hasSettingsChanges}
            onClick={() => void handleSaveSettings()}
          >
            {isSavingSettings ? 'Saving...' : 'Save Settings'}
          </Button>
          {hasSettingsChanges ? <span className="text-xs text-slate-400">Unsaved changes</span> : null}
        </div>
      ) : null}

      <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900/35 p-5">
        <div>
          <h4 className="text-lg font-semibold text-white">Project Access Roles</h4>
          <p className="text-sm text-slate-400">
            Same role structure as project creation. Admins can edit, viewers/editors can only view.
          </p>
        </div>

        {membersError ? (
          <div className="rounded border border-red-600/40 bg-red-900/20 p-3 text-sm text-red-200">
            {membersError}
          </div>
        ) : null}

        {isMembersLoading ? (
          <div className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-400">
            Loading role assignments...
          </div>
        ) : (
          <div className="space-y-4">
            {PROJECT_INVITE_ROLE_SECTIONS.map((section) => {
              const normalizedSearch = inviteSearchByRole[section.role].trim().toLowerCase();
              const filteredUsers = inviteUsers.filter((user) => {
                if (!normalizedSearch) {
                  return true;
                }
                const searchable = `${getDisplayName(user)} ${user.email}`.toLowerCase();
                return searchable.includes(normalizedSearch);
              });
              const filteredGroups = inviteGroups.filter((group) => {
                if (!normalizedSearch) {
                  return true;
                }
                const searchable = `${group.name} ${group.description || ''}`.toLowerCase();
                return searchable.includes(normalizedSearch);
              });
              const hasMatchingCandidates = filteredUsers.length > 0 || filteredGroups.length > 0;
              const roleMembers = membersByRole[section.role];

              return (
                <div key={`project-settings-invite-section-${section.role}`} className="rounded border border-slate-700 bg-slate-900/30 p-3">
                  <div className="mb-2">
                    <p className="text-sm font-semibold text-slate-100">{section.title}</p>
                    <p className="text-xs text-slate-400">{section.description}</p>
                  </div>

                  {canManageSettings ? (
                    <>
                      <input
                        type="text"
                        value={inviteSearchByRole[section.role]}
                        onChange={(event) => updateInviteSearch(section.role, event.target.value)}
                        className="mb-3 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-orange-400 focus:outline-none"
                        placeholder={`Search users or groups for ${section.role.toLowerCase()}s`}
                        disabled={isSavingMemberAssignments}
                      />

                      {isInviteCandidatesLoading ? (
                        <div className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-400">
                          Loading invite candidates...
                        </div>
                      ) : hasMatchingCandidates ? (
                        <div className="space-y-3">
                          {filteredUsers.length > 0 ? (
                            <div>
                              <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Users</p>
                              <div className="max-h-36 space-y-2 overflow-y-auto rounded border border-slate-700 bg-slate-900/40 p-2">
                                {filteredUsers.map((user) => {
                                  const selectedInvite = invitedUsers.find((invite) => invite.userId === user.id);
                                  const isSelected = selectedInvite?.role === section.role;
                                  const isCreator = user.id === creatorUserId;

                                  return (
                                    <label
                                      key={`project-settings-invite-user-${section.role}-${user.id}`}
                                      className={`flex items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-sm text-slate-200 ${
                                        isCreator ? 'opacity-80' : 'cursor-pointer'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(event) =>
                                          setInvitedUserRoleSelection(user.id, section.role, event.target.checked)
                                        }
                                        disabled={isSavingMemberAssignments || isCreator}
                                        className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-orange-500 focus:ring-orange-400"
                                      />
                                      <span className="truncate">{getDisplayName(user)}</span>
                                      {isCreator ? (
                                        <span className="rounded bg-orange-900/30 px-2 py-0.5 text-[10px] font-semibold text-orange-200">
                                          Creator
                                        </span>
                                      ) : null}
                                      <span className="ml-auto truncate text-xs text-slate-400">{user.email}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}

                          {filteredGroups.length > 0 ? (
                            <div>
                              <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Groups</p>
                              <div className="max-h-36 space-y-2 overflow-y-auto rounded border border-slate-700 bg-slate-900/40 p-2">
                                {filteredGroups.map((group) => {
                                  const selectedInvite = invitedGroups.find((invite) => invite.groupId === group.id);
                                  const isSelected = selectedInvite?.role === section.role;

                                  return (
                                    <label
                                      key={`project-settings-invite-group-${section.role}-${group.id}`}
                                      className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-sm text-slate-200"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(event) =>
                                          setInvitedGroupRoleSelection(group.id, section.role, event.target.checked)
                                        }
                                        disabled={isSavingMemberAssignments}
                                        className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-orange-500 focus:ring-orange-400"
                                      />
                                      <div className="min-w-0">
                                        <p className="truncate">{group.name}</p>
                                        {group.description?.trim() ? (
                                          <p className="truncate text-xs text-slate-400">{group.description}</p>
                                        ) : null}
                                      </div>
                                      <span className="ml-auto rounded bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                                        {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-400">
                          No users or groups match this search.
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Users</p>
                      {roleMembers.length === 0 ? (
                        <div className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-400">
                          No users assigned.
                        </div>
                      ) : (
                        <div className="max-h-36 space-y-2 overflow-y-auto rounded border border-slate-700 bg-slate-900/40 p-2">
                          {roleMembers.map((member) => (
                            <div
                              key={`project-settings-readonly-member-${section.role}-${member.userId}`}
                              className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-sm text-slate-200"
                            >
                              <span className="truncate">{getDisplayName(member.user)}</span>
                              {member.isCreator ? (
                                <span className="rounded bg-orange-900/30 px-2 py-0.5 text-[10px] font-semibold text-orange-200">
                                  Creator
                                </span>
                              ) : null}
                              <span className="ml-auto truncate text-xs text-slate-400">{member.user.email}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {inviteCandidatesError ? <p className="text-xs text-red-300">{inviteCandidatesError}</p> : null}
          </div>
        )}

        {canManageSettings ? (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={isSavingMemberAssignments || !hasMemberSelectionChanges}
              onClick={() => void handleSaveRoleAssignments()}
            >
              {isSavingMemberAssignments ? 'Saving roles...' : 'Save Access Roles'}
            </Button>
            {hasMemberSelectionChanges ? (
              <span className="text-xs text-slate-400">Unsaved role changes</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
