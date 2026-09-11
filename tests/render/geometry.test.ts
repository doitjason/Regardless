import { describe, it, expect } from 'vitest';
import {
  sampleCubic, taperOutline, ringOutline, minWidthOf, type Pt,
} from '../../src/render/geometry';
import { parsePathPoints } from '../helpers/path';

describe('sampleCubic', () => {
  it('steps + 1 개의 점을 낳는다', () => {
    expect(sampleCubic([0, 0], [1, 0], [2, 0], [3, 0], 10)).toHaveLength(11);
  });

  it('양 끝점이 p0과 p3이다', () => {
    const pts = sampleCubic([0, 0], [1, 5], [2, 5], [3, 0], 8);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([3, 0]);
  });

  it('제어점이 일직선이면 직선을 낳는다', () => {
    const pts = sampleCubic([0, 0], [1, 0], [2, 0], [3, 0], 6);
    for (const p of pts) expect(p[1]).toBeCloseTo(0, 10);
  });

  it('steps가 1보다 작으면 던진다', () => {
    expect(() => sampleCubic([0, 0], [0, 0], [0, 0], [0, 0], 0)).toThrow();
  });
});

describe('taperOutline', () => {
  it('닫힌 패스를 낳는다', () => {
    const d = taperOutline([[0, 0], [10, 0], [20, 0]], () => 4);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('수평 직선에 일정 굵기를 주면 폭이 그 값이다', () => {
    const d = taperOutline([[0, 50], [10, 50], [20, 50]], () => 6);
    const ys = parsePathPoints(d).map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6, 3);
  });

  it('굵기가 줄면 끝쪽 폭이 더 좁다', () => {
    const d = taperOutline(
      [[0, 50], [10, 50], [20, 50], [30, 50]],
      (t) => 8 * (1 - t) + 1,
    );
    const pts = parsePathPoints(d);
    // 전반부는 left, 후반부는 right(역순). 첫 점과 마지막 점이 같은 x 위치의 쌍이다.
    const startSpan = Math.abs(pts[0]![1] - pts[pts.length - 1]![1]);
    const midIdx = Math.floor(pts.length / 2);
    const endSpan = Math.abs(pts[midIdx - 1]![1] - pts[midIdx]![1]);
    expect(startSpan).toBeGreaterThan(endSpan);
  });

  it('점이 2개 미만이면 던진다', () => {
    expect(() => taperOutline([[0, 0]], () => 1)).toThrow();
  });
});

describe('ringOutline', () => {
  it('닫힌 서브패스 두 개를 낳는다', () => {
    const d = ringOutline(150, 150, 100, () => 8);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it('모든 점이 r - w/2 이상 r + w/2 이하 반경에 있다', () => {
    const d = ringOutline(150, 150, 100, () => 10);
    for (const [x, y] of parsePathPoints(d)) {
      const rad = Math.hypot(x - 150, y - 150);
      expect(rad).toBeGreaterThanOrEqual(95 - 0.01);
      expect(rad).toBeLessThanOrEqual(105 + 0.01);
    }
  });

  it('바깥과 안쪽 윤곽을 반대 방향으로 감아 구멍을 만든다', () => {
    // 서명 면적의 부호가 서로 반대여야 nonzero fill-rule에서 고리가 된다.
    const d = ringOutline(150, 150, 100, () => 8, 60);
    const [outer, inner] = d.split('Z').slice(0, 2);
    const area = (sub: string): number => {
      const pts = parsePathPoints(sub);
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
        a += p[0] * q[1] - q[0] * p[1];
      }
      return a / 2;
    };
    expect(Math.sign(area(outer!))).not.toBe(Math.sign(area(inner!)));
  });
});

describe('minWidthOf', () => {
  it('일정 함수의 최솟값은 그 값이다', () => {
    expect(minWidthOf(() => 5)).toBeCloseTo(5, 6);
  });

  it('감소 함수의 최솟값은 t=1 값이다', () => {
    expect(minWidthOf((t) => 10 - 9 * t)).toBeCloseTo(1, 3);
  });

  it('중간이 최소인 함수도 잡는다', () => {
    expect(minWidthOf((t) => Math.abs(t - 0.5) * 10 + 0.5)).toBeCloseTo(0.5, 2);
  });
});
