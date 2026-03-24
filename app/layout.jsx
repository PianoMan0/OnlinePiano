import './globals.css';

export const metadata = {
  title: 'Online Piano',
  description: 'Play piano online with friends in real-time.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
