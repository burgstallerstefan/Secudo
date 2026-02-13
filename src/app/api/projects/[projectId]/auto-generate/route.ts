/**
 * Auto-Generation API Route
 * Triggers findings and measures auto-generation from completed assessments
 */

import { requireAuth } from '@/lib/auth';
import { autoGenerateFindings } from '@/lib/risk-service';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isGlobalAdmin } from '@/lib/user-role';

export async function POST(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    // Verify admin/editor role
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId } },
    });

    if (!isGlobalAdmin(session.user?.role) && (!membership || (membership.role !== 'Admin' && membership.role !== 'Editor'))) {
      return NextResponse.json(
        { error: 'Not authorized (Editor required)' },
        { status: 403 }
      );
    }

    // Auto-generate
    const result = await autoGenerateFindings(params.projectId, userId);

    return NextResponse.json({
      success: true,
      findingsGenerated: result.findingsGenerated,
      measuresGenerated: result.measuresGenerated,
      ai: result.ai,
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Auto-generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
