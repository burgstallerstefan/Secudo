'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/common/Button';

interface ReportData {
  project: {
    name: string;
    description?: string;
    norm: string;
  };
  assets: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  findings: {
    count: number;
    bySeverity: Record<string, number>;
  };
  measures: {
    total: number;
    open: number;
    inProgress: number;
    done: number;
  };
}

export default function ReportPreview({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    fetchReportData();
  }, [projectId]);

  const fetchReportData = async () => {
    try {
      setIsLoading(true);

      // Fetch all data needed for report
      const [projectRes, assetRes, findingsRes, measuresRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/asset-values`),
        fetch(`/api/projects/${projectId}/findings`),
        fetch(`/api/projects/${projectId}/measures`),
      ]);

      if (!projectRes.ok) throw new Error('Failed to fetch project');

      const project = await projectRes.json();
      const assets = (await assetRes.json()) || [];
      const findings = (await findingsRes.json()) || [];
      const measures = (await measuresRes.json()) || [];

      const reportData: ReportData = {
        project: {
          name: project.name,
          description: project.description,
          norm: project.norm,
        },
        assets: {
          critical: assets.filter((a: any) => a.value >= 8).length,
          high: assets.filter((a: any) => a.value >= 6 && a.value < 8).length,
          medium: assets.filter((a: any) => a.value >= 4 && a.value < 6).length,
          low: assets.filter((a: any) => a.value < 4).length,
        },
        findings: {
          count: findings.length,
          bySeverity: {
            critical: findings.filter((f: any) => f.severity >= 8).length,
            high: findings.filter((f: any) => f.severity >= 6 && f.severity < 8).length,
            medium: findings.filter((f: any) => f.severity >= 4 && f.severity < 6).length,
            low: findings.filter((f: any) => f.severity < 4).length,
          },
        },
        measures: {
          total: measures.length,
          open: measures.filter((m: any) => m.status === 'Open').length,
          inProgress: measures.filter((m: any) => m.status === 'InProgress').length,
          done: measures.filter((m: any) => m.status === 'Done').length,
        },
      };

      setReport(reportData);
    } catch (error) {
      console.error('Failed to fetch report data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    setIsPrinting(true);
    try {
      // Print the page (browser's native PDF export)
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  if (isLoading) {
    return <div className="text-slate-400">Generating report preview...</div>;
  }

  if (!report) {
    return <div className="text-slate-400">No data available for report</div>;
  }

  return (
    <div className="space-y-6">
      {/* Export Button */}
      <div className="flex gap-2">
        <Button onClick={handleExportPDF} disabled={isPrinting}>
          {isPrinting ? '📄 Exporting...' : '📥 Export as PDF'}
        </Button>
        <button
          onClick={fetchReportData}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Report Preview */}
      <div id="report-content" className="bg-white text-slate-900 rounded-lg overflow-hidden shadow-lg print:shadow-none print:rounded-none">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-400 to-yellow-400 p-8 text-white">
          <h1 className="text-4xl font-black mb-2">TESTUDO</h1>
          <p className="text-lg opacity-90">Security Assessment Report</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Project Info */}
          <section>
            <h2 className="text-2xl font-bold mb-4 border-b pb-2">Project Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-600 uppercase font-semibold">Project Name</p>
                <p className="text-lg font-semibold">{report.project.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 uppercase font-semibold">Standard</p>
                <p className="text-lg font-semibold">{report.project.norm}</p>
              </div>
              {report.project.description && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-600 uppercase font-semibold">Description</p>
                  <p className="text-sm">{report.project.description}</p>
                </div>
              )}
            </div>
          </section>

          {/* Risk Summary */}
          <section>
            <h2 className="text-2xl font-bold mb-4 border-b pb-2">Risk Summary</h2>
            <div className="grid grid-cols-4 gap-3">
              <div className="border-l-4 border-red-500 pl-3">
                <p className="text-xs text-slate-600 uppercase font-semibold">Critical Findings</p>
                <p className="text-3xl font-bold text-red-600">{report.findings.bySeverity.critical}</p>
              </div>
              <div className="border-l-4 border-orange-500 pl-3">
                <p className="text-xs text-slate-600 uppercase font-semibold">High Findings</p>
                <p className="text-3xl font-bold text-orange-600">{report.findings.bySeverity.high}</p>
              </div>
              <div className="border-l-4 border-yellow-500 pl-3">
                <p className="text-xs text-slate-600 uppercase font-semibold">Medium Findings</p>
                <p className="text-3xl font-bold text-yellow-600">{report.findings.bySeverity.medium}</p>
              </div>
              <div className="border-l-4 border-green-500 pl-3">
                <p className="text-xs text-slate-600 uppercase font-semibold">Low Findings</p>
                <p className="text-3xl font-bold text-green-600">{report.findings.bySeverity.low}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-4">
              Total findings: <strong>{report.findings.count}</strong>
            </p>
          </section>

          {/* Asset Distribution */}
          <section>
            <h2 className="text-2xl font-bold mb-4 border-b pb-2">Asset Distribution</h2>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-red-50 border border-red-200 rounded p-3 text-center">
                <p className="text-xs text-slate-600 uppercase font-semibold">Critical</p>
                <p className="text-2xl font-bold text-red-600">{report.assets.critical}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded p-3 text-center">
                <p className="text-xs text-slate-600 uppercase font-semibold">High</p>
                <p className="text-2xl font-bold text-orange-600">{report.assets.high}</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-center">
                <p className="text-xs text-slate-600 uppercase font-semibold">Medium</p>
                <p className="text-2xl font-bold text-yellow-600">{report.assets.medium}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
                <p className="text-xs text-slate-600 uppercase font-semibold">Low</p>
                <p className="text-2xl font-bold text-green-600">{report.assets.low}</p>
              </div>
            </div>
          </section>

          {/* Remediation Status */}
          <section>
            <h2 className="text-2xl font-bold mb-4 border-b pb-2">Remediation Status</h2>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="font-semibold">Total Measures</span>
                <span className="text-lg font-bold">{report.measures.total}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-slate-600">Open</span>
                <span className="text-lg font-bold text-red-600">{report.measures.open}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-slate-600">In Progress</span>
                <span className="text-lg font-bold text-yellow-600">{report.measures.inProgress}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-600">Completed</span>
                <span className="text-lg font-bold text-green-600">{report.measures.done}</span>
              </div>
            </div>
            {report.measures.total > 0 && (
              <p className="text-sm text-slate-600 mt-4">
                Completion rate:{' '}
                <strong>
                  {Math.round((report.measures.done / report.measures.total) * 100)}%
                </strong>
              </p>
            )}
          </section>

          {/* Footer */}
          <div className="pt-8 border-t text-center text-xs text-slate-500">
            <p>Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
            <p>Testudo Security Assessment v1.0</p>
          </div>
        </div>
      </div>

      {/* Print Stylesheet */}
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          #report-content {
            box-shadow: none;
            page-break-after: always;
          }
        }
      `}</style>
    </div>
  );
}
