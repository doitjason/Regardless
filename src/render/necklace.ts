import { render, scaleFor, buildStrokes, type RenderResult } from './compose';
import { checkManufacturable, cleanForManufacture, checkManufacturableShape, type CleanedShape, type MillReport, type MillOptions } from './manufacture';
import { loadNecklaceLook } from './look';
import { seedOf, sortedConstituents, type IR, type Constituent } from '../core/ir';
import type { Lexicon } from '../core/lexicon';
import type { Stroke } from './stroke';
import type { Pt } from './geometry';
import { ENGINE_VERSION } from '../version';

export interface NecklaceOptions {
  /** 펜던트 지름 (mm) */
  diameterMm: number;
  /** 물리적으로 재현 가능한 최소 선폭 (mm). 제작소 공정에 맞춰 조정한다 */
  minStrokeMm: number;
  /** 최소 틈 (mm). 투각은 틈이 좁으면 메워진다 */
  minGapMm: number;
  /** SVG 좌표계 한 변. 화면용보다 크게 잡아 정밀도를 확보한다 */
  size: number;
}

/**
 * 기본 프리셋. 지름 20mm 펜던트, 최소 선폭 0.5mm, 최소 틈 0.5mm.
 * 최소 선폭과 틈은 실제 제작소 공정을 확인해 확정한다.
 */
export const DEFAULT_NECKLACE: NecklaceOptions = {
  diameterMm: 20,
  minStrokeMm: 0.5,
  minGapMm: 0.5,
  size: 600,
};

const floorPxOf = (o: NecklaceOptions): number => (o.minStrokeMm / o.diameterMm) * o.size;

/**
 * 목걸이 각인용 렌더 (설계 문서 12.2).
 *
 * 각인·레이저컷은 너무 얇은 획을 재현하지 못한다. 화면에서 사라지는 붓끝이
 * 실물에서는 소실되거나 반대로 뭉친다. 그래서 굵기 하한을 걸어 다시 그린다.
 *
 * 화면 렌더러는 침식을 거치므로 링이 얇고 끊겨 보이지만, 각인용은 침식을
 * 거치지 않아 골격 그대로의 두꺼운 링이 나온다. 이 차이는 의도된 것이다.
 */
export function renderForNecklace(
  ir: IR, lex: Lexicon, opts: Partial<NecklaceOptions> = {},
): RenderResult {
  const merged: NecklaceOptions = { ...DEFAULT_NECKLACE, ...opts };
  const look = loadNecklaceLook();
  return render(ir, lex, look, {
    size: merged.size,
    // 하한은 mm → 화면 px → p 공간 순으로 환산한다.
    // `RenderOptions.minStrokeWidth` 는 p 공간 단위다.
    minStrokeWidth: floorPxOf(merged) / scaleFor(merged.size),
  });
}

/**
 * 목걸이 경로가 실제로 잘라 낼 골격 (p 공간).
 *
 * `renderForNecklace` 와 **같은 룩·같은 하한**을 지나므로, 이것을 검증에
 * 넘기면 검증이 출력과 같은 모양을 본다. 넓히기 전 골격을 검증하면 얇은
 * 곳은 과하게 잡고 좁은 틈은 놓친다 — 후자는 만들 수 없는 것을 통과시키는
 * 방향이라 특히 위험하다.
 */
export function necklaceSkeleton(
  ir: IR, lex: Lexicon, opts: Partial<NecklaceOptions> = {},
): Stroke[] {
  const merged: NecklaceOptions = { ...DEFAULT_NECKLACE, ...opts };
  return buildStrokes(ir, lex, loadNecklaceLook(), {
    minStrokeWidth: floorPxOf(merged) / scaleFor(merged.size),
  }).strokes;
}

/** 각인 가능성 검증. 위반 목록을 반환하며, 빈 배열이면 통과. */
export function validateNecklace(
  result: RenderResult,
  opts: NecklaceOptions,
  /** p 공간 골격. 주면 틈·연결·구멍까지 본다 (설계 문서 12.3) */
  strokes?: readonly Stroke[],
): string[] {
  const floor = floorPxOf(opts);
  const problems: string[] = [];
  for (const s of result.strokes) {
    if (s.minWidth < floor - 1e-6) {
      problems.push(
        `획 "${s.label}" (${String(s.role)}) 의 최소 폭 ${s.minWidth.toFixed(3)}px 가 ` +
        `하한 ${floor.toFixed(3)}px 미만이다`);
    }
    if (!s.d.trimEnd().endsWith('Z')) {
      problems.push(`획 "${s.label}" (${String(s.role)}) 의 패스가 닫혀 있지 않다`);
    }
  }

  if (strokes) {
    const rep = checkManufacturable(strokes, {
      diameterMm: opts.diameterMm,
      minStrokeMm: opts.minStrokeMm,
      minGapMm: opts.minGapMm,
      pxPerMm: 20,
    });
    problems.push(...rep.violations);
  }
  return problems;
}

