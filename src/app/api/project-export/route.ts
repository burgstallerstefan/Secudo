import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGlobalAdmin } from '@/lib/user-role';
import { supportsProjectDeletedAt } from '@/lib/project-trash';
import { parseProjectNorms } from '@/lib/project-norm';

const OSCAL_VERSION = '1.1.3';

const ExportProjectsSchema = z.object({
  projectIds: z.array(z.string().min(1)).min(1),
  format: z.enum(['secudo', 'oscal']).optional().default('secudo'),
});

type ExportFormat = z.infer<typeof ExportProjectsSchema>['format'];

type ExportedUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  role: string;
};

type ExportedProjectData = {
  project: {
    id: string;
    name: string;
    description: string | null;
    norm: string;
    minRoleToView: string;
    createdAt: Date;
    updatedAt: Date;
  };
  members: Array<{
    id: string;
    projectId: string;
    userId: string;
    role: string;
    createdAt: Date;
    addedAt: Date;
  }>;
  users: ExportedUser[];
  nodes: Array<{
    id: string;
    stableId: string;
    name: string;
    category: string;
    description: string | null;
    notes: string | null;
    parentNodeId: string | null;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    name: string | null;
    direction: string;
    protocol: string | null;
    description: string | null;
    notes: string | null;
  }>;
  dataObjects: Array<{
    id: string;
    name: string;
    description: string | null;
    dataClass: string;
    confidentiality: number;
    integrity: number;
    availability: number;
    tags: string | null;
  }>;
  componentData: Array<{
    id: string;
    nodeId: string;
    dataObjectId: string;
    role: string;
    notes: string | null;
  }>;
  edgeDataFlows: Array<{
    id: string;
    edgeId: string;
    dataObjectId: string;
    direction: string;
    notes: string | null;
  }>;
  assetValues: unknown[];
  questions: unknown[];
  answers: unknown[];
  finalAnswers: unknown[];
  findings: Array<{
    id: string;
    assetType: string;
    assetId: string;
    assetName: string;
    questionText: string;
    normReference: string;
    severity: number;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  measures: Array<{
    id: string;
    findingId: string;
    title: string;
    description: string | null;
    assetType: string;
    assetId: string;
    normReference: string | null;
    priority: string;
    status: string;
    assignedTo: string | null;
    dueDate: Date | null;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  reports: unknown[];
  savepoints: unknown[];
};

type ProjectWithMembers = {
  id: string;
  name: string;
  description: string | null;
  norm: string;
  minRoleToView: string;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    id: string;
    projectId: string;
    userId: string;
    role: string;
    createdAt: Date;
    addedAt: Date;
  }>;
};

const toOscalUuid = (value: string): string => {
  const digest = createHash('sha1').update(value).digest('hex').slice(0, 32).split('');
  digest[12] = '4';
  digest[16] = ((parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  const normalized = digest.join('');
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
};

const ensureText = (value: string | null | undefined, fallback: string): string => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
};

const scoreToFipsImpact = (score: number): 'fips-199-low' | 'fips-199-moderate' | 'fips-199-high' => {
  if (score >= 8) {
    return 'fips-199-high';
  }
  if (score >= 4) {
    return 'fips-199-moderate';
  }
  return 'fips-199-low';
};

const mapNodeCategoryToOscalType = (category: string): string => {
  const normalized = category.trim().toLowerCase();
  if (normalized === 'system') {
    return 'this-system';
  }
  if (normalized === 'human') {
    return 'person';
  }
  return 'service';
};

const mapProjectRoleToOscalRoleId = (role: string): string => {
  const normalized = role.trim().toLowerCase();
  if (normalized === 'admin') {
    return 'secudo-project-admin';
  }
  if (normalized === 'viewer') {
    return 'secudo-project-viewer';
  }
  return 'secudo-project-editor';
};

const toUserDisplayName = (user: ExportedUser): string => {
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (fullName) {
    return fullName;
  }
  return user.name || user.email;
};

const normalizeControlId = (normReference: string): string => {
  const normalized = normReference.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const trimmed = normalized.replace(/^-+|-+$/g, '');
  return trimmed || 'secudo-control';
};

const toShortDate = (value: Date | null): string | null => {
  if (!value) {
    return null;
  }
  return value.toISOString().slice(0, 10);
};

const groupComponentDataByNodeId = (
  componentData: ExportedProjectData['componentData']
): Map<string, ExportedProjectData['componentData']> => {
  const componentDataByNodeId = new Map<string, ExportedProjectData['componentData']>();
  componentData.forEach((entry) => {
    const existing = componentDataByNodeId.get(entry.nodeId);
    if (existing) {
      existing.push(entry);
      return;
    }
    componentDataByNodeId.set(entry.nodeId, [entry]);
  });
  return componentDataByNodeId;
};

const groupEdgeDataFlowsByEdgeId = (
  edgeDataFlows: ExportedProjectData['edgeDataFlows']
): Map<string, ExportedProjectData['edgeDataFlows']> => {
  const edgeDataFlowsByEdgeId = new Map<string, ExportedProjectData['edgeDataFlows']>();
  edgeDataFlows.forEach((entry) => {
    const existing = edgeDataFlowsByEdgeId.get(entry.edgeId);
    if (existing) {
      existing.push(entry);
      return;
    }
    edgeDataFlowsByEdgeId.set(entry.edgeId, [entry]);
  });
  return edgeDataFlowsByEdgeId;
};

const groupMeasuresByFindingId = (
  measures: ExportedProjectData['measures']
): Map<string, ExportedProjectData['measures']> => {
  const measuresByFindingId = new Map<string, ExportedProjectData['measures']>();
  measures.forEach((entry) => {
    const existing = measuresByFindingId.get(entry.findingId);
    if (existing) {
      existing.push(entry);
      return;
    }
    measuresByFindingId.set(entry.findingId, [entry]);
  });
  return measuresByFindingId;
};

const buildOscalProject = (projectData: ExportedProjectData) => {
  const nodeById = new Map(projectData.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(projectData.edges.map((edge) => [edge.id, edge]));
  const userById = new Map(projectData.users.map((user) => [user.id, user]));
  const dataObjectById = new Map(projectData.dataObjects.map((dataObject) => [dataObject.id, dataObject]));
  const componentDataByNodeId = groupComponentDataByNodeId(projectData.componentData);
  const edgeDataFlowsByEdgeId = groupEdgeDataFlowsByEdgeId(projectData.edgeDataFlows);
  const measuresByFindingId = groupMeasuresByFindingId(projectData.measures);

  const norms = parseProjectNorms(projectData.project.norm).filter((norm) => norm !== 'None');
  const effectiveNorms = norms.length > 0 ? norms : ['Secudo'];
  const primaryNormResourceUuid = toOscalUuid(`project:${projectData.project.id}:norm:primary`);

  const parties = projectData.users.map((user) => ({
    uuid: toOscalUuid(`party:${user.id}`),
    type: 'person',
    name: toUserDisplayName(user),
    ...(user.email ? { 'email-addresses': [user.email] } : {}),
    props: [
      { name: 'secudo-user-id', value: user.id },
      { name: 'secudo-global-role', value: user.role },
    ],
  }));

  const systemUsers = projectData.members.map((member) => {
    const linkedUser = userById.get(member.userId);
    return {
      uuid: toOscalUuid(`member:${member.id}`),
      title: linkedUser ? toUserDisplayName(linkedUser) : member.userId,
      'short-name': linkedUser?.email || member.userId,
      'role-ids': [mapProjectRoleToOscalRoleId(member.role)],
      props: [
        { name: 'secudo-member-id', value: member.id },
        { name: 'secudo-user-id', value: member.userId },
        { name: 'secudo-project-role', value: member.role },
      ],
    };
  });

  const thisSystemComponentUuid = toOscalUuid(`project:${projectData.project.id}:this-system`);
  const nodeComponents = projectData.nodes.map((node) => {
    const relatedData = componentDataByNodeId.get(node.id) || [];
    const dataRelations = relatedData
      .map((entry) => {
        const dataObject = dataObjectById.get(entry.dataObjectId);
        const dataObjectName = dataObject ? dataObject.name : entry.dataObjectId;
        return `${dataObjectName}:${entry.role}`;
      })
      .join('; ');

    const props = [
      { name: 'secudo-node-id', value: node.id },
      { name: 'secudo-node-stable-id', value: node.stableId },
      { name: 'secudo-node-category', value: node.category },
    ];
    if (node.parentNodeId) {
      props.push({ name: 'secudo-parent-node-id', value: node.parentNodeId });
    }
    if (dataRelations) {
      props.push({ name: 'secudo-data-relations', value: dataRelations });
    }

    return {
      uuid: toOscalUuid(`node:${node.id}`),
      type: mapNodeCategoryToOscalType(node.category),
      title: node.name,
      description: ensureText(node.description || node.notes, `Secudo node ${node.stableId}`),
      props,
      status: {
        state: 'operational',
      },
    };
  });

  const components = [
    {
      uuid: thisSystemComponentUuid,
      type: 'this-system',
      title: projectData.project.name,
      description: ensureText(
        projectData.project.description,
        'System representation exported from Secudo.'
      ),
      status: {
        state: 'operational',
      },
      props: [
        { name: 'secudo-project-id', value: projectData.project.id },
        { name: 'secudo-min-role-to-view', value: projectData.project.minRoleToView },
      ],
    },
    ...nodeComponents,
  ];

  const mappedInventoryItems = projectData.edges.map((edge) => {
    const sourceNode = nodeById.get(edge.sourceNodeId);
    const targetNode = nodeById.get(edge.targetNodeId);
    const relatedDataFlows = edgeDataFlowsByEdgeId.get(edge.id) || [];
    const dataFlowSummary = relatedDataFlows
      .map((entry) => {
        const dataObject = dataObjectById.get(entry.dataObjectId);
        const dataObjectName = dataObject ? dataObject.name : entry.dataObjectId;
        return `${dataObjectName}:${entry.direction}`;
      })
      .join('; ');

    const implementedComponentUuids = new Set<string>([thisSystemComponentUuid]);
    if (sourceNode) {
      implementedComponentUuids.add(toOscalUuid(`node:${sourceNode.id}`));
    }
    if (targetNode) {
      implementedComponentUuids.add(toOscalUuid(`node:${targetNode.id}`));
    }

    const props = [
      { name: 'secudo-edge-id', value: edge.id },
      { name: 'secudo-edge-direction', value: edge.direction },
    ];
    if (edge.name) {
      props.push({ name: 'secudo-edge-name', value: edge.name });
    }
    if (edge.protocol) {
      props.push({ name: 'secudo-edge-protocol', value: edge.protocol });
    }
    if (dataFlowSummary) {
      props.push({ name: 'secudo-edge-data-flows', value: dataFlowSummary });
    }

    return {
      uuid: toOscalUuid(`edge:${edge.id}`),
      description: ensureText(
        edge.description,
        `${sourceNode?.name || edge.sourceNodeId} -> ${targetNode?.name || edge.targetNodeId}`
      ),
      props,
      'implemented-components': Array.from(implementedComponentUuids).map((componentUuid) => ({
        'component-uuid': componentUuid,
      })),
    };
  });

  const inventoryItems =
    mappedInventoryItems.length > 0
      ? mappedInventoryItems
      : [
          {
            uuid: toOscalUuid(`project:${projectData.project.id}:inventory-item:default`),
            description:
              'No inventory items were modeled in Secudo. This placeholder represents the system-level inventory.',
            props: [{ name: 'secudo-generated', value: 'true' }],
            'implemented-components': [
              {
                'component-uuid': thisSystemComponentUuid,
              },
            ],
          },
        ];

  const informationTypes =
    projectData.dataObjects.length > 0
      ? projectData.dataObjects.map((dataObject) => ({
          uuid: toOscalUuid(`data-object:${dataObject.id}`),
          title: dataObject.name,
          description: ensureText(
            dataObject.description,
            `Secudo data class ${dataObject.dataClass}`
          ),
          categorizations: [
            {
              system: 'https://secudo.app/data-classification',
              'information-type-ids': [dataObject.dataClass],
            },
          ],
          'confidentiality-impact': {
            base: scoreToFipsImpact(dataObject.confidentiality),
          },
          'integrity-impact': {
            base: scoreToFipsImpact(dataObject.integrity),
          },
          'availability-impact': {
            base: scoreToFipsImpact(dataObject.availability),
          },
        }))
      : [
          {
            uuid: toOscalUuid(`project:${projectData.project.id}:information-type:default`),
            title: 'General System Information',
            description: 'No data objects were modeled in Secudo.',
            categorizations: [
              {
                system: 'https://secudo.app/data-classification',
                'information-type-ids': ['General'],
              },
            ],
            'confidentiality-impact': {
              base: 'fips-199-moderate',
            },
            'integrity-impact': {
              base: 'fips-199-moderate',
            },
            'availability-impact': {
              base: 'fips-199-moderate',
            },
          },
        ];

  const maxConfidentiality = projectData.dataObjects.length
    ? Math.max(...projectData.dataObjects.map((item) => item.confidentiality))
    : 5;
  const maxIntegrity = projectData.dataObjects.length
    ? Math.max(...projectData.dataObjects.map((item) => item.integrity))
    : 5;
  const maxAvailability = projectData.dataObjects.length
    ? Math.max(...projectData.dataObjects.map((item) => item.availability))
    : 5;

  const mappedImplementedRequirements = projectData.findings.map((finding) => {
    const findingControlId = normalizeControlId(finding.normReference);
    const relatedMeasures = measuresByFindingId.get(finding.id) || [];
    const componentUuids = new Set<string>();

    if (finding.assetType.toLowerCase() === 'node' && nodeById.has(finding.assetId)) {
      componentUuids.add(toOscalUuid(`node:${finding.assetId}`));
    }

    if (finding.assetType.toLowerCase() === 'edge') {
      const edge = edgeById.get(finding.assetId);
      if (edge) {
        if (nodeById.has(edge.sourceNodeId)) {
          componentUuids.add(toOscalUuid(`node:${edge.sourceNodeId}`));
        }
        if (nodeById.has(edge.targetNodeId)) {
          componentUuids.add(toOscalUuid(`node:${edge.targetNodeId}`));
        }
      }
    }

    const measureSummary = relatedMeasures
      .map((measure) => {
        const dueDate = toShortDate(measure.dueDate);
        if (dueDate) {
          return `${measure.title} [${measure.status}] due ${dueDate}`;
        }
        return `${measure.title} [${measure.status}]`;
      })
      .join('; ');

    return {
      uuid: toOscalUuid(`finding:${finding.id}`),
      'control-id': findingControlId,
      description: ensureText(finding.description, finding.questionText),
      props: [
        { name: 'secudo-finding-id', value: finding.id },
        { name: 'secudo-asset-type', value: finding.assetType },
        { name: 'secudo-asset-id', value: finding.assetId },
        { name: 'secudo-asset-name', value: finding.assetName },
        { name: 'secudo-severity', value: String(finding.severity) },
      ],
      statements: [
        {
          'statement-id': `${findingControlId}_statement`,
          uuid: toOscalUuid(`finding:${finding.id}:statement`),
          description: ensureText(
            [finding.questionText, finding.description].filter(Boolean).join('\n\n'),
            finding.questionText
          ),
          ...(componentUuids.size > 0
            ? {
                'by-components': Array.from(componentUuids).map((componentUuid, index) => ({
                  'component-uuid': componentUuid,
                  uuid: toOscalUuid(`finding:${finding.id}:component:${index}`),
                  description: `Mapped from Secudo finding ${finding.id}`,
                })),
              }
            : {}),
        },
      ],
      ...(measureSummary ? { remarks: `Measures: ${measureSummary}` } : {}),
    };
  });

  const implementedRequirements =
    mappedImplementedRequirements.length > 0
      ? mappedImplementedRequirements
      : [
          {
            uuid: toOscalUuid(
              `project:${projectData.project.id}:implemented-requirement:default`
            ),
            'control-id': 'secudo-control',
            description:
              'No findings were recorded in Secudo. This placeholder requirement keeps the export schema-valid.',
            props: [{ name: 'secudo-generated', value: 'true' }],
            statements: [
              {
                'statement-id': 'secudo-control_statement',
                uuid: toOscalUuid(
                  `project:${projectData.project.id}:implemented-requirement:default:statement`
                ),
                description: 'No control findings were available at export time.',
                'by-components': [
                  {
                    'component-uuid': thisSystemComponentUuid,
                    uuid: toOscalUuid(
                      `project:${projectData.project.id}:implemented-requirement:default:component`
                    ),
                    description: 'Mapped to the system component by default.',
                  },
                ],
              },
            ],
          },
        ];

  return {
    'system-security-plan': {
      uuid: toOscalUuid(`project:${projectData.project.id}:ssp`),
      metadata: {
        title: `${projectData.project.name} System Security Plan`,
        'last-modified': projectData.project.updatedAt.toISOString(),
        version: '1.0',
        'oscal-version': OSCAL_VERSION,
        roles: [
          { id: 'secudo-project-admin', title: 'Secudo Project Admin' },
          { id: 'secudo-project-editor', title: 'Secudo Project Editor' },
          { id: 'secudo-project-viewer', title: 'Secudo Project Viewer' },
        ],
        parties,
      },
      'import-profile': {
        href: `#${primaryNormResourceUuid}`,
      },
      'system-characteristics': {
        'system-ids': [
          {
            'identifier-type': 'https://ietf.org/rfc/rfc4122',
            id: toOscalUuid(`project:${projectData.project.id}:system-id`),
          },
        ],
        'system-name': projectData.project.name,
        description: ensureText(
          projectData.project.description,
          'System representation exported from Secudo.'
        ),
        props: [
          { name: 'secudo-project-id', value: projectData.project.id },
          { name: 'secudo-project-norm', value: projectData.project.norm },
          { name: 'secudo-min-role-to-view', value: projectData.project.minRoleToView },
        ],
        'security-sensitivity-level': 'moderate',
        'system-information': {
          'information-types': informationTypes,
        },
        'security-impact-level': {
          'security-objective-confidentiality': scoreToFipsImpact(maxConfidentiality),
          'security-objective-integrity': scoreToFipsImpact(maxIntegrity),
          'security-objective-availability': scoreToFipsImpact(maxAvailability),
        },
        status: {
          state: 'operational',
        },
        'authorization-boundary': {
          description:
            'Authorization boundary covers the Secudo-modeled system components and data flows.',
        },
      },
      'system-implementation': {
        users: systemUsers,
        components,
        'inventory-items': inventoryItems,
      },
      'control-implementation': {
        description: 'Control implementation exported from Secudo findings and measures.',
        'implemented-requirements': implementedRequirements,
      },
      'back-matter': {
        resources: effectiveNorms.map((norm, index) => ({
          uuid:
            index === 0
              ? primaryNormResourceUuid
              : toOscalUuid(`project:${projectData.project.id}:norm:${norm}`),
          title: `${norm} profile reference`,
          props: [{ name: 'secudo-project-norm', value: norm }],
        })),
      },
    },
  };
};

const buildSecudoExportedProject = async (project: ProjectWithMembers): Promise<ExportedProjectData> => {
  const [
    nodes,
    edges,
    dataObjects,
    componentData,
    edgeDataFlows,
    assetValues,
    questions,
    answers,
    finalAnswers,
    findings,
    measures,
    reports,
    savepoints,
  ] = await Promise.all([
    prisma.modelNode.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.modelEdge.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dataObject.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.componentData.findMany({
      where: {
        node: {
          projectId: project.id,
        },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.edgeDataFlow.findMany({
      where: {
        edge: {
          projectId: project.id,
        },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.assetValue.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.question.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.answer.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.finalAnswer.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.finding.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.measure.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.report.findMany({
      where: { projectId: project.id },
      orderBy: { generatedAt: 'asc' },
    }),
    prisma.canonicalModelSavepoint.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const referencedUserIds = new Set<string>();
  project.members.forEach((member) => {
    referencedUserIds.add(member.userId);
  });
  nodes.forEach((node) => {
    if (node.createdByUserId) referencedUserIds.add(node.createdByUserId);
    if (node.updatedByUserId) referencedUserIds.add(node.updatedByUserId);
  });
  edges.forEach((edge) => {
    if (edge.createdByUserId) referencedUserIds.add(edge.createdByUserId);
  });
  answers.forEach((answer) => {
    referencedUserIds.add(answer.userId);
  });
  measures.forEach((measure) => {
    if (measure.createdByUserId) referencedUserIds.add(measure.createdByUserId);
  });
  savepoints.forEach((savepoint) => {
    if (savepoint.createdByUserId) referencedUserIds.add(savepoint.createdByUserId);
  });

  const exportedUsers: ExportedUser[] =
    referencedUserIds.size > 0
      ? await prisma.user.findMany({
          where: {
            id: {
              in: Array.from(referencedUserIds),
            },
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            name: true,
            role: true,
          },
        })
      : [];

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      norm: project.norm,
      minRoleToView: project.minRoleToView,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    members: project.members.map((member) => ({
      id: member.id,
      projectId: member.projectId,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      addedAt: member.addedAt,
    })),
    users: exportedUsers,
    nodes,
    edges,
    dataObjects,
    componentData,
    edgeDataFlows,
    assetValues,
    questions,
    answers,
    finalAnswers,
    findings,
    measures,
    reports,
    savepoints,
  };
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    const globalRole = session.user?.role;

    if (!userId) {
      return NextResponse.json({ error: 'User not found in session' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ExportProjectsSchema.parse(body);
    const exportFormat: ExportFormat = parsed.format;
    const uniqueProjectIds = Array.from(new Set(parsed.projectIds));
    const activeFilter = supportsProjectDeletedAt() ? { deletedAt: null } : {};

    const projects = await prisma.project.findMany({
      where: {
        id: { in: uniqueProjectIds },
        ...activeFilter,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (projects.length !== uniqueProjectIds.length) {
      const foundIds = new Set(projects.map((project) => project.id));
      const missingIds = uniqueProjectIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        {
          error: 'One or more projects were not found',
          missingProjectIds: missingIds,
        },
        { status: 404 }
      );
    }

    if (!isGlobalAdmin(globalRole)) {
      const unauthorized = projects
        .filter((project) => {
          const membership = project.members.find((member) => member.userId === userId);
          return membership?.role !== 'Admin' && membership?.role !== 'Editor';
        })
        .map((project) => project.id);

      if (unauthorized.length > 0) {
        return NextResponse.json(
          {
            error: 'Not authorized to export one or more selected projects (Editor required)',
            unauthorizedProjectIds: unauthorized,
          },
          { status: 403 }
        );
      }
    }

    const projectById = new Map(projects.map((project) => [project.id, project]));
    const orderedProjects = uniqueProjectIds
      .map((projectId) => projectById.get(projectId))
      .filter((project): project is NonNullable<typeof project> => Boolean(project));

    const exportedProjects = await Promise.all(
      orderedProjects.map((project) => buildSecudoExportedProject(project))
    );

    const exportedBy = {
      id: session.user?.id ?? null,
      email: session.user?.email ?? null,
      name: session.user?.name ?? null,
      role: session.user?.role ?? null,
    };

    if (exportFormat === 'oscal') {
      const documents = exportedProjects.map((project) => buildOscalProject(project));
      return NextResponse.json({
        format: 'oscal-project-export',
        model: 'system-security-plan',
        version: 1,
        oscalVersion: OSCAL_VERSION,
        exportedAt: new Date().toISOString(),
        exportedBy,
        projectCount: documents.length,
        documents,
      });
    }

    return NextResponse.json({
      format: 'secudo-project-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy,
      projects: exportedProjects,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Export projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
