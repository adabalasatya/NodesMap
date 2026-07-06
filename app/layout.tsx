import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NodesMap — Markdown notes & progress tracker",
  description:
    "Hierarchical markdown notes with completion tracking, progress analytics, and a radial mind-map view.",
  icons: {
    icon: "/NodesMap_Icon.png",
    shortcut: "/NodesMap_Icon.png",
    apple: "/NodesMap_Icon.png",
  },
};

// Runs before React hydrates so the correct `data-theme` is on <html>
// on first paint — otherwise React reconciliation could wipe an
// attribute added later by the theme hook, which is what caused the
// Auth landing toggle to visibly do nothing.
const themeBootstrap = `(() => {
  try {
    var v = localStorage.getItem('noteflow_theme');
    if (v !== 'dark' && v !== 'light') {
      v = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = v;
    document.documentElement.style.colorScheme = v;
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
