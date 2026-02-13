import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const ImportBundleSchema = z.object({
  format: z.string().optional(),
  version: z.number().optional(),
  projects: z.array(z.unknown()).min(1),
});

type IdMap = Map<string, string>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeProjectMinRoleToView(value: unknown): 'any' | 'viewer' | 'editor' | 'admin' | 'private' {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'any') return 'any';
  if (normalized === 'viewer') return 'viewer';
  if (normalized === 'editor') return 'editor';
  if (normalized === 'admin') return 'admin';
  return 'private';
}

function normalizeMembershipRole(value: unknown): 'Admin' | 'Editor' | 'Viewer' {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'editor') return 'Editor';
  return 'Viewer';
}

function normalizeEdgeDirection(value: unknown): 'A_TO_B' | 'B_TO_A' | 'BIDIRECTIONAL' {
  const normalized = readString(value)?.toUpperCase();
  if (normalized === 'B_TO_A') return 'B_TO_A';
  if (normalized === 'BIDIRECTIONAL') return 'BIDIRECTIONAL';
  return 'A_TO_B';
}

function normalizeEdgeFlowDirection(
  value: unknown
): 'SourceToTarget' | 'TargetToSource' | 'Bidirectional' {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'targettosource') return 'TargetToSource';
  if (normalized === 'bidirectional') return 'Bidirectional';
  return 'SourceToTarget';
}

function normalizeComponentDataRole(
  value: unknown
): 'Stores' | 'Processes' | 'Generates' | 'Receives' {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'processes') return 'Processes';
  if (normalized === 'generates') return 'Generates';
  if (normalized === 'receives') return 'Receives';
  return 'Stores';
}

function normalizeAssetType(value: unknown): 'Node' | 'Edge' | 'DataObject' | null {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'node') return 'Node';
  if (normalized === 'edge') return 'Edge';
  if (normalized === 'dataobject') return 'DataObject';
  return null;
}

function normalizeQuestionTargetType(value: unknown): 'Component' | 'Edge' | 'DataObject' | 'None' {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'component') return 'Component';
  if (normalized === 'edge') return 'Edge';
  if (normalized === 'dataobject') return 'DataObject';
  return 'None';
}

function normalizeAnswerType(value: unknown): 'YesNo' | 'Text' | 'MultiSelect' {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'text') return 'Text';
  if (normalized === 'multiselect') return 'MultiSelect';
  return 'YesNo';
}

function normalizeAnswerTargetType(value: unknown): 'Component' | 'Edge' | 'DataObject' | 'None' | null {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'component' || normalized === 'node') return 'Component';
  if (normalized === 'edge') return 'Edge';
  if (normalized === 'dataobject') return 'DataObject';
  if (normalized === 'none') return 'None';
  return null;
}

function normalizeMeasureStatus(value: unknown): string {
  const status = readString(value);
  return status && status.trim().length > 0 ? status : 'Open';
}

function normalizeMeasurePriority(value: unknown): string {
  const priority = readString(value);
  return priority && priority.trim().length > 0 ? priority : 'Medium';
}

