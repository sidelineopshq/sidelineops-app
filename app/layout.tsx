import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ReportProblemModal from "@/components/ReportProblemModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default:  'SidelineOps',
    template: '%s | SidelineOps',
  },
  description: 'Team operations platform for high school athletic programs',
  icons: {
    icon:  '/sidelineops-favicon.ico',
    apple: '/sidelineops-logo-cropped.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <ReportProblemModal />
      </body>
    </html>
  );
}
