'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import Image from 'next/image';
import Button from '@/components/common/Button';
import InviteNotificationsBell from '@/components/common/InviteNotificationsBell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PROJECT_NORMS, parseProjectNorms } from '@/lib/project-norm';
import type { ProjectNorm } from '@/lib/project-norm';
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

type GlobalUserRole = 'User' | 'Admin';

interface ManagedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  role: GlobalUserRole;
  createdAt: string;
}

interface GroupMember {
  id: string;
  userId: string;
  groupId: string;
  addedAt: string;
  user: ManagedUser;
}

interface ManagedGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  members: GroupMember[];
}

interface ProjectInviteGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

type ProjectInviteRole = 'Viewer' | 'Editor' | 'Admin';

interface ProjectInviteUserSelection {
  userId: string;
  role: ProjectInviteRole;
}

interface ProjectInviteGroupSelection {
  groupId: string;
  role: ProjectInviteRole;
}

interface NewProjectState {
  name: string;
  description: string;
  norms: ProjectNorm[];
  invitedUsers: ProjectInviteUserSelection[];
  invitedGroups: ProjectInviteGroupSelection[];
}

interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  jobTitle: string | null;
  role: GlobalUserRole;
  createdAt: string;
}

interface ProfileFormState {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  password: string;
  confirmPassword: string;
}

interface DashboardSection {
  id: string;
  label: string;
}

