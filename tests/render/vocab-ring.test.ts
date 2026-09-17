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

describe('링 이음매', () => {
  it('틈이 없으면 끝을 가늘게 빼지 않는다 — 이음매에 홈이 생기면 투각에서 끊긴다', () => {
    const noGap = { ...look, cGaps: 0, cJitter: 0, pRingAmp: 0 };
    const ss = ringStrokes(noGap, mulberry32(5));
    const ring = ss.find((s) => s.role === 'ring')!;
    const first = ring.widths[0]!, mid = ring.widths[Math.floor(ring.widths.length / 2)]!;
    expect(first).toBeCloseTo(mid, 6);
  });

  it('틈이 있으면 끊긴 끝은 가늘게 뺀다 — 붓 자국이다', () => {
    const gapped = { ...look, cGaps: 2, cJitter: 0, pRingAmp: 0 };
    const ring = ringStrokes(gapped, mulberry32(5)).find((s) => s.role === 'ring')!;
    const first = ring.widths[0]!, mid = ring.widths[Math.floor(ring.widths.length / 2)]!;
    expect(first).toBeLessThan(mid * 0.7);
  });
});

describe('양보 링', () => {
  const conc = (l = look) => ringStrokes(l, mulberry32(9), { concessive: true });

  it('획이 하나다 — 틈도 겹선도 쓰지 않는다', () => {
    expect(conc()).toHaveLength(1);
  });

  it('닫히지 않는다 — 끝이 시작을 지나쳐 바깥에 있다', () => {
    const r = conc()[0]!;
    const first = r.pts[0]!, last = r.pts[r.pts.length - 1]!;
    expect(Math.hypot(last[0], last[1])).toBeGreaterThan(Math.hypot(first[0], first[1]) + look.cPassOut * 0.8);
  });

  it('한 바퀴를 넘어 돈다', () => {
    const r = conc()[0]!;
    let total = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const a = Math.atan2(r.pts[i - 1]![1], r.pts[i - 1]![0]);
      const b = Math.atan2(r.pts[i]![1], r.pts[i]![0]);
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      total += d;
    }
    expect(Math.abs(total)).toBeGreaterThan(Math.PI * 2);
  });

  it('두 가닥이 겹치는 구간에서 서로 떨어져 있다', () => {
    const r = conc()[0]!;
    const last = r.pts[r.pts.length - 1]!;
    const near = r.pts.slice(0, 40)
      .map((p) => Math.hypot(p[0] - last[0], p[1] - last[1]));
    expect(Math.min(...near)).toBeGreaterThan(look.pRingBase);
  });

  it('굵기가 양 끝에서 가늘어지지 않는다 — 겹치는 자리에 홈이 생기면 안 된다', () => {
    const r = conc({ ...look, cJitter: 0, pRingAmp: 0 })[0]!;
    expect(r.widths[0]!).toBeCloseTo(r.widths[Math.floor(r.widths.length / 2)]!, 6);
  });
});
