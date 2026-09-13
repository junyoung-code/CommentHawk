import type { Metadata } from "next";
import Script from "next/script";

import { PRODUCT_THEME_BOOTSTRAP_SCRIPT } from "@/features/theme/product-theme-script";

import "./globals.css";

export const metadata: Metadata = {
  title: "CrowdSift",
  description: "크리에이터를 위한 AI 댓글 관리 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      data-scroll-behavior="smooth"
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <Script
          data-product-theme-bootstrap=""
          dangerouslySetInnerHTML={{ __html: PRODUCT_THEME_BOOTSTRAP_SCRIPT }}
          id="product-theme-bootstrap"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
