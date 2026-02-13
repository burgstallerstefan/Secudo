'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GraphEditor from '@/components/project/GraphEditor';
import ProjectSettings from '@/components/project/ProjectSettings';
import AssetValuation from '@/components/project/AssetValuation';
import AssessmentQuestions from '@/components/project/AssessmentQuestions';
import FindingsAndMeasures from '@/components/project/FindingsAndMeasures';
import ReportPreview from '@/components/project/ReportPreview';
import InviteNotificationsBell from '@/components/common/InviteNotificationsBell';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  norm: string;
  minRoleToView: string;
  canEdit?: boolean;
  canManageSettings?: boolean;
}

export default function ProjectPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const projectIdParam = params?.projectId;
  const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('model');
  const queryTab = searchParams.get('tab');
  const focusAnswerId = searchParams.get('answerId') || undefined;
  const focusAssetType = searchParams.get('assetType') || undefined;
  const focusAssetId = searchParams.get('assetId') || undefined;
  const focusCommentId = searchParams.get('commentId') || undefined;

  useEffect(() => {
    if (!queryTab) {
      return;
    }

    const allowedTabs = new Set(['settings', 'model', 'assets', 'questions', 'findings', 'report']);
    if (allowedTabs.has(queryTab)) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  const handleProjectUpdated = (updates: Partial<Project>) => {
    setProject((previous) => (previous ? { ...previous, ...updates } : previous));
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !projectId) return;

    const fetchProject = async () => {
      try {
        setIsLoading(true);
        setError('');
        const response = await fetch(`/api/projects/${projectId}`);
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'Failed to load project');
        }
        const data = await response.json();
        setProject(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId, status]);

  if (status === 'loading' || isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading project...</div>;
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-400">Error: {error || 'Project not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700 sticky top-0 z-50">
        <div className="mx-auto w-full max-w-[1800px] px-3 py-2.5 md:px-4 md:py-3 flex justify-between items-start gap-4">
          <div>
            <Link href="/dashboard" className="inline-flex items-center gap-3">
              <Image src="/secudo-logo.png?v=20260212c" alt="Secudo logo" width={144} height={144} className="secudo-brand-logo h-36 w-36 object-contain" priority />
              <span className="secudo-brand-wordmark text-4xl font-bold">
                SECUDO
              </span>
            </Link>
            {/* <div className="mt-2">
              <Link
                href="/dashboard"
                className="text-sm text-orange-300 hover:text-orange-200 transition-colors"
              >
                {'← Back to Dashboard'}
              </Link>
            </div> */}
            <h1 className="mt-2 text-2xl font-bold text-white md:text-[1.7rem]">{project.name}</h1>
            <p className="text-slate-400 text-sm">{project.description || 'No description'}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <InviteNotificationsBell />
              <button
                type="button"
                onClick={() => router.push('/settings')}
                className="rounded-lg border border-slate-600 bg-slate-700/80 p-2 text-slate-300 transition-colors hover:bg-slate-600 hover:text-white"
                aria-label="Open project settings"
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
              <p className="text-sm text-slate-200">{session?.user?.name || session?.user?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ redirect: true, callbackUrl: '/login' })}
              className="rounded-lg border border-red-500/50 bg-red-900/20 px-4 py-2 text-red-200 transition-colors hover:bg-red-900/35"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-700">
        <div className="mx-auto w-full max-w-[1800px] px-3 md:px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent border-b border-slate-700 rounded-none">
              <TabsTrigger value="settings" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Settings
              </TabsTrigger>
              <TabsTrigger value="model" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Canonical Model
              </TabsTrigger>
              <TabsTrigger value="assets" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Asset Valuation
              </TabsTrigger>
              <TabsTrigger value="questions" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Assessment Questions
              </TabsTrigger>
              <TabsTrigger value="findings" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Findings & Measures
              </TabsTrigger>
              <TabsTrigger value="report" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Report
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="px-1 pb-4 pt-3 md:px-2">
              <ProjectSettings
                projectId={projectId}
                project={{
                  name: project.name,
                  description: project.description,
                  norm: project.norm,
                  minRoleToView: project.minRoleToView,
                }}
                canManageSettings={project.canManageSettings ?? false}
                onProjectUpdated={handleProjectUpdated}
              />
            </TabsContent>

            <TabsContent value="model" className="px-1 pb-4 pt-3 md:px-2">
              <GraphEditor projectId={projectId} canEdit={project.canEdit ?? false} />
            </TabsContent>

            <TabsContent value="assets" className="px-1 pb-4 pt-3 md:px-2">
              <AssetValuation
                projectId={projectId}
                canEdit={project.canEdit ?? false}
                focusAssetType={focusAssetType}
                focusAssetId={focusAssetId}
                focusCommentId={focusCommentId}
              />
            </TabsContent>

            <TabsContent value="questions" className="px-1 pb-4 pt-3 md:px-2">
              <AssessmentQuestions
                projectId={projectId}
                canEdit={project.canEdit ?? false}
                focusAnswerId={focusAnswerId}
                focusCommentId={focusCommentId}
              />
            </TabsContent>

            <TabsContent value="findings" className="px-1 pb-4 pt-3 md:px-2">
              <FindingsAndMeasures projectId={projectId} canEdit={project.canEdit ?? false} />
            </TabsContent>

            <TabsContent value="report" className="px-1 pb-4 pt-3 md:px-2">
              <ReportPreview projectId={projectId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

