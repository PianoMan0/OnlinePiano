'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

const START_MIDI = 48;
const NUM_KEYS = 24;

function isSharp(midi) {
  const n = midi % 12;
  return [1, 3, 6, 8, 10].includes(n);
}

export default function Keyboard({ onPlay, onRelease }) {
  const [active, setActive] = useState(new Set());

  useEffect(() => {
    function down(e) {
      const map = {
        a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72
      };
      const key = e.key.toLowerCase();
      if (map[key]) {
        const midi = map[key];
        if (!active.has(midi)) {
          setActive(prev => new Set(prev).add(midi));
          onPlay?.(midi);
        }
      }
    }
    function up(e) {
      const map = {
        a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72
      };
      const key = e.key.toLowerCase();
      if (map[key]) {
        const midi = map[key];
        setActive(prev => {
          const copy = new Set(prev);
          copy.delete(midi);
          return copy;
        });
        onRelease?.(midi);
      }
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [active, onPlay, onRelease]);

  function handleMouseDown(midi) {
    setActive(prev => new Set(prev).add(midi));
    onPlay?.(midi);
  }
  function handleMouseUp(midi) {
    setActive(prev => {
      const copy = new Set(prev);
      copy.delete(midi);
      return copy;
    });
    onRelease?.(midi);
  }

  const keys = Array.from({ length: NUM_KEYS }, (_, i) => START_MIDI + i);

  return (
    <div style={{ userSelect: 'none' }}>
      <div style={{ display: 'flex', position: 'relative', height: 160 }}>
        {keys.map(midi => {
          const sharp = isSharp(midi);
          const isActive = active.has(midi);
          return (
            <div
              key={midi}
              onMouseDown={() => handleMouseDown(midi)}
              onMouseUp={() => handleMouseUp(midi)}
              onMouseLeave={() => handleMouseUp(midi)}
              className={clsx('key', sharp ? 'black' : 'white', isActive && 'active')}
              style={{
                width: sharp ? 28 : 48,
                height: sharp ? 100 : 160,
                marginLeft: sharp ? -14 : 0,
                zIndex: sharp ? 2 : 1
              }}
            >
              <div style={{ fontSize: 10, color: sharp ? 'white' : '#111827', paddingTop: sharp ? 70 : 130, textAlign: 'center' }}>
                {midi}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, color: '#6b7280' }}>Tip: use keys A W S E D F T G Y H U J K to play a central octave</div>
    </div>
  );
}
