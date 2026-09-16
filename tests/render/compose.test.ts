import { describe, it, expect } from 'vitest';
import { render, scaleFor } from '../../src/render/compose';
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

  it('성분 순서가 달라도 SVG 문자열 전체가 같다 — 메타데이터 포함 (원칙 1)', () => {
    const a = render(three, lex, look).svg;
    expect(render(ir([C('너','대상'), C('사랑','행위'), C('나','주체')]), lex, look).svg).toBe(a);
    expect(render(ir([C('나','주체'), C('너','대상'), C('사랑','행위')]), lex, look).svg).toBe(a);
  });

  it('성분 객체의 키 순서나 여분 필드가 SVG 에 새지 않는다 (원칙 1)', () => {
    const a = render(ir([{ kind: 'concept', lemma: '사랑', role: '행위' }]), lex, look).svg;
    const b = render(ir([{ role: '행위', lemma: '사랑', kind: 'concept', extra: 1 } as unknown as Constituent]), lex, look).svg;
    expect(b).toBe(a);
  });

  it('최소 선폭을 올려도 링이 아닌 획의 안쪽 가장자리가 링 안으로 들어오지 않는다', () => {
    const size = 300, scale = scaleFor(size);
    const floorPx = (look.pR - look.pRingBase) * scale;
    for (const minStrokeWidth of [0, 0.05, 0.1, 0.2, 0.3]) {
      const { strokes } = render(three, lex, look, { size, minStrokeWidth });
      for (const s of strokes) {
        if (s.role === 'ring') continue;
        // 윤곽선 좌표만 읽는다 — 윤곽선 점은 이미 굵기가 반영된 가장자리다
        const nums = s.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const r = Math.hypot(nums[i]! - size / 2, nums[i + 1]! - size / 2);
          expect(r, `${s.label} min=${minStrokeWidth}`).toBeGreaterThanOrEqual(floorPx - 0.5);
        }
      }
    }
  });
});
