import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { hashPassword, requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isGlobalAdmin, normalizeGlobalRole } from '@/lib/user-role';

const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(255),
  jobTitle: z.string().trim().max(120).optional(),
  password: z.string().min(8).max(255).optional(),
});

const resolveTargetUserId = (requestedUserId: string, currentUserId: string): string =>
  requestedUserId === 'me' ? currentUserId : requestedUserId;

export async function GET(
  _request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await requireAuth();
    const currentUserId = session.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const targetUserId = resolveTargetUserId(params.userId, currentUserId);
    const isSelf = targetUserId === currentUserId;

    if (!isSelf && !isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...user,
      role: normalizeGlobalRole(user.role),
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Get user profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await requireAuth();
    const currentUserId = session.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const targetUserId = resolveTargetUserId(params.userId, currentUserId);
    const isSelf = targetUserId === currentUserId;

    if (!isSelf && !isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = profileUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { firstName, lastName, email, jobTitle, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        id: { not: targetUserId },
      },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const hashedPassword = password ? await hashPassword(password) : undefined;
    const name = `${firstName} ${lastName}`.trim();

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        firstName,
        lastName,
        name,
        email: normalizedEmail,
        jobTitle: jobTitle || null,
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ...updatedUser,
      role: normalizeGlobalRole(updatedUser.role),
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Update user profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await requireAuth();
    const currentUserId = session.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Only Admin can delete users' }, { status: 403 });
    }

    const targetUserId = resolveTargetUserId(params.userId, currentUserId);

    if (targetUserId === currentUserId) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'Admin') {
      const adminCount = await prisma.user.count({
        where: { role: 'Admin' },
      });

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'At least one Admin user must remain' },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.answer.deleteMany({
        where: { userId: targetUserId },
      });

      await tx.user.delete({
        where: { id: targetUserId },
      });
    });

    return NextResponse.json({ success: true, deletedUserId: targetUserId });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
