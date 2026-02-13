import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { ensureInitialAdminUser } from '@/lib/initial-admin';
import { normalizeGlobalRole } from '@/lib/user-role';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        await ensureInitialAdminUser();

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user?.password) {
          return null;
        }

        const isValidPassword = await bcrypt.compare(credentials.password, user.password);
        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: normalizeGlobalRole(user.role),
          firstName: user.firstName,
          lastName: user.lastName,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const jwtUser = user as typeof user & {
          role?: string;
          firstName?: string | null;
          lastName?: string | null;
        };
        token.id = user.id;
        token.role = normalizeGlobalRole(jwtUser.role);
        token.firstName = typeof jwtUser.firstName === 'string' ? jwtUser.firstName : null;
        token.lastName = typeof jwtUser.lastName === 'string' ? jwtUser.lastName : null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === 'string') {
        session.user.id = token.id;
        session.user.role = normalizeGlobalRole(typeof token.role === 'string' ? token.role : null);
        session.user.firstName = typeof token.firstName === 'string' ? token.firstName : null;
        session.user.lastName = typeof token.lastName === 'string' ? token.lastName : null;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
  },
};
