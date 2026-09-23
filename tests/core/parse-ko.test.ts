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

  it('공동격 조사를 뗀다', () => {
    expect(roleOf(parseKo('나는 너와 바다를 보았다', lex), '너')).toBe('대상');
    expect(roleOf(parseKo('너랑 가자', lex), '너')).toBe('대상');
  });

  it('과거형 어미를 뗀다', () => {
    const cs = parseKo('나는 바다를 보았다', lex);
    expect(cs.some((c) => c.kind === 'phonetic'), JSON.stringify(cs)).toBe(false);
  });

  it('축약형을 되돌려 사전에서 찾는다', () => {
    // 기다려 = 기다리 + 어. 사전의 표제어는 명사형 '기다림' 하나뿐이다
    // (계획 III 최종 리뷰 C6) — '기다리다' 는 그 별칭이므로, 이 어절을
    // 어떻게 되돌리든 IR 에는 대표 표제어 '기다림' 만 새겨져야 한다.
    const cs = parseKo('너를 기다려', lex);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '기다림'),
      JSON.stringify(cs)).toBe(true);
  });

  it('하다형 용언은 어근으로 찾는다', () => {
    for (const s of ['너를 사랑한다', '우리는 약속했다', '나는 선택했어']) {
      const cs = parseKo(s, lex);
      expect(cs.some((c) => c.kind === 'phonetic'), `${s}: ${JSON.stringify(cs)}`).toBe(false);
    }
  });

  it('일상 문장이 음소 폴백 없이 그려진다', () => {
    const cs = parseKo('나는 너와 함께 바다를 보았다', lex);
    expect(cs.filter((c) => c.kind === 'phonetic'), JSON.stringify(cs)).toHaveLength(0);
    expect(cs).toHaveLength(5);
  });

  it('사람 이름은 여전히 음소 폴백이다 — 되돌리기가 이름을 삼키면 안 된다', () => {
    const cs = parseKo('루이즈를 기다려', lex);
    expect(cs.some((c) => c.kind === 'phonetic' && c.syllables.length === 3)).toBe(true);
  });

  it('짐작한 어간이 엉뚱한 낱말에 걸리지 않는다', () => {
    // 보았다 → 어간 보 → 명사형 봄. 사전의 '봄' 은 계절이다. 계절로 그리느니
    // 모르는 말로 두는 편이 낫다.
    const cs = parseKo('나는 바다를 보았다', lex);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '봄'), JSON.stringify(cs)).toBe(false);
  });

  it('짐작으로 찾은 낱말은 용언만 받는다', () => {
    // 기다림(행위)은 받고, 봄(시간)은 받지 않는다
    const wait = parseKo('너를 기다려', lex);
    expect(wait.some((c) => c.kind === 'concept' && c.lemma === '기다림')).toBe(true);
  });

  it('어간에 붙어 줄어든 과거형을 되돌린다', () => {
    const cs = parseKo('우리는 어제 만났다', lex);
    // 사전의 표제어는 명사형 '만남' 하나뿐이다 (계획 III 최종 리뷰 C6) —
    // '만나다' 는 그 별칭이므로 IR 에는 대표 표제어만 새겨져야 한다.
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '만남'),
      JSON.stringify(cs)).toBe(true);
  });

  it('직접 찾은 낱말은 역할과 무관하게 그대로 쓴다', () => {
    // 짐작 가드가 평범한 명사 조회까지 막으면 안 된다
    expect(parseKo('봄이 왔다', lex).some((c) => c.kind === 'concept' && c.lemma === '봄')).toBe(true);
    expect(parseKo('오늘 하늘을 보았다', lex).some((c) => c.kind === 'concept' && c.lemma === '하늘')).toBe(true);
  });
});

describe('기본형 되찾기', () => {
  it('과거형이 계절이 아니라 동사로 잡힌다', () => {
    const cs = parseKo('나는 바다를 보았다', lex);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '보다'), JSON.stringify(cs)).toBe(true);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '봄')).toBe(false);
  });

  it('어간에 녹아붙은 과거형도 기본형으로 돌아온다', () => {
    expect(parseKo('봄이 왔다', lex).some((c) => c.kind === 'concept' && c.lemma === '오다')).toBe(true);
  });

  it('명사는 그대로 명사다 — 기본형 만들기가 명사를 삼키지 않는다', () => {
    expect(parseKo('봄이 왔다', lex).some((c) => c.kind === 'concept' && c.lemma === '봄')).toBe(true);
    expect(parseKo('바다를 보았다', lex).some((c) => c.kind === 'concept' && c.lemma === '바다')).toBe(true);
  });
});
