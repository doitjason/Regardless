import { describe, it, expect } from 'vitest';
import { rasterize, checkManufacturable, type MillOptions } from '../../src/render/manufacture';
import type { Stroke } from '../../src/render/stroke';
import { arcPts } from '../../src/render/stroke';

const OPTS: MillOptions = { diameterMm: 20, minStrokeMm: 0.5, minGapMm: 0.5, pxPerMm: 20 };

/** p 공간 반경 r 의 닫힌 원 획 하나. 굵기는 mm 단위를 p 로 환산해 받는다. */
const ring = (r: number, widthMm: number, opts = OPTS): Stroke => {
  const pts = arcPts(r, 0, Math.PI * 2, 0, 200);
  const wp = (widthMm / opts.diameterMm) * 2 * 0.9; // mm → p (지름 20mm 가 p 1.8)
  return { pts, widths: pts.map(() => wp), label: 'ring', role: 'ring' };
};

describe('rasterize', () => {
  it('격자 크기가 지름과 해상도에서 나온다', () => {
    const { n } = rasterize([ring(0.5, 1)], OPTS);
    expect(n).toBe(Math.round(OPTS.diameterMm * OPTS.pxPerMm));
  });

  it('획이 있으면 잉크 화소가 있고, 없으면 없다', () => {
    const { grid } = rasterize([ring(0.5, 1)], OPTS);
    expect(grid.some((v) => v === 1)).toBe(true);
    expect(rasterize([], OPTS).grid.every((v) => v === 0)).toBe(true);
  });
});

describe('checkManufacturable', () => {
  it('충분히 굵은 링 하나는 통과한다', () => {
    const rep = checkManufacturable([ring(0.5, 1.2)], OPTS);
    expect(rep.violations, rep.violations.join(' / ')).toHaveLength(0);
    expect(rep.components).toBe(1);
  });

  it('하한보다 가는 링은 선폭 위반으로 잡는다', () => {
    const rep = checkManufacturable([ring(0.5, 0.2)], OPTS);
    expect(rep.thinPx).toBeGreaterThan(0);
    expect(rep.violations.join(' ')).toMatch(/선폭/);
  });

  it('떨어진 두 조각은 연결 위반으로 잡는다', () => {
    const rep = checkManufacturable([ring(0.30, 1.2), ring(0.75, 1.2)], OPTS);
    expect(rep.components).toBe(2);
    expect(rep.violations.join(' ')).toMatch(/조각|연결/);
  });

  it('하한보다 좁은 틈은 틈 위반으로 잡는다', () => {
    // 0.5mm 는 p 로 0.045. 두 링 사이 간격이 그보다 좁도록 놓는다.
    const rep = checkManufacturable([ring(0.50, 1.2), ring(0.65, 1.2)], OPTS);
    expect(rep.narrowGapPx).toBeGreaterThan(0);
    expect(rep.violations.join(' ')).toMatch(/틈/);
  });

  it('너무 작은 구멍은 구멍 위반으로 잡는다', () => {
    const rep = checkManufacturable([ring(0.06, 1.2)], OPTS);
    expect(rep.smallHoles.length).toBeGreaterThan(0);
    expect(rep.violations.join(' ')).toMatch(/구멍/);
  });

  it('결정적이다', () => {
    const a = checkManufacturable([ring(0.5, 1.2)], OPTS);
    const b = checkManufacturable([ring(0.5, 1.2)], OPTS);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
