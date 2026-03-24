import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const PianoClient = dynamic(() => import('../../../components/PianoClient'), { ssr: false });

export default function RoomPage() {
  const params = useParams();
  const room = params.room || process.env.DEFAULT_ROOM || 'main';
  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>Room: {room}</h2>
      <p style={{ marginBottom: 12 }}>This uses WebRTC DataChannels for peer-to-peer note events.</p>
      <PianoClient room={room} />
    </div>
  );
}
