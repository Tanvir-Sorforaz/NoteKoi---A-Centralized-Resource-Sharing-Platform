import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NoteKoi — shared course resources",
  description: "Notes, slides and past papers shared across your college.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <Providers>
          <Navbar />
          <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
