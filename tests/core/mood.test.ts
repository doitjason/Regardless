import { describe, it, expect } from 'vitest';
import { detectMoodKo as detectKo, detectMoodEn } from '../../src/core/mood';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { parse } from '../../src/core/parse';
import type { Constituent } from '../../src/core/ir';

const lex = loadSeedLexicon();
const detectMoodKo = (s: string) => detectKo(s, lex);
const brief = (cs: Constituent[]) => cs.map((c) =>
  c.kind === 'concept' ? `${c.role}:${c.lemma}` : `${c.role}:음소(${c.syllables.length})`).join(' ');

describe('detectMoodKo', () => {
  it('평서문이 기본이다', () => {
    expect(detectMoodKo('나는 너를 사랑해').mood).toBe('declarative');
  });

  it('물음표와 의문 어미를 잡는다', () => {
    for (const s of ['나를 사랑해?', '나를 사랑하니', '나를 사랑하나', '사랑입니까']) {
      expect(detectMoodKo(s).mood, s).toBe('interrogative');
    }
  });

  it('부정 표지를 잡는다', () => {
    for (const s of ['나는 너를 안 사랑해', '못 기다려', '사랑하지 않아']) {
      expect(detectMoodKo(s).mood, s).toBe('negative');
    }
  });

  it('의지 표지를 잡는다', () => {
    for (const s of ['너를 기다릴게', '우리 약속하자', '기다리겠다']) {
      expect(detectMoodKo(s).mood, s).toBe('volitional');
    }
  });

  it('양보 표지를 잡는다', () => {
    for (const s of ['그럼에도 불구하고 나는 너를 사랑해', '그래도 사랑해', '그럼에도 사랑해']) {
      expect(detectMoodKo(s).mood, s).toBe('concessive');
    }
  });

  it('표지어를 문장에서 덜어낸다 — 같은 뜻이 두 번 그려지면 안 된다', () => {
    const r = detectMoodKo('그럼에도 불구하고 나는 너를 사랑해');
    expect(r.rest).toBe('나는 너를 사랑해');
    expect(detectMoodKo('나는 너를 안 사랑해').rest).toBe('나는 너를 사랑해');
    expect(detectMoodKo('나를 사랑해?').rest).toBe('나를 사랑해');
  });

  it('양보가 의문·부정보다 앞선다 — 가장 바깥 태도다', () => {
    expect(detectMoodKo('그럼에도 불구하고 안 잊어').mood).toBe('concessive');
    expect(detectMoodKo('그럼에도 불구하고 안 잊어').rest).toBe('잊어');
  });

  it('결정적이다', () => {
    const a = detectMoodKo('그래도 사랑해');
    expect(detectMoodKo('그래도 사랑해')).toEqual(a);
  });
});

describe('계획 III 최종 리뷰 C4 — 의문 어미는 용언 뒤에서만', () => {
  it('너와 나 는 평서문이고 나 가 남는다', () => {
    const r = detectMoodKo('너와 나');
    expect(r).toEqual({ mood: 'declarative', rest: '너와 나' });
    expect(brief(parse('너와 나', lex).constituents)).toBe('대상:너 주체:나');
  });

  it('우리 어머니 는 평서문이고 어머니 가 잘리지 않는다', () => {
    expect(detectMoodKo('우리 어머니')).toEqual({ mood: 'declarative', rest: '우리 어머니' });
  });

  it('니/나 로 끝나는 명사는 의문이 아니다', () => {
    for (const s of ['나는 언니', '너는 나의 누나', '우리 둘은 하나', '나의 할머니']) {
      expect(detectMoodKo(s), s).toEqual({ mood: 'declarative', rest: s });
    }
  });

  it('의문 어미를 떼고 동사는 기본형으로 남긴다', () => {
    const cases: [string, string][] = [
      ['나를 사랑하니', '나를 사랑하다'],
      ['사랑하나요?', '사랑하다'],
      ['사랑입니까', '사랑이다'],
      ['나를 사랑합니까', '나를 사랑하다'],
      ['밥을 먹니', '밥을 먹다'],
      ['어디 가냐', '어디 가다'],
      ['같이 갈까', '같이 가다'],
      ['너를 믿어도 될까', '너를 믿어도 되다'],
      ['나를 기다렸니', '나를 기다렸다'],
    ];
    for (const [s, rest] of cases) {
      expect(detectMoodKo(s), s).toEqual({ mood: 'interrogative', rest });
    }
  });

  it('의문문의 동사가 IR 에 남는다', () => {
    const ir = parse('나를 사랑하니', lex);
    expect(ir.mood).toBe('interrogative');
    expect(brief(ir.constituents)).toBe('대상:나 행위:사랑');
  });
});

