import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { PostHogProvider } from "@/components/PostHogProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// design3 display face — headings across the app (composer, history).
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Postship",
    template: "%s · Postship",
  },
  description:
    "Write one description. Ship six platform-native posts. YouTube, LinkedIn, X, Threads, Instagram, TikTok.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={{ theme: shadcn }}>
          {/* PostHog inside Clerk — identify() reads Clerk context.
              TASK-070: env-driven no-op without NEXT_PUBLIC_POSTHOG_KEY. */}
          <PostHogProvider>
            {/* Convex inside Clerk — Convex mints tokens from Clerk context */}
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </PostHogProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}