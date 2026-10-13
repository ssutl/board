import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: { default: "Board", template: "%s · Board" },
  description: "Things I like: product design, cars, clothes, spaces.",
  metadataBase: new URL("https://board.ssutl.com"),
};

export default function RootLayout({ children, sheet }: { children: React.ReactNode; sheet: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        {children}
        {sheet}
      </body>
    </html>
  );
}
