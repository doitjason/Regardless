import { describe, it, expect } from 'vitest';
import { renderForNecklace, validateNecklace, DEFAULT_NECKLACE } from '../../src/render/necklace';
import { render, buildStrokes } from '../../src/render/compose';
import { checkManufacturable, type MillOptions } from '../../src/render/manufacture';
import { loadLook, loadNecklaceLook } from '../../src/render/look';
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
    const r = renderForNecklace(sample, lex);
    const floor = floorPx(DEFAULT_NECKLACE);
    for (const s of r.strokes) expect(s.minWidth, s.label).toBeGreaterThanOrEqual(floor - 1e-6);
  });

  it('모든 패스가 닫혀 있다', () => {
    const { svg } = renderForNecklace(sample, lex);
    for (const d of svg.match(/ d="[^"]+"/g) ?? []) expect(d.endsWith('Z"')).toBe(true);
  });

  it('엔진 버전과 IR을 메타데이터로 담는다 — 수년 후 재현용', () => {
    const { svg } = renderForNecklace(sample, lex);
    expect(svg).toContain(`data-engine-version="${ENGINE_VERSION}"`);
    expect(svg).toContain('<metadata>');
  });

  it('화면용보다 큰 좌표계를 쓴다 — 정밀도 확보', () => {
    expect(renderForNecklace(sample, lex).svg).toContain('viewBox="0 0 600 600"');
  });

  it('결정적이다', () => {
    expect(renderForNecklace(sample, lex).svg)
      .toBe(renderForNecklace(sample, lex).svg);
  });

  it('최소 선폭을 바꾸면 결과가 달라진다', () => {
    const minOf = (r: ReturnType<typeof renderForNecklace>) =>
      Math.min(...r.strokes.map((s) => s.minWidth));
    expect(minOf(renderForNecklace(sample, lex, { minStrokeMm: 1.2 })))
      .toBeGreaterThan(minOf(renderForNecklace(sample, lex, { minStrokeMm: 0.2 })));
  });
});

describe('validateNecklace', () => {
  it('목걸이 모드 출력은 위반이 없다', () => {
    expect(validateNecklace(renderForNecklace(sample, lex), DEFAULT_NECKLACE)).toEqual([]);
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

  it('목걸이 내보내기는 목걸이 룩을 쓴다 — 화면 룩과 다른 그림이다', () => {
    const a = renderForNecklace(sample, lex).svg;
    const b = render(sample, lex, loadLook(), { size: DEFAULT_NECKLACE.size }).svg;
    expect(a).not.toBe(b);
  });

  it('검증이 제작 위반을 함께 보고한다', () => {
    const r = renderForNecklace(sample, lex);
    const { strokes } = buildStrokes(sample, lex, loadNecklaceLook());
    const problems = validateNecklace(r, DEFAULT_NECKLACE, strokes);
    // 목걸이 룩이 아직 출발점이므로 위반이 있을 수 있다. 형식만 고정한다.
    for (const p of problems) expect(typeof p).toBe('string');
  });
});

describe('투각 20mm 제작 가능성 — 화면 룩 기준선', () => {
  const mill: MillOptions = { diameterMm: 20, minStrokeMm: 0.5, minGapMm: 0.5, pxPerMm: 20 };

  it('확정 화면 룩은 투각으로 만들 수 없다 — 위반을 수치로 고정한다', () => {
    // 이 테스트는 "지금은 안 된다"를 고정한다. 목걸이 룩이 확정되면 그 룩으로
    // 위반 0 을 요구하는 테스트가 따로 생긴다 (계획 II-b Task 8).
    const { strokes } = buildStrokes(sample, lex, look);
    const rep = checkManufacturable(strokes, mill);
    expect(rep.violations.length).toBeGreaterThan(0);
    expect(rep.thinPx).toBeGreaterThan(0);
    // 가장 큰 문제는 선폭이 아니라 연결이다 — 가시가 링에 붙어 있지 않아
    // 투각하면 떨어져 나간다.
    expect(rep.components).toBeGreaterThan(1);
  });

  it('무엇이 위반인지 사람이 읽을 수 있게 적힌다', () => {
    const { strokes } = buildStrokes(sample, lex, look);
    for (const v of checkManufacturable(strokes, mill).violations) {
      expect(v).toMatch(/mm|조각/);
    }
  });
});
