export async function loadTone() {
  if (typeof window === 'undefined') return null;
  const Tone = await import('tone');
  return Tone;
}
