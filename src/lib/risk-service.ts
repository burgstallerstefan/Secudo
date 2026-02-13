/**
 * Risk Management Service
 * Handles finding generation, risk calculation, and measure templates
 */

import { prisma } from '@/lib/prisma';
import {
  FindingRecommendation,
  FindingRecommendationInput,
  generateFindingRecommendations,
} from '@/lib/llm-service';

export interface RiskCalculationInput {
  assetValue: number; // 1-10 criticality
  findingSeverity: number; // 1-10 severity
}

export interface RiskScore {
  score: number; // 1-100
  level: 'Low' | 'Medium' | 'High' | 'Critical';
}

const FINDING_FULFILLMENT_THRESHOLD = 4;

const parseAssessmentFulfillmentScore = (answerValue: string | null | undefined): number | null => {
  if (!answerValue) {
    return null;
  }

  const normalized = answerValue.trim().toUpperCase();
  if (normalized === 'N/A') {
    return null;
  }
  if (normalized === 'YES') {
    return 10;
  }
  if (normalized === 'NO') {
    return 0;
  }
  if (!/^(10|[0-9])$/.test(normalized)) {
    return null;
  }

  return Number.parseInt(normalized, 10);
};

const shouldGenerateFindingForAnswer = (answerValue: string | null | undefined): boolean => {
  const score = parseAssessmentFulfillmentScore(answerValue);
  return score !== null && score <= FINDING_FULFILLMENT_THRESHOLD;
};

const fallbackSeverityFromFulfillment = (answerValue: string | null | undefined): number => {
  const score = parseAssessmentFulfillmentScore(answerValue);
  if (score === null) {
    return 7;
  }
  return Math.max(1, Math.min(10, 10 - score));
};

/**
 * Calculate risk score using formula: assetValue × findingSeverity × 1.25
 * Result: 1-125, normalized to 1-100
 */
export function calculateRiskScore(input: RiskCalculationInput): RiskScore {
  const { assetValue, findingSeverity } = input;

  // Score formula: multiply value and severity, scale to 1-100
  const rawScore = (assetValue * findingSeverity) / 100 * 100;
  const score = Math.min(100, Math.max(1, Math.round(rawScore)));

  // Classify risk level
  let level: RiskScore['level'];
  if (score >= 81) {
    level = 'Critical';
  } else if (score >= 51) {
    level = 'High';
  } else if (score >= 21) {
    level = 'Medium';
  } else {
    level = 'Low';
  }

  return { score, level };
}

/**
 * Auto-generate findings and measures from negative assessment answers
 */
