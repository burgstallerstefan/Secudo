'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import Button from '@/components/common/Button';

interface Project {
  id: string;
  name: string;
  description?: string;
  norm: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', norm: 'IEC 62443' });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchProjects();
    }
  }, [status]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });
      if (!response.ok) throw new Error('Failed to create project');
      const project = await response.json();
      setProjects([project, ...projects]);
      setNewProject({ name: '', description: '', norm: 'IEC 62443' });
      setShowNewProjectForm(false);
    } catch (err) {
      setError((err as Error).message);
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
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
            TESTUDO
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-slate-300">{session?.user?.name}</span>
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
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-white mb-2">Projects</h2>
          <p className="text-slate-400">Manage your security assessment projects</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-600/30 rounded text-red-200">
            {error}
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

              <div className="flex gap-4">
                <Button type="submit">Create Project</Button>
                <button
                  type="button"
                  onClick={() => setShowNewProjectForm(false)}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Projects Grid */}
        {isLoading ? (
          <div className="text-center text-slate-400">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center text-slate-400">
            <p>No projects yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-orange-400 transition-colors hover:shadow-lg"
              >
                <h3 className="text-xl font-semibold text-white mb-2">{project.name}</h3>
                {project.description && (
                  <p className="text-slate-400 text-sm mb-4">{project.description}</p>
                )}
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span className="bg-slate-700 px-2 py-1 rounded">{project.norm}</span>
                  <span>Last updated: {new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
