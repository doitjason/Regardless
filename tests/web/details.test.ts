import { describe, it, expect } from 'vitest';
import { parse } from '../../src/core/parse';
import { loadSeedLexicon, lookup } from '../../src/core/lexicon';
import { loadLook } from '../../src/render/look';
import { buildStrokes, render } from '../../src/render/compose';
import { arrival } from '../../src/render/arrival';
import { loadScreen } from '../../web/screen';
import { detailsOf } from '../../web/details';

const lex = loadSeedLexicon();
const look = loadLook();
const { timing } = loadScreen();
const detailsFor = (s: string) => {
  const ir = parse(s, lex);
  const arr = arrival(buildStrokes(ir, lex, look), look, timing);
  const result = render(ir, lex, look);
  return { d: detailsOf(ir, arr, result, lex, s), arr, ir };
};

describe('detailsOf', () => {
  it('양보문 — 낱말·역할·자리가 12시부터 시계 방향으로', () => {
    const { d, arr } = detailsFor('그럼에도 불구하고 나는 너를 사랑해');
    expect(d.moodName).toBe('양보문');
    expect(d.moodPart).toBeNull();
    expect(d.moodNote).toContain('나선');
    expect(d.rows.map((r) => [r.word, r.roleWord, r.hour])).toEqual([
      ['사랑', '하는 일', 12], ['나', '누가', 2], ['너', '누구를·무엇을', 8],
    ]);
    for (const r of d.rows) expect(r.strokes).toBeGreaterThan(0);
    expect(d.rows.map((r) => arr.parts[r.part])).toEqual(['행위|사랑', '주체|나', '대상|너']);
    expect(d.rows.map((r) => r.roleName)).toEqual(['서술', '주체', '대상']);
    expect(d.spelled).toBe(0);
  });

  it('영어 문장은 영어 뜻으로, 자리는 한국어와 같다', () => {
    const en = detailsFor('Regardless, I love you').d;
    const ko = detailsFor('그럼에도 불구하고 나는 너를 사랑해').d;
    expect(en.rows.map((r) => r.word).sort())
      .toEqual(['나', '너', '사랑'].map((l) => lookup(lex, l)!.gloss_en).sort());
    expect(en.rows.map((r) => r.hour)).toEqual(ko.rows.map((r) => r.hour));
  });

  it('의문문은 6시 표지 묶음을 가리킨다', () => {
    const { d, arr } = detailsFor('나를 사랑하니?');
    expect(d.moodName).toBe('의문문');
    expect(d.moodPart).toBe(arr.parts.indexOf('양상|interrogative'));
    expect(d.moodPart).toBeGreaterThan(0);
  });

  it('나열한 이름은 한글로, 소리로 적은 말 수를 센다', () => {
    const { d } = detailsFor('나는 한별이, 로건이, 로하니를 사랑해');
    expect(d.spelled).toBe(3);
    expect(d.rows.filter((r) => r.roleWord === '누구를·무엇을').map((r) => r.word).sort())
      .toEqual(['한별', '로건', '로하니'].sort());
  });
});
