import { describe, it, expect } from 'vitest';
import { parse } from '../../src/core/parse';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { loadLook } from '../../src/render/look';
import { buildStrokes, type SkeletonResult } from '../../src/render/compose';
import { arrival, ringTimeAt, angularDistance, type ArrivalTiming } from '../../src/render/arrival';
import { partKeyOf } from '../../src/render/parts';

const lex = loadSeedLexicon();
const look = loadLook();
const T: ArrivalTiming = { ringSeconds: 3, depthSecondsPerUnit: 6, flowSpeed: 0.4, jitterSeconds: 0.2, tailSeconds: 0.8 };
const skOf = (s: string) => buildStrokes(parse(s, lex), lex, look);
const KEY = '그럼에도 불구하고 나는 너를 사랑해';

describe('angularDistance / ringTimeAt', () => {
  it('각거리는 0..π 이고 방향과 무관하다', () => {
    expect(angularDistance(0.1, 0.1)).toBeCloseTo(0);
    expect(angularDistance(0, Math.PI)).toBeCloseTo(Math.PI);
    expect(angularDistance(0.2, -0.2)).toBeCloseTo(0.4);
    expect(angularDistance(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6.0);
  });

  it('링의 먹은 시작점에서 양쪽으로 같은 속도로 번진다 — 시계 방향 쓸기가 없다', () => {
    const o = 1.234;
    expect(ringTimeAt(o, o, T)).toBeCloseTo(0);
    expect(ringTimeAt(o + Math.PI, o, T)).toBeCloseTo(T.ringSeconds);
    for (const d of [0.1, 0.7, 1.5, 2.9]) {
      expect(ringTimeAt(o + d, o, T)).toBeCloseTo(ringTimeAt(o - d, o, T), 12);
    }
    expect(ringTimeAt(o + 0.5, o, T)).toBeLessThan(ringTimeAt(o + 1.0, o, T));
  });
});

describe('arrival', () => {
  it('같은 문장이면 같은 시간표다 — 언어가 달라도', () => {
    const a = arrival(skOf(KEY), look, T);
    expect(arrival(skOf(KEY), look, T)).toEqual(a);
    expect(arrival(skOf('Regardless, I love you'), look, T)).toEqual(a);
  });

  it('시작점은 문장마다 다르다', () => {
    const a = arrival(skOf(KEY), look, T).origin;
    const b = arrival(skOf('나는 바다를 보았다'), look, T).origin;
    expect(a).not.toBeCloseTo(b, 6);
  });

  it('점마다 시각이 있고, 전체 길이는 마지막 도착 뒤 여운까지다', () => {
    const sk = skOf(KEY);
    const a = arrival(sk, look, T);
    expect(a.strokes.length).toBe(sk.strokes.length);
    let max = 0;
    a.strokes.forEach((s, i) => {
      expect(s.times.length).toBe(sk.strokes[i]!.pts.length);
      for (const t of s.times) { expect(t).toBeGreaterThanOrEqual(0); max = Math.max(max, t); }
    });
    expect(a.duration).toBeCloseTo(max + T.tailSeconds, 9);
  });

  it('링이 아닌 획은 링의 선두가 뿌리에 닿은 뒤에 번지고, 뿌리에서 끝으로 흐른다', () => {
    const sk = skOf(KEY);
    const a = arrival(sk, look, T);
    sk.strokes.forEach((s, i) => {
      if (s.role === 'ring' || s.pts.length < 2) return;
      const times = a.strokes[i]!.times;
      const r = times.indexOf(Math.min(...times));
      const rp = s.pts[r]!;
      expect(times[r]!).toBeGreaterThanOrEqual(ringTimeAt(Math.atan2(rp[1], rp[0]), a.origin, T) - 1e-9);
      for (let k = r + 1; k < times.length; k++) expect(times[k]!).toBeGreaterThanOrEqual(times[k - 1]!);
      for (let k = r - 1; k >= 0; k--) expect(times[k]!).toBeGreaterThanOrEqual(times[k + 1]!);
    });
  });

  it('바깥 층일수록 늦게 번진다', () => {
    const line = (r0: number, r1: number) => ({
      pts: [[r0, 0], [r1, 0]] as [number, number][], widths: [0.01, 0.01], label: 'x', role: '대상' as const,
    });
    const sk: SkeletonResult = { seed: 7, total: 2, strokes: [line(look.pR + 0.02, 0.8), line(look.pR + 0.2, 0.9)] };
    const a = arrival(sk, look, { ...T, jitterSeconds: 0 });
    expect(a.strokes[1]!.times[0]!).toBeGreaterThan(a.strokes[0]!.times[0]!);
  });

  it('묶음: 링이 0번, 나머지는 첫 도착 순, 같은 키는 같은 번호', () => {
    const sk = skOf(KEY);
    const a = arrival(sk, look, T);
    expect(a.parts[0]).toBe('ring|링');
    sk.strokes.forEach((s, i) => expect(a.parts[a.strokes[i]!.part]).toBe(partKeyOf(s)));
    const first = a.parts.map((k) => Math.min(...sk.strokes.flatMap((s, i) =>
      partKeyOf(s) === k ? a.strokes[i]!.times : [])));
    for (let k = 2; k < first.length; k++) expect(first[k]!).toBeGreaterThanOrEqual(first[k - 1]!);
    expect(new Set(a.parts).size).toBe(a.parts.length);
  });
});

describe('arrival — 링 (스펙 7)', () => {
  // 틈이 있는 룩으로 — 틈이 번짐을 막지 못한다는 것을 확인하려는 것이다
  const gapLook = look.cGaps > 0 ? look : { ...look, cGaps: 2 };
  const sk = buildStrokes(parse(KEY, lex), lex, gapLook);
  const a = arrival(sk, gapLook, T);
  const ringIdx = sk.strokes.flatMap((s, i) => (s.role === 'ring' ? [i] : []));

  it('틈이 있는 양보문의 링을 시험한다', () => {
    expect(gapLook.cGaps).toBeGreaterThan(0);
    expect(ringIdx.length).toBeGreaterThan(0);
  });

  it('링의 모든 점은 자기 각도의 시각을 받는다 — 획 단위가 아니라 각도 단위', () => {
    for (const i of ringIdx) {
      const pts = sk.strokes[i]!.pts;
      const times = a.strokes[i]!.times;
      expect(times.length).toBe(pts.length);
      pts.forEach((p, k) => {
        expect(times[k]!).toBeCloseTo(ringTimeAt(Math.atan2(p[1], p[0]), a.origin, T), 12);
      });
    }
  });

  it('틈이 있어도 먹은 반대편까지 간다', () => {
    let max = 0;
    for (const i of ringIdx) for (const t of a.strokes[i]!.times) max = Math.max(max, t);
    expect(max).toBeGreaterThan(T.ringSeconds * 0.97);
    expect(max).toBeLessThanOrEqual(T.ringSeconds + 1e-9);
  });
});

