import { describe, it, expect } from 'vitest';
import { clampOutside, strokeMinRadius, arcPts, bezPts, type Stroke } from '../../src/render/stroke';
import type { Pt } from '../../src/render/geometry';

const rad = (p: Pt) => Math.hypot(p[0], p[1]);

describe('arcPts', () => {
  it('n + 1 개의 점을 낸다', () => {
    expect(arcPts(1, 0, Math.PI, 0, 12)).toHaveLength(13);
  });

  it('bow 가 0이면 모든 점이 반경 r 위에 있다', () => {
    for (const p of arcPts(0.5, 0.3, 1.2, 0, 24)) expect(rad(p)).toBeCloseTo(0.5, 9);
  });

  it('bow 가 양수면 가운데가 바깥으로 부푼다', () => {
    const pts = arcPts(0.5, 0, 1.0, 0.1, 20);
    expect(rad(pts[10]!)).toBeGreaterThan(0.5);
    expect(rad(pts[0]!)).toBeCloseTo(0.5, 9);
  });
});

describe('bezPts', () => {
  it('양 끝점이 a 와 c 다', () => {
    const pts = bezPts([0, 0], [1, 2], [2, 0], 10);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[10]).toEqual([2, 0]);
  });
});

describe('clampOutside', () => {
  it('반경이 minR 이상인 점은 그대로 둔다', () => {
    const pts: Pt[] = [[1, 0], [0, 2]];
    expect(clampOutside(pts, 0.5)).toEqual(pts);
  });

  it('안쪽으로 들어온 점을 반경 minR 로 밀어낸다', () => {
    const out = clampOutside([[0.1, 0]], 0.5);
    expect(rad(out[0]!)).toBeCloseTo(0.5, 9);
    // 방향은 유지된다
    expect(out[0]![1]).toBeCloseTo(0, 9);
    expect(out[0]![0]).toBeGreaterThan(0);
  });

  it('원점은 임의 방향으로 밀되 반경은 minR 이다', () => {
    const out = clampOutside([[0, 0]], 0.5);
    expect(rad(out[0]!)).toBeCloseTo(0.5, 9);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const pts: Pt[] = [[0.1, 0]];
    clampOutside(pts, 0.5);
    expect(pts[0]).toEqual([0.1, 0]);
  });

  it('minR 이 0 이하면 그대로 돌려준다', () => {
    const pts: Pt[] = [[0.1, 0], [0, 0]];
    expect(clampOutside(pts, 0)).toEqual(pts);
  });
});

describe('strokeMinRadius', () => {
  it('중심선에서 굵기의 절반을 뺀 최소 반경을 낸다', () => {
    const s: Stroke = {
      pts: [[1, 0], [0, 1]],
      widths: [0.2, 0.4],
      label: '테스트', role: 'ring',
    };
    // (1,0) 에서 1 - 0.1 = 0.9, (0,1) 에서 1 - 0.2 = 0.8
    expect(strokeMinRadius(s)).toBeCloseTo(0.8, 9);
  });

  it('점이 없으면 Infinity 를 낸다', () => {
    expect(strokeMinRadius({ pts: [], widths: [], label: '', role: 'ring' })).toBe(Infinity);
  });
});
