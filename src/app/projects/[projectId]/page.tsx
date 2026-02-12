'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GraphEditor from '@/components/project/GraphEditor';
import AssetValuation from '@/components/project/AssetValuation';
import AssessmentQuestions from '@/components/project/AssessmentQuestions';
import FindingsAndMeasures from '@/components/project/FindingsAndMeasures';
import ReportPreview from '@/components/project/ReportPreview';

interface Project {
  id: string;
  name: string;
  description?: string;
  norm: string;
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/projects/${projectId}`);
        if (!response.ok) throw new Error('Failed to load project');
        const data = await response.json();
        setProject(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  if (isLoading) {
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
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold text-white mb-1">{project.name}</h1>
          <p className="text-slate-400 text-sm">{project.description || 'No description'}</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6">
          <Tabs defaultValue="model" className="w-full">
            <TabsList className="bg-transparent border-b border-slate-700 rounded-none">
              <TabsTrigger value="model" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Canonical Model
              </TabsTrigger>
              <TabsTrigger value="assets" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Asset Valuation
              </TabsTrigger>
              <TabsTrigger value="questions" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Norm Questions
              </TabsTrigger>
              <TabsTrigger value="findings" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Findings & Measures
              </TabsTrigger>
              <TabsTrigger value="report" className="text-slate-300 border-b-2 border-transparent data-[state=active]:border-orange-400">
                Report
              </TabsTrigger>
            </TabsList>

            <TabsContent value="model" className="p-6">
              <GraphEditor projectId={projectId} />
            </TabsContent>

            <TabsContent value="assets" className="p-6">
              <AssetValuation projectId={projectId} />
            </TabsContent>

            <TabsContent value="questions" className="p-6">
              <AssessmentQuestions projectId={projectId} />
            </TabsContent>

            <TabsContent value="findings" className="p-6">
              <FindingsAndMeasures projectId={projectId} />
            </TabsContent>

            <TabsContent value="report" className="p-6">
              <ReportPreview projectId={projectId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
