import { describe, it, expect } from 'vitest';
import {
  canonicalize, seedOf, subSeed, constituentKey, sortedConstituents,
  type IR, type Constituent,
} from '../../src/core/ir';
import { ENGINE_VERSION } from '../../src/version';

const love: Constituent = { kind: 'concept', lemma: '사랑', role: '행위' };
const me: Constituent = { kind: 'concept', lemma: '나', role: '주체' };
const you: Constituent = { kind: 'concept', lemma: '너', role: '대상' };

const ir = (cs: Constituent[], mood: IR['mood'] = 'declarative'): IR => ({
  constituents: cs, mood, engineVersion: ENGINE_VERSION,
});

describe('constituentKey', () => {
  it('개념 성분은 역할과 표제어로 키를 만든다', () => {
    expect(constituentKey(love)).toBe('concept|행위|사랑');
  });

  it('음소 성분은 역할과 음절열로 키를 만든다', () => {
    const name: Constituent = {
      kind: 'phonetic',
      role: '대상',
      syllables: [
        { onset: 'l', nucleus: 'u', coda: '' },
        { onset: '', nucleus: 'i', coda: '' },
      ],
    };
    expect(constituentKey(name)).toBe('phonetic|대상|[["l","u",""],["","i",""]]');
  });

  it('음절 필드에 구분자가 들어가도 키가 겹치지 않는다', () => {
    const mk = (s: { onset: string; nucleus: string; coda: string }): Constituent =>
      ({ kind: 'phonetic', role: '대상', syllables: [s] });
    const a = mk({ onset: 'a', nucleus: 'b.c', coda: 'd' });
    const b = mk({ onset: 'a.b', nucleus: 'c', coda: 'd' });
    expect(constituentKey(a)).not.toBe(constituentKey(b));
  });
});

describe('canonicalize', () => {
  it('성분 순서가 달라도 같은 문자열을 낳는다', () => {
    expect(canonicalize(ir([love, me, you]))).toBe(canonicalize(ir([you, love, me])));
  });

  it('양상이 다르면 다른 문자열을 낳는다', () => {
    expect(canonicalize(ir([love, me, you])))
      .not.toBe(canonicalize(ir([love, me, you], 'interrogative')));
  });

  it('역할이 뒤바뀌면 다른 문자열을 낳는다', () => {
    const swapped: Constituent[] = [
      love,
      { kind: 'concept', lemma: '너', role: '주체' },
      { kind: 'concept', lemma: '나', role: '대상' },
    ];
    expect(canonicalize(ir([love, me, you]))).not.toBe(canonicalize(ir(swapped)));
  });

  it('엔진 버전을 포함한다', () => {
    expect(canonicalize(ir([love]))).toContain(ENGINE_VERSION);
  });
});

describe('seedOf', () => {
  it('성분 순서와 무관하게 같은 시드를 낳는다', () => {
    expect(seedOf(ir([love, me, you]))).toBe(seedOf(ir([you, me, love])));
  });

  it('역할이 뒤바뀌면 다른 시드를 낳는다', () => {
    const swapped: Constituent[] = [
      love,
      { kind: 'concept', lemma: '너', role: '주체' },
      { kind: 'concept', lemma: '나', role: '대상' },
    ];
    expect(seedOf(ir([love, me, you]))).not.toBe(seedOf(ir(swapped)));
  });
});

describe('subSeed', () => {
  it('같은 시드와 키에 같은 값을 낳는다', () => {
    expect(subSeed(123, 'concept|행위|사랑')).toBe(subSeed(123, 'concept|행위|사랑'));
  });

  it('키가 다르면 값이 다르다', () => {
    expect(subSeed(123, 'a')).not.toBe(subSeed(123, 'b'));
  });

  it('시드가 다르면 값이 다르다', () => {
    expect(subSeed(1, 'a')).not.toBe(subSeed(2, 'a'));
  });
});

describe('sortedConstituents', () => {
  it('입력 순서와 무관하게 같은 순서를 낳는다', () => {
    const a = sortedConstituents(ir([love, me, you])).map(constituentKey);
    const b = sortedConstituents(ir([you, love, me])).map(constituentKey);
    expect(a).toEqual(b);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const input = ir([you, love, me]);
    const before = input.constituents.map(constituentKey);
    sortedConstituents(input);
    expect(input.constituents.map(constituentKey)).toEqual(before);
  });
});
