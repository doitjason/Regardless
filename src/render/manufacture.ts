import { P_SPAN } from './compose';
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

/** 획들을 격자에 채운다. 1 = 잉크. */
export function rasterize(
  strokes: readonly Stroke[], opts: MillOptions,
): { grid: Uint8Array; n: number } {
  const n = Math.round(opts.diameterMm * opts.pxPerMm);
  const grid = new Uint8Array(n * n);
  const scale = (opts.diameterMm * opts.pxPerMm * 0.5) / P_SPAN;

  const disc = (cx: number, cy: number, r: number) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(n - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(n - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) grid[idx(n, x, y)] = 1;
      }
    }
  };

  for (const s of strokes) {
    for (let i = 0; i < s.pts.length; i++) {
      const a = toPx(n, opts.diameterMm, opts.pxPerMm, s.pts[i]!);
      const ra = Math.max(0.5, ((s.widths[i] ?? 0) / 2) * scale);
      disc(a.x, a.y, ra);
      // 점 사이를 이어 채운다 — 원만 찍으면 성긴 중심선에서 끊긴다
      if (i + 1 < s.pts.length) {
        const b = toPx(n, opts.diameterMm, opts.pxPerMm, s.pts[i + 1]!);
        const rb = Math.max(0.5, ((s.widths[i + 1] ?? 0) / 2) * scale);
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          disc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, ra + (rb - ra) * t);
        }
      }
    }
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
 * 제작 가능성 판정. 위반이 없으면 `violations` 가 빈 배열이다.
 *
 * - 선폭: 최소 선폭의 반지름으로 침식했다가 되돌렸을 때(열기) 사라지는 부분이
 *   하한보다 가는 곳이다.
 * - 틈: 잉크를 최소 틈의 반만큼 부풀렸다 되돌리면(닫기) 좁은 틈이 메워진다.
 *   메워진 화소가 좁은 틈이다.
 * - 연결: 잉크 덩어리가 둘 이상이면 떨어져 나간다.
 * - 구멍: 바깥과 이어지지 않은 배경 덩어리가 구멍이다. 지름이 최소 틈보다
 *   작으면 뚫리지 않는다.
 */
export function checkManufacturable(
  strokes: readonly Stroke[], opts: MillOptions,
): MillReport {
  const { grid, n } = rasterize(strokes, opts);
  const violations: string[] = [];

  const rThin = (opts.minStrokeMm * opts.pxPerMm) / 2;
  const opened = dilate(erode(grid, n, rThin), n, rThin);
  let thinPx = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] && !opened[i]) thinPx++;
  if (thinPx > 0) {
    violations.push(`최소 선폭 ${opts.minStrokeMm}mm 보다 가는 부분이 ${thinPx}화소 있다`);
  }

  const rGap = (opts.minGapMm * opts.pxPerMm) / 2;
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
  const smallHoles: number[] = [];
  bg.sizes.forEach((size, id) => {
    if (outer.has(id)) return;
    // 같은 넓이의 원으로 환산한 지름 (mm)
    const dMm = (2 * Math.sqrt(size / Math.PI)) / opts.pxPerMm;
    if (dMm < opts.minGapMm) smallHoles.push(Number(dMm.toFixed(3)));
  });
  if (smallHoles.length > 0) {
    violations.push(`최소 틈 ${opts.minGapMm}mm 보다 작은 구멍이 ${smallHoles.length}개 있다`);
  }

  return { violations, components: ink.sizes.length, thinPx, narrowGapPx, smallHoles };
}
