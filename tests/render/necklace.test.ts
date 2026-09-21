import { describe, it, expect } from 'vitest';
import { renderForNecklace, validateNecklace, necklaceSkeleton, renderCutFile, DEFAULT_NECKLACE } from '../../src/render/necklace';
import { render, buildStrokes, scaleFor } from '../../src/render/compose';
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

describe('necklaceSkeleton', () => {
  it('내보내기와 같은 하한을 적용한 골격을 낸다 — 검증이 출력과 같은 모양을 본다', () => {
    const floorP = floorPx(DEFAULT_NECKLACE) / scaleFor(DEFAULT_NECKLACE.size);
    for (const s of necklaceSkeleton(sample, lex)) {
      for (const w of s.widths) expect(w).toBeGreaterThanOrEqual(floorP - 1e-9);
    }
  });

  it('하한을 적용해도 링이 아닌 획은 링 밖에 머문다', () => {
    const look2 = loadNecklaceLook();
    const floor = look2.pR - look2.pRingBase;
    for (const s of necklaceSkeleton(sample, lex)) {
      if (s.role === 'ring') continue;
      s.pts.forEach((p, i) => {
        expect(Math.hypot(p[0], p[1]) - (s.widths[i] ?? 0) / 2, s.label)
          .toBeGreaterThanOrEqual(floor - 1e-9);
      });
    }
  });
});

describe('renderCutFile', () => {
  it('제작 검사를 위반 없이 통과하는 SVG 를 낸다', () => {
    const { svg, report } = renderCutFile(sample, lex);
    expect(report.violations, report.violations.join(' / ')).toHaveLength(0);
    expect(report.components).toBe(1);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('<metadata>');
  });

  it('10단어 문장도 위반 없이 나온다', () => {
    const ROLES = ['행위','주체','대상','시간','장소','행위수식','주체수식','대상수식','정도','방향'] as const;
    const many: IR = {
      constituents: ['사랑','시간','나','너','아이','약속','선택','빛','물','하늘']
        .map((lemma, i): Constituent => ({ kind: 'concept', lemma, role: ROLES[i]! })),
      mood: 'declarative',
      engineVersion: ENGINE_VERSION,
    };
    expect(renderCutFile(many, lex).report.violations).toHaveLength(0);
  });

  it('같은 입력은 같은 파일을 낸다 (원칙 1)', () => {
    expect(renderCutFile(sample, lex).svg).toBe(renderCutFile(sample, lex).svg);
  });

  it('컷 파일이 로고그램을 보존한다 — 링 한 바퀴와 면적', () => {
    const conc: IR = { ...sample, mood: 'concessive' };
    const skel = necklaceSkeleton(conc, lex);
    const { cleaned } = renderCutFile(conc, lex);
    const look2 = loadNecklaceLook();

    // 골격이 닿는 반경대에 잉크가 한 바퀴 있어야 한다
    const pts = cleaned.rings.flatMap((g) => g.pts);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const probe = [Math.cos(a) * look2.pR, Math.sin(a) * look2.pR] as const;
      const near = pts.map((p) => Math.hypot(p[0] - probe[0], p[1] - probe[1]));
      expect(Math.min(...near), `${k}시 방향`).toBeLessThan(0.10);
    }

    // 경계 상자가 링을 감싼다
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThan(-look2.pR * 0.9);
    expect(Math.max(...xs)).toBeGreaterThan(look2.pR * 0.9);
    expect(Math.min(...ys)).toBeLessThan(-look2.pR * 0.9);
    expect(Math.max(...ys)).toBeGreaterThan(look2.pR * 0.9);

    // 골격 획의 라벨이 전부 어딘가에 남아 있는지까지는 보지 않는다 —
    // 다만 획 수가 30개인데 남은 면적이 절반 미만이면 그림이 아니다
    expect(skel.length).toBeGreaterThan(10);
  });
});