describe('계획 III 최종 리뷰 C5 — 의지 표지를 지워도 동사는 남는다', () => {
  it('오늘 밤에 만나자', () => {
    expect(detectMoodKo('오늘 밤에 만나자')).toEqual({ mood: 'volitional', rest: '오늘 밤에 만나다' });
    const ir = parse('오늘 밤에 만나자', lex);
    expect(ir.mood).toBe('volitional');
    expect(brief(ir.constituents)).toBe('시간:오늘 시간:밤 행위:만남');
  });

  it('너를 기다릴게 — 받침 ㄹ 을 떼고 어간을 남긴다', () => {
    expect(detectMoodKo('너를 기다릴게')).toEqual({ mood: 'volitional', rest: '너를 기다리다' });
    const ir = parse('너를 기다릴게', lex);
    expect(brief(ir.constituents)).toBe('대상:너 행위:기다림');
  });

  it('청유형·약속형의 어간이 모두 남는다', () => {
    const cases: [string, string][] = [
      ['우리 약속하자', '우리 약속하다'],
      ['같이 가자', '같이 가다'],
      ['우리 사랑하자', '우리 사랑하다'],
      ['조금 기다리자', '조금 기다리다'],
      ['기다리겠다', '기다리다'],
      ['너를 사랑할게요', '너를 사랑하다'],
      ['여기 살게', '여기 살다'],
      ['먼저 잘게', '먼저 자다'],
      ['밥을 먹을래', '밥을 먹다'],
      ['너를 기다릴 거야', '너를 기다리다'],
    ];
    for (const [s, rest] of cases) {
      expect(detectMoodKo(s), s).toEqual({ mood: 'volitional', rest });
    }
  });

  it('-게 로 끝나는 조사는 약속형이 아니다', () => {
    expect(detectMoodKo('사랑을 너에게')).toEqual({ mood: 'declarative', rest: '사랑을 너에게' });
  });
});

describe('계획 III 최종 리뷰 I6 — 한국어 부정', () => {
  it('붙여 쓴 못해 / 안돼 는 부정이다', () => {
    expect(detectMoodKo('나는 못해')).toEqual({ mood: 'negative', rest: '나는' });
    expect(detectMoodKo('나는 잘 못해')).toEqual({ mood: 'negative', rest: '나는 잘' });
    expect(detectMoodKo('나는 안돼')).toEqual({ mood: 'negative', rest: '나는' });
  });

  it('못 은 뒤의 낱말을 먹지 않는다', () => {
    expect(detectMoodKo('못 기다려')).toEqual({ mood: 'negative', rest: '기다려' });
    expect(detectMoodKo('나는 너를 잊지 못해')).toEqual({ mood: 'negative', rest: '나는 너를 잊다' });
    const ir = parse('나는 너를 잊지 못해', lex);
    expect(brief(ir.constituents)).toBe('주체:나 대상:너 행위:잊다');
  });

  it('-지 않- 은 어간을 기본형으로 남긴다', () => {
    expect(detectMoodKo('사랑하지 않아').rest).toBe('사랑하다');
    expect(detectMoodKo('너를 잊지 마').rest).toBe('너를 잊다');
    expect(detectMoodKo('너를 잊지 마').mood).toBe('negative');
  });

  it('낱말 안의 안/못 은 부정이 아니다', () => {
    for (const s of ['안개가 꼈다', '안개가 짙다', '못이 박혔다', '책 안에 있다', '나를 안아']) {
      expect(detectMoodKo(s), s).toEqual({ mood: 'declarative', rest: s });
    }
  });

  it('안개가 꼈다 는 IR 에서도 부정이 아니다', () => {
    expect(parse('안개가 꼈다', lex).mood).toBe('declarative');
  });
});

