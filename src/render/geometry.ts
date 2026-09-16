export type Pt = readonly [number, number];

/** t(0..1)에서의 획 굵기를 반환하는 함수. */
export type WidthFn = (t: number) => number;

/** 좌표 문자열의 소수점 자리수. 결정성을 위해 고정한다. */
const PRECISION = 3;
/**
 * n.toFixed(PRECISION)은 아주 작은 음수(예: -0.0001)를 "-0.000"으로 직렬화하는 반면
 * 아주 작은 양수는 "0.000"이 된다. Math.cos/Math.sin은 "깨끗한" 각도에서도 정확히
 * 0이 아니라 ~1e-17 수준의 부호 있는 잡음을 내므로, 수학적으로 동일해야 할 좌표가
 * 부동소수점 잡음의 부호에 따라 다른 문자열로 직렬화될 수 있다. 이는 원칙 1(같은
 * 입력은 항상 바이트 단위로 동일한 패스 문자열을 낳는다)을 깬다. 출력 정밀도에서
 * 0으로 반올림되는 값은 부호를 버려 이를 막는다. -0 자체는 toFixed가 이미
 * "0.000"으로 처리하므로 별도 분기가 필요 없다.
 */
const f = (n: number): string => {
  const s = n.toFixed(PRECISION);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
};

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
 *
 * 알려진 한계: 조인(join) 전략이 없다. 중심선이 굵기에 비해 급격히 꺾이거나
 * 되돌아오면 오프셋된 윤곽선이 스스로 교차할 수 있다. 이를 고치지 않고 두는
 * 이유는, 각 획이 개별 채움 패스로 출력되고 fill-rule이 nonzero이기 때문이다.
 * 자기교차는 구멍을 뚫는 게 아니라 겹친 루프들의 합집합을 채우는 결과로
 * 이어지고, 화면 렌더러는 겹치는 삼각형을 래스터화해 그 합집합을 자연스럽게
 * 만들어낸다. 조인과 불리언 합집합을 갖춘 제대로 된 오프셋 구현은 범위 밖이다.
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
  // 안쪽 반지름 r - h가 중심(0)에 닿거나 넘어가면, 그 점은 중심을 지나 반대편
  // 각도로 반사된다. t가 그 경계를 지나면서 안쪽 서브패스가 중심을 가로질러
  // 자기교차하는 패스가 된다. 이를 막기 위해 h를 안쪽에서만 clamp해 안쪽
  // 반지름이 항상 0보다 확실히 큰 값(작은 여유 margin)으로 남게 한다. 굵기가
  // 지름을 넘어서는 입력은 뚫린 고리가 아니라 거의 속이 찬 원반 형태로
  // 수렴해야 하며, 자기교차하는 뒤집힌 패스가 되어서는 안 된다.
  const innerMargin = Math.max(r * 1e-3, 1e-3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const hOuter = Math.max(0, widthAt(t)) / 2;
    const hInner = Math.max(0, Math.min(hOuter, r - innerMargin));
    outer.push([cx + Math.cos(a) * (r + hOuter), cy + Math.sin(a) * (r + hOuter)]);
    inner.push([cx + Math.cos(a) * (r - hInner), cy + Math.sin(a) * (r - hInner)]);
  }
  inner.reverse();
  return `M${polyline(outer)}ZM${polyline(inner)}Z`;
}

/**
 * 굵기 함수의 최솟값. 목걸이 모드 검증에 쓴다.
 *
 * 균등 표본으로 최솟값을 찾으므로, 표본 간격보다 좁은 골(dip)은 어떤 표본점도
 * 건드리지 못해 보이지 않을 수 있다 — 그 경우 반환값은 실제 최솟값의
 * 과대평가가 된다. 이 함수가 목걸이 레이저 각인의 최소 안전 선폭을 검증하는
 * 용도이므로 과대평가는 위험한 방향이다(실제로는 각인기가 자를 수 없는
 * 머리카락 굵기 골을 안전하다고 승인해버릴 수 있다).
 *
 * 기본 표본 수 1024는 이 프로젝트가 생성하는 굵기 함수가 의도적으로
 * 저주파(획 하나에 걸쳐 사인파 몇 개, 대략 열 번 안팎의 주기)라는 전제에
 * 기댄다. 주기당 대략 100개의 표본이면 충분하다. 이 함수는 적대적이거나
 * 고주파인 굵기 함수에 대해서는 안전하지 않으며, 그런 용도로 설계되지도
 * 않았다.
 */
export function minWidthOf(widthAt: WidthFn, samples = 1024): number {
  let m = Infinity;
  for (let i = 0; i <= samples; i++) m = Math.min(m, widthAt(i / samples));
  return m;
}

/**
 * 굵기가 배열로 주어진 획의 닫힌 윤곽선.
 *
 * `taperOutline` 은 굵기를 함수로 받지만, 획 어휘는 점마다의 굵기를 배열로
 * 낳는다. 함수로 감싸 보간하면 표본 위치가 어긋나므로 배열을 직접 쓴다.
 */
export function outlineOf(pts: Pt[], widths: number[]): string {
  if (pts.length < 2) throw new Error(`outlineOf: needs >= 2 points, got ${pts.length}`);
  if (widths.length !== pts.length) {
    throw new Error(`outlineOf: widths(${widths.length}) != pts(${pts.length})`);
  }
  const last = pts.length - 1;
  return taperOutline(pts, (t) => widths[Math.round(t * last)] ?? 0);
}
