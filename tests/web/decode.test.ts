import { describe, it, expect } from 'vitest';
import { parse } from '../../src/core/parse';
import { loadSeedLexicon, lookup } from '../../src/core/lexicon';
import { loadLook } from '../../src/render/look';
import { buildStrokes } from '../../src/render/compose';
import { arrival } from '../../src/render/arrival';
import { loadScreen } from '../../web/screen';
import { decodeSteps } from '../../web/decode';

const lex = loadSeedLexicon();
const look = loadLook();
const { timing } = loadScreen();
const stepsOf = (s: string) => {
  const ir = parse(s, lex);
  const arr = arrival(buildStrokes(ir, lex, look), look, timing);
  return { steps: decodeSteps(ir, arr, lex, s), arr };
};

describe('decodeSteps', () => {
  it('먹이 닿은 차례대로, 링은 빼고', () => {
    const { steps, arr } = stepsOf('그럼에도 불구하고 나는 너를 사랑해');
    expect(steps.map((s) => s.part)).toEqual(arr.parts.map((_, i) => i).slice(1));
  });

  it('한국어 문장은 표제어로', () => {
    const { steps } = stepsOf('그럼에도 불구하고 나는 너를 사랑해');
    expect([...steps.map((s) => s.label)].sort()).toEqual(['나', '너', '사랑'].sort());
  });

  it('영어 문장은 영어 뜻으로', () => {
    const { steps } = stepsOf('Regardless, I love you');
    const want = ['나', '너', '사랑'].map((l) => lookup(lex, l)!.gloss_en);
    expect([...steps.map((s) => s.label)].sort()).toEqual([...want].sort());
  });

  it('같은 뜻이면 같은 차례 — 언어가 달라도', () => {
    const ko = stepsOf('그럼에도 불구하고 나는 너를 사랑해').steps.map((s) => s.part);
    const en = stepsOf('Regardless, I love you').steps.map((s) => s.part);
    expect(en).toEqual(ko);
  });

  it('소리로 적은 말은 한글로, 문장 종류 표지는 이름으로', () => {
    expect(stepsOf('루이즈를 기다려').steps.map((s) => s.label)).toContain('루이즈');
    expect(stepsOf('나를 사랑하니?').steps.map((s) => s.label)).toContain('물음');
    expect(stepsOf('do you love me?').steps.map((s) => s.label)).toContain('question');
  });
});
