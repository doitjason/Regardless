import { P_SPAN } from './compose';
import { outlineOf, type Pt } from './geometry';
import type { Stroke } from './stroke';

/**
 * 제작 가능성 검증 (설계 문서 12.3).
 *
 * 획 하나하나의 폭만 봐서는 투각 펜던트의 실패를 알 수 없다. 좁은 틈은
 * 메워지고, 떨어진 조각은 떨어져 나가고, 작은 구멍은 뚫리지 않는다. 이들은
 * **그림 전체의 성질**이므로 실척 격자에 채워 놓고 판정한다.
 *
 * 화소 단위는 mm 다 — `pxPerMm` 로 해상도를 정한다. 20mm 펜던트를 20px/mm 로
 * 보면 400×400 격자이고, 0.5mm 하한은 10화소다.
 */
export interface MillOptions {
  /** 펜던트 바깥 지름 (mm). p 공간 반경 P_SPAN 이 이 지름의 절반에 대응한다 */
  diameterMm: number;
  /** 최소 선폭 (mm) */
  minStrokeMm: number;
  /** 최소 틈 (mm) */
  minGapMm: number;
  /** 격자 해상도 (화소/mm) */
  pxPerMm: number;
}

export interface MillReport {
  /** 사람이 읽는 위반 목록. 비어 있으면 제작 가능 */
  violations: string[];
  /** 잉크 덩어리 수. 1이어야 한다 */
  components: number;
  /** 최소 선폭보다 가는 부분의 화소 수 */
  thinPx: number;
  /** 최소 틈보다 좁은 틈의 화소 수 */
  narrowGapPx: number;
  /** 최소 틈보다 작은 구멍들의 지름 (mm) */
  smallHoles: number[];
}

/** 제작용으로 정리한 모양. 폴리곤은 화소 좌표가 아니라 p 공간이다. */
export interface CleanedShape {
  /** 바깥 윤곽들과 구멍들. 각 고리는 닫힌 폴리곤 (첫 점 == 끝 점 아님) */
  rings: { pts: Pt[]; hole: boolean }[];
}

const idx = (n: number, x: number, y: number) => y * n + x;

/** p 공간 → 화소. 반경 P_SPAN 이 지름의 절반에 닿는다. */
function toPx(n: number, diameterMm: number, pxPerMm: number, p: readonly [number, number]) {
  const scale = (diameterMm * pxPerMm * 0.5) / P_SPAN;
  return { x: n / 2 + p[0] * scale, y: n / 2 - p[1] * scale };
}

/**
 * `outlineOf` 가 만든 `M x,y L x,y … Z` 경로 문자열에서 꼭짓점을 뽑아낸다.
 * `taperOutline` 은 항상 좌표쌍을 `L` 로 이어붙이고 앞에 `M`, 뒤에 `Z` 를
 * 붙일 뿐이므로(`geometry.ts`), `M`/`L` 로 나누기만 하면 순서 그대로 나온다.
 */
function parseOutlinePoints(d: string): Pt[] {
  const body = d.endsWith('Z') ? d.slice(0, -1) : d;
  return body
    .split(/[ML]/)
    .filter((s) => s.length > 0)
    .map((pair) => {
      const comma = pair.indexOf(',');
      return [Number(pair.slice(0, comma)), Number(pair.slice(comma + 1))] as Pt;
    });
}

/** 스캔라인 y 에서 닫힌 다각형과 만나는 x 와, 그 변이 위로 가는지 아래로 가는지. */
function crossingsAt(poly: readonly Pt[], ys: number): { x: number; dir: number }[] {
  const hits: { x: number; dir: number }[] = [];
  const m = poly.length;
  for (let i = 0; i < m; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % m]!;
    const ay = a[1], by = b[1];
    if (ay === by) continue; // 수평 변은 스캔라인 교차에 기여하지 않는다
    if ((ay <= ys && by > ys) || (by <= ys && ay > ys)) {
      const t = (ys - ay) / (by - ay);
      hits.push({ x: a[0] + t * (b[0] - a[0]), dir: by > ay ? 1 : -1 });
    }
  }
  return hits;
}

/** 감음수(winding) ≠ 0 구간의 화소를 채운다. 화소 중심(x+0.5)이 구간 안이면 채운다. */
function fillSpanNonzero(grid: Uint8Array, n: number, y: number, xStart: number, xEnd: number) {
  const xa = Math.max(0, Math.ceil(xStart - 0.5));
  const xb = Math.min(n - 1, Math.ceil(xEnd - 0.5) - 1);
  for (let x = xa; x <= xb; x++) grid[idx(n, x, y)] = 1;
}

