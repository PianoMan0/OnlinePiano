import Link from 'next/link';

export default function Home() {
  const rooms = ['main', 'jam', 'lobby'];
  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Online Piano</h1>
      <p style={{ marginBottom: 16 }}>Join a room and play with others!</p>
      <div style={{ display: 'flex', gap: 12 }}>
        {rooms.map(r => (
          <Link key={r} href={`/piano/${r}`}>
            <a style={{
              padding: '10px 16px',
              background: '#111827',
              color: 'white',
              borderRadius: 8,
              textDecoration: 'none'
            }}>{r}</a>
          </Link>
        ))}
      </div>
    </div>
  );
}
