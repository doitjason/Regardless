import { seedOf, subSeed, constituentKey, sortedConstituents, type Constituent, type IR, type Role } from '../core/ir';
import { mulberry32 } from '../core/hash';
import { lookup, type Lexicon } from '../core/lexicon';
import { ENGINE_VERSION } from '../version';
import type { LookParams } from './look';
import { conceptParams } from './mapping';
import { outlineOf, type Pt } from './geometry';
import { ringStrokes, bloomStrokes } from './vocab';
import { nameStrokes } from './name';
import { layout } from './layout';
import { ringFloor, pushOutside, type Stroke } from './stroke';

/**
 * 획 어휘가 쓰는 p 공간에서 화면 반쪽 끝에 닿는 반경. 링(pR)뿐 아니라
 * 가장 바깥의 가시·수염까지 이 안에 들어와야 잘리지 않는다.
 */
export const P_SPAN = 0.9; // 룩 JSON 후보 (목걸이 룩에서 달라질 값)

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

// 룩 JSON 후보 (목걸이 룩에서 달라질 값). `look-v3.json` 의 `pInk` 는 화면
// 셰이더가 쓰는 잉크 밀도값이고, 이 SVG 채우기 색과는 무관한 별개 출처다.
const INK = '#16120e';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function labelOf(c: Constituent): string {
  if (c.kind === 'concept') return c.lemma;
  return c.syllables.map((s) => `${s.onset}${s.nucleus}${s.coda}`).join('');
}

export interface SkeletonResult {
  /** p 공간 획들. 화면 렌더러(계획 IV)와 목걸이 검증이 같은 골격을 쓴다. */
  strokes: Stroke[];
  seed: number;
  /** 성분 수 — 복잡도 예산의 분모 */
  total: number;
}

/**
 * IR → 골격(`Stroke[]`). `render` 가 SVG 로 굳히기 전까지 하는 조립 — `layout`,
 * 링 획, 성분별(서브시드가 붙은) 블룸·이름 획, 사전 미등재 에러 — 전부를 한다.
 *
 * **좌표는 p 공간이다 — 화면 좌표가 아니다.** 스케일링·y 뒤집기·
 * `minStrokeWidth` 재클램프는 여기 없다. `render` 가 이 결과를 받아 그
 * 화면 변환을 적용한다. 화면 렌더러(계획 IV)의 삼각형 셰이더와 목걸이의
 * 틈·연결성 검증이 SVG 를 역파싱하지 않고 같은 골격을 직접 쓰게 하려고
 * 뽑아냈다.
 *
 * 성분은 canonical 순서로 순회하고 성분마다 독립된 서브시드를 쓰기 때문에,
 * 파서가 성분을 어떤 순서로 뱉어도 결과가 같다 (원칙 1).
 *
 * 조형 수치는 전부 `look` 에서 온다. 이 파일에 수치를 박지 않는다.
 */
export function buildStrokes(ir: IR, lex: Lexicon, look: LookParams): SkeletonResult {
  const seed = seedOf(ir);
  const { placements, total } = layout(ir, look);

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
        { angle: pl.angle, depth: pl.depth, label, role: pl.item.role }, rnd));
    } else {
      const entry = lookup(lex, pl.item.lemma);
      if (!entry) throw new Error(`render: 사전에 없는 표제어 "${pl.item.lemma}"`);
      const sp = conceptParams(entry.features);
      all.push(...bloomStrokes(look, sp,
        { angle: pl.angle, depth: pl.depth, n: total, label, role: pl.item.role }, rnd));
    }
  }

  return { strokes: all, seed, total };
}

/**
 * IR → SVG. 순수 함수이며 브라우저 API 에 의존하지 않는다.
 *
 * 골격 조립은 `buildStrokes` 가 한다 — 여기서는 그 결과를 받아 폭 넓히기·
 * 재클램프, 좌표 변환, 윤곽선, 메타데이터, SVG 문자열만 만든다.
 */
export function render(
  ir: IR, lex: Lexicon, look: LookParams, opts: RenderOptions = {},
): RenderResult {
  const size = opts.size ?? 300;
  const minW = opts.minStrokeWidth ?? 0;
  const { strokes: all, seed } = buildStrokes(ir, lex, look);

  const scale = scaleFor(size);
  const cx = size / 2, cy = size / 2;
  // 링 밖 여유 (p 공간). 링이 아닌 획의 안쪽 가장자리는 이 반경 밖에 있어야 한다.
  const floor = ringFloor(look);

  // ── SVG ──
  const body: string[] = [];
  const strokes: StrokeMeta[] = [];
  for (const s of all) {
    if (s.pts.length < 2) continue;
    const widths = minW > 0 ? s.widths.map((w) => Math.max(w, minW)) : s.widths;
    // 생성기는 원래 폭 기준으로 각 점을 이미 링 밖(`floor + 원폭/2`)으로 밀어
    // 두었다(`pushOutside`, vocab.ts/name.ts). 여기서 폭만 넓히면 넓어진
    // 폭의 안쪽 가장자리(중심 - 새폭/2)가 링 안으로 들어올 수 있으므로, 넓어진
    // 폭으로 다시 링 밖으로 민다. 링 자신은 경계를 정의하는 도형이므로 위치는
    // 그대로 두고 굵기만 키운다 — 목걸이 모드에서 링이 두꺼워지는 것은
    // 설계 문서가 예상한 결과다.
    const ptsP = minW > 0 && s.role !== 'ring'
      ? pushOutside(s.pts, widths, floor)
      : s.pts;
    // p 공간에서 화면 좌표로. y 는 위쪽이 + 이므로 뒤집는다.
    const pts: Pt[] = ptsP.map((p) => [cx + p[0] * scale, cy - p[1] * scale]);
    const d = outlineOf(pts, widths.map((w) => w * scale));
    body.push(`<path d="${d}" fill="${INK}" fill-rule="nonzero"/>`);
    strokes.push({ d, role: s.role, label: s.label, minWidth: Math.min(...widths) * scale });
  }

  // 메타데이터도 SVG 의 일부이므로 어순이 새면 원칙 1(같은 뜻 → 같은 SVG)이
  // 깨진다. 정렬된 성분을 담아 입력 어순 정보를 지운다.
  // 호출자가 만든 성분 객체를 그대로 직렬화하면 키 순서·여분 필드가 새어
  // 같은 뜻이 다른 바이트가 된다. 알려진 필드만 고정된 순서로 다시 담는다.
  const canonicalConstituents: Constituent[] = sortedConstituents(ir).map((c) =>
    c.kind === 'concept'
      ? { kind: 'concept', role: c.role, lemma: c.lemma }
      : { kind: 'phonetic', role: c.role, syllables: c.syllables.map(({ onset, nucleus, coda }) => ({ onset, nucleus, coda })) },
  );
  const canonicalIr: IR = { constituents: canonicalConstituents, mood: ir.mood, engineVersion: ir.engineVersion };
  const meta = escapeXml(JSON.stringify({ ir: canonicalIr, seed, engineVersion: ENGINE_VERSION }));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" data-engine-version="${ENGINE_VERSION}">` +
    `<metadata>${meta}</metadata>` + body.join('') + `</svg>`;

  return { svg, strokes, seed, engineVersion: ENGINE_VERSION };
}