/**
 * 닫힌 다각형(자기교차 가능) 하나를 nonzero 감음수 규칙으로 격자에 채운다.
 * SVG 출력이 쓰는 `fill-rule="nonzero"` 와 같은 규칙이어야, 링처럼 바깥
 * 윤곽과 안쪽 윤곽이 반대 방향으로 감겨 구멍을 이루는 도형도 같게 채워진다.
 */
function fillPolygonNonzero(grid: Uint8Array, n: number, poly: readonly Pt[]) {
  if (poly.length < 3) return;
  let yMin = Infinity, yMax = -Infinity;
  for (const p of poly) { if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1]; }
  const y0 = Math.max(0, Math.floor(yMin));
  const y1 = Math.min(n - 1, Math.ceil(yMax));

  for (let y = y0; y <= y1; y++) {
    const ys = y + 0.5; // 화소 중심에서 표본화
    const hits = crossingsAt(poly, ys);
    if (hits.length === 0) continue;
    hits.sort((p, q) => p.x - q.x);
    let winding = 0;
    let spanStart = 0;
    for (const h of hits) {
      const was = winding;
      winding += h.dir;
      if (was === 0 && winding !== 0) spanStart = h.x;
      else if (was !== 0 && winding === 0) fillSpanNonzero(grid, n, y, spanStart, h.x);
    }
  }
}

/**
 * 여러 닫힌 다각형(고리)을 **하나의** nonzero 감음수로 함께 채운다.
 *
 * `fillPolygonNonzero` 를 고리마다 따로따로 부르면 안 된다 — 그러면 구멍
 * 고리도 자기 혼자만 보고 속을 채워버려 구멍이 사라진다. 정리한 모양은
 * 바깥 윤곽과 구멍을 별도 고리로 낸다(`CleanedShape`), 그래서 한 스캔라인의
 * 교차점을 모든 고리에서 모아 함께 정렬한 뒤에 감음수를 누적해야, 반대
 * 방향으로 감긴 구멍 고리가 감음수를 상쇄해 실제로 구멍을 남긴다.
 */
function fillRingsNonzero(grid: Uint8Array, n: number, rings: readonly (readonly Pt[])[]) {
  let yMin = Infinity, yMax = -Infinity;
  for (const poly of rings) {
    for (const p of poly) { if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1]; }
  }
  if (!isFinite(yMin)) return;
  const y0 = Math.max(0, Math.floor(yMin));
  const y1 = Math.min(n - 1, Math.ceil(yMax));

  for (let y = y0; y <= y1; y++) {
    const ys = y + 0.5;
    const hits: { x: number; dir: number }[] = [];
    for (const poly of rings) hits.push(...crossingsAt(poly, ys));
    if (hits.length === 0) continue;
    hits.sort((p, q) => p.x - q.x);
    let winding = 0;
    let spanStart = 0;
    for (const h of hits) {
      const was = winding;
      winding += h.dir;
      if (was === 0 && winding !== 0) spanStart = h.x;
      else if (was !== 0 && winding === 0) fillSpanNonzero(grid, n, y, spanStart, h.x);
    }
  }
}

/**
 * 획들을 격자에 채운다. 1 = 잉크.
 *
 * 잘리는 것은 중심선이 아니라 윤곽선이다. 원판을 중심선에 찍으면 굽은
 * 곳에서 실제보다 두껍게 보여 0.5mm 미만의 살을 놓친다 — 예각으로 꺾인
 * 자리는 `taperOutline` 의 오프셋 윤곽이 안쪽에서 가늘어지는데, 중심선에
 * 원판을 찍는 모델은 그 가늘어짐을 아예 표현하지 못한다. 그래서 내보내기
 * (`compose.ts` 가 SVG 에 쓰는 `outlineOf`)와 정확히 같은 경로 문자열을
 * 만들어, 같은 채움 규칙(`fill-rule="nonzero"`)으로 래스터화한다.
 */
export function rasterize(
  strokes: readonly Stroke[], opts: MillOptions,
): { grid: Uint8Array; n: number } {
  const n = Math.round(opts.diameterMm * opts.pxPerMm);
  const grid = new Uint8Array(n * n);
  const scale = (opts.diameterMm * opts.pxPerMm * 0.5) / P_SPAN;

  for (const s of strokes) {
    if (s.pts.length < 2) continue; // compose.ts의 render()도 같은 이유로 건너뛴다
    const pxPts: Pt[] = s.pts.map((p) => {
      const q = toPx(n, opts.diameterMm, opts.pxPerMm, p);
      return [q.x, q.y] as Pt;
    });
    const pxWidths = s.widths.map((w) => w * scale);
    const d = outlineOf(pxPts, pxWidths);
    fillPolygonNonzero(grid, n, parseOutlinePoints(d));
  }
  return { grid, n };
}

