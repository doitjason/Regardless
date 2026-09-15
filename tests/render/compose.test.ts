import { describe, it, expect } from 'vitest';
import { render } from '../../src/render/compose';
import { outlineOf } from '../../src/render/geometry';
import { loadLook } from '../../src/render/look';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { syllabify } from '../../src/core/phonology';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const look = loadLook();
const lex = loadSeedLexicon();
const ir = (cs: Constituent[], mood: IR['mood'] = 'declarative'): IR =>
  ({ constituents: cs, mood, engineVersion: ENGINE_VERSION });
const C = (lemma: string, role: Constituent['role']): Constituent =>
  ({ kind: 'concept', lemma, role });
const three = ir([C('사랑','행위'), C('나','주체'), C('너','대상')]);

describe('outlineOf', () => {
  it('닫힌 패스를 낸다', () => {
    const d = outlineOf([[0,0],[1,0],[2,0]], [0.2, 0.2, 0.2]);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('길이가 안 맞으면 던진다', () => {
    expect(() => outlineOf([[0,0],[1,0]], [0.2])).toThrow();
  });
});

describe('render', () => {
  it('유효한 SVG 문서를 낸다', () => {
    const { svg } = render(three, lex, look);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 300 300"');
  });

  it('입력·IR·엔진 버전을 메타데이터로 담는다', () => {
    const { svg } = render(three, lex, look);
    expect(svg).toContain(`data-engine-version="${ENGINE_VERSION}"`);
    expect(svg).toContain('<metadata>');
    expect(svg).toContain('사랑');
  });

  it('12분할 격자를 그리지 않는다', () => {
    expect(render(three, lex, look).svg).not.toContain('<line');
  });

  it('링과 각 성분의 획 메타데이터를 낸다', () => {
    const { strokes } = render(three, lex, look);
    expect(strokes.some((s) => s.role === 'ring')).toBe(true);
    for (const label of ['사랑','나','너']) {
      expect(strokes.some((s) => s.label === label), label).toBe(true);
    }
  });

  it('획 메타데이터의 역할이 실제 성분 역할과 일치한다', () => {
    const { strokes } = render(three, lex, look);
    expect(strokes.find((s) => s.label === '나')!.role).toBe('주체');
    expect(strokes.find((s) => s.label === '너')!.role).toBe('대상');
    expect(strokes.find((s) => s.label === '사랑')!.role).toBe('행위');
  });

  it('모든 획이 라벨을 갖는다 — 소유자 없는 획이 없다', () => {
    for (const s of render(three, lex, look).strokes) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it('음소 성분을 그린다', () => {
    const withName = ir([
      C('사랑','행위'), C('나','주체'),
      { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') },
    ]);
    const { strokes } = render(withName, lex, look);
    expect(strokes.some((s) => s.role === '대상')).toBe(true);
  });

  it('사전에 없는 표제어는 던진다', () => {
    expect(() => render(ir([C('없는말','행위')]), lex, look)).toThrow(/없는말/);
  });

  it('성분이 없으면 던진다', () => {
    expect(() => render(ir([]), lex, look)).toThrow();
  });

  it('size 옵션이 viewBox 에 반영된다', () => {
    expect(render(three, lex, look, { size: 512 }).svg).toContain('viewBox="0 0 512 512"');
  });

  it('seed 와 engineVersion 을 반환한다', () => {
    const r = render(three, lex, look);
    expect(typeof r.seed).toBe('number');
    expect(r.engineVersion).toBe(ENGINE_VERSION);
  });

  it('모든 패스가 닫혀 있다', () => {
    const { svg } = render(three, lex, look);
    for (const d of svg.match(/ d="[^"]+"/g) ?? []) expect(d.endsWith('Z"')).toBe(true);
  });
});
