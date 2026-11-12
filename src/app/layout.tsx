import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WebGuard — Build with AI. Launch with confidence. Stay secure.",
  description:
    "Continuous, AI-assisted web application security for vibe coders and developers. Find vulnerabilities, understand them in plain language, and fix them.",
};

// Dark-first: apply saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('webguard-theme');document.documentElement.classList.toggle('dark',t!=='light')}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster position="bottom-right" richColors closeButton theme="system" />
      </body>
    </html>
  );
}