/** 반경 r(화소) 원판으로 침식 */
function erode(grid: Uint8Array, n: number, r: number): Uint8Array {
  const out = new Uint8Array(n * n);
  const rr = r * r;
  const off: number[] = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dy * dy <= rr) off.push(dx, dy);
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!grid[idx(n, x, y)]) continue;
      let ok = 1;
      for (let k = 0; k < off.length && ok; k += 2) {
        const nx = x + off[k]!, ny = y + off[k + 1]!;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n || !grid[idx(n, nx, ny)]) ok = 0;
      }
      out[idx(n, x, y)] = ok;
    }
  }
  return out;
}

/** 반경 r(화소) 원판으로 팽창 */
function dilate(grid: Uint8Array, n: number, r: number): Uint8Array {
  const out = new Uint8Array(n * n);
  const rr = r * r;
  const off: number[] = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dy * dy <= rr) off.push(dx, dy);
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!grid[idx(n, x, y)]) continue;
      for (let k = 0; k < off.length; k += 2) {
        const nx = x + off[k]!, ny = y + off[k + 1]!;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n) out[idx(n, nx, ny)] = 1;
      }
    }
  }
  return out;
}

/** 4-이웃 연결 성분. `want` 값을 가진 화소들을 묶는다. */
function components(grid: Uint8Array, n: number, want: number): { sizes: number[]; label: Int32Array } {
  const label = new Int32Array(n * n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== want || label[i] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % n, y = (p / n) | 0;
      if (x > 0 && grid[p - 1] === want && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1); }
      if (x < n - 1 && grid[p + 1] === want && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && grid[p - n] === want && label[p - n] === -1) { label[p - n] = id; stack.push(p - n); }
      if (y < n - 1 && grid[p + n] === want && label[p + n] === -1) { label[p + n] = id; stack.push(p + n); }
    }
    sizes.push(size);
  }
  return { sizes, label };
}

/**
 * 배경(잉크가 아닌) 화소마다 가장 가까운 잉크 화소까지의 거리를 화소 단위로
 * 근사한다. 2-패스 챔퍼(가중치 3, 4 — 순서대로 직선 한 걸음과 대각선 한
 * 걸음) 거리 변환. 3으로 나누어 "직선 한 걸음 = 1화소"로 정규화한다.
 *
 * 구멍 안에서 이 거리의 최댓값이 그 구멍에 들어가는 가장 큰 원의 반지름
 * (내접 반지름)이다 — 길고 가는 틈이라도 폭이 좁으면 이 값이 작게 나오므로,
 * 넓이로는 커 보이는 구멍도 실제 폭으로 잡아낸다.
 */
function chamferDistanceToInk(grid: Uint8Array, n: number): Float64Array {
  const INF = 1e9;
  const dist = new Float64Array(n * n).fill(INF);
  for (let i = 0; i < grid.length; i++) if (grid[i]) dist[i] = 0;

  // 정방향: 좌상단 → 우하단
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = idx(n, x, y);
      if (dist[i] === 0) continue;
      let d = dist[i]!;
      if (x > 0) d = Math.min(d, dist[i - 1]! + 3);
      if (y > 0) d = Math.min(d, dist[i - n]! + 3);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - n - 1]! + 4);
      if (x < n - 1 && y > 0) d = Math.min(d, dist[i - n + 1]! + 4);
      dist[i] = d;
    }
  }
  // 역방향: 우하단 → 좌상단
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = idx(n, x, y);
      if (dist[i] === 0) continue;
      let d = dist[i]!;
      if (x < n - 1) d = Math.min(d, dist[i + 1]! + 3);
      if (y < n - 1) d = Math.min(d, dist[i + n]! + 3);
      if (x < n - 1 && y < n - 1) d = Math.min(d, dist[i + n + 1]! + 4);
      if (x > 0 && y < n - 1) d = Math.min(d, dist[i + n - 1]! + 4);
      dist[i] = d;
    }
  }
  for (let i = 0; i < dist.length; i++) dist[i] = dist[i]! / 3;
  return dist;
}

/**
 * 선폭 판정이 쓰는 침식·팽창 반지름(화소). `reportForGrid`와 정리 단계가 공유한다.
 *
 * 정확히 최소 선폭의 절반으로 침식하면 안 된다 — 화소는 정수 격자라, 폭이
 * 정확히 하한(2r 화소)인 직선 살은 반지름 r 원판이 안쪽 어디에도 통째로
 * 들어갈 자리가 없다(중심 화소 하나가 원판을 담으려면 살이 2r+1 화소는
 * 되어야 한다). 그러면 열기가 "정확히 하한인" 살마저 완전히 지워버린다 —
 * 하한을 만족하는 골격을 정리 단계가 스스로 위반작으로 둔갑시키는 셈이다.
 * 반지름을 화소 하나 줄이면 정확히 하한인 살이 이산화 오차를 견디고
 * 살아남는다(반 화소만 줄이는 틈 판정의 `gapRadius`보다 더 줄여야 하는
 * 이유는, 열기가 침식·팽창 두 번 다 같은 반지름을 쓰기 때문이다).
 */