function clampSeverity(value: unknown): number {
  const numeric = readNumber(value);
  if (numeric === null) return 5;
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

function clampAssetValue(value: unknown): number {
  const numeric = readNumber(value);
  if (numeric === null) return 5;
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

function clampCia(value: unknown): number {
  const numeric = readNumber(value);
  if (numeric === null) return 5;
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

function resolveUniqueName(base: string, usedNames: Set<string>, fallbackPrefix: string): string {
  const normalizedBase = base.trim() || fallbackPrefix;
  let candidate = normalizedBase;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${normalizedBase} (${suffix})`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function mapByAssetType(
  assetType: 'Node' | 'Edge' | 'DataObject' | null,
  sourceAssetId: string,
  nodeIdMap: IdMap,
  edgeIdMap: IdMap,
  dataObjectIdMap: IdMap
): string | null {
  if (!assetType) {
    return null;
  }
  if (assetType === 'Node') {
    return nodeIdMap.get(sourceAssetId) || null;
  }
  if (assetType === 'Edge') {
    return edgeIdMap.get(sourceAssetId) || null;
  }
  return dataObjectIdMap.get(sourceAssetId) || null;
}

function mapAnswerTargetId(
  targetType: 'Component' | 'Edge' | 'DataObject' | 'None' | null,
  sourceTargetId: string | null,
  nodeIdMap: IdMap,
  edgeIdMap: IdMap,
  dataObjectIdMap: IdMap
): string | null {
  if (!sourceTargetId || !targetType || targetType === 'None') {
    return null;
  }
  if (targetType === 'Component') {
    return nodeIdMap.get(sourceTargetId) || null;
  }
  if (targetType === 'Edge') {
    return edgeIdMap.get(sourceTargetId) || null;
  }
  return dataObjectIdMap.get(sourceTargetId) || null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found in session' }, { status: 401 });
    }

    const body = await request.json();
    const payload = ImportBundleSchema.parse(body);

    const importedProjects: Array<{ id: string; name: string }> = [];
    const failedProjects: Array<{ index: number; name: string; error: string }> = [];

    for (const [index, rawProject] of payload.projects.entries()) {
      const projectPayload = asRecord(rawProject);
      const projectMeta = asRecord(projectPayload?.project);
      const projectName = readString(projectMeta?.name)?.trim() || '';

      if (!projectPayload || !projectMeta || !projectName) {
        failedProjects.push({
          index,
          name: projectName || `Project ${index + 1}`,
          error: 'Invalid project payload',
        });
        continue;
      }

      try {
        const imported = await prisma.$transaction(async (tx) => {
          const createdProject = await tx.project.create({
            data: {
              name: projectName,
              description: readOptionalString(projectMeta.description) ?? null,
              norm: readString(projectMeta.norm) || 'IEC 62443',
              minRoleToView: normalizeProjectMinRoleToView(projectMeta.minRoleToView),
            },
            select: {
              id: true,
              name: true,
            },
          });

          const users = asArray(projectPayload.users);
          const oldUserIdToEmail = new Map<string, string>();
          users.forEach((rawUser) => {
            const userRecord = asRecord(rawUser);
            const oldUserId = readString(userRecord?.id);
            const email = readString(userRecord?.email);
            if (oldUserId && email) {
              oldUserIdToEmail.set(oldUserId, email.toLowerCase());
            }
          });

          const distinctEmails = Array.from(new Set(Array.from(oldUserIdToEmail.values())));
          const existingUsers =
            distinctEmails.length > 0
              ? await tx.user.findMany({
                  where: { email: { in: distinctEmails } },
                  select: { id: true, email: true },
                })
              : [];
          const existingUserByEmail = new Map(
            existingUsers.map((existingUser) => [existingUser.email.toLowerCase(), existingUser.id])
          );

          const oldUserIdToNewUserId = new Map<string, string>();
          oldUserIdToEmail.forEach((email, oldUserId) => {
            const mappedUserId = existingUserByEmail.get(email);
            if (mappedUserId) {
              oldUserIdToNewUserId.set(oldUserId, mappedUserId);
            }
          });

          await tx.projectMembership.create({
            data: {
              projectId: createdProject.id,
              userId,
              role: 'Admin',
            },
          });

          const members = asArray(projectPayload.members);
          const additionalMemberships: Array<{ projectId: string; userId: string; role: string }> = [];
          const assignedUserIds = new Set<string>([userId]);
          members.forEach((rawMember) => {
            const memberRecord = asRecord(rawMember);
            const sourceUserId = readString(memberRecord?.userId);
            if (!sourceUserId) return;
            const mappedUserId = oldUserIdToNewUserId.get(sourceUserId);
            if (!mappedUserId || assignedUserIds.has(mappedUserId)) return;
            assignedUserIds.add(mappedUserId);
            additionalMemberships.push({
              projectId: createdProject.id,
              userId: mappedUserId,
              role: normalizeMembershipRole(memberRecord?.role),
            });
          });
          if (additionalMemberships.length > 0) {
            await tx.projectMembership.createMany({
              data: additionalMemberships,
              skipDuplicates: true,
            });
          }

          const nodeIdMap: IdMap = new Map();
          const edgeIdMap: IdMap = new Map();
          const dataObjectIdMap: IdMap = new Map();
          const questionIdMap: IdMap = new Map();
          const findingIdMap: IdMap = new Map();
          const usedStableIds = new Set<string>();
          const usedDataObjectNames = new Set<string>();

          const nodes = asArray(projectPayload.nodes);
          let stableIdCounter = 1;
          for (const rawNode of nodes) {
            const nodeRecord = asRecord(rawNode);
            const sourceNodeId = readString(nodeRecord?.id);
            if (!sourceNodeId) continue;

            let stableId = readString(nodeRecord?.stableId)?.trim() || '';
            if (!stableId) {
              stableId = `imported-node-${stableIdCounter}`;
              stableIdCounter += 1;
            }
            if (usedStableIds.has(stableId)) {
              let duplicateCounter = 2;
              let candidate = `${stableId}-${duplicateCounter}`;
              while (usedStableIds.has(candidate)) {
                duplicateCounter += 1;
                candidate = `${stableId}-${duplicateCounter}`;
              }
              stableId = candidate;
            }
            usedStableIds.add(stableId);

            const createdNode = await tx.modelNode.create({
              data: {
                projectId: createdProject.id,
                stableId,
                name: readString(nodeRecord?.name) || 'Imported Node',
                category: readString(nodeRecord?.category) || 'Component',
                description: readOptionalString(nodeRecord?.description) ?? null,
                notes: readOptionalString(nodeRecord?.notes) ?? null,
                parentNodeId: null,
                createdByUserId: readString(nodeRecord?.createdByUserId)
                  ? oldUserIdToNewUserId.get(readString(nodeRecord?.createdByUserId) as string) || null
                  : null,
                updatedByUserId: readString(nodeRecord?.updatedByUserId)
                  ? oldUserIdToNewUserId.get(readString(nodeRecord?.updatedByUserId) as string) || null
                  : null,
              },
              select: { id: true },
            });

            nodeIdMap.set(sourceNodeId, createdNode.id);
          }

          for (const rawNode of nodes) {
            const nodeRecord = asRecord(rawNode);
            const sourceNodeId = readString(nodeRecord?.id);
            if (!sourceNodeId) continue;
            const newNodeId = nodeIdMap.get(sourceNodeId);
            if (!newNodeId) continue;
            const sourceParentNodeId = readString(nodeRecord?.parentNodeId);
            if (!sourceParentNodeId) continue;
            const mappedParentNodeId = nodeIdMap.get(sourceParentNodeId);
            if (!mappedParentNodeId) continue;
            await tx.modelNode.update({
              where: { id: newNodeId },
              data: { parentNodeId: mappedParentNodeId },
            });
          }

          const edges = asArray(projectPayload.edges);
          for (const rawEdge of edges) {
            const edgeRecord = asRecord(rawEdge);
            const sourceEdgeId = readString(edgeRecord?.id);
            const sourceNodeId = readString(edgeRecord?.sourceNodeId);
            const targetNodeId = readString(edgeRecord?.targetNodeId);
            if (!sourceEdgeId || !sourceNodeId || !targetNodeId) continue;

            const mappedSourceNodeId = nodeIdMap.get(sourceNodeId);
            const mappedTargetNodeId = nodeIdMap.get(targetNodeId);
            if (!mappedSourceNodeId || !mappedTargetNodeId) continue;

            const createdEdge = await tx.modelEdge.create({
              data: {
                projectId: createdProject.id,
                sourceNodeId: mappedSourceNodeId,
                targetNodeId: mappedTargetNodeId,
                name: readOptionalString(edgeRecord?.name) ?? null,
                direction: normalizeEdgeDirection(edgeRecord?.direction),
                protocol: readOptionalString(edgeRecord?.protocol) ?? null,
                description: readOptionalString(edgeRecord?.description) ?? null,
                notes: readOptionalString(edgeRecord?.notes) ?? null,
                createdByUserId: readString(edgeRecord?.createdByUserId)
                  ? oldUserIdToNewUserId.get(readString(edgeRecord?.createdByUserId) as string) || null
                  : null,
              },
              select: { id: true },
            });

            edgeIdMap.set(sourceEdgeId, createdEdge.id);
          }

          const dataObjects = asArray(projectPayload.dataObjects);
          for (const rawDataObject of dataObjects) {
            const dataObjectRecord = asRecord(rawDataObject);
            const sourceDataObjectId = readString(dataObjectRecord?.id);
            if (!sourceDataObjectId) continue;

            const importedName = readString(dataObjectRecord?.name) || 'Imported Data Object';
            const uniqueName = resolveUniqueName(importedName, usedDataObjectNames, 'Imported Data Object');

            const createdDataObject = await tx.dataObject.create({
              data: {
                projectId: createdProject.id,
                name: uniqueName,
                description: readOptionalString(dataObjectRecord?.description) ?? null,
                dataClass: readString(dataObjectRecord?.dataClass) || 'Other',
                confidentiality: clampCia(dataObjectRecord?.confidentiality),
                integrity: clampCia(dataObjectRecord?.integrity),
                availability: clampCia(dataObjectRecord?.availability),
                tags: readOptionalString(dataObjectRecord?.tags) ?? null,
              },
              select: { id: true },
            });

            dataObjectIdMap.set(sourceDataObjectId, createdDataObject.id);
          }

          const componentData = asArray(projectPayload.componentData);
          const componentDataRows: Array<{
            nodeId: string;
            dataObjectId: string;
            role: string;
            notes: string | null;
          }> = [];
          componentData.forEach((rawComponentData) => {
            const record = asRecord(rawComponentData);
            const sourceNodeId = readString(record?.nodeId);
            const sourceDataObjectId = readString(record?.dataObjectId);
            if (!sourceNodeId || !sourceDataObjectId) return;
            const mappedNodeId = nodeIdMap.get(sourceNodeId);
            const mappedDataObjectId = dataObjectIdMap.get(sourceDataObjectId);
            if (!mappedNodeId || !mappedDataObjectId) return;
            componentDataRows.push({
              nodeId: mappedNodeId,
              dataObjectId: mappedDataObjectId,
              role: normalizeComponentDataRole(record?.role),
              notes: readOptionalString(record?.notes) ?? null,
            });
          });
          if (componentDataRows.length > 0) {
            await tx.componentData.createMany({
              data: componentDataRows,
              skipDuplicates: true,
            });
          }

          const edgeDataFlows = asArray(projectPayload.edgeDataFlows);
          const edgeDataFlowRows: Array<{
            edgeId: string;
            dataObjectId: string;
            direction: string;
            notes: string | null;
          }> = [];
          edgeDataFlows.forEach((rawEdgeDataFlow) => {
            const record = asRecord(rawEdgeDataFlow);
            const sourceEdgeId = readString(record?.edgeId);
            const sourceDataObjectId = readString(record?.dataObjectId);
            if (!sourceEdgeId || !sourceDataObjectId) return;
            const mappedEdgeId = edgeIdMap.get(sourceEdgeId);
            const mappedDataObjectId = dataObjectIdMap.get(sourceDataObjectId);
            if (!mappedEdgeId || !mappedDataObjectId) return;
            edgeDataFlowRows.push({
              edgeId: mappedEdgeId,
              dataObjectId: mappedDataObjectId,
              direction: normalizeEdgeFlowDirection(record?.direction),
              notes: readOptionalString(record?.notes) ?? null,
            });
          });
          if (edgeDataFlowRows.length > 0) {
            await tx.edgeDataFlow.createMany({
              data: edgeDataFlowRows,
              skipDuplicates: true,
            });
          }

          const assetValues = asArray(projectPayload.assetValues);
          const assetValueRows: Array<{
            projectId: string;
            assetType: string;
            assetId: string;
            value: number;
            comment: string | null;
          }> = [];
          assetValues.forEach((rawAssetValue) => {
            const record = asRecord(rawAssetValue);
            const sourceAssetType = normalizeAssetType(record?.assetType);
            const sourceAssetId = readString(record?.assetId);
            if (!sourceAssetType || !sourceAssetId) return;
            const mappedAssetId = mapByAssetType(
              sourceAssetType,
              sourceAssetId,
              nodeIdMap,
              edgeIdMap,
              dataObjectIdMap
            );
            if (!mappedAssetId) return;
            assetValueRows.push({
              projectId: createdProject.id,
              assetType: sourceAssetType,
              assetId: mappedAssetId,
              value: clampAssetValue(record?.value),
              comment: readOptionalString(record?.comment) ?? null,
            });
          });
          if (assetValueRows.length > 0) {
            await tx.assetValue.createMany({
              data: assetValueRows,
              skipDuplicates: true,
            });
          }

          const questions = asArray(projectPayload.questions);
          for (const rawQuestion of questions) {
            const questionRecord = asRecord(rawQuestion);
            const sourceQuestionId = readString(questionRecord?.id);
            if (!sourceQuestionId) continue;
            const createdQuestion = await tx.question.create({
              data: {
                projectId: createdProject.id,
                text: readString(questionRecord?.text) || 'Imported Question',
                normReference: readString(questionRecord?.normReference) || 'Custom',
                targetType: normalizeQuestionTargetType(questionRecord?.targetType),
                answerType: normalizeAnswerType(questionRecord?.answerType),
                riskDescription: readOptionalString(questionRecord?.riskDescription) ?? null,
                defaultMeasures: readOptionalString(questionRecord?.defaultMeasures) ?? null,
              },
              select: { id: true },
            });
            questionIdMap.set(sourceQuestionId, createdQuestion.id);
          }

          const answers = asArray(projectPayload.answers);
          const answerRows: Array<{
            projectId: string;
            questionId: string;
            userId: string;
            answerValue: string | null;
            targetType: string | null;
            targetId: string | null;
            comment: string | null;
            isAggregate: boolean;
          }> = [];
          answers.forEach((rawAnswer) => {
            const answerRecord = asRecord(rawAnswer);
            const sourceQuestionId = readString(answerRecord?.questionId);
            if (!sourceQuestionId) return;
            const mappedQuestionId = questionIdMap.get(sourceQuestionId);
            if (!mappedQuestionId) return;
            const sourceUserId = readString(answerRecord?.userId);
            const mappedUserId = sourceUserId ? oldUserIdToNewUserId.get(sourceUserId) || userId : userId;
            const targetType = normalizeAnswerTargetType(answerRecord?.targetType);
            const targetId = mapAnswerTargetId(
              targetType,
              readString(answerRecord?.targetId),
              nodeIdMap,
              edgeIdMap,
              dataObjectIdMap
            );
            answerRows.push({
              projectId: createdProject.id,
              questionId: mappedQuestionId,
              userId: mappedUserId,
              answerValue: readOptionalString(answerRecord?.answerValue) ?? null,
              targetType,
              targetId,
              comment: readOptionalString(answerRecord?.comment) ?? null,
              isAggregate: readBoolean(answerRecord?.isAggregate),
            });
          });
          if (answerRows.length > 0) {
            await tx.answer.createMany({
              data: answerRows,
            });
          }

          const finalAnswers = asArray(projectPayload.finalAnswers);
          const finalAnswerRows: Array<{
            projectId: string;
            questionId: string;
            answerValue: string;
            status: string;
            resolvedAt: Date | null;
            notes: string | null;
          }> = [];
          finalAnswers.forEach((rawFinalAnswer) => {
            const finalAnswerRecord = asRecord(rawFinalAnswer);
            const sourceQuestionId = readString(finalAnswerRecord?.questionId);
            if (!sourceQuestionId) return;
            const mappedQuestionId = questionIdMap.get(sourceQuestionId);
            if (!mappedQuestionId) return;
            const answerValue = readString(finalAnswerRecord?.answerValue) || '';
            if (!answerValue) return;
            const resolvedAtValue = readString(finalAnswerRecord?.resolvedAt);
            finalAnswerRows.push({
              projectId: createdProject.id,
              questionId: mappedQuestionId,
              answerValue,
              status: readString(finalAnswerRecord?.status) || 'Approved',
              resolvedAt: resolvedAtValue ? new Date(resolvedAtValue) : null,
              notes: readOptionalString(finalAnswerRecord?.notes) ?? null,
            });
          });
          if (finalAnswerRows.length > 0) {
            await tx.finalAnswer.createMany({
              data: finalAnswerRows,
              skipDuplicates: true,
            });
          }

          const findings = asArray(projectPayload.findings);
          for (const rawFinding of findings) {
            const findingRecord = asRecord(rawFinding);
            if (!findingRecord) continue;
            const sourceFindingId = readString(findingRecord.id);
            const sourceAssetType = normalizeAssetType(findingRecord.assetType);
            const sourceAssetId = readString(findingRecord.assetId);
            const mappedAssetId =
              sourceAssetType && sourceAssetId
                ? mapByAssetType(sourceAssetType, sourceAssetId, nodeIdMap, edgeIdMap, dataObjectIdMap)
                : null;

            const createdFinding = await tx.finding.create({
              data: {
                projectId: createdProject.id,
                assetType: sourceAssetType || readString(findingRecord.assetType) || 'Node',
                assetId: mappedAssetId || sourceAssetId || 'general',
                assetName: readString(findingRecord.assetName) || 'Imported Asset',
                questionText: readString(findingRecord.questionText) || 'Imported Finding',
                normReference: readString(findingRecord.normReference) || 'Custom',
                severity: clampSeverity(findingRecord.severity),
                description: readOptionalString(findingRecord.description) ?? null,
              },
              select: { id: true },
            });

            if (sourceFindingId) {
              findingIdMap.set(sourceFindingId, createdFinding.id);
            }
          }

          const measures = asArray(projectPayload.measures);
          for (const rawMeasure of measures) {
            const measureRecord = asRecord(rawMeasure);
            const sourceFindingId = readString(measureRecord?.findingId);
            if (!sourceFindingId) continue;
            const mappedFindingId = findingIdMap.get(sourceFindingId);
            if (!mappedFindingId) continue;

            const sourceAssetType = normalizeAssetType(measureRecord?.assetType);
            const sourceAssetId = readString(measureRecord?.assetId);
            const mappedAssetId =
              sourceAssetType && sourceAssetId
                ? mapByAssetType(sourceAssetType, sourceAssetId, nodeIdMap, edgeIdMap, dataObjectIdMap)
                : null;

            const sourceCreatedByUserId = readString(measureRecord?.createdByUserId);
            await tx.measure.create({
              data: {
                projectId: createdProject.id,
                findingId: mappedFindingId,
                title: readString(measureRecord?.title) || 'Imported Measure',
                description: readOptionalString(measureRecord?.description) ?? null,
                assetType: sourceAssetType || readString(measureRecord?.assetType) || 'Node',
                assetId: mappedAssetId || sourceAssetId || 'general',
                normReference: readOptionalString(measureRecord?.normReference) ?? null,
                priority: normalizeMeasurePriority(measureRecord?.priority),
                status: normalizeMeasureStatus(measureRecord?.status),
                assignedTo: readOptionalString(measureRecord?.assignedTo) ?? null,
                dueDate: readString(measureRecord?.dueDate)
                  ? new Date(readString(measureRecord?.dueDate) as string)
                  : null,
                createdByUserId: sourceCreatedByUserId
                  ? oldUserIdToNewUserId.get(sourceCreatedByUserId) || null
                  : null,
              },
            });
          }

          const reports = asArray(projectPayload.reports);
          for (const rawReport of reports) {
            const reportRecord = asRecord(rawReport);
            if (!reportRecord) continue;
            await tx.report.create({
              data: {
                projectId: createdProject.id,
                title: readString(reportRecord.title) || 'Imported Report',
                generatedAt: readString(reportRecord.generatedAt)
                  ? new Date(readString(reportRecord.generatedAt) as string)
                  : new Date(),
                pdfUrl: readOptionalString(reportRecord.pdfUrl) ?? null,
                format: readString(reportRecord.format) || 'PDF',
              },
            });
          }

          const savepoints = asArray(projectPayload.savepoints);
          for (const rawSavepoint of savepoints) {
            const savepointRecord = asRecord(rawSavepoint);
            if (!savepointRecord) continue;
            const sourceCreatedByUserId = readString(savepointRecord.createdByUserId);
            const sourceModelJson = readString(savepointRecord.modelJson) || '{}';
            await tx.canonicalModelSavepoint.create({
              data: {
                projectId: createdProject.id,
                title: readString(savepointRecord.title) || 'Imported Snapshot',
                modelJson: sourceModelJson,
                createdByUserId: sourceCreatedByUserId
                  ? oldUserIdToNewUserId.get(sourceCreatedByUserId) || null
                  : null,
              },
            });
          }

          return createdProject;
        });

        importedProjects.push(imported);
      } catch (projectImportError) {
        failedProjects.push({
          index,
          name: projectName || `Project ${index + 1}`,
          error: (projectImportError as Error).message || 'Import failed',
        });
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: importedProjects.length,
      failedCount: failedProjects.length,
      importedProjects,
      failedProjects,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Import projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
