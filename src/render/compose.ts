import { seedOf, subSeed, constituentKey, type Constituent, type IR, type Role } from '../core/ir';
import { mulberry32 } from '../core/hash';
import { lookup, type Lexicon } from '../core/lexicon';
import { ENGINE_VERSION } from '../version';
import type { LookParams } from './look';
import { conceptParams } from './mapping';
import { outlineOf, type Pt } from './geometry';
import { ringStrokes, bloomStrokes } from './vocab';
import { nameStrokes } from './name';
import { layout } from './layout';
import type { Stroke } from './stroke';

/**
 * 획 어휘가 쓰는 p 공간에서 로고그램이 차지하는 반지름 여유.
 * 반경 0.45 의 링이 화면 반쪽의 0.5 를 차지하도록 잡은 값이다.
 */
export const P_SPAN = 0.9;

/** p 공간 → 화면 좌표 배율. `necklace.ts` 가 단위를 환산할 때도 쓴다. */
export function scaleFor(size: number): number {
  return (size * 0.5) / P_SPAN;
}

export interface RenderOptions {
  /** viewBox 한 변. 기본 300 */
  size?: number;
  /**
   * 모든 획 폭의 하한. **p 공간 단위다** (화면 픽셀이 아니다).
   * 기본 0 (제한 없음). 목걸이 모드에서 쓴다 — `necklace.ts` 가
   * mm 하한을 `scaleFor` 로 환산해 넘긴다.
   */
  minStrokeWidth?: number;
}

export interface StrokeMeta {
  d: string;
  role: Role | 'ring';
  /** 사람이 읽을 라벨. 분해 보기 UI 가 쓴다 */
  label: string;
  minWidth: number;
}

export interface RenderResult {
  svg: string;
  strokes: StrokeMeta[];
  seed: number;
  engineVersion: string;
}

const INK = '#16120e';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function labelOf(c: Constituent): string {
  if (c.kind === 'concept') return c.lemma;
  return c.syllables.map((s) => `${s.onset}${s.nucleus}${s.coda}`).join('');
}

/**
 * IR → SVG. 순수 함수이며 브라우저 API 에 의존하지 않는다.
 *
 * 성분은 canonical 순서로 순회하고 성분마다 독립된 서브시드를 쓰기 때문에,
 * 파서가 성분을 어떤 순서로 뱉어도 결과가 같다 (원칙 1).
 *
 * 조형 수치는 전부 `look` 에서 온다. 이 파일에 수치를 박지 않는다.
 */
export function render(
  ir: IR, lex: Lexicon, look: LookParams, opts: RenderOptions = {},
): RenderResult {
  const size = opts.size ?? 300;
  const floor = opts.minStrokeWidth ?? 0;
  const seed = seedOf(ir);
  const { placements, total } = layout(ir, look);

  const scale = scaleFor(size);
  const cx = size / 2, cy = size / 2;

  const all: Stroke[] = [];

  // ── 링 ──
  all.push(...ringStrokes(look, mulberry32(subSeed(seed, 'ring'))));

  // ── 성분 ──
  for (const pl of placements) {
    const key = constituentKey(pl.item);
    const rnd = mulberry32(subSeed(seed, key));
    const label = labelOf(pl.item);
    if (pl.item.kind === 'phonetic') {
      all.push(...nameStrokes(look, pl.item.syllables,
        { angle: pl.angle, depth: pl.depth, n: total, label, role: pl.item.role }, rnd));
    } else {
      const entry = lookup(lex, pl.item.lemma);
      if (!entry) throw new Error(`render: 사전에 없는 표제어 "${pl.item.lemma}"`);
      const sp = conceptParams(entry.features);
      all.push(...bloomStrokes(look, sp,
        { angle: pl.angle, depth: pl.depth, n: total, label, role: pl.item.role }, rnd));
    }
  }

  // ── SVG ──
  const body: string[] = [];
  const strokes: StrokeMeta[] = [];
  for (const s of all) {
    if (s.pts.length < 2) continue;
    const widths = floor > 0 ? s.widths.map((w) => Math.max(w, floor)) : s.widths;
    // p 공간에서 화면 좌표로. y 는 위쪽이 + 이므로 뒤집는다.
    const pts: Pt[] = s.pts.map((p) => [cx + p[0] * scale, cy - p[1] * scale]);
    const d = outlineOf(pts, widths.map((w) => w * scale));
    body.push(`<path d="${d}" fill="${INK}" fill-rule="nonzero"/>`);
    strokes.push({ d, role: s.role, label: s.label, minWidth: Math.min(...widths) * scale });
  }

  const meta = escapeXml(JSON.stringify({ ir, seed, engineVersion: ENGINE_VERSION }));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" data-engine-version="${ENGINE_VERSION}">` +
    `<metadata>${meta}</metadata>` + body.join('') + `</svg>`;

  return { svg, strokes, seed, engineVersion: ENGINE_VERSION };
}
