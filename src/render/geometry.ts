export type Pt = readonly [number, number];

/** t(0..1)에서의 획 굵기를 반환하는 함수. */
export type WidthFn = (t: number) => number;

/** 좌표 문자열의 소수점 자리수. 결정성을 위해 고정한다. */
const PRECISION = 3;
const f = (n: number): string => n.toFixed(PRECISION);

function polyline(pts: Pt[]): string {
  return pts.map((p) => `${f(p[0])},${f(p[1])}`).join('L');
}

/** 3차 베지어를 균등 파라미터로 샘플링한다. */
export function sampleCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): Pt[] {
  if (steps < 1) throw new Error(`sampleCubic: steps must be >= 1, got ${steps}`);
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
  return out;
}

/**
 * 중심선을 따라 굵기가 변하는 획의 닫힌 윤곽선을 만든다.
 * SVG에는 굵기 변조 stroke가 없으므로 윤곽선을 채우는 방식을 쓴다.
 * 부수 효과로 목걸이 각인이 요구하는 닫힌 패스 조건을 처음부터 만족한다.
 */
export function taperOutline(pts: Pt[], widthAt: WidthFn): string {
  if (pts.length < 2) throw new Error(`taperOutline: needs >= 2 points, got ${pts.length}`);
  const left: Pt[] = [];
  const right: Pt[] = [];
  const last = pts.length - 1;
  for (let i = 0; i <= last; i++) {
    const t = i / last;
    const h = Math.max(0, widthAt(t)) / 2;
    const prev = pts[Math.max(i - 1, 0)]!;
    const next = pts[Math.min(i + 1, last)]!;
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const p = pts[i]!;
    left.push([p[0] - dy * h, p[1] + dx * h]);
    right.push([p[0] + dy * h, p[1] - dx * h]);
  }
  right.reverse();
  return `M${polyline(left)}L${polyline(right)}Z`;
}

/**
 * 굵기가 각도에 따라 변조되는 고리.
 * 바깥 윤곽은 정방향, 안쪽 윤곽은 역방향으로 감아 nonzero fill-rule에서 구멍이 생긴다.
 */
export function ringOutline(
  cx: number, cy: number, r: number, widthAt: WidthFn, steps = 360,
): string {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const h = Math.max(0, widthAt(t)) / 2;
    outer.push([cx + Math.cos(a) * (r + h), cy + Math.sin(a) * (r + h)]);
    inner.push([cx + Math.cos(a) * (r - h), cy + Math.sin(a) * (r - h)]);
  }
  inner.reverse();
  return `M${polyline(outer)}ZM${polyline(inner)}Z`;
}

/** 굵기 함수의 최솟값. 목걸이 모드 검증에 쓴다. */
export function minWidthOf(widthAt: WidthFn, samples = 128): number {
  let m = Infinity;
  for (let i = 0; i <= samples; i++) m = Math.min(m, widthAt(i / samples));
  return m;
}