export async function autoGenerateFindings(projectId: string, userId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { norm: true },
    });

    const finalAnswers = await prisma.finalAnswer.findMany({
      where: { projectId },
    });

    const questions = await prisma.question.findMany({
      where: { projectId },
    });

    const answersToEvaluate =
      finalAnswers.length > 0
        ? finalAnswers.map((answer) => ({
            questionId: answer.questionId,
            answerValue: answer.answerValue,
            targetType: 'Node' as 'Node' | 'Edge',
            targetId: 'general',
            comment: null as string | null,
          }))
        : (
            await prisma.answer.findMany({
              where: {
                projectId,
              },
            })
          ).map((answer) => ({
            questionId: answer.questionId,
            answerValue: answer.answerValue || '',
            targetType: answer.targetType === 'Edge' ? ('Edge' as const) : ('Node' as const),
            targetId: answer.targetId || 'general',
            comment: answer.comment || null,
          }));

    const recommendationInputs: FindingRecommendationInput[] = [];
    const recommendationInputKeys = new Set<string>();
    for (const answer of answersToEvaluate) {
      if (!shouldGenerateFindingForAnswer(answer.answerValue)) {
        continue;
      }

      const question = questions.find((item) => item.id === answer.questionId);
      if (!question) {
        continue;
      }

      const normalizedAssetType = answer.targetType === 'Edge' ? 'Edge' : 'Node';
      const normalizedAssetId = answer.targetId || 'general';
      const recommendationKey = `${answer.questionId}::${normalizedAssetType}::${normalizedAssetId}`;
      if (recommendationInputKeys.has(recommendationKey)) {
        continue;
      }
      recommendationInputKeys.add(recommendationKey);

      recommendationInputs.push({
        key: recommendationKey,
        questionText: question.text,
        normReference: question.normReference,
        assetType: normalizedAssetType,
        assetName: normalizedAssetId === 'general' ? question.targetType || 'System' : normalizedAssetId,
        answerComment: answer.comment,
      });
    }

    const aiRecommendationResult = await generateFindingRecommendations(
      recommendationInputs,
      project?.norm || undefined
    );
    const recommendationByKey = new Map<string, FindingRecommendation>(
      aiRecommendationResult.suggestions.map((suggestion) => [suggestion.key, suggestion])
    );

    const generatedFindings = [];
    const generatedMeasures = [];

    for (const answer of answersToEvaluate) {
      if (!shouldGenerateFindingForAnswer(answer.answerValue)) {
        continue;
      }

      const question = questions.find((item) => item.id === answer.questionId);
      if (!question) {
        continue;
      }

      const normalizedAssetType = answer.targetType === 'Edge' ? 'Edge' : 'Node';
      const normalizedAssetId = answer.targetId || 'general';
      const recommendationKey = `${answer.questionId}::${normalizedAssetType}::${normalizedAssetId}`;
      const aiRecommendation = recommendationByKey.get(recommendationKey);
      const severity = aiRecommendation?.severity ?? fallbackSeverityFromFulfillment(answer.answerValue);

      const existingFinding = await prisma.finding.findFirst({
        where: {
          projectId,
          assetType: normalizedAssetType,
          assetId: normalizedAssetId,
          questionText: question.text,
        },
      });
      if (existingFinding) {
        continue;
      }

      const finding = await prisma.finding.create({
        data: {
          projectId,
          assetType: normalizedAssetType,
          assetId: normalizedAssetId,
          assetName: normalizedAssetId === 'general' ? question.targetType || 'System' : normalizedAssetId,
          questionText: question.text,
          normReference: question.normReference,
          severity,
          description: aiRecommendation?.findingDescription || `Non-compliance with ${question.normReference}: ${question.text}`,
        },
      });

      generatedFindings.push(finding);

      const measure = await prisma.measure.create({
        data: {
          projectId,
          findingId: finding.id,
          title: aiRecommendation?.measureTitle || `Remediate: ${question.text}`,
          description:
            aiRecommendation?.measureDescription ||
            `Implement control to address finding related to ${question.normReference}`,
          assetType: finding.assetType,
          assetId: finding.assetId,
          normReference: question.normReference,
          priority:
            aiRecommendation?.priority ||
            (severity >= 8 ? 'Critical' : severity >= 6 ? 'High' : severity >= 4 ? 'Medium' : 'Low'),
          status: 'Open',
          createdByUserId: userId,
        },
      });

      generatedMeasures.push(measure);
    }

    return {
      findingsGenerated: generatedFindings.length,
      measuresGenerated: generatedMeasures.length,
      ai: {
        provider: aiRecommendationResult.provider,
        model: aiRecommendationResult.model,
        fallbackUsed: aiRecommendationResult.fallbackUsed,
        warning: aiRecommendationResult.warning,
      },
    };
  } catch (error) {
    console.error('Auto-generate findings failed:', error);
    throw error;
  }
}

/**
 * Get risk matrix data for visualization
 */
export async function getRiskMatrix(projectId: string) {
  try {
    const findings = await prisma.finding.findMany({
      where: { projectId },
      include: {
        _count: {
          select: { measures: true },
        },
      },
    });

    const assetValues = await prisma.assetValue.findMany({
      where: { projectId },
    });

    // Create risk matrix
    const matrix: Record<string, Record<number, number>> = {};

    for (const finding of findings) {
      for (const asset of assetValues) {
        const risk = calculateRiskScore({
          assetValue: asset.value,
          findingSeverity: finding.severity,
        });

        const key = risk.level;
        const severity = finding.severity;

        if (!matrix[key]) {
          matrix[key] = {};
        }

        matrix[key][severity] = (matrix[key][severity] || 0) + 1;
      }
    }

    return matrix;
  } catch (error) {
    console.error('Get risk matrix failed:', error);
    throw error;
  }
}

/**
 * Get measure prioritization recommendations
 */
export async function getMeasurePriorities(projectId: string) {
  try {
    const measures = await prisma.measure.findMany({
      where: {
        projectId,
        status: 'Open',
      },
      include: {
        finding: {
          select: {
            severity: true,
            normReference: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 10, // Top 10 priorities
    });

    return measures.map((m) => ({
      id: m.id,
      title: m.title,
      priority: m.priority,
      severity: m.finding?.severity || 0,
      norm: m.finding?.normReference || 'Unknown',
      riskScore: calculateRiskScore({
        assetValue: 5, // Default asset value
        findingSeverity: m.finding?.severity || 5,
      }),
    }));
  } catch (error) {
    console.error('Get measure priorities failed:', error);
    throw error;
  }
}
