'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
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
  const [isExporting, setIsExporting] = useState(false);

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
    setIsExporting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/report/pdf`, {
        method: 'GET',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Failed to generate PDF');
      }

      const pdfBlob = await response.blob();
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${report?.project.name || 'secudo-report'}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      window.alert((error as Error).message || 'Failed to export PDF');
    } finally {
      setIsExporting(false);
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
        <Button onClick={handleExportPDF} disabled={isExporting}>
          {isExporting ? 'Exporting PDF...' : 'Export as PDF (LaTeX)'}
        </Button>
        <button
          onClick={fetchReportData}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Report Preview */}
      <div
        id="report-content"
        className="rounded-lg overflow-hidden border border-slate-700 bg-slate-800/50 text-slate-100 shadow-lg print:shadow-none print:rounded-none"
      >
        {/* Header */}
        <div className="border-b border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-8">
          <div className="mb-3 flex items-center gap-3">
            <Image src="/secudo-logo.png?v=20260212c" alt="Secudo logo" width={144} height={144} className="secudo-brand-logo h-36 w-36 object-contain" />
            <h1 className="secudo-brand-wordmark text-4xl font-black">
              SECUDO
            </h1>
          </div>
          <p className="text-lg text-slate-300">Security Assessment Report</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Project Info */}
          <section>
            <h2 className="mb-4 border-b border-slate-700 pb-2 text-2xl font-bold text-white">Project Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Project Name</p>
                <p className="text-lg font-semibold text-slate-100">{report.project.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Standard</p>
                <p className="text-lg font-semibold text-slate-100">{report.project.norm}</p>
              </div>
              {report.project.description && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold uppercase text-slate-400">Description</p>
                  <p className="text-sm text-slate-200">{report.project.description}</p>
                </div>
              )}
            </div>
          </section>

          {/* Risk Summary */}
          <section>
            <h2 className="mb-4 border-b border-slate-700 pb-2 text-2xl font-bold text-white">Risk Summary</h2>
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded border border-red-500/30 bg-red-900/10 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Critical Findings</p>
                <p className="text-3xl font-bold text-red-400">{report.findings.bySeverity.critical}</p>
              </div>
              <div className="rounded border border-orange-500/30 bg-orange-900/10 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">High Findings</p>
                <p className="text-3xl font-bold text-orange-400">{report.findings.bySeverity.high}</p>
              </div>
              <div className="rounded border border-yellow-500/30 bg-yellow-900/10 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Medium Findings</p>
                <p className="text-3xl font-bold text-yellow-300">{report.findings.bySeverity.medium}</p>
              </div>
              <div className="rounded border border-green-500/30 bg-green-900/10 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Low Findings</p>
                <p className="text-3xl font-bold text-green-400">{report.findings.bySeverity.low}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-300">
              Total findings: <strong>{report.findings.count}</strong>
            </p>
          </section>

          {/* Asset Distribution */}
          <section>
            <h2 className="mb-4 border-b border-slate-700 pb-2 text-2xl font-bold text-white">Asset Distribution</h2>
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded border border-red-500/30 bg-red-900/10 p-3 text-center">
                <p className="text-xs font-semibold uppercase text-slate-400">Critical</p>
                <p className="text-2xl font-bold text-red-400">{report.assets.critical}</p>
              </div>
              <div className="rounded border border-orange-500/30 bg-orange-900/10 p-3 text-center">
                <p className="text-xs font-semibold uppercase text-slate-400">High</p>
                <p className="text-2xl font-bold text-orange-400">{report.assets.high}</p>
              </div>
              <div className="rounded border border-yellow-500/30 bg-yellow-900/10 p-3 text-center">
                <p className="text-xs font-semibold uppercase text-slate-400">Medium</p>
                <p className="text-2xl font-bold text-yellow-300">{report.assets.medium}</p>
              </div>
              <div className="rounded border border-green-500/30 bg-green-900/10 p-3 text-center">
                <p className="text-xs font-semibold uppercase text-slate-400">Low</p>
                <p className="text-2xl font-bold text-green-400">{report.assets.low}</p>
              </div>
            </div>
          </section>

          {/* Remediation Status */}
          <section>
            <h2 className="mb-4 border-b border-slate-700 pb-2 text-2xl font-bold text-white">Remediation Status</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-700 py-2">
                <span className="font-semibold text-slate-200">Total Measures</span>
                <span className="text-lg font-bold text-slate-100">{report.measures.total}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-700 py-2">
                <span className="text-slate-400">Open</span>
                <span className="text-lg font-bold text-red-400">{report.measures.open}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-700 py-2">
                <span className="text-slate-400">In Progress</span>
                <span className="text-lg font-bold text-yellow-300">{report.measures.inProgress}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">Completed</span>
                <span className="text-lg font-bold text-green-400">{report.measures.done}</span>
              </div>
            </div>
            {report.measures.total > 0 && (
              <p className="mt-4 text-sm text-slate-300">
                Completion rate:{' '}
                <strong>
                  {Math.round((report.measures.done / report.measures.total) * 100)}%
                </strong>
              </p>
            )}
          </section>

          {/* Footer */}
          <div className="border-t border-slate-700 pt-8 text-center text-xs text-slate-400">
            <p>
              Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
            </p>
            <p>Secudo Security Assessment v1.0</p>
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

