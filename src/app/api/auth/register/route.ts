import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialAdminUser } from '@/lib/initial-admin';
import * as z from 'zod';

// Validation schema
const RegisterSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  jobTitle: z.string().optional(),
  role: z.enum(['User', 'Admin']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await ensureInitialAdminUser();

    const body = await req.json();
    const { firstName, lastName, email, password, jobTitle } = RegisterSchema.parse(body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
        email,
        password: hashedPassword,
        jobTitle,
        role: 'User',
      },
    });

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Register error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
