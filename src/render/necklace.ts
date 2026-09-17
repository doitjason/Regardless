import { render, scaleFor, buildStrokes, type RenderResult } from './compose';
import { checkManufacturable } from './manufacture';
import { loadNecklaceLook } from './look';
import type { IR } from '../core/ir';
import type { Lexicon } from '../core/lexicon';
import type { Stroke } from './stroke';

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
