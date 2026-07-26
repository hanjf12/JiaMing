import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "127.0.0.1:4318";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("127.") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const title = "嘉名 · 中文宝宝起名";
  const description = "从四书五经、唐诗、宋词、诗经与楚辞中，为宝宝寻找有出处、有寓意的中文姓名。";
  const imageUrl = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "zh_CN",
      images: [{ url: imageUrl, width: 1730, height: 909, alt: "嘉名 · 从千年文脉中，取一生清雅" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
