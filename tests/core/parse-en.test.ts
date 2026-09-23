import { describe, it, expect } from 'vitest';
import { parseEn } from '../../src/core/parse-en';
import { detectMoodEn } from '../../src/core/mood';
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
    for (const [sentence, lemma] of [['I wait', '기다림'], ['I hate you', '미움'],
                                     ['I choose you', '선택']] as const) {
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
    for (const [s, lemma] of [['we met yesterday', '만남'], ['I saw the sky', '보다'],
                              ['I gave water', '주다']] as const) {
      expect(parseEn(s, lex).some((c) => c.kind === 'concept' && c.lemma === lemma), s).toBe(true);
    }
  });

  it('chose 는 선택에 행위로 닿는다 (I3)', () => {
    const cs = parseEn('I chose you', lex);
    expect(roleOf(cs, '선택')).toBe('행위');
    // 부정: 근처 낱말 'you' 는 선택에 닿지 않는다 — 동사 자리만 닿는다.
    expect(cs.find((c) => c.kind === 'concept' && c.lemma === '너')?.role).not.toBe('행위');
  });

  it('사전에 없는 lose 는 나선 없이 조용히 버려진다 (I3) — "잃다" 항목이 없다', () => {
    const cs = parseEn('I lost you', lex);
    expect(cs.every((c) => c.kind !== 'phonetic')).toBe(true);
    expect(cs.some((c) => c.kind === 'concept' && c.role === '행위')).toBe(false);
    // 주체·대상은 살아 있다 — 동사 하나가 빠졌을 뿐 문장 전체가 무너지지 않는다.
    expect(roleOf(cs, '나')).toBe('주체');
    expect(roleOf(cs, '너')).toBe('대상');
  });

  it('불규칙 표가 존재하는 gloss 를 가로채지 않는다 — thought 는 생각(명사)에 닿는다 (I3)', () => {
    const cs = parseEn('I see the thought', lex);
    expect(roleOf(cs, '생각')).toBe('대상');
    // 음소 나선으로 떨어지지 않았다 — 불규칙 표(think, 사전에 없음)에
    // 가로채였다면 조용히 사라졌을 것이다.
    expect(cs.every((c) => c.kind !== 'phonetic')).toBe(true);
    // 부정: 'see' 는 생각이 아니라 보다에 닿는다 — 근처 낱말이 같은 표제어를
    // 훔치지 않는다.
    expect(roleOf(cs, '보다')).toBe('행위');
  });
});

describe('시간 명사의 문장 성분 (I1)', () => {
  it('관사 있는 시간 명사는 동사 뒤에서 대상이다', () => {
    const cs = parseEn('I love the night', lex);
    expect(roleOf(cs, '밤')).toBe('대상');
    expect(roleOf(cs, '사랑')).toBe('행위');
  });

  it('관사 있는 시간 명사가 계사 앞이면 주체다', () => {
    const cs = parseEn('the morning is bright', lex);
    expect(roleOf(cs, '아침')).toBe('주체');
  });

  it('부정: 관사 없이 쓰인 시간 명사는 여전히 부사적 시간이다', () => {
    // 'I wait today' 에는 관사가 없다 — 동사 뒤에 있어도 대상이 되지 않는다.
    expect(roleOf(parseEn('I wait today', lex), '오늘')).toBe('시간');
    // 'we met yesterday' 도 마찬가지다.
    expect(roleOf(parseEn('we met yesterday', lex), '어제')).toBe('시간');
  });
});

describe('전치사와 시간 명사 (I2)', () => {
  it('in/at 뒤의 시간 명사는 장소가 아니라 시간이다', () => {
    expect(roleOf(parseEn('I wait in the morning', lex), '아침')).toBe('시간');
    expect(roleOf(parseEn('I wait at night', lex), '밤')).toBe('시간');
  });

  it('부정: in/at 뒤의 장소 명사는 그대로 장소다', () => {
    expect(roleOf(parseEn('I wait in the sky', lex), '하늘')).toBe('장소');
  });
});

describe('대명사 (I4)', () => {
  it('3인칭 대명사는 사람으로 이어져 주체가 살아남는다', () => {
    const cs = parseEn('she loves me', lex);
    expect(roleOf(cs, '사람')).toBe('주체');
    expect(roleOf(cs, '사랑')).toBe('행위');
    expect(roleOf(cs, '나')).toBe('대상');
    // 부정: 'she' 가 '너'(you)로 잘못 닿지 않는다 — 대명사끼리 섞이지 않는다.
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '너')).toBe(false);
  });

  it("축약형 I'm 이 주체 나에 닿는다", () => {
    const cs = parseEn("I'm waiting for you", lex);
    expect(roleOf(cs, '나')).toBe('주체');
    expect(roleOf(cs, '기다림')).toBe('행위');
    expect(roleOf(cs, '너')).toBe('대상');
  });
});

describe('목걸이 문장은 그대로다', () => {
  it("'Regardless, I love you' → 주체:나 행위:사랑 대상:너 (기존 목걸이 문구는 바뀌지 않는다)", () => {
    const { rest } = detectMoodEn('Regardless, I love you');
    const cs = parseEn(rest, lex);
    expect(roleOf(cs, '나')).toBe('주체');
    expect(roleOf(cs, '사랑')).toBe('행위');
    expect(roleOf(cs, '너')).toBe('대상');
    expect(cs).toHaveLength(3);
  });
});
