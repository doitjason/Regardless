import { describe, it, expect } from 'vitest';
import { parseEn } from '../../src/core/parse-en';
import { loadSeedLexicon } from '../../src/core/lexicon';
import type { Constituent } from '../../src/core/ir';

const lex = loadSeedLexicon();
const roleOf = (cs: Constituent[], lemma: string) =>
  cs.find((c) => c.kind === 'concept' && c.lemma === lemma)?.role;

describe('parseEn', () => {
  it('gloss_en 으로 한국어 표제어에 잇는다', () => {
    const cs = parseEn('I love you', lex);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '사랑')).toBe(true);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '나')).toBe(true);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '너')).toBe(true);
  });

  it('동사 앞은 주체, 뒤는 대상이다', () => {
    const cs = parseEn('I love you', lex);
    expect(roleOf(cs, '나')).toBe('주체');
    expect(roleOf(cs, '사랑')).toBe('행위');
    expect(roleOf(cs, '너')).toBe('대상');
  });

  it('목적격 대명사도 잇는다', () => {
    expect(roleOf(parseEn('you love me', lex), '나')).toBe('대상');
  });

  it('관사와 빈 낱말은 버린다', () => {
    const cs = parseEn('the child loves a bird', lex);
    expect(cs.every((c) => c.kind !== 'phonetic')).toBe(true);
    expect(roleOf(cs, '아이')).toBe('주체');
    expect(roleOf(cs, '새')).toBe('대상');
  });

  it('in/at 은 장소, 시간 낱말은 시간이다', () => {
    expect(roleOf(parseEn('I wait in the sky', lex), '하늘')).toBe('장소');
    expect(roleOf(parseEn('I wait today', lex), '오늘')).toBe('시간');
  });

  it('사전에 없는 영어 낱말은 아직 그리지 않는다', () => {
    const cs = parseEn('I love Louise', lex);
    expect(cs.every((c) => c.kind !== 'phonetic')).toBe(true);
  });

  it('양상 역할을 만들지 않는다', () => {
    for (const c of parseEn('question I love you', lex)) expect(c.role).not.toBe('양상');
  });

  it('빈 문장은 빈 배열이다', () => {
    expect(parseEn('  ', lex)).toEqual([]);
  });

  it('결정적이다', () => {
    expect(JSON.stringify(parseEn('I love you', lex)))
      .toBe(JSON.stringify(parseEn('I love you', lex)));
  });
});

describe('동사 기본형', () => {
  it('영어 동사가 명사형만 있는 개념에도 닿는다', () => {
    for (const [sentence, lemma] of [['I wait', '기다리다'], ['I hate you', '미워하다'],
                                     ['I choose you', '선택하다']] as const) {
      const cs = parseEn(sentence, lex);
      expect(cs.some((c) => c.kind === 'concept' && c.lemma === lemma), sentence).toBe(true);
    }
  });

  it('명사형 영어도 여전히 명사에 닿는다', () => {
    expect(parseEn('waiting', lex).some((c) => c.kind === 'concept' && c.lemma === '기다림')).toBe(true);
  });
});

describe('불규칙 과거형', () => {
  it('met·saw·went 가 기본형에 닿는다', () => {
    for (const [s, lemma] of [['we met yesterday', '만나다'], ['I saw the sky', '보다'],
                              ['I gave water', '주다']] as const) {
      expect(parseEn(s, lex).some((c) => c.kind === 'concept' && c.lemma === lemma), s).toBe(true);
    }
  });
});
