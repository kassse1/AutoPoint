import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "../../../messages/ru.json";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic", "cyrillic-ext"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AutoPoint Admin",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// The admin is a separate root layout outside the public site's locale routing.
// It is Russian-only for now; all texts still live in messages/ru.json ("Admin").
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} antialiased`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale="ru" timeZone="Asia/Almaty" messages={{ Admin: messages.Admin }}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
