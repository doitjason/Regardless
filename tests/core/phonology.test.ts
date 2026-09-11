import { describe, it, expect } from 'vitest';
import {
  decomposeHangul, syllabify, consonantFeatures, vowelFeatures,
} from '../../src/core/phonology';

describe('decomposeHangul', () => {
  it('종성 없는 음절을 분해한다', () => {
    expect(decomposeHangul('루')).toEqual({ onset: 'l', nucleus: 'u', coda: '' });
  });

  it('빈 초성(ㅇ)을 빈 문자열로 낸다', () => {
    expect(decomposeHangul('이')).toEqual({ onset: '', nucleus: 'i', coda: '' });
  });

  it('종성 있는 음절을 분해한다', () => {
    expect(decomposeHangul('한')).toEqual({ onset: 'h', nucleus: 'a', coda: 'n' });
  });

  it('정과 종은 중성만 다르다', () => {
    const a = decomposeHangul('정')!;
    const b = decomposeHangul('종')!;
    expect(a.onset).toBe(b.onset);
    expect(a.coda).toBe(b.coda);
    expect(a.nucleus).not.toBe(b.nucleus);
  });

  it('한글 음절이 아니면 null을 낸다', () => {
    expect(decomposeHangul('a')).toBeNull();
    expect(decomposeHangul('1')).toBeNull();
    expect(decomposeHangul('ㄱ')).toBeNull();
  });

  it('음절 영역의 양 끝을 처리한다', () => {
    expect(decomposeHangul('가')).toEqual({ onset: 'g', nucleus: 'a', coda: '' });
    expect(decomposeHangul('힣')).toEqual({ onset: 'h', nucleus: 'i', coda: 'h' });
  });
});

describe('syllabify', () => {
  it('한글 문자열을 음절 배열로 만든다', () => {
    expect(syllabify('루이즈')).toHaveLength(3);
  });

  it('음절 순서를 보존한다 — 이름에서 순서는 의미다', () => {
    const a = syllabify('정호');
    const b = syllabify('호정');
    expect(a[0]).not.toEqual(b[0]);
  });

  it('한글이 아닌 문자는 건너뛴다', () => {
    expect(syllabify('루 이')).toHaveLength(2);
    expect(syllabify('a루b이c')).toHaveLength(2);
  });

  it('빈 문자열은 빈 배열을 낸다', () => {
    expect(syllabify('')).toEqual([]);
  });
});

describe('consonantFeatures', () => {
  it('조음 방법을 분류한다', () => {
    expect(consonantFeatures('g').manner).toBe('stop');
    expect(consonantFeatures('s').manner).toBe('fricative');
    expect(consonantFeatures('n').manner).toBe('nasal');
    expect(consonantFeatures('l').manner).toBe('liquid');
    expect(consonantFeatures('j').manner).toBe('affricate');
    expect(consonantFeatures('').manner).toBe('none');
  });

  it('조음 위치가 양순에서 후음으로 증가한다', () => {
    expect(consonantFeatures('b').place).toBeLessThan(consonantFeatures('d').place);
    expect(consonantFeatures('d').place).toBeLessThan(consonantFeatures('j').place);
    expect(consonantFeatures('j').place).toBeLessThan(consonantFeatures('g').place);
    expect(consonantFeatures('g').place).toBeLessThan(consonantFeatures('h').place);
  });

  it('평음·격음·경음의 긴장도를 구별한다', () => {
    expect(consonantFeatures('g').tense).toBe(0);
    expect(consonantFeatures('k').tense).toBe(1);
    expect(consonantFeatures('kk').tense).toBe(2);
  });

  it('모르는 음소는 중립값을 낸다', () => {
    const f = consonantFeatures('zzz');
    expect(f.place).toBeGreaterThanOrEqual(0);
    expect(f.place).toBeLessThanOrEqual(4);
  });

  it('분해에서 나오는 모든 초성·종성 id를 표에서 찾을 수 있다', () => {
    // 자질 표에 구멍이 있으면 그 자모가 조용히 중립값으로 떨어진다.
    const ids = new Set<string>();
    for (let cp = 0xac00; cp <= 0xd7a3; cp++) {
      const s = decomposeHangul(String.fromCodePoint(cp))!;
      ids.add(s.onset);
      if (s.coda !== '') ids.add(s.coda);
    }
    const neutral = consonantFeatures(' 없는음소 ');
    for (const id of ids) {
      const f = consonantFeatures(id);
      expect(f, `자질 표에 ${id} 없음`).not.toEqual(neutral);
    }
  });
});

describe('vowelFeatures', () => {
  it('고모음이 저모음보다 height가 크다', () => {
    expect(vowelFeatures('i').height).toBeGreaterThan(vowelFeatures('a').height);
    expect(vowelFeatures('u').height).toBeGreaterThan(vowelFeatures('a').height);
  });

  it('후설모음이 전설모음보다 back이 크다', () => {
    expect(vowelFeatures('u').back).toBeGreaterThan(vowelFeatures('i').back);
  });

  it('원순모음을 표시한다', () => {
    expect(vowelFeatures('u').round).toBe(1);
    expect(vowelFeatures('i').round).toBe(0);
  });

  it('모든 자질이 0..1 범위다', () => {
    for (const v of ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae',
                     'oe','yo','u','wo','we','wi','yu','eu','ui','i']) {
      const f = vowelFeatures(v);
      for (const [k, n] of Object.entries(f)) {
        expect(n, `${v}.${k}`).toBeGreaterThanOrEqual(0);
        expect(n, `${v}.${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('분해에서 나오는 모든 중성 id를 표에서 찾을 수 있다', () => {
    const ids = new Set<string>();
    for (let cp = 0xac00; cp <= 0xd7a3; cp++) {
      ids.add(decomposeHangul(String.fromCodePoint(cp))!.nucleus);
    }
    const neutral = vowelFeatures(' 없는음소 ');
    for (const id of ids) {
      expect(vowelFeatures(id), `자질 표에 ${id} 없음`).not.toEqual(neutral);
    }
  });

  it('모르는 음소는 중립값을 낸다', () => {
    const f = vowelFeatures('zzz');
    expect(f.height).toBeGreaterThanOrEqual(0);
    expect(f.height).toBeLessThanOrEqual(1);
  });
});
