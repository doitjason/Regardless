import { describe, it, expect } from 'vitest';
import { parseKo } from '../../src/core/parse-ko';
import { loadSeedLexicon } from '../../src/core/lexicon';
import type { Constituent } from '../../src/core/ir';

const lex = loadSeedLexicon();
const roleOf = (cs: Constituent[], lemma: string) =>
  cs.find((c) => c.kind === 'concept' && c.lemma === lemma)?.role;

describe('parseKo', () => {
  it('은/는/이/가 는 주체다', () => {
    expect(roleOf(parseKo('나는 너를 사랑해', lex), '나')).toBe('주체');
    expect(roleOf(parseKo('내가 너를 사랑해', lex), '나')).toBe('주체');
  });

  it('을/를 은 대상이다', () => {
    expect(roleOf(parseKo('나는 너를 사랑해', lex), '너')).toBe('대상');
  });

  it('용언은 어미를 떼고 행위가 된다', () => {
    for (const s of ['나는 너를 사랑해', '나는 너를 사랑한다', '나는 너를 사랑했다', '나는 너를 사랑합니다']) {
      expect(roleOf(parseKo(s, lex), '사랑'), s).toBe('행위');
    }
  });

  it('에/에서 는 시간성 자질로 시간과 장소를 가른다', () => {
    // 시간(temporality 높음) vs 하늘(낮음)
    expect(roleOf(parseKo('오늘에 사랑해', lex), '오늘')).toBe('시간');
    expect(roleOf(parseKo('하늘에서 기다림', lex), '하늘')).toBe('장소');
  });

  it('(으)로 는 방향이다', () => {
    expect(roleOf(parseKo('하늘로 기다림', lex), '하늘')).toBe('방향');
  });

  it('사전에 없는 말은 음소 폴백으로 내려간다', () => {
    const cs = parseKo('루이즈를 사랑해', lex);
    const name = cs.find((c) => c.kind === 'phonetic');
    expect(name).toBeDefined();
    expect(name!.role).toBe('대상');
    expect(name!.kind === 'phonetic' && name!.syllables.length).toBe(3);
  });

  it('조사가 없으면 사전의 기본 역할을 쓴다', () => {
    expect(roleOf(parseKo('사랑 나 너', lex), '나')).toBe('주체');
    expect(roleOf(parseKo('사랑 나 너', lex), '너')).toBe('대상');
  });

  it('양상 역할을 만들지 않는다 — 6시는 mood 의 자리다', () => {
    for (const c of parseKo('의문 나는 너를 사랑해', lex)) {
      expect(c.role).not.toBe('양상');
    }
  });

  it('어순이 달라도 같은 성분을 낸다 (스펙 6.1)', () => {
    const a = parseKo('나는 너를 사랑해', lex);
    const b = parseKo('너를 나는 사랑해', lex);
    const key = (cs: Constituent[]) => cs.map((c) =>
      c.kind === 'concept' ? `${c.role}|${c.lemma}` : `${c.role}|음소`).sort().join(',');
    expect(key(b)).toBe(key(a));
  });

  it('빈 문장은 빈 배열이다', () => {
    expect(parseKo('   ', lex)).toEqual([]);
  });

  it('결정적이다', () => {
    expect(JSON.stringify(parseKo('나는 너를 사랑해', lex)))
      .toBe(JSON.stringify(parseKo('나는 너를 사랑해', lex)));
  });
});
