'use client';

export async function loadTone() {
  const Tone = await import('tone');
  return Tone;
}
