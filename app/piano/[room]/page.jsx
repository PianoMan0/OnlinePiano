import dynamic from 'next/dynamic';

const PianoClient = dynamic(() => import('../../../components/PianoClient'), {
  ssr: false
});

export default function RoomPage({ params }) {
  const room = params?.room || 'main';

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>Room: {room}</h2>
      <p style={{ marginBottom: 12 }}>
        This uses WebRTC DataChannels for peer-to-peer note events.
      </p>
      <PianoClient room={room} />
    </div>
  );
}
