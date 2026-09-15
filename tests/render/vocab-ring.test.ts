import { describe, it, expect } from 'vitest';
import { ringStrokes } from '../../src/render/vocab';
import { loadLook } from '../../src/render/look';
import { mulberry32 } from '../../src/core/hash';

const look = loadLook();
const r = () => mulberry32(7);

describe('ringStrokes', () => {
  it('끊김 수 + 1 개의 호와 겹선들을 낸다', () => {
    const s = ringStrokes(look, r());
    expect(s.length).toBe(look.cGaps + 1 + look.cDouble);
  });

  it('모든 획의 역할이 ring 이다', () => {
    for (const s of ringStrokes(look, r())) expect(s.role).toBe('ring');
  });

  it('중심선과 굵기 배열의 길이가 같다', () => {
    for (const s of ringStrokes(look, r())) expect(s.widths).toHaveLength(s.pts.length);
  });

  it('모든 굵기가 양수다', () => {
    for (const s of ringStrokes(look, r())) for (const w of s.widths) expect(w).toBeGreaterThan(0);
  });

  it('모든 점이 링 반경 근처에 있다 — 링은 하나다', () => {
    // 동심 링을 만들면 이 검사가 깨진다.
    for (const s of ringStrokes(look, r())) {
      for (const p of s.pts) {
        const rad = Math.hypot(p[0], p[1]);
        expect(rad).toBeGreaterThan(look.pR * 0.9);
        expect(rad).toBeLessThan(look.pR * 1.15);
      }
    }
  });

  it('겹선은 링 바깥에만 있다', () => {
    const all = ringStrokes(look, r());
    const doubles = all.slice(look.cGaps + 1);
    expect(doubles).toHaveLength(look.cDouble);
    for (const s of doubles) {
      for (const p of s.pts) expect(Math.hypot(p[0], p[1])).toBeGreaterThanOrEqual(look.pR);
    }
  });

  it('끊김이 있으면 호들이 원을 다 덮지 않는다', () => {
    if (look.cGaps === 0) return;
    const s = ringStrokes(look, r()).slice(0, look.cGaps + 1);
    const covered = s.reduce((acc, st) => {
      const a0 = Math.atan2(st.pts[0]![1], st.pts[0]![0]);
      const a1 = Math.atan2(st.pts[st.pts.length - 1]![1], st.pts[st.pts.length - 1]![0]);
      let d = a1 - a0;
      while (d < 0) d += Math.PI * 2;
      return acc + d;
    }, 0);
    expect(covered).toBeLessThan(Math.PI * 2);
  });

  it('결정적이다', () => {
    expect(ringStrokes(look, r())).toEqual(ringStrokes(look, r()));
  });

  it('링 굵기를 키우면 획이 두꺼워진다', () => {
    const thin = ringStrokes({ ...look, pRingBase: 0.01 }, r());
    const thick = ringStrokes({ ...look, pRingBase: 0.05 }, r());
    const avg = (ss: ReturnType<typeof ringStrokes>) =>
      ss[0]!.widths.reduce((a, b) => a + b, 0) / ss[0]!.widths.length;
    expect(avg(thick)).toBeGreaterThan(avg(thin));
  });
});