function thinRadius(opts: MillOptions): number {
  return Math.max((opts.minStrokeMm * opts.pxPerMm) / 2 - 1, 0.5);
}

/**
 * 틈 판정이 쓰는 닫기 반지름(화소). `reportForGrid`와 정리 단계가 공유한다.
 * 반 화소는 래스터화 여유다 — 화소 중심 표본이라 닫기 연산의 경계가 실제보다
 * 반 화소 더 넓게 번진다(자세한 설명은 `reportForGrid`에 있다).
 */
function gapRadius(opts: MillOptions): number {
  return Math.max((opts.minGapMm * opts.pxPerMm) / 2 - 0.5, 0.5);
}

/** 4-이웃 연결 성분 중 가장 큰 것만 남긴다. `cleanForManufacture`가 반복해서 쓴다. */
function keepLargestComponent(grid: Uint8Array, n: number): Uint8Array {
  const comp = components(grid, n, 1);
  let bestId = -1, bestSize = -1;
  comp.sizes.forEach((size, id) => { if (size > bestSize) { bestSize = size; bestId = id; } });
  const out = new Uint8Array(n * n);
  if (bestId >= 0) {
    for (let i = 0; i < comp.label.length; i++) if (comp.label[i] === bestId) out[i] = 1;
  }
  return out;
}

/**
 * 성긴 격자는 작은 특징을 조용히 지운다 — 판정이 해상도에 좌우되면 그
 * 자체로 거짓 통과다(같은 도형이 해상도만 바뀌어도 통과/불통과가 달라짐).
 * 하한을 8화소 미만으로 만드는 해상도는 애초에 그 하한을 볼 수 없으므로
 * 막는다. 0.5mm × 20화소/mm = 10화소는 통과하고, × 10화소/mm = 5화소는
 * 여기서 던진다. `checkManufacturable`과 `checkManufacturableShape` 둘 다
 * 같은 격자를 검사하므로 이 가드를 공유한다.
 */
function assertResolution(opts: MillOptions): void {
  if (opts.minStrokeMm * opts.pxPerMm < 8) {
    throw new Error(
      `checkManufacturable: pxPerMm ${opts.pxPerMm} 는 최소 선폭 ${opts.minStrokeMm}mm 를 ` +
      `8화소 미만으로 만든다 — 판정이 해상도에 좌우된다`,
    );
  }
  if (opts.minGapMm * opts.pxPerMm < 8) {
    throw new Error(
      `checkManufacturable: pxPerMm ${opts.pxPerMm} 는 최소 틈 ${opts.minGapMm}mm 를 ` +
      `8화소 미만으로 만든다 — 판정이 해상도에 좌우된다`,
    );
  }
}

/**
 * 이미 래스터화된 격자에 대한 제작 가능성 판정. `checkManufacturable`(원본
 * 획)과 `checkManufacturableShape`(정리한 모양을 다시 래스터화한 결과)가
 * 이 한 곳의 판정 로직을 공유한다 — 두 경로가 갈라지면 "정리한 모양이
 * 검사를 통과한다"는 보장 자체가 어느 판정을 기준으로 하는지 모호해진다.
 *
 * - 선폭: 최소 선폭의 반지름으로 침식했다가 되돌렸을 때(열기) 사라지는 부분이
 *   하한보다 가는 곳이다.
 * - 틈: 잉크를 최소 틈의 반만큼 부풀렸다 되돌리면(닫기) 좁은 틈이 메워진다.
 *   메워진 화소가 좁은 틈이다.
 * - 연결: 잉크 덩어리가 둘 이상이면 떨어져 나간다.
 * - 구멍: 바깥과 이어지지 않은 배경 덩어리가 구멍이다. 내접 지름이 최소
 *   틈보다 작으면 뚫리지 않는다.
 */
