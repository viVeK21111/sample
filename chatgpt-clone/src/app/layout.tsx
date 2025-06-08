import type { Metadata } from "next";
import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import { UserProvider } from '@auth0/nextjs-auth0/client';
import BootstrapClient from './BootstrapClient';

export const metadata: Metadata = {
  title: "AI Chat Clone",
  description: "A mobile-first AI chat application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
          rel="stylesheet"
        />
      </head>
      <body>
        <UserProvider>
          {children}
          <BootstrapClient />
        </UserProvider>
      </body>
    </html>
  );
}
