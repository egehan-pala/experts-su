import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faculty Experts - Sabancı University",
  description: "Find experts at Sabancı University",
};

import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
