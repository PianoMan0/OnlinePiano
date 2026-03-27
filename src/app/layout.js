export const metadata = {
  title: "Infinite Remix Engine – Dreamwave",
  description: "A fully code-generated synthwave engine that reacts to you."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
