/**
 * Risk Management Service
 * Handles finding generation, risk calculation, and measure templates
 */

import { prisma } from '@/lib/prisma';

export interface RiskCalculationInput {
  assetValue: number; // 1-10 criticality
  findingSeverity: number; // 1-10 severity
}

export interface RiskScore {
  score: number; // 1-100
  level: 'Low' | 'Medium' | 'High' | 'Critical';
}

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
          }))
        : (
            await prisma.answer.findMany({
              where: {
                projectId,
                answerValue: { in: ['No', 'NO', 'no'] },
              },
            })
          ).map((answer) => ({
            questionId: answer.questionId,
            answerValue: answer.answerValue || '',
            targetType: answer.targetType === 'Edge' ? ('Edge' as const) : ('Node' as const),
            targetId: answer.targetId || 'general',
          }));

    const generatedFindings = [];
    const generatedMeasures = [];

    for (const answer of answersToEvaluate) {
      if (answer.answerValue.toLowerCase() !== 'no') {
        continue;
      }

      const question = questions.find((item) => item.id === answer.questionId);
      if (!question) {
        continue;
      }

      const severity = 7;
      const normalizedAssetType = answer.targetType === 'Edge' ? 'Edge' : 'Node';
      const normalizedAssetId = answer.targetId || 'general';
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
          description: `Non-compliance with ${question.normReference}: ${question.text}`,
        },
      });

      generatedFindings.push(finding);

      const measure = await prisma.measure.create({
        data: {
          projectId,
          findingId: finding.id,
          title: `Remediate: ${question.text}`,
          description: `Implement control to address finding related to ${question.normReference}`,
          assetType: finding.assetType,
          assetId: finding.assetId,
          normReference: question.normReference,
          priority: severity >= 8 ? 'Critical' : severity >= 6 ? 'High' : 'Medium',
          status: 'Open',
          createdByUserId: userId,
        },
      });

      generatedMeasures.push(measure);
    }

    return {
      findingsGenerated: generatedFindings.length,
      measuresGenerated: generatedMeasures.length,
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
