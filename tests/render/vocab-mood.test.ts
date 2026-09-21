import { describe, it, expect } from 'vitest';
import { moodStrokes } from '../../src/render/vocab';
import { loadLook } from '../../src/render/look';
import { ringFloor } from '../../src/render/stroke';
import { slotAngle, ROLE_SLOT } from '../../src/render/layout';
import { mulberry32 } from '../../src/core/hash';
import type { Mood } from '../../src/core/ir';

const look = loadLook();
const r = () => mulberry32(11);
const MOODS: Mood[] = ['interrogative', 'negative', 'volitional'];

describe('moodStrokes', () => {
  it('평서문은 표지를 그리지 않는다', () => {
    expect(moodStrokes(look, 'declarative', r())).toHaveLength(0);
  });

  it('양보도 표지를 그리지 않는다 — 링이 닫히지 않는 것으로 이미 나타냈다', () => {
    expect(moodStrokes(look, 'concessive', r())).toHaveLength(0);
  });

  it('의문·부정·의지는 각각 획을 낸다', () => {
    for (const m of MOODS) {
      expect(moodStrokes(look, m, r()).length, m).toBeGreaterThan(0);
    }
  });

  it('셋은 서로 다른 그림이다 — 문장 종류가 형태로 드러난다', () => {
    const seen = new Map<string, Mood>();
    for (const m of MOODS) {
      const key = JSON.stringify(moodStrokes(look, m, r()));
      expect(seen.get(key), `${m} 와 ${seen.get(key)} 가 같다`).toBeUndefined();
      seen.set(key, m);
    }
  });

  it('표지는 6시 양상 슬롯 근처에 놓인다', () => {
    const want = slotAngle(ROLE_SLOT['양상'], 0);
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) {
        for (const p of s.pts) {
          const a = Math.atan2(p[1], p[0]);
          const d = Math.abs(((a - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          expect(d, `${m}`).toBeLessThan(Math.PI / 6);
        }
      }
    }
  });

  it('링 안쪽으로 넘어오지 않는다', () => {
    const floor = ringFloor(look);
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) {
        s.pts.forEach((p, i) => {
          expect(Math.hypot(p[0], p[1]) - (s.widths[i] ?? 0) / 2, m)
            .toBeGreaterThanOrEqual(floor - 1e-9);
        });
      }
    }
  });

  it('캔버스 반경 0.9 를 넘지 않는다', () => {
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) {
        s.pts.forEach((p, i) => {
          expect(Math.hypot(p[0], p[1]) + (s.widths[i] ?? 0) / 2, m).toBeLessThanOrEqual(0.9);
        });
      }
    }
  });

  it('모든 획이 양상 라벨과 역할을 갖는다 — 주인 없는 획이 없다', () => {
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) {
        expect(s.role).toBe('양상');
        expect(s.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('중심선과 굵기 배열의 길이가 같다', () => {
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) expect(s.widths.length).toBe(s.pts.length);
    }
  });

  it('결정적이다', () => {
    expect(JSON.stringify(moodStrokes(look, 'interrogative', r())))
      .toBe(JSON.stringify(moodStrokes(look, 'interrogative', r())));
  });
});