interface DashboardViewProps {
  settingsOnly?: boolean;
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

const getDisplayProjectNorms = (rawNorm: string): string[] => {
  const parsed = parseProjectNorms(rawNorm);
  return parsed.length > 0 ? parsed : ['IEC 62443'];
};

const getUserDisplayName = (user: Pick<ManagedUser, 'firstName' | 'lastName' | 'name' | 'email'>): string => {
  if (user.firstName || user.lastName) {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    if (fullName) return fullName;
  }
  return user.name || user.email;
};

const sortGroupsByName = (items: ManagedGroup[]): ManagedGroup[] =>
  [...items].sort((left, right) => left.name.localeCompare(right.name));

const sortProjectInviteGroupsByName = (items: ProjectInviteGroup[]): ProjectInviteGroup[] =>
  [...items].sort((left, right) => left.name.localeCompare(right.name));

export default function DashboardView({ settingsOnly = false }: DashboardViewProps = {}) {
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
  const [newProject, setNewProject] = useState<NewProjectState>({
    name: '',
    description: '',
    norms: ['IEC 62443'],
    invitedUsers: [],
    invitedGroups: [],
  });
  const [inviteUsers, setInviteUsers] = useState<ManagedUser[]>([]);
  const [inviteGroups, setInviteGroups] = useState<ProjectInviteGroup[]>([]);
  const [isInviteCandidatesLoading, setIsInviteCandidatesLoading] = useState(false);
  const [inviteCandidatesError, setInviteCandidatesError] = useState('');
  const [inviteSearchByRole, setInviteSearchByRole] = useState<Record<ProjectInviteRole, string>>({
    Admin: '',
    Editor: '',
    Viewer: '',
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
  const [groups, setGroups] = useState<ManagedGroup[]>([]);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupEdits, setGroupEdits] = useState<Record<string, { name: string; description: string }>>({});
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [addingMemberGroupId, setAddingMemberGroupId] = useState<string | null>(null);
  const [removingGroupMemberKey, setRemovingGroupMemberKey] = useState<string | null>(null);
  const [addMemberSelections, setAddMemberSelections] = useState<Record<string, string>>({});
  const [pendingProjectDelete, setPendingProjectDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [restoringProjectId, setRestoringProjectId] = useState<string | null>(null);
  const [permanentlyDeletingProjectId, setPermanentlyDeletingProjectId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    firstName: '',
    lastName: '',
    email: '',
    jobTitle: '',
    password: '',
    confirmPassword: '',
  });
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(settingsOnly ? 'profile' : 'projects');
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const hasFetchedProjectsOnStartRef = useRef(false);
  const hasFetchedInviteCandidatesOnStartRef = useRef(false);
  const hasFetchedUsersOnStartRef = useRef(false);
  const hasFetchedGroupsOnStartRef = useRef(false);
  const hasFetchedProfileOnStartRef = useRef(false);
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
  const selectableInviteUsers = useMemo(
    () => inviteUsers.filter((user) => user.id !== session?.user?.id),
    [inviteUsers, session?.user?.id]
  );
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
  const sections = useMemo<DashboardSection[]>(() => {
    const sectionItems: DashboardSection[] = settingsOnly
      ? [{ id: 'profile', label: 'Profile' }]
      : [
          { id: 'projects', label: 'Projects' },
          { id: 'profile', label: 'Profile' },
        ];

    if (canManageRoles) {
      sectionItems.push({ id: 'user-roles', label: 'Users' });
    }

    if (isGlobalAdminUser) {
      sectionItems.push({ id: 'groups', label: 'Groups' });
    }

    if (settingsOnly) {
      sectionItems.push({ id: 'recycle-bin', label: 'Recycle Bin' });
    }
    return sectionItems;
  }, [canManageRoles, isGlobalAdminUser, settingsOnly]);
  const headerName = useMemo(() => {
    const fullName = `${profileForm.firstName} ${profileForm.lastName}`.trim();
    if (fullName) {
      return fullName;
    }
    return session?.user?.name || session?.user?.email || 'User';
  }, [profileForm.firstName, profileForm.lastName, session?.user?.email, session?.user?.name]);
  const headerEmail = profileForm.email || session?.user?.email || '';

  useEffect(() => {
    if (status === 'unauthenticated') {
      hasFetchedProjectsOnStartRef.current = false;
      hasFetchedInviteCandidatesOnStartRef.current = false;
      hasFetchedUsersOnStartRef.current = false;
      hasFetchedGroupsOnStartRef.current = false;
      hasFetchedProfileOnStartRef.current = false;
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated' && !settingsOnly && !hasFetchedProjectsOnStartRef.current) {
      hasFetchedProjectsOnStartRef.current = true;
      void fetchProjects();
    }
  }, [status, settingsOnly]);

  useEffect(() => {
    if (status === 'authenticated' && !settingsOnly && !hasFetchedInviteCandidatesOnStartRef.current) {
      hasFetchedInviteCandidatesOnStartRef.current = true;
      void fetchProjectInviteCandidates();
    }
  }, [status, settingsOnly]);

  useEffect(() => {
    if (status === 'authenticated' && canManageRoles && !hasFetchedUsersOnStartRef.current) {
      hasFetchedUsersOnStartRef.current = true;
      void fetchUsers();
    }
  }, [status, canManageRoles]);

  useEffect(() => {
    if (status === 'authenticated' && isGlobalAdminUser && !hasFetchedGroupsOnStartRef.current) {
      hasFetchedGroupsOnStartRef.current = true;
      void fetchGroups();
    }
  }, [status, isGlobalAdminUser]);

  useEffect(() => {
    if (status === 'authenticated' && !hasFetchedProfileOnStartRef.current) {
      hasFetchedProfileOnStartRef.current = true;
      void fetchCurrentProfile();
    }
  }, [status]);

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

  useEffect(() => {
    const availableUserIds = new Set(users.map((user) => user.id));
    setNewGroupMemberIds((previous) => previous.filter((userId) => availableUserIds.has(userId)));
    setAddMemberSelections((previous) => {
      const nextEntries = Object.entries(previous).filter(([, userId]) => userId && availableUserIds.has(userId));
      return Object.fromEntries(nextEntries);
    });
  }, [users]);

  useEffect(() => {
    const availableUserIds = new Set(selectableInviteUsers.map((user) => user.id));
    const availableGroupIds = new Set(inviteGroups.map((group) => group.id));
    setNewProject((previous) => ({
      ...previous,
      invitedUsers: previous.invitedUsers.filter((invite) => availableUserIds.has(invite.userId)),
      invitedGroups: previous.invitedGroups.filter((invite) => availableGroupIds.has(invite.groupId)),
    }));
  }, [selectableInviteUsers, inviteGroups]);

  useEffect(() => {
    const updateActiveSection = () => {
      if (sections.length === 0) {
        return;
      }

      const offset = 180;
      let currentSectionId = sections[0].id;

      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (!element) {
          continue;
        }
        if (element.getBoundingClientRect().top <= offset) {
          currentSectionId = section.id;
        }
      }

      setActiveSectionId(currentSectionId);
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);

    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, [sections]);

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

  const fetchProjectInviteCandidates = async () => {
    try {
      setIsInviteCandidatesLoading(true);
      setInviteCandidatesError('');
      const response = await fetch('/api/project-invite-candidates');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch invitation candidates');
      }

      const data = (await response.json()) as {
        users: ManagedUser[];
        groups: ProjectInviteGroup[];
      };
      setInviteUsers(Array.isArray(data.users) ? data.users : []);
      setInviteGroups(sortProjectInviteGroupsByName(Array.isArray(data.groups) ? data.groups : []));
    } catch (err) {
      setInviteCandidatesError((err as Error).message);
    } finally {
      setIsInviteCandidatesLoading(false);
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

  const fetchGroups = async () => {
    try {
      setIsGroupsLoading(true);
      setGroupsError('');
      const response = await fetch('/api/groups');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch groups');
      }

      const data = (await response.json()) as ManagedGroup[];
      setGroups(data);
      setGroupEdits(
        Object.fromEntries(
          data.map((group) => [
            group.id,
            { name: group.name, description: group.description || '' },
          ])
        )
      );
    } catch (err) {
      setGroupsError((err as Error).message);
    } finally {
      setIsGroupsLoading(false);
    }
  };

  const fetchCurrentProfile = async () => {
    try {
      setIsProfileLoading(true);
      setProfileError('');
      const response = await fetch('/api/users/me');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch profile');
      }

      const data = (await response.json()) as UserProfile;
      setProfileForm((previous) => ({
        ...previous,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        jobTitle: data.jobTitle || '',
        password: '',
        confirmPassword: '',
      }));
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setIsProfileLoading(false);
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

    if (newProject.norms.length === 0) {
      setError('Select at least one norm.');
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
          norms: newProject.norms,
          invitedUsers: newProject.invitedUsers,
          invitedGroups: newProject.invitedGroups,
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

  const toggleProjectNormSelection = (norm: ProjectNorm) => {
    setNewProject((previous) => {
      if (norm === 'None') {
        return { ...previous, norms: ['None'] };
      }

      const withoutNone = previous.norms.filter((entry) => entry !== 'None');
      const alreadySelected = withoutNone.includes(norm);
      const nextNorms = alreadySelected
        ? withoutNone.filter((entry) => entry !== norm)
        : [...withoutNone, norm];

      return {
        ...previous,
        norms: nextNorms.length > 0 ? nextNorms : ['IEC 62443'],
      };
    });
  };

  const setInvitedUserRoleSelection = (userId: string, role: ProjectInviteRole, isSelected: boolean) => {
    setNewProject((previous) => ({
      ...previous,
      invitedUsers: isSelected
        ? [...previous.invitedUsers.filter((invite) => invite.userId !== userId), { userId, role }]
        : previous.invitedUsers.filter((invite) => invite.userId !== userId),
    }));
  };

  const setInvitedGroupRoleSelection = (groupId: string, role: ProjectInviteRole, isSelected: boolean) => {
    setNewProject((previous) => ({
      ...previous,
      invitedGroups: isSelected
        ? [...previous.invitedGroups.filter((invite) => invite.groupId !== groupId), { groupId, role }]
        : previous.invitedGroups.filter((invite) => invite.groupId !== groupId),
    }));
  };

  const updateInviteSearch = (role: ProjectInviteRole, query: string) => {
    setInviteSearchByRole((previous) => ({
      ...previous,
      [role]: query,
    }));
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
      setInviteUsers((previous) => previous.filter((user) => user.id !== userId));
      setNewProject((previous) => ({
        ...previous,
        invitedUsers: previous.invitedUsers.filter((invite) => invite.userId !== userId),
      }));
      setGroups((previous) =>
        previous.map((group) => ({
          ...group,
          members: group.members.filter((member) => member.userId !== userId),
        }))
      );
      void fetchProjectInviteCandidates();
      if (isGlobalAdminUser) {
        void fetchGroups();
      }
    } catch (err) {
      setUsersError((err as Error).message);
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleToggleNewGroupMember = (userId: string) => {
    setNewGroupMemberIds((previous) =>
      previous.includes(userId)
        ? previous.filter((selectedUserId) => selectedUserId !== userId)
        : [...previous, userId]
    );
  };

  const handleCreateGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!isGlobalAdminUser || isCreatingGroup) {
      return;
    }

    const normalizedName = newGroupName.trim();
    if (!normalizedName) {
      setGroupsError('Group name is required.');
      return;
    }

    try {
      setGroupsError('');
      setIsCreatingGroup(true);
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          description: newGroupDescription.trim(),
          userIds: newGroupMemberIds,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to create group');
      }

      const createdGroup = (await response.json()) as ManagedGroup;
      setGroups((previous) => sortGroupsByName([...previous, createdGroup]));
      setInviteGroups((previous) =>
        sortProjectInviteGroupsByName([
          ...previous,
          {
            id: createdGroup.id,
            name: createdGroup.name,
            description: createdGroup.description,
            memberCount: createdGroup.members.length,
          },
        ])
      );
      setGroupEdits((previous) => ({
        ...previous,
        [createdGroup.id]: {
          name: createdGroup.name,
          description: createdGroup.description || '',
        },
      }));
      setNewGroupName('');
      setNewGroupDescription('');
      setNewGroupMemberIds([]);
      setSuccessMessage(`Group "${createdGroup.name}" created.`);
    } catch (err) {
      setGroupsError((err as Error).message);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleGroupEditFieldChange = (
    groupId: string,
    field: 'name' | 'description',
    value: string
  ) => {
    setGroupEdits((previous) => ({
      ...previous,
      [groupId]: {
        name: previous[groupId]?.name ?? '',
        description: previous[groupId]?.description ?? '',
        [field]: value,
      },
    }));
  };

  const handleSaveGroup = async (groupId: string) => {
    if (!isGlobalAdminUser || savingGroupId) {
      return;
    }

    const draft = groupEdits[groupId];
    const normalizedName = draft?.name?.trim() || '';
    if (!normalizedName) {
      setGroupsError('Group name is required.');
      return;
    }

    try {
      setGroupsError('');
      setSavingGroupId(groupId);
      const response = await fetch(`/api/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          description: draft?.description ?? '',
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to update group');
      }

      const updatedGroup = (await response.json()) as ManagedGroup;
      setGroups((previous) =>
        sortGroupsByName(previous.map((group) => (group.id === groupId ? updatedGroup : group)))
      );
      setInviteGroups((previous) =>
        sortProjectInviteGroupsByName(
          previous.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  name: updatedGroup.name,
                  description: updatedGroup.description,
                  memberCount: updatedGroup.members.length,
                }
              : group
          )
        )
      );
      setGroupEdits((previous) => ({
        ...previous,
        [groupId]: {
          name: updatedGroup.name,
          description: updatedGroup.description || '',
        },
      }));
      setSuccessMessage(`Group "${updatedGroup.name}" updated.`);
    } catch (err) {
      setGroupsError((err as Error).message);
    } finally {
      setSavingGroupId(null);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!isGlobalAdminUser || deletingGroupId) {
      return;
    }

    try {
      setGroupsError('');
      setDeletingGroupId(groupId);
      const response = await fetch(`/api/groups/${groupId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to delete group');
      }

      setGroups((previous) => previous.filter((group) => group.id !== groupId));
      setInviteGroups((previous) => previous.filter((group) => group.id !== groupId));
      setGroupEdits((previous) => {
        const next = { ...previous };
        delete next[groupId];
        return next;
      });
      setAddMemberSelections((previous) => {
        const next = { ...previous };
        delete next[groupId];
        return next;
      });
      setSuccessMessage('Group deleted.');
    } catch (err) {
      setGroupsError((err as Error).message);
    } finally {
      setDeletingGroupId(null);
    }
  };

  const handleAddGroupMember = async (groupId: string, selectedUserId: string) => {
    if (!isGlobalAdminUser || addingMemberGroupId || !selectedUserId) {
      return;
    }

    try {
      setGroupsError('');
      setAddingMemberGroupId(groupId);
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to add member');
      }

      const updatedGroup = (await response.json()) as ManagedGroup;
      setGroups((previous) =>
        sortGroupsByName(previous.map((group) => (group.id === groupId ? updatedGroup : group)))
      );
      setInviteGroups((previous) =>
        sortProjectInviteGroupsByName(
          previous.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  name: updatedGroup.name,
                  description: updatedGroup.description,
                  memberCount: updatedGroup.members.length,
                }
              : group
          )
        )
      );
      setGroupEdits((previous) => ({
        ...previous,
        [groupId]: {
          name: updatedGroup.name,
          description: updatedGroup.description || '',
        },
      }));
      setAddMemberSelections((previous) => ({
        ...previous,
        [groupId]: '',
      }));
      setSuccessMessage('Member added to group.');
    } catch (err) {
      setGroupsError((err as Error).message);
    } finally {
      setAddingMemberGroupId(null);
    }
  };

  const handleRemoveGroupMember = async (groupId: string, userId: string) => {
    if (!isGlobalAdminUser || removingGroupMemberKey) {
      return;
    }

    const actionKey = `${groupId}:${userId}`;
    try {
      setGroupsError('');
      setRemovingGroupMemberKey(actionKey);
      const response = await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to remove member');
      }

      const updatedGroup = (await response.json()) as ManagedGroup;
      setGroups((previous) =>
        sortGroupsByName(previous.map((group) => (group.id === groupId ? updatedGroup : group)))
      );
      setInviteGroups((previous) =>
        sortProjectInviteGroupsByName(
          previous.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  name: updatedGroup.name,
                  description: updatedGroup.description,
                  memberCount: updatedGroup.members.length,
                }
              : group
          )
        )
      );
      setGroupEdits((previous) => ({
        ...previous,
        [groupId]: {
          name: updatedGroup.name,
          description: updatedGroup.description || '',
        },
      }));
      setSuccessMessage('Member removed from group.');
    } catch (err) {
      setGroupsError((err as Error).message);
    } finally {
      setRemovingGroupMemberKey(null);
    }
  };

  const handleProfileFieldChange = (
    field: keyof ProfileFormState,
    value: string
  ) => {
    setProfileForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();

    if (isSavingProfile) {
      return;
    }

    const firstName = profileForm.firstName.trim();
    const lastName = profileForm.lastName.trim();
    const email = profileForm.email.trim();
    const jobTitle = profileForm.jobTitle.trim();
    const password = profileForm.password;
    const confirmPassword = profileForm.confirmPassword;

    if (!firstName || !lastName || !email) {
      setProfileError('First name, last name and email are required.');
      return;
    }

    if (password && password.length < 8) {
      setProfileError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setProfileError('Passwords do not match.');
      return;
    }

    try {
      setIsSavingProfile(true);
      setProfileError('');
      setProfileSuccess('');
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          jobTitle,
          password: password || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save profile');
      }

      const updatedProfile = (await response.json()) as UserProfile;
      setProfileForm((previous) => ({
        ...previous,
        firstName: updatedProfile.firstName || '',
        lastName: updatedProfile.lastName || '',
        email: updatedProfile.email,
        jobTitle: updatedProfile.jobTitle || '',
        password: '',
        confirmPassword: '',
      }));
      setProfileSuccess('Profile saved.');
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSectionId(sectionId);
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
      <div className="sticky top-0 z-50 border-b border-slate-700 bg-slate-800/50 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-4 py-3 lg:px-6">
          <Link href="/dashboard" className="inline-flex items-center gap-3">
            <Image src="/secudo-logo.png?v=20260212c" alt="Secudo logo" width={144} height={144} className="secudo-brand-logo h-36 w-36 object-contain" priority />
            <span className="secudo-brand-wordmark text-4xl font-bold">
              SECUDO
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <InviteNotificationsBell />
              <button
                type="button"
                onClick={() => {
                  if (settingsOnly) {
                    scrollToSection('profile');
                    return;
                  }
                  router.push('/settings');
                }}
                className="rounded-lg border border-slate-600 bg-slate-700/80 p-2 text-slate-300 transition-colors hover:bg-slate-600 hover:text-white"
                aria-label="Open settings"
                title="Settings"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.45 3.18a1.75 1.75 0 0 1 3.1 0l.44.9a1.75 1.75 0 0 0 2.1.93l.99-.3a1.75 1.75 0 0 1 2.2 2.2l-.3.99a1.75 1.75 0 0 0 .93 2.1l.9.44a1.75 1.75 0 0 1 0 3.1l-.9.44a1.75 1.75 0 0 0-.93 2.1l.3.99a1.75 1.75 0 0 1-2.2 2.2l-.99-.3a1.75 1.75 0 0 0-2.1.93l-.44.9a1.75 1.75 0 0 1-3.1 0l-.44-.9a1.75 1.75 0 0 0-2.1-.93l-.99.3a1.75 1.75 0 0 1-2.2-2.2l.3-.99a1.75 1.75 0 0 0-.93-2.1l-.9-.44a1.75 1.75 0 0 1 0-3.1l.9-.44a1.75 1.75 0 0 0 .93-2.1l-.3-.99a1.75 1.75 0 0 1 2.2-2.2l.99.3a1.75 1.75 0 0 0 2.1-.93l.44-.9Z"
                  />
                  <circle cx="12" cy="12" r="3.2" />
                </svg>
              </button>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Profile</p>
              <p className="text-sm text-slate-200">{headerName}</p>
              {headerEmail ? <p className="text-xs text-slate-400">{headerEmail}</p> : null}
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
      <div className="mx-auto w-full max-w-[1800px] px-4 py-8 lg:px-6">
        <div className={settingsOnly ? 'grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start' : 'block'}>
          {settingsOnly ? (
            <aside className="lg:sticky lg:top-24 lg:border-r lg:border-slate-700 lg:pr-5">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Navigation</p>
              <nav className="space-y-1 pr-1">
                {sections.map((section) => {
                  const isActive = activeSectionId === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? 'bg-slate-700/60 text-white'
                          : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
                      }`}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </nav>
            </aside>
          ) : null}

          <div className={`space-y-14 ${settingsOnly ? 'lg:pl-2' : ''}`}>
            {!settingsOnly && (
            <section id="projects" className="scroll-mt-32">
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
                <label className="mb-1 block text-slate-300">Norms</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PROJECT_NORMS.map((normOption) => {
                    const isChecked = newProject.norms.includes(normOption);
                    return (
                      <label
                        key={normOption}
                        className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm transition-colors ${
                          isChecked
                            ? 'border-orange-500/70 bg-orange-900/20 text-orange-100'
                            : 'border-slate-600 bg-slate-700 text-slate-200 hover:border-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
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

              <div className="space-y-4">
                {PROJECT_INVITE_ROLE_SECTIONS.map((section) => {
                  const normalizedSearch = inviteSearchByRole[section.role].trim().toLowerCase();
                  const filteredUsers = selectableInviteUsers.filter((user) => {
                    if (!normalizedSearch) {
                      return true;
                    }
                    const searchable = `${getUserDisplayName(user)} ${user.email}`.toLowerCase();
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

                  return (
                    <div key={`invite-section-${section.role}`} className="rounded border border-slate-700 bg-slate-900/30 p-3">
                      <div className="mb-2">
                        <p className="text-sm font-semibold text-slate-100">{section.title}</p>
                        <p className="text-xs text-slate-400">{section.description}</p>
                      </div>

                      <input
                        type="text"
                        value={inviteSearchByRole[section.role]}
                        onChange={(event) => updateInviteSearch(section.role, event.target.value)}
                        className="mb-3 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-orange-400 focus:outline-none"
                        placeholder={`Search users or groups for ${section.role.toLowerCase()}s`}
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
                                  const selectedInvite = newProject.invitedUsers.find((invite) => invite.userId === user.id);
                                  const isSelected = selectedInvite?.role === section.role;

                                  return (
                                    <label
                                      key={`invite-user-${section.role}-${user.id}`}
                                      className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-sm text-slate-200"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(event) =>
                                          setInvitedUserRoleSelection(user.id, section.role, event.target.checked)
                                        }
                                        className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-orange-500 focus:ring-orange-400"
                                      />
                                      <span className="truncate">{getUserDisplayName(user)}</span>
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
                                  const selectedInvite = newProject.invitedGroups.find((invite) => invite.groupId === group.id);
                                  const isSelected = selectedInvite?.role === section.role;

                                  return (
                                    <label
                                      key={`invite-group-${section.role}-${group.id}`}
                                      className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-sm text-slate-200"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(event) =>
                                          setInvitedGroupRoleSelection(group.id, section.role, event.target.checked)
                                        }
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
                    </div>
                  );
                })}
                {inviteCandidatesError && <p className="mt-1 text-xs text-red-300">{inviteCandidatesError}</p>}
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
                    {getDisplayProjectNorms(project.norm).map((normLabel) => (
                      <span key={`${project.id}-${normLabel}`} className="bg-slate-700 px-2 py-1 rounded">
                        {normLabel}
                      </span>
                    ))}
                    <span className="bg-slate-700 px-2 py-1 rounded">
                      {project.minRoleToView === 'any' && 'Public (Any)'}
                      {project.minRoleToView === 'viewer' && 'Viewer+'}
                      {(project.minRoleToView === 'editor' || project.minRoleToView === 'user') && 'Editor+'}
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

            </section>
            )}

            <section id="profile" className="scroll-mt-32 rounded-lg border border-slate-700 bg-slate-800/45 p-6">
              <div className="mb-5">
                <h2 className="text-2xl font-bold text-white">Settings</h2>
                <p className="text-slate-400">Profile fields mirror the registration form.</p>
              </div>

              {profileError && (
                <div className="mb-4 rounded border border-red-600/30 bg-red-900/20 p-3 text-sm text-red-200">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="mb-4 rounded border border-emerald-600/30 bg-emerald-900/20 p-3 text-sm text-emerald-200">
                  {profileSuccess}
                </div>
              )}

              {isProfileLoading ? (
                <div className="text-slate-400">Loading profile...</div>
              ) : (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-slate-300">First name</label>
                      <input
                        type="text"
                        value={profileForm.firstName}
                        onChange={(event) => handleProfileFieldChange('firstName', event.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-slate-300">Last name</label>
                      <input
                        type="text"
                        value={profileForm.lastName}
                        onChange={(event) => handleProfileFieldChange('lastName', event.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-slate-300">Email</label>
                      <input
                        type="email"
                        value={profileForm.email}
                        onChange={(event) => handleProfileFieldChange('email', event.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-slate-300">Job title</label>
                      <input
                        type="text"
                        value={profileForm.jobTitle}
                        onChange={(event) => handleProfileFieldChange('jobTitle', event.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-slate-300">Password</label>
                      <input
                        type="password"
                        value={profileForm.password}
                        onChange={(event) => handleProfileFieldChange('password', event.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                        placeholder="Leave empty to keep current password"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-slate-300">Confirm password</label>
                      <input
                        type="password"
                        value={profileForm.confirmPassword}
                        onChange={(event) => handleProfileFieldChange('confirmPassword', event.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                        placeholder="Repeat new password"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="rounded border border-cyan-500/40 bg-cyan-900/20 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingProfile ? 'Saving...' : 'Save profile'}
                  </button>
                </form>
              )}
            </section>

            {canManageRoles && (
              <section id="user-roles" className="scroll-mt-32 rounded-lg border border-slate-700 bg-slate-800/45 p-6">
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
                          {getUserDisplayName(user)}
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
                            <option value="User">User</option>
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

                {isGlobalAdminUser && (
                  <div id="groups" className="mt-10 space-y-6 scroll-mt-32">
                    <div>
                  <h3 className="text-2xl font-semibold text-white">Group Management</h3>
                  <p className="text-slate-400">Create groups and assign users for easier administration.</p>
                    </div>

                {groupsError && (
                  <div className="rounded border border-red-600/30 bg-red-900/20 p-3 text-sm text-red-200">
                    {groupsError}
                  </div>
                )}

                <form
                  onSubmit={handleCreateGroup}
                  className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-5"
                >
                  <h4 className="text-lg font-semibold text-white">Create Group</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-slate-300">Group Name *</label>
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(event) => setNewGroupName(event.target.value)}
                        placeholder="e.g. OT Security Team"
                        className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                        disabled={isCreatingGroup}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-slate-300">Description</label>
                      <input
                        type="text"
                        value={newGroupDescription}
                        onChange={(event) => setNewGroupDescription(event.target.value)}
                        placeholder="Optional"
                        className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
                        disabled={isCreatingGroup}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-slate-300">Initial Members (optional)</p>
                    {users.length === 0 ? (
                      <div className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-400">
                        No users available.
                      </div>
                    ) : (
                      <div className="max-h-44 overflow-y-auto rounded border border-slate-700 bg-slate-900/40 p-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          {users.map((user) => (
                            <label
                              key={`new-group-member-${user.id}`}
                              className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-sm text-slate-200"
                            >
                              <input
                                type="checkbox"
                                checked={newGroupMemberIds.includes(user.id)}
                                onChange={() => handleToggleNewGroupMember(user.id)}
                                disabled={isCreatingGroup}
                                className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-orange-500 focus:ring-orange-400"
                              />
                              <span className="truncate">{getUserDisplayName(user)}</span>
                              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{user.role}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isCreatingGroup}
                    className="rounded border border-emerald-500/40 bg-emerald-900/20 px-4 py-2 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingGroup ? 'Creating...' : 'Create Group'}
                  </button>
                </form>

                {isGroupsLoading ? (
                  <div className="text-slate-400">Loading groups...</div>
                ) : groups.length === 0 ? (
                  <div className="rounded border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                    No groups yet.
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {groups.map((group) => {
                      const editDraft = groupEdits[group.id] || {
                        name: group.name,
                        description: group.description || '',
                      };
                      const memberUserIds = new Set(group.members.map((member) => member.userId));
                      const addableUsers = users.filter((user) => !memberUserIds.has(user.id));
                      const selectedAddUserId = addMemberSelections[group.id] || '';
                      const validSelectedAddUserId = addableUsers.some((user) => user.id === selectedAddUserId)
                        ? selectedAddUserId
                        : '';

                      return (
                        <div
                          key={group.id}
                          className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">Group Name</label>
                              <input
                                type="text"
                                value={editDraft.name}
                                onChange={(event) => handleGroupEditFieldChange(group.id, 'name', event.target.value)}
                                className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-orange-400 focus:outline-none"
                                disabled={savingGroupId === group.id || deletingGroupId === group.id}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">Description</label>
                              <input
                                type="text"
                                value={editDraft.description}
                                onChange={(event) =>
                                  handleGroupEditFieldChange(group.id, 'description', event.target.value)
                                }
                                className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-orange-400 focus:outline-none"
                                disabled={savingGroupId === group.id || deletingGroupId === group.id}
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveGroup(group.id)}
                              disabled={savingGroupId === group.id || deletingGroupId === group.id}
                              className="rounded border border-cyan-500/40 bg-cyan-900/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingGroupId === group.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteGroup(group.id)}
                              disabled={deletingGroupId === group.id || savingGroupId === group.id}
                              className="rounded border border-red-500/40 bg-red-900/20 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingGroupId === group.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>

                          <div className="mt-4">
                            <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                              Members ({group.members.length})
                            </p>
                            {group.members.length === 0 ? (
                              <p className="text-sm text-slate-500">No members assigned.</p>
                            ) : (
                              <div className="space-y-2">
                                {group.members.map((member) => {
                                  const memberActionKey = `${group.id}:${member.userId}`;
                                  return (
                                    <div
                                      key={member.id}
                                      className="flex items-center justify-between rounded border border-slate-700 bg-slate-900/40 px-2 py-1.5 text-sm text-slate-200"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate">{getUserDisplayName(member.user)}</p>
                                        <p className="truncate text-xs text-slate-400">{member.user.email}</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => void handleRemoveGroupMember(group.id, member.userId)}
                                        disabled={
                                          removingGroupMemberKey === memberActionKey ||
                                          deletingGroupId === group.id ||
                                          savingGroupId === group.id
                                        }
                                        className="rounded border border-red-500/40 bg-red-900/20 px-2 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {removingGroupMemberKey === memberActionKey ? 'Removing...' : 'Remove'}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex gap-2">
                            <select
                              value={validSelectedAddUserId}
                              onChange={(event) =>
                                setAddMemberSelections((previous) => ({
                                  ...previous,
                                  [group.id]: event.target.value,
                                }))
                              }
                              disabled={
                                addableUsers.length === 0 ||
                                addingMemberGroupId === group.id ||
                                deletingGroupId === group.id ||
                                savingGroupId === group.id
                              }
                              className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-orange-400 focus:outline-none disabled:opacity-60"
                            >
                              <option value="">Add member...</option>
                              {addableUsers.map((user) => (
                                <option key={`${group.id}-add-${user.id}`} value={user.id}>
                                  {getUserDisplayName(user)} ({user.role})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleAddGroupMember(group.id, validSelectedAddUserId)}
                              disabled={!validSelectedAddUserId || addingMemberGroupId === group.id}
                              className="rounded border border-emerald-500/40 bg-emerald-900/20 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {addingMemberGroupId === group.id ? 'Adding...' : 'Add'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                  </div>
                )}
              </section>
            )}

            {settingsOnly && !isLoading && (
              <section id="recycle-bin" className="scroll-mt-32 rounded-lg border border-slate-700 bg-slate-800/45 p-6">
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
          </div>
        </div>
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

