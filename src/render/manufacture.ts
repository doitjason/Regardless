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
 * 제작 가능성 판정. 위반이 없으면 `violations` 가 빈 배열이다.
 *
 * - 선폭: 최소 선폭의 반지름으로 침식했다가 되돌렸을 때(열기) 사라지는 부분이
 *   하한보다 가는 곳이다.
 * - 틈: 잉크를 최소 틈의 반만큼 부풀렸다 되돌리면(닫기) 좁은 틈이 메워진다.
 *   메워진 화소가 좁은 틈이다.
 * - 연결: 잉크 덩어리가 둘 이상이면 떨어져 나간다.
 * - 구멍: 바깥과 이어지지 않은 배경 덩어리가 구멍이다. 내접 지름이 최소
 *   틈보다 작으면 뚫리지 않는다.
 */
export function checkManufacturable(
  strokes: readonly Stroke[], opts: MillOptions,
): MillReport {
  // 성긴 격자는 작은 특징을 조용히 지운다 — 판정이 해상도에 좌우되면 그
  // 자체로 거짓 통과다(같은 도형이 해상도만 바뀌어도 통과/불통과가 달라짐).
  // 하한을 8화소 미만으로 만드는 해상도는 애초에 그 하한을 볼 수 없으므로
  // 막는다. 0.5mm × 20화소/mm = 10화소는 통과하고, × 10화소/mm = 5화소는
  // 여기서 던진다.
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

  const { grid, n } = rasterize(strokes, opts);
  const violations: string[] = [];

  const rThin = (opts.minStrokeMm * opts.pxPerMm) / 2;
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
  const rGap = Math.max((opts.minGapMm * opts.pxPerMm) / 2 - 0.5, 0.5);
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
