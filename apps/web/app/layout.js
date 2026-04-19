import "./globals.css";

export const metadata = {
  title: "Infernet Protocol",
  description: "Supabase-backed Next.js operations dashboard for Infernet Protocol"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
