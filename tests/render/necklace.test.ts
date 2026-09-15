import { describe, it, expect } from 'vitest';
import { renderForNecklace, validateNecklace, DEFAULT_NECKLACE } from '../../src/render/necklace';
import { render } from '../../src/render/compose';
import { loadLook } from '../../src/render/look';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { syllabify } from '../../src/core/phonology';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const look = loadLook();
const lex = loadSeedLexicon();
const sample: IR = {
  constituents: [
    { kind: 'concept', lemma: '사랑', role: '행위' },
    { kind: 'concept', lemma: '나', role: '주체' },
    { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') },
  ],
  mood: 'declarative',
  engineVersion: ENGINE_VERSION,
};

const floorPx = (o: typeof DEFAULT_NECKLACE) => (o.minStrokeMm / o.diameterMm) * o.size;

describe('renderForNecklace', () => {
  it('모든 획 폭이 하한 이상이다', () => {
    const r = renderForNecklace(sample, lex, look);
    const floor = floorPx(DEFAULT_NECKLACE);
    for (const s of r.strokes) expect(s.minWidth, s.label).toBeGreaterThanOrEqual(floor - 1e-6);
  });

  it('모든 패스가 닫혀 있다', () => {
    const { svg } = renderForNecklace(sample, lex, look);
    for (const d of svg.match(/ d="[^"]+"/g) ?? []) expect(d.endsWith('Z"')).toBe(true);
  });

  it('엔진 버전과 IR을 메타데이터로 담는다 — 수년 후 재현용', () => {
    const { svg } = renderForNecklace(sample, lex, look);
    expect(svg).toContain(`data-engine-version="${ENGINE_VERSION}"`);
    expect(svg).toContain('<metadata>');
  });

  it('화면용보다 큰 좌표계를 쓴다 — 정밀도 확보', () => {
    expect(renderForNecklace(sample, lex, look).svg).toContain('viewBox="0 0 600 600"');
  });

  it('결정적이다', () => {
    expect(renderForNecklace(sample, lex, look).svg)
      .toBe(renderForNecklace(sample, lex, look).svg);
  });

  it('최소 선폭을 바꾸면 결과가 달라진다', () => {
    const minOf = (r: ReturnType<typeof renderForNecklace>) =>
      Math.min(...r.strokes.map((s) => s.minWidth));
    expect(minOf(renderForNecklace(sample, lex, look, { minStrokeMm: 1.2 })))
      .toBeGreaterThan(minOf(renderForNecklace(sample, lex, look, { minStrokeMm: 0.2 })));
  });
});

describe('validateNecklace', () => {
  it('목걸이 모드 출력은 위반이 없다', () => {
    expect(validateNecklace(renderForNecklace(sample, lex, look), DEFAULT_NECKLACE)).toEqual([]);
  });

  it('화면용 출력은 위반을 보고한다', () => {
    const v = validateNecklace(render(sample, lex, look, { size: 600 }), DEFAULT_NECKLACE);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/폭/);
  });

  it('위반 메시지에 어느 획인지 담는다', () => {
    const v = validateNecklace(render(sample, lex, look, { size: 600 }), DEFAULT_NECKLACE);
    expect(v.some((x) => /사랑|나|루이즈|링/.test(x))).toBe(true);
  });
});