describe('detectMoodEn', () => {
  it('평서문이 기본이다', () => {
    expect(detectMoodEn('I love you').mood).toBe('declarative');
  });

  it('물음표와 의문 조동사를 잡는다', () => {
    for (const s of ['Do you love me?', 'do you love me', 'Is it time?']) {
      expect(detectMoodEn(s).mood, s).toBe('interrogative');
    }
  });

  it('부정을 잡는다', () => {
    for (const s of ["I don't love you", 'I never forget', 'I do not wait']) {
      expect(detectMoodEn(s).mood, s).toBe('negative');
    }
  });

  it('의지를 잡는다', () => {
    for (const s of ["Let's wait", 'I will wait']) {
      expect(detectMoodEn(s).mood, s).toBe('volitional');
    }
  });

  it('양보를 잡는다', () => {
    for (const s of ['Regardless, I love you', 'Nevertheless I love you', 'Even so, I love you']) {
      expect(detectMoodEn(s).mood, s).toBe('concessive');
    }
  });

  it('표지어를 문장에서 덜어낸다', () => {
    expect(detectMoodEn('Regardless, I love you').rest.trim()).toBe('I love you');
    expect(detectMoodEn("I don't love you").rest.trim()).toBe('I love you');
  });

  it('한국어와 영어가 같은 태도를 낸다', () => {
    expect(detectMoodEn('Regardless, I love you').mood)
      .toBe(detectMoodKo('그럼에도 불구하고 나는 너를 사랑해').mood);
  });

  it('짧은 표지가 다른 낱말에 걸리지 않는다', () => {
    expect(detectMoodKo('나는 혼자').mood).toBe('declarative');
    expect(detectMoodKo('오늘은 바다').mood).toBe('declarative');
    expect(detectMoodEn('I wait in the sky').mood).toBe('declarative');
    // 니/나 도 자 와 같은 종류의 결함이었다 (리뷰 C4, I7)
    expect(detectMoodKo('너와 나').mood).toBe('declarative');
    expect(detectMoodKo('우리 어머니').mood).toBe('declarative');
  });
});

describe('계획 III 최종 리뷰 I6 — 영어 부정과 의지', () => {
  it('be + not 은 부정이고 be 는 남는다', () => {
    expect(detectMoodEn('I am not waiting')).toEqual({ mood: 'negative', rest: 'I am waiting' });
    expect(detectMoodEn("I'm not afraid")).toEqual({ mood: 'negative', rest: "I'm afraid" });
    expect(detectMoodEn("the sky isn't dark")).toEqual({ mood: 'negative', rest: 'the sky is dark' });
    expect(detectMoodEn('the sky is not yet dark').mood).toBe('negative');
  });

  it('문장 머리의 부정도 잡는다', () => {
    expect(detectMoodEn("Don't go")).toEqual({ mood: 'negative', rest: 'go' });
    expect(detectMoodEn('I cannot forget you')).toEqual({ mood: 'negative', rest: 'I forget you' });
    expect(detectMoodEn("I can't forget you")).toEqual({ mood: 'negative', rest: 'I forget you' });
  });

  it('명사 will 은 의지가 아니다', () => {
    for (const s of ['the will of the people', 'the will of the people is strong', 'free will is a myth']) {
      expect(detectMoodEn(s), s).toEqual({ mood: 'declarative', rest: s });
    }
  });

  it('조동사 will 은 의지이고 지워진다', () => {
    expect(detectMoodEn('I will wait')).toEqual({ mood: 'volitional', rest: 'I wait' });
    expect(detectMoodEn('we will always love you')).toEqual({ mood: 'volitional', rest: 'we always love you' });
    expect(detectMoodEn("I'll wait for you")).toEqual({ mood: 'volitional', rest: 'I wait for you' });
    expect(detectMoodEn('Let us wait')).toEqual({ mood: 'volitional', rest: 'wait' });
    expect(detectMoodEn("Let's wait")).toEqual({ mood: 'volitional', rest: 'wait' });
  });
});

describe('자 로 끝나는 낱말', () => {
  it('명사는 의지로 읽지 않는다', () => {
    for (const s of ['나는 혼자', '이것은 감자', '나의 모자', '저기 의자', '그 남자']) {
      expect(detectMoodKo(s), s).toEqual({ mood: 'declarative', rest: s });
    }
  });

  it('아는 동사의 청유형은 의지다', () => {
    for (const s of ['우리 약속하자', '같이 가자', '이제 만나자', '조금 기다리자']) {
      expect(detectMoodKo(s).mood, s).toBe('volitional');
    }
  });
});
