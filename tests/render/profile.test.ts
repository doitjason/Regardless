import { describe, it, expect } from 'vitest';
import { smoothJit, widthProfile } from '../../src/render/profile';
import { mulberry32 } from '../../src/core/hash';

const r = () => mulberry32(42);

describe('smoothJit', () => {
  it('진폭 0이면 항상 1이다', () => {
    const j = smoothJit(r(), 0);
    for (let i = 0; i <= 20; i++) expect(j(i / 20)).toBeCloseTo(1, 9);
  });

  it('같은 시드는 같은 함수를 낳는다', () => {
    const a = smoothJit(r(), 0.4), b = smoothJit(r(), 0.4);
    for (let i = 0; i <= 20; i++) expect(a(i / 20)).toBeCloseTo(b(i / 20), 12);
  });

  it('저주파다 — 점마다 독립 난수를 쓴 것보다 훨씬 완만하다', () => {
    // 점마다 독립 난수를 쓰면 획이 구슬처럼 울퉁불퉁해진다. 조형 실험에서
    // 실제로 그렇게 됐다.
    //
    // 절대 임계값 대신 "구슬" 구현과 비교한다. 진폭이나 주파수 상수를
    // 나중에 손봐도 의도가 유지되고, 실제 분리폭이 38배라 넉넉하다.
    const N = 400;
    const step = (f: (t: number) => number) => {
      let m = 0;
      for (let i = 1; i <= N; i++) m = Math.max(m, Math.abs(f(i / N) - f((i - 1) / N)));
      return m;
    };
    const beadedRnd = mulberry32(42);
    const beaded = (_t: number) => 1 + 0.5 * (beadedRnd() - 0.5) * 2;

    const smooth = step(smoothJit(r(), 0.5));
    expect(smooth * 10).toBeLessThan(step(beaded));
    // 그래도 상한은 둔다 — 주파수를 크게 올리면 이 검사에 걸린다
    expect(smooth).toBeLessThan(0.06);
  });
});

describe('widthProfile', () => {
  it('요청한 개수만큼 낸다', () => {
    expect(widthProfile(17, 0.05, 0.01, 'lens', r(), 0)).toHaveLength(17);
  });

  it('모든 값이 양수다', () => {
    for (const kind of ['blade', 'lens', 'bloom', 'spike', 'hair', 'flat'] as const) {
      for (const w of widthProfile(40, 0.05, 0.004, kind, r(), 1.8)) {
        expect(w, kind).toBeGreaterThan(0);
      }
    }
  });

  it('lens 와 bloom 은 가운데가 가장 두껍다', () => {
    for (const kind of ['lens', 'bloom'] as const) {
      const w = widthProfile(41, 0.06, 0, kind, r(), 0);
      const mid = w[20]!;
      expect(mid, kind).toBeGreaterThan(w[0]!);
      expect(mid, kind).toBeGreaterThan(w[40]!);
    }
  });

  it('hair 는 끝이 뿌리 대비 w1 만큼 남는다 — 바늘처럼 뾰족해지지 않는다', () => {
    const root = 0.02, tip = root * 0.48;
    const w = widthProfile(31, root, tip, 'hair', r(), 0);
    expect(w[30]!).toBeCloseTo(tip, 6);
    expect(w[30]! / w[0]!).toBeGreaterThan(0.3);
  });

  it('spike 는 hair 보다 빨리 가늘어진다', () => {
    const s = widthProfile(31, 0.02, 0, 'spike', r(), 0);
    const h = widthProfile(31, 0.02, 0, 'hair', r(), 0);
    expect(s[15]!).toBeLessThan(h[15]!);
  });

  it('flat 은 w0 에서 w1 로 곧게 간다', () => {
    const w = widthProfile(11, 0.02, 0.01, 'flat', r(), 0);
    expect(w[0]!).toBeCloseTo(0.02, 6);
    expect(w[10]!).toBeCloseTo(0.01, 6);
    expect(w[5]!).toBeCloseTo(0.015, 6);
  });

  it('blade 는 뿌리가 가장 두껍다', () => {
    const w = widthProfile(31, 0.06, 0, 'blade', r(), 0);
    expect(w[0]!).toBeGreaterThan(w[30]!);
  });

  it('결정적이다', () => {
    const a = widthProfile(25, 0.04, 0.002, 'bloom', r(), 1.2);
    const b = widthProfile(25, 0.04, 0.002, 'bloom', r(), 1.2);
    expect(a).toEqual(b);
  });

  it('길이 1도 처리한다', () => {
    expect(widthProfile(1, 0.03, 0.01, 'lens', r(), 0)).toHaveLength(1);
  });
});
