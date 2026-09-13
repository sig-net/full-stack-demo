import "./globals.css";

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type * as React from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/providers/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

/** Page metadata for the token management shell. */
export const metadata: Metadata = {
  title: "Token Manager",
  description: "Manage your ERC20 tokens on-chain",
};

/**
 * Wraps every route in the application providers, error boundary and toast surface.
 *
 * @param root0 - Layout properties.
 * @param root0.children - Active route content.
 * @returns The document shell for the active route.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en">
      <body className={` ${inter.variable} ${jetbrainsMono.variable}antialiased `}>
        <Providers>
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster richColors position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
