import { describe, it, expect } from 'vitest';
import { fnv1a, mulberry32 } from '../../src/core/hash';

describe('fnv1a', () => {
  it('빈 문자열에 대해 FNV-1a offset basis를 반환한다', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
  });

  it('같은 입력에 항상 같은 값을 반환한다', () => {
    expect(fnv1a('사랑')).toBe(fnv1a('사랑'));
  });

  it('다른 입력에 다른 값을 반환한다', () => {
    expect(fnv1a('사랑')).not.toBe(fnv1a('미움'));
  });

  it('한 글자만 달라도 값이 달라진다', () => {
    expect(fnv1a('정')).not.toBe(fnv1a('종'));
  });

  it('항상 32비트 부호 없는 정수를 반환한다', () => {
    for (const s of ['', 'a', '사랑', 'I love you', '루이즈']) {
      const h = fnv1a(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('mulberry32', () => {
  it('같은 시드는 같은 수열을 낳는다', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('다른 시드는 다른 수열을 낳는다', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('[0, 1) 범위의 값을 낳는다', () => {
    const r = mulberry32(999);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