function reportForGrid(grid: Uint8Array, n: number, opts: MillOptions): MillReport {
  const violations: string[] = [];

  const rThin = thinRadius(opts);
  const opened = dilate(erode(grid, n, rThin), n, rThin);
  let thinPx = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] && !opened[i]) thinPx++;
  if (thinPx > 0) {
    violations.push(`최소 선폭 ${opts.minStrokeMm}mm 보다 가는 부분이 ${thinPx}화소 있다`);
  }

  // 반 화소는 래스터화 여유다 — 화소 중심 표본이라 닫기 연산의 경계가
  // 실제보다 반 화소 더 넓게 번진다. 그만큼 반경을 줄이지 않으면 정확히
  // 0.5mm인, 진짜로 괜찮은 틈까지 억울하게 걸린다(하한을 낮추는 게 아니라
  // 래스터화 오차를 상쇄하는 것이다).
  const rGap = gapRadius(opts);
  const closed = erode(dilate(grid, n, rGap), n, rGap);
  let narrowGapPx = 0;
  for (let i = 0; i < grid.length; i++) if (!grid[i] && closed[i]) narrowGapPx++;
  if (narrowGapPx > 0) {
    violations.push(`최소 틈 ${opts.minGapMm}mm 보다 좁은 틈이 ${narrowGapPx}화소 있다`);
  }

  const ink = components(grid, n, 1);
  if (ink.sizes.length !== 1) {
    violations.push(`잉크가 ${ink.sizes.length}조각이다 — 투각 펜던트는 한 덩어리여야 한다`);
  }

  // 구멍 — 바깥 테두리에 닿지 않는 배경 덩어리
  const bg = components(grid, n, 0);
  const outer = new Set<number>();
  for (let x = 0; x < n; x++) {
    outer.add(bg.label[idx(n, x, 0)]!);
    outer.add(bg.label[idx(n, x, n - 1)]!);
    outer.add(bg.label[idx(n, 0, x)]!);
    outer.add(bg.label[idx(n, n - 1, x)]!);
  }
  // 각 구멍의 내접 반지름(잉크까지의 챔퍼 거리 최댓값)을 한 번의 순회로 모은다.
  const distToInk = chamferDistanceToInk(grid, n);
  const maxDistById = new Map<number, number>();
  for (let i = 0; i < bg.label.length; i++) {
    const id = bg.label[i]!;
    if (id < 0 || outer.has(id)) continue;
    const d = distToInk[i]!;
    if (d > (maxDistById.get(id) ?? 0)) maxDistById.set(id, d);
  }
  const smallHoles: number[] = [];
  bg.sizes.forEach((_size, id) => {
    if (outer.has(id)) return;
    // 넓이 환산 지름이 아니라 내접 지름(mm) — 길고 가는 슬릿도 폭으로 잡는다.
    const dMm = (2 * (maxDistById.get(id) ?? 0)) / opts.pxPerMm;
    if (dMm < opts.minGapMm) smallHoles.push(Number(dMm.toFixed(3)));
  });
  if (smallHoles.length > 0) {
    violations.push(`최소 틈 ${opts.minGapMm}mm 보다 작은 구멍이 ${smallHoles.length}개 있다`);
  }

  return { violations, components: ink.sizes.length, thinPx, narrowGapPx, smallHoles };
}

/** 제작 가능성 판정. 위반이 없으면 `violations` 가 빈 배열이다. */
export function checkManufacturable(
  strokes: readonly Stroke[], opts: MillOptions,
): MillReport {
  assertResolution(opts);
  const { grid, n } = rasterize(strokes, opts);
  return reportForGrid(grid, n, opts);
}

/**
 * p 공간 폴리곤을 화소 좌표로 옮기고, `fillRingsNonzero` 로 함께 채운다.
 * `checkManufacturableShape` 가 쓰는 것과 같은 래스터화라 테스트도 이걸
 * 써야 "정리한 모양이 실제로 얼마나 잉크를 남겼는지"를 같은 잣대로 잰다.
 */
export function rasterizeShape(shape: CleanedShape, opts: MillOptions, n: number): Uint8Array {
  const grid = new Uint8Array(n * n);
  const rings = shape.rings.map((r) => r.pts.map((p) => {
    const q = toPx(n, opts.diameterMm, opts.pxPerMm, p);
    return [q.x, q.y] as Pt;
  }));
  fillRingsNonzero(grid, n, rings);
  return grid;
}

/**
 * `cleanForManufacture` 가 낸 정리된 모양을 검사한다.
 *
 * `checkManufacturable` 은 **원본 획**을 래스터화해 검사한다 — 정리 전
 * 골격이 통과해도, 정리 단계가 실제로 내보내는 다각형이 같은 모양이라는
 * 보장은 없다(경계 추적과 단순화가 화소를 조금이라도 바꿀 수 있다).
 * 내보낸 파일이 곧 잘릴 모양이라는 설계 문서 12.3의 전제를 지키려면,
 * **정리한 다각형을 다시 래스터화해** 검사해야 한다.
 */
export function checkManufacturableShape(shape: CleanedShape, opts: MillOptions): MillReport {
  assertResolution(opts);
  const n = Math.round(opts.diameterMm * opts.pxPerMm);
  const grid = rasterizeShape(shape, opts, n);
  return reportForGrid(grid, n, opts);
}

