import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/app/providers';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Secudo - Security Assessment Tool',
  description: 'Product security assessment tool based on IEC 62443',
  icons: {
    icon: '/secudo-logo.png?v=20260212c',
    shortcut: '/secudo-logo.png?v=20260212c',
    apple: '/secudo-logo.png?v=20260212c',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <main className="flex-1">{children}</main>
            <footer className="py-4 text-center text-xs text-slate-400">
              © Secudo Cyber Sec GmbH
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}

