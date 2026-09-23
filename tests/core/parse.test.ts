import { describe, it, expect } from 'vitest';
import { parse, detectLanguage } from '../../src/core/parse';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { canonicalize } from '../../src/core/ir';
import { ENGINE_VERSION } from '../../src/version';

const lex = loadSeedLexicon();

describe('detectLanguage', () => {
  it('한글이 하나라도 있으면 한국어다', () => {
    expect(detectLanguage('나는 너를 사랑해')).toBe('ko');
    expect(detectLanguage('I love 너')).toBe('ko');
  });

  it('한글이 없으면 영어다', () => {
    expect(detectLanguage('I love you')).toBe('en');
  });
});

describe('parse', () => {
  it('IR 을 낸다', () => {
    const ir = parse('나는 너를 사랑해', lex);
    expect(ir.engineVersion).toBe(ENGINE_VERSION);
    expect(ir.mood).toBe('declarative');
    expect(ir.constituents.length).toBe(3);
  });

  it('한국어와 영어가 같은 IR 을 낸다 (스펙 6.1)', () => {
    const ko = parse('나는 너를 사랑해', lex);
    const en = parse('I love you', lex);
    expect(canonicalize(en)).toBe(canonicalize(ko));
  });

  it('프로젝트 문장도 두 언어가 같다', () => {
    const ko = parse('그럼에도 불구하고 나는 너를 사랑해', lex);
    const en = parse('Regardless, I love you', lex);
    expect(ko.mood).toBe('concessive');
    expect(canonicalize(en)).toBe(canonicalize(ko));
  });

  it('어순이 달라도 같은 IR 이다', () => {
    expect(canonicalize(parse('너를 나는 사랑해', lex)))
      .toBe(canonicalize(parse('나는 너를 사랑해', lex)));
  });

  it('역할이 바뀌면 다른 IR 이다 (원칙 2)', () => {
    expect(canonicalize(parse('너는 나를 사랑해', lex)))
      .not.toBe(canonicalize(parse('나는 너를 사랑해', lex)));
  });

  it('문장 종류가 바뀌면 다른 IR 이다', () => {
    expect(parse('나를 사랑해?', lex).mood).toBe('interrogative');
    expect(canonicalize(parse('나를 사랑해?', lex)))
      .not.toBe(canonicalize(parse('나를 사랑해', lex)));
  });

  it('빈 입력은 던진다 — 그릴 것이 없다', () => {
    expect(() => parse('   ', lex)).toThrow(/성분/);
  });

  it('결정적이다', () => {
    expect(canonicalize(parse('나는 너를 사랑해', lex)))
      .toBe(canonicalize(parse('나는 너를 사랑해', lex)));
  });

  it('한 개념의 여러 형태가 두 언어에서 같은 IR 을 낸다 (스펙 6.1)', () => {
    const same = (a: string, b: string) =>
      expect(canonicalize(parse(b, lex)), `${a} / ${b}`).toBe(canonicalize(parse(a, lex)));
    same('나는 너를 선택했다', 'I choose you');
    same('나는 너를 선택했다', 'I chose you');
    same('나는 너를 기다려', 'I wait for you');
    same('나는 너를 기다려', 'I am waiting for you');
    same('나는 너를 기억해', 'I remember you');
    same('나는 너를 미워해', 'I hate you');
  });
});

describe('연인 문장 — 두 언어가 같은 그림 (알다/잃다, -고 싶다, 심리 서술어)', () => {
  const same = (ko: string, en: string) =>
    expect(canonicalize(parse(ko, lex)), `${ko} / ${en}`).toBe(canonicalize(parse(en, lex)));
  const brief = (text: string) => parse(text, lex).constituents.map((c) =>
    c.kind === 'concept' ? `${c.role}:${c.lemma}` : `${c.role}:음소`).join(' ');

  it('나는 네가 보고 싶어 = I miss you', () => same('나는 네가 보고 싶어', 'I miss you'));
  it('나는 너를 보고 싶어 = I miss you', () => same('나는 너를 보고 싶어', 'I miss you'));
  it('나는 네가 그리워 = I miss you', () => same('나는 네가 그리워', 'I miss you'));
  it('나는 너를 안다 = I know you', () => same('나는 너를 안다', 'I know you'));
  it('나는 너를 알았다 = I knew you', () => same('나는 너를 알았다', 'I knew you'));
  it('나는 너를 잃었다 = I lost you', () => same('나는 너를 잃었다', 'I lost you'));
  it('나는 먹고 싶어 = I want to eat', () => same('나는 먹고 싶어', 'I want to eat'));
  it('나는 너를 사랑하고 싶어 = I want to love you', () => same('나는 너를 사랑하고 싶어', 'I want to love you'));
  it('나는 네가 좋아 = I like you', () => same('나는 네가 좋아', 'I like you'));
  it('나는 너를 좋아해 = I like you', () => same('나는 너를 좋아해', 'I like you'));

  it('목걸이 문장은 그대로다', () => {
    const ko = parse('그럼에도 불구하고 나는 너를 사랑해', lex);
    expect(ko.mood).toBe('concessive');
    expect(brief('그럼에도 불구하고 나는 너를 사랑해')).toBe('주체:나 대상:너 행위:사랑');
    same('그럼에도 불구하고 나는 너를 사랑해', 'Regardless, I love you');
  });

  it('바뀌면 안 되는 것 — 심리 서술어가 아니면 이/가 는 주체다', () => {
    expect(brief('그녀가 나를 사랑해')).toBe('주체:사람 대상:나 행위:사랑');
    expect(brief('네가 나를 미워해')).toBe('주체:너 대상:나 행위:미움');   // -어하다 는 타동사
    expect(brief('그녀가 너를 그리워해')).toBe('주체:사람 대상:너 행위:그리움');
    expect(brief('그리움이 밀려온다')).toMatch(/^주체:그리움 /);
    expect(brief('엄마가 나를 안아')).toBe('주체:엄마 대상:나 행위:안다');
  });

  it('의문 표지가 -고 싶어 에 붙어도 태도와 성분이 모두 남는다', () => {
    const ir = parse('나를 보고 싶어?', lex);
    expect(ir.mood).toBe('interrogative');
    expect(brief('나를 보고 싶어?')).toBe('대상:나 행위:그리움');
    expect(parse('나를 보고 싶니', lex).mood).toBe('interrogative');
    expect(brief('나를 보고 싶니')).toBe('대상:나 행위:그리움');
    expect(parse('보고 싶지 않아', lex).mood).toBe('negative');
    expect(brief('보고 싶지 않아')).toBe('행위:그리움');
  });
});
