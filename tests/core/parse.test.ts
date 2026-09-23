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