// ── 경계 추적 (square/crack tracing) ──────────────────────────────────────
//
// 화소 격자의 경계를 다각형으로 뽑아낸다. 화소 (x,y)는 화소-공간에서
// [x,x+1) × [y,y+1) 를 차지하므로, 그 네 귀퉁이는 "꼭짓점" 격자의 정수
// 좌표 (x,y),(x+1,y),(x,y+1),(x+1,y+1) 다. 경계는 잉크 화소와 배경 화소를
// 가르는 변들의 연쇄다.
//
// 각 변에 방향을 매긴다 — "잉크가 항상 진행 방향의 오른쪽에 있도록". 이
// 규칙만으로 각 변의 방향이 인접한 두 화소 값만 보고 모호함 없이 정해진다
// (변 하나마다 양쪽 화소 중 정확히 하나만 잉크이기 때문). 꼭짓점에 들고
// 나는 변이 2개뿐이면(보통의 경우) 다음 변이 하나로 정해지고, 대각선으로만
// 맞닿은 두 잉크 덩어리가 한 꼭짓점에서 만나는 안장점(saddle)에서는 변이
// 4개가 되어 선택이 필요하다 — 그 경우 "들어온 방향 기준 가장 오른쪽으로
// 꺾는" 벽 따라가기 규칙을 쓴다. 결정적이고, 표준적인 경계 추적 방법이다.
const DX = [1, 0, -1, 0]; // 0=오른쪽 1=아래 2=왼쪽 3=위
const DY = [0, 1, 0, -1];

/** 잉크가 오른쪽에 오도록, 꼭짓점 (x,y)에서 방향 d 로 나가는 변이 있는가. */
function outgoingEdge(ink: (x: number, y: number) => number, x: number, y: number, d: number): boolean {
  switch (d) {
    case 0: return ink(x, y) === 1 && ink(x, y - 1) === 0; // 오른쪽
    case 1: return ink(x - 1, y) === 1 && ink(x, y) === 0; // 아래
    case 2: return ink(x - 1, y - 1) === 1 && ink(x - 1, y) === 0; // 왼쪽
    default: return ink(x, y - 1) === 1 && ink(x - 1, y - 1) === 0; // 위
  }
}

/**
 * 격자의 모든 경계 고리를 화소-공간 정수 좌표로 뽑는다.
 * 바깥 윤곽은 부호 있는 넓이가 양수, 구멍은 음수다(둘러싼 방향이 반대이기
 * 때문 — "잉크는 오른쪽" 규칙을 지키려면 구멍 둘레는 반대로 돌아야 한다).
 */
function traceContours(grid: Uint8Array, n: number): { pts: Pt[]; hole: boolean }[] {
  const ink = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= n || y >= n) return 0;
    return grid[y * n + x] ?? 0;
  };
  const visited = new Set<string>();
  const rings: { pts: Pt[]; hole: boolean }[] = [];

  for (let y = 0; y <= n; y++) {
    for (let x = 0; x <= n; x++) {
      for (let d0 = 0; d0 < 4; d0++) {
        if (!outgoingEdge(ink, x, y, d0)) continue;
        const startKey = `${x},${y},${d0}`;
        if (visited.has(startKey)) continue;

        const pts: Pt[] = [];
        let cx = x, cy = y, cd = d0;
        let area2 = 0; // 신발끈 공식의 2배 — 부호만 필요하므로 나누지 않는다
        for (;;) {
          visited.add(`${cx},${cy},${cd}`);
          pts.push([cx, cy]);
          const nx = cx + DX[cd]!, ny = cy + DY[cd]!;
          area2 += cx * ny - nx * cy;

          // 벽 따라가기 우선순위: 가장 오른쪽으로 꺾기 → 직진 → 왼쪽으로
          // 꺾기 → 되돌아가기. 안장점이 아니면 이 중 하나만 존재한다.
          const cw = (cd + 1) % 4, straight = cd, ccw = (cd + 3) % 4, back = (cd + 2) % 4;
          let nd = -1;
          for (const cand of [cw, straight, ccw, back]) {
            if (outgoingEdge(ink, nx, ny, cand)) { nd = cand; break; }
          }
          if (nd < 0) {
            throw new Error('cleanForManufacture: 경계 추적이 막혔다 (버그) — 격자가 이진이 아닐 수 있다');
          }
          cx = nx; cy = ny; cd = nd;
          if (cx === x && cy === y && cd === d0) break;
        }
        rings.push({ pts, hole: area2 < 0 });
      }
    }
  }
  return rings;
}

/** 점 p 에서 선분 a-b 까지의 수직 거리. a==b 면 유클리드 거리. */
function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const projX = a[0] + t * dx, projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

