import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SeverityBuckets = {
  critical: number;
  high: number;
  medium: number;
  low: number;
};

const escapeLatex = (value: string | null | undefined): string => {
  const input = (value || '').replace(/\r?\n/g, ' ').trim();
  return input
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
};

const safeFileName = (raw: string): string => {
  const sanitized = raw
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return sanitized || 'secudo-report';
};

const toDateTimeString = (value: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

const bucketFromValues = (values: Array<{ value: number }>): SeverityBuckets => ({
  critical: values.filter((entry) => entry.value >= 8).length,
  high: values.filter((entry) => entry.value >= 6 && entry.value < 8).length,
  medium: values.filter((entry) => entry.value >= 4 && entry.value < 6).length,
  low: values.filter((entry) => entry.value < 4).length,
});

const buildLatexDocument = (params: {
  project: { name: string; description: string | null; norm: string; updatedAt: Date };
  modelStats: { containers: number; components: number; interfaces: number; dataObjects: number };
  assets: SeverityBuckets;
  findings: Array<{ assetName: string; severity: number; questionText: string; normReference: string }>;
  findingsBySeverity: SeverityBuckets;
  measures: Array<{ title: string; status: string; priority: string; normReference: string | null; dueDate: Date | null }>;
  measuresSummary: { total: number; open: number; inProgress: number; done: number; completionRate: number };
  generatedAt: Date;
}) => {
  const findingsRows =
    params.findings.length === 0
      ? '\\multicolumn{4}{l}{No findings identified.} \\\\'
      : params.findings
          .map(
            (finding, index) =>
              `${index + 1} & ${escapeLatex(finding.assetName)} & ${finding.severity} & ${escapeLatex(
                finding.questionText
              )} \\\\`
          )
          .join('\n\\midrule\n');

  const measuresRows =
    params.measures.length === 0
      ? '\\multicolumn{5}{l}{No measures available.} \\\\'
      : params.measures
          .map(
            (measure, index) =>
              `${index + 1} & ${escapeLatex(measure.title)} & ${escapeLatex(measure.status)} & ${escapeLatex(
                measure.priority
              )} & ${escapeLatex(measure.normReference || '-')} \\\\`
          )
          .join('\n\\midrule\n');

  return String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{geometry}
\usepackage{longtable}
\usepackage{array}
\usepackage{booktabs}
\geometry{margin=2cm}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.4em}

\begin{document}

{\LARGE \textbf{SECUDO Security Assessment Report}}\\
\textbf{Project:} ${escapeLatex(params.project.name)}\\
\textbf{Standard:} ${escapeLatex(params.project.norm)}\\
\textbf{Generated:} ${escapeLatex(toDateTimeString(params.generatedAt))}\\
\textbf{Last Project Update:} ${escapeLatex(toDateTimeString(params.project.updatedAt))}

\section*{Project Information}
\begin{tabular}{p{0.28\linewidth}p{0.68\linewidth}}
\toprule
Name & ${escapeLatex(params.project.name)} \\
Description & ${escapeLatex(params.project.description || 'n/a')} \\
Standard & ${escapeLatex(params.project.norm)} \\
\bottomrule
\end{tabular}

\section*{Canonical Model Summary}
\begin{tabular}{p{0.36\linewidth}p{0.24\linewidth}p{0.36\linewidth}}
\toprule
Containers & ${params.modelStats.containers} & Components ${params.modelStats.components} \\
Interfaces & ${params.modelStats.interfaces} & Data Objects ${params.modelStats.dataObjects} \\
\bottomrule
\end{tabular}

\section*{Asset Valuation Summary}
\begin{tabular}{p{0.24\linewidth}p{0.2\linewidth}p{0.24\linewidth}p{0.2\linewidth}}
\toprule
Critical (8-10) & ${params.assets.critical} & High (6-7) & ${params.assets.high} \\
Medium (4-5) & ${params.assets.medium} & Low (1-3) & ${params.assets.low} \\
\bottomrule
\end{tabular}

\section*{Findings Summary}
\begin{tabular}{p{0.24\linewidth}p{0.2\linewidth}p{0.24\linewidth}p{0.2\linewidth}}
\toprule
Critical & ${params.findingsBySeverity.critical} & High & ${params.findingsBySeverity.high} \\
Medium & ${params.findingsBySeverity.medium} & Low & ${params.findingsBySeverity.low} \\
\bottomrule
\end{tabular}

\section*{Detailed Findings}
\begin{longtable}{p{0.06\linewidth}p{0.22\linewidth}p{0.08\linewidth}p{0.56\linewidth}}
\toprule
\# & Asset & Sev. & Question \\
\midrule
\endfirsthead
\toprule
\# & Asset & Sev. & Question \\
\midrule
\endhead
${findingsRows}
\\\bottomrule
\end{longtable}

\section*{Measures Summary}
\begin{tabular}{p{0.2\linewidth}p{0.14\linewidth}p{0.2\linewidth}p{0.14\linewidth}}
\toprule
Total & ${params.measuresSummary.total} & Done & ${params.measuresSummary.done} \\
Open & ${params.measuresSummary.open} & In Progress & ${params.measuresSummary.inProgress} \\
\multicolumn{4}{p{0.94\linewidth}}{\textbf{Completion Rate:} ${params.measuresSummary.completionRate}\%} \\
\bottomrule
\end{tabular}

\section*{Detailed Measures}
\begin{longtable}{p{0.06\linewidth}p{0.38\linewidth}p{0.14\linewidth}p{0.14\linewidth}p{0.2\linewidth}}
\toprule
\# & Title & Status & Priority & Norm Reference \\
\midrule
\endfirsthead
\toprule
\# & Title & Status & Priority & Norm Reference \\
\midrule
\endhead
${measuresRows}
\\\bottomrule
\end{longtable}

\end{document}
`;
};

const compileLatexToPdf = async (workingDirectory: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tectonic', ['--outdir', workingDirectory, 'report.tex'], {
      cwd: workingDirectory,
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('LaTeX engine "tectonic" is not installed in this container.'));
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`LaTeX compilation failed (${code}). ${output}`));
    });
  });
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  let workingDirectory = '';

  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const access = await getProjectViewAccess(params.projectId, userId, session.user?.role);
    if (!access.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const [project, nodes, edges, dataObjects, assetValues, findings, measures] = await Promise.all([
      prisma.project.findUnique({
        where: { id: params.projectId },
        select: { name: true, description: true, norm: true, updatedAt: true },
      }),
      prisma.modelNode.findMany({
        where: { projectId: params.projectId },
        select: { category: true, name: true },
      }),
      prisma.modelEdge.findMany({
        where: { projectId: params.projectId },
        select: { id: true },
      }),
      prisma.dataObject.findMany({
        where: { projectId: params.projectId },
        select: {
          id: true,
          confidentiality: true,
          integrity: true,
          availability: true,
        },
      }),
      prisma.assetValue.findMany({
        where: {
          projectId: params.projectId,
          assetType: {
            in: ['Node', 'Edge'],
          },
        },
        select: { value: true },
      }),
      prisma.finding.findMany({
        where: { projectId: params.projectId },
        orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
        select: {
          assetName: true,
          severity: true,
          questionText: true,
          normReference: true,
        },
      }),
      prisma.measure.findMany({
        where: { projectId: params.projectId },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
        select: {
          title: true,
          status: true,
          priority: true,
          normReference: true,
          dueDate: true,
        },
      }),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const derivedDataObjectValues = dataObjects.map((dataObject) => ({
      value: Math.max(dataObject.confidentiality, dataObject.integrity, dataObject.availability),
    }));
    const assetsByRisk = bucketFromValues([...assetValues, ...derivedDataObjectValues]);
    const findingsBySeverity = bucketFromValues(findings.map((finding) => ({ value: finding.severity })));
    const measuresSummary = {
      total: measures.length,
      open: measures.filter((measure) => measure.status === 'Open').length,
      inProgress: measures.filter((measure) => measure.status === 'InProgress').length,
      done: measures.filter((measure) => measure.status === 'Done').length,
      completionRate: measures.length > 0 ? Math.round((measures.filter((measure) => measure.status === 'Done').length / measures.length) * 100) : 0,
    };

    const latexSource = buildLatexDocument({
      project,
      modelStats: {
        containers: nodes.filter(
          (node) => node.category.trim().toLowerCase() === 'container' || node.category.trim().toLowerCase() === 'system'
        ).length,
        components: nodes.filter(
          (node) => node.category.trim().toLowerCase() !== 'container' && node.category.trim().toLowerCase() !== 'system'
        ).length,
        interfaces: edges.length,
        dataObjects: dataObjects.length,
      },
      assets: assetsByRisk,
      findings,
      findingsBySeverity,
      measures,
      measuresSummary,
      generatedAt: new Date(),
    });

    workingDirectory = await mkdtemp(path.join(tmpdir(), 'secudo-report-'));
    const texPath = path.join(workingDirectory, 'report.tex');
    const pdfPath = path.join(workingDirectory, 'report.pdf');

    await writeFile(texPath, latexSource, 'utf8');
    await compileLatexToPdf(workingDirectory);
    const pdfBuffer = await readFile(pdfPath);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=\"${safeFileName(project.name)}-report.pdf\"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Generate report PDF error:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to generate PDF' }, { status: 500 });
  } finally {
    if (workingDirectory) {
      await rm(workingDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