// `compose.ts`의 render()가 쓰는 것과 같은 잉크색. 그 파일의 상수는 모듈
// 내부용이라 노출되지 않으므로 여기서 다시 적는다.
const INK = '#16120e';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 각인·절단용 SVG. `renderForNecklace` 와 달리 획을 그대로 내보내지 않고,
 * 제작 가능하도록 정리한 모양의 윤곽선을 내보낸다 — 내보낸 파일이 곧
 * 잘릴 모양이다 (설계 문서 12.3).
 */
export function renderCutFile(
  ir: IR, lex: Lexicon, opts: Partial<NecklaceOptions> = {},
): { svg: string; cleaned: CleanedShape; report: MillReport } {
  const merged: NecklaceOptions = { ...DEFAULT_NECKLACE, ...opts };
  const millOpts: MillOptions = {
    diameterMm: merged.diameterMm,
    minStrokeMm: merged.minStrokeMm,
    minGapMm: merged.minGapMm,
    pxPerMm: 20,
  };

  // `renderForNecklace` 와 같은 룩·같은 하한을 지난 골격 — 이미 최소
  // 선폭을 적용했으므로, 정리 단계는 틈·연결·구멍만 손보면 된다.
  const skeleton = necklaceSkeleton(ir, lex, merged);
  const cleaned = cleanForManufacture(skeleton, millOpts);

  // 정리한 다각형을 다시 래스터화해 검사한다 — 골격이 아니라 실제로
  // 내보낼 모양을 봐야 "내보낸 파일이 곧 잘릴 모양"이라는 전제가 선다.
  // 위반이 남아 있으면 절대 내보내지 않는다: 자기 검사를 통과하지 못하는
  // 컷 파일은 없는 것만 못하다.
  const report = checkManufacturableShape(cleaned, millOpts);
  if (report.violations.length > 0) {
    throw new Error(
      `renderCutFile: 정리 후에도 제작 위반이 남았다 — ${report.violations.join(' / ')}`,
    );
  }

  const size = merged.size;
  const scale = scaleFor(size);
  const cx = size / 2, cy = size / 2;
  const toScreen = (p: Pt): Pt => [cx + p[0] * scale, cy - p[1] * scale];

  // 고리마다 M...Z 서브패스 하나. 바깥 윤곽과 구멍 둘 다 담고, evenodd 로
  // 채우므로 감음 방향이 아니라 중첩 횟수만으로 구멍이 생긴다.
  const body = cleaned.rings
    .map((r) => `M${r.pts.map(toScreen).map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join('L')}Z`)
    .join('');

  // `compose.ts`의 render()가 쓰는 것과 같은 메타데이터 — 정규화한 IR·시드·
  // 엔진 버전을 담아 수년 후에도 같은 컷 파일을 재현할 수 있게 한다.
  // render()는 이 구성을 별도 헬퍼로 내보내지 않으므로(모듈 내부 전용),
  // 여기서 최소한으로 다시 만든다.
  const canonicalConstituents: Constituent[] = sortedConstituents(ir).map((c) =>
    c.kind === 'concept'
      ? { kind: 'concept', role: c.role, lemma: c.lemma }
      : { kind: 'phonetic', role: c.role, syllables: c.syllables.map(({ onset, nucleus, coda }) => ({ onset, nucleus, coda })) },
  );
  const canonicalIr: IR = { constituents: canonicalConstituents, mood: ir.mood, engineVersion: ir.engineVersion };
  const seed = seedOf(ir);
  const meta = escapeXml(JSON.stringify({ ir: canonicalIr, seed, engineVersion: ENGINE_VERSION }));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" data-engine-version="${ENGINE_VERSION}">` +
    `<metadata>${meta}</metadata>` +
    `<path d="${body}" fill="${INK}" fill-rule="evenodd"/></svg>`;

  return { svg, cleaned, report };
}
