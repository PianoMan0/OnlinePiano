'use client';

import PianoClient from './PianoClient';

export default function Page({ params }) {
  return <PianoClient room={params.room} />;
}
