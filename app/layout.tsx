import type { Metadata } from "next";
import { Noto_Kufi_Arabic } from "next/font/google";
import "./globals.css";

const notoKufi = Noto_Kufi_Arabic({
  variable: "--font-noto-kufi",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ادمشن | مساعد القبول الموحد",
  description: "منصة ذكية للإجابة على استفساراتك حول القبول الموحد للجامعات والمؤسسات التعليمية",
  keywords: ["قبول", "جامعات", "عُمان", "بعثات", "منح", "تعليم عالي"],
  authors: [{ name: "Admission AI" }],
  openGraph: {
    title: "ادمشن | مساعد القبول الموحد",
    description: "منصة ذكية للإجابة على استفساراتك حول القبول الموحد",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${notoKufi.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
