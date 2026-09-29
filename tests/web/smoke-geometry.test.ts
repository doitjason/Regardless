import { describe, it, expect } from 'vitest';
import { parse } from '../../src/core/parse';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { loadLook } from '../../src/render/look';
import { buildStrokes, type SkeletonResult } from '../../src/render/compose';
import { arrival, type Arrival } from '../../src/render/arrival';
import { maskVertices, FLOATS_PER_VERTEX } from '../../web/smoke/geometry';

const lex = loadSeedLexicon();
const look = loadLook();
const T = { ringSeconds: 3, depthSecondsPerUnit: 6, flowSpeed: 0.4, jitterSeconds: 0.2, tailSeconds: 0.8 };

describe('maskVertices', () => {
  it('곧은 획 하나: 정점 6개, 폭만큼 벌어지고, 시각은 정규화된다', () => {
    const sk: SkeletonResult = { seed: 1, total: 1, strokes: [
      { pts: [[0.5, 0], [0.7, 0]], widths: [0.02, 0.02], label: 'x', role: '대상' },
    ] };
    const arr: Arrival = { origin: 0, duration: 4, parts: ['ring|링', '대상|x'],
      strokes: [{ times: [1, 3], part: 1 }] };
    const v = maskVertices(sk, arr);
    expect(v.length).toBe(6 * FLOATS_PER_VERTEX);
    const ys = [0, 1, 2, 3, 4, 5].map((k) => v[k * 4 + 1]!);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.02, 6);
    const ts = [0, 1, 2, 3, 4, 5].map((k) => v[k * 4 + 2]!);
    expect(Math.min(...ts)).toBeCloseTo(0.25, 6);
    expect(Math.max(...ts)).toBeCloseTo(0.75, 6);
    for (let k = 0; k < 6; k++) expect(v[k * 4 + 3]).toBe(1);
  });

  it('점이 2개 미만인 획은 건너뛴다', () => {
    const sk: SkeletonResult = { seed: 1, total: 1, strokes: [
      { pts: [[0.5, 0]], widths: [0.02], label: 'x', role: '대상' },
    ] };
    const arr: Arrival = { origin: 0, duration: 1, parts: ['ring|링', '대상|x'], strokes: [{ times: [0], part: 1 }] };
    expect(maskVertices(sk, arr).length).toBe(0);
  });

  it('실제 문장: 정점 수가 맞고 시각은 0..1, 묶음은 정수', () => {
    const sk = buildStrokes(parse('그럼에도 불구하고 나는 너를 사랑해', lex), lex, look);
    const arr = arrival(sk, look, T);
    const v = maskVertices(sk, arr);
    const want = sk.strokes.reduce((n, s) => n + (s.pts.length >= 2 ? 6 * (s.pts.length - 1) : 0), 0);
    expect(v.length).toBe(want * FLOATS_PER_VERTEX);
    for (let k = 0; k < v.length; k += FLOATS_PER_VERTEX) {
      expect(v[k + 2]!).toBeGreaterThanOrEqual(0);
      expect(v[k + 2]!).toBeLessThanOrEqual(1);
      expect(Number.isInteger(v[k + 3]!)).toBe(true);
      expect(v[k + 3]!).toBeLessThan(arr.parts.length);
    }
  });
});