/** Ramer–Douglas–Peucker. `pts` 는 열린 폴리라인(첫 점·끝 점 고정)으로 다룬다. */
function rdp(pts: readonly Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const first = pts[0]!, last = pts[pts.length - 1]!;
  let maxDist = -1, idx2 = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i]!, first, last);
    if (d > maxDist) { maxDist = d; idx2 = i; }
  }
  if (maxDist > eps) {
    const left = rdp(pts.slice(0, idx2 + 1), eps);
    const right = rdp(pts.slice(idx2), eps);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/**
 * 닫힌 고리(첫 점 == 끝 점 아님)를 RDP 로 단순화한다.
 * 닫는 변(마지막 점 → 첫 점)도 단순화 대상에 넣으려고 첫 점을 끝에 잠깐
 * 덧붙였다가, 단순화 후 다시 뗀다.
 */
function simplifyClosed(pts: readonly Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const closed = [...pts, pts[0]!];
  const simplified = rdp(closed, eps);
  return simplified.slice(0, -1);
}

/**
 * 획들을 제작 가능하도록 정리한다 (설계 문서 12.3).
 *
 * `checkManufacturable` 로 잡아내는 네 위반(선폭·틈·연결·구멍)을 룩 수치
 * 튜닝으로 없애려던 시도는 17개 매개변수를 훑어도 ~90 화소의 위반에서
 * 정체됐다 — 획들이 접선으로 만나는 자리마다 합집합이 만드는 0.1mm 목은
 * 구조적인 결과라 수치를 아무리 조정해도 사라지지 않는다. 그래서 레이저/
 * 워터젯 준비 공정처럼, 그린 모양을 후처리해 "물리적으로 자를 수 있는
 * 모양"으로 명시적으로 바꾼다. 이 함수가 낸 결과를 `checkManufacturableShape`
 * 로 검사하면, 구성상 위반이 0이어야 한다.
 */
export function cleanForManufacture(
  strokes: readonly Stroke[], opts: MillOptions,
): CleanedShape {
  const { grid: raw, n } = rasterize(strokes, opts);

  // 닫기 — 팽창으로 좁은 틈을 이어 붙이고 침식으로 바깥 크기를 되돌린다.
  // 최소 틈보다 좁아 자를 수 없는 틈을 메운다.
  const closeR = (opts.minGapMm / 2) * opts.pxPerMm;
  const closed = erode(dilate(raw, n, closeR), n, closeR);

  // 열기 — 침식으로 가는 살을 지우고 팽창으로 남은 부분의 크기를 되돌린다.
  // `reportForGrid`의 선폭 판정과 정확히 같은 반지름의 같은 연산이라(열기는
  // 멱등이다) 여기서 지운 부분은 검사에서 다시 걸리지 않는다.
  const openR = thinRadius(opts);
  const opened = dilate(erode(closed, n, openR), n, openR);

  // 코어 — 원본 잉크(닫기·열기를 거치지 않은 `raw`)를 훨씬 작은 반지름으로
  // 침식한 것. 골격은 어디서나 최소 선폭 이상으로 그려지므로(그렇게
  // 그렸으니까), 이렇게 작은 반지름의 침식은 그 자리 어디서도 잉크를 완전히
  // 지우지 않는다 — 반면 획들이 접선으로 만나는 자리의 구조적인 목(설계
  // 문서가 말하는, 수치 튜닝으로도 안 사라지는 0.1mm 급 목)은 이 정도
  // 침식으로도 끊어진다. `thinRadius`를 화소 하나 줄여도(위 주석) 화소
  // 단위 이산화나 곡률이 겹치면 열기가 여전히 한 자리를 통째로 지워버릴 수
  // 있다 — 그 최후 안전망으로, 열기 결과와 이 코어를 합집합해 골격이 있던
  // 자리의 잉크를 절대 통째로 잃지 않게 한다.
  const coreR = Math.max(openR / 4, 0.5);
  const core = erode(raw, n, coreR);
  const openedWithCore = new Uint8Array(opened);
  for (let i = 0; i < core.length; i++) if (core[i]) openedWithCore[i] = 1;

  // 가장 큰 덩어리만 남기는 건 최후 수단이다 — 먼저 용접을 시도한다. 열기가
  // 만든 조각들은 대개 원래 하나로 이어져 있던 자리가 이산화 오차로 잠깐
  // 끊긴 것뿐이라, 아래 용접 루프의 첫 라운드가 쓰는 틈-닫기(`gapRadius`)가
  // 그 작은 틈을 다시 이어 붙인다. 그림 자체가 진짜로 떨어진 조각을 담고
  // 있는 경우에만(용접이 다 끝나도 안 붙는 경우에만) 루프 끝의
  // `keepLargestComponent` 가 그 조각을 골라 버린다.
  let main: Uint8Array = openedWithCore;

  // 용접 — 닫기 다음에 연 열기가 방금 이은 다리를 도로 갉아먹을 수 있다
  // (닫기가 메운 틈의 폭이 열기의 침식 반경보다 좁으면, 열기가 그 다리를
  // 그대로 지워버린다). 화소 중심 표본이라 경계 자체가 화소 하나 규모로
  // 들쭉날쭉해서, 정확히 같은 반지름을 두 번 감아도 이 되갉음이 반복될 수
  // 있다 — 두 반지름이 우연히 같은 값(기본값이 그렇다)일 때 특히 그렇다.
  //
  // `reportForGrid`가 쓰는 것과 정확히 같은 반지름으로 닫으면(`gapRadius`),
  // 그 결과는 닫기의 멱등성에 의해 그 자체로 틈 위반이 0이 되도록
  // 보장된다 — 문제는 이때 새로 이어진 다리가 선폭 하한보다 가늘 수 있다는
  // 것뿐이다. 그 가는 다리만 정확히 골라내(같은 열기 반지름으로) 그
  // 자리만 넉넉히 두껍게 용접한다 — 전체를 다시 넓히면 다른 곳에 새
  // 들쭉날쭉함을 만들 뿐이다. 용접은 항상 더 넓은 원판을 더하기만 하고,
  // 원판은 스스로의 반지름의 열기를 항상 버텨내므로 용접한 자리가 다시
  // 가늘어지지 않는다. 그래도 남는 틈·구멍이 있을 수 있어 반복한다 —
  // 매 라운드 잉크만 늘어나거나 같은 자리를 다시 다듬을 뿐이라 수렴한다.
  const rGap = gapRadius(opts);
  for (let round = 0; round < 20; round++) {
    if (reportForGrid(main, n, opts).violations.length === 0) break;

    const gapClosed = erode(dilate(main, n, rGap), n, rGap);
    const thinOpened = dilate(erode(gapClosed, n, openR), n, openR);
    const thin = new Uint8Array(n * n);
    let anyThin = false;
    for (let i = 0; i < gapClosed.length; i++) {
      if (gapClosed[i] && !thinOpened[i]) { thin[i] = 1; anyThin = true; }
    }
    let patched = gapClosed;
    if (anyThin) {
      const weld = dilate(thin, n, openR);
      patched = new Uint8Array(gapClosed);
      for (let i = 0; i < weld.length; i++) if (weld[i]) patched[i] = 1;
    }
    main = keepLargestComponent(patched, n);
  }

  // 뚫을 수 없을 만큼 작은 구멍은 메운다 — 내접 지름이 최소 틈보다 작으면
  // 그 자리는 뚫리지 않고 금속으로 남으므로, 정리한 모양도 그래야 한다.
  const bg = components(main, n, 0);
  const outer = new Set<number>();
  for (let x = 0; x < n; x++) {
    outer.add(bg.label[idx(n, x, 0)]!);
    outer.add(bg.label[idx(n, x, n - 1)]!);
    outer.add(bg.label[idx(n, 0, x)]!);
    outer.add(bg.label[idx(n, n - 1, x)]!);
  }
  const distToInk = chamferDistanceToInk(main, n);
  const maxDistById = new Map<number, number>();
  for (let i = 0; i < bg.label.length; i++) {
    const id = bg.label[i]!;
    if (id < 0 || outer.has(id)) continue;
    const d = distToInk[i]!;
    if (d > (maxDistById.get(id) ?? 0)) maxDistById.set(id, d);
  }
  const filled = new Uint8Array(main);
  for (let i = 0; i < bg.label.length; i++) {
    const id = bg.label[i]!;
    if (id < 0 || outer.has(id)) continue;
    const dMm = (2 * (maxDistById.get(id) ?? 0)) / opts.pxPerMm;
    if (dMm < opts.minGapMm) filled[i] = 1;
  }

  // 경계를 다각형으로 뽑고, 화소 좌표를 p 공간으로 되돌린 뒤(`rasterize`가
  // 쓰는 매핑의 역), 화소 하나마다 꺾이는 계단을 다듬는다. 허용오차를
  // 화소의 1/3로 잡아 — 화소 격자 자체의 양자화(반 화소)보다 확실히 작게
  // 두어 — 단순화가 되레 새 위반을 만들지 않게 한다.
  const scale = (opts.diameterMm * opts.pxPerMm * 0.5) / P_SPAN;
  const toP = (v: Pt): Pt => [(v[0] - n / 2) / scale, (n / 2 - v[1]) / scale];
  const tolP = (1 / 3) / scale;

  const rings = traceContours(filled, n)
    .map((r) => ({ pts: simplifyClosed(r.pts.map(toP), tolP), hole: r.hole }))
    .filter((r) => r.pts.length >= 3);

  return { rings };
}
