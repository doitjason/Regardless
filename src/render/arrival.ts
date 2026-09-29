import { mulberry32 } from '../core/hash';
import { subSeed } from '../core/ir';
import type { Pt } from './geometry';
import type { SkeletonResult } from './compose';
import type { LookParams } from './look';
import { partKeyOf } from './parts';

/**
 * 번짐 시간표 (화면 경험 설계 4.1).
 *
 * 먹은 링 위의 한 점(시작점)에서 **양쪽으로 동시에** 번진다. 시계 방향으로
 * 쓰면 설계 문서 6.1 에서 없앤 '읽는 방향' 이 애니메이션으로 되살아난다
 * (9.5.2). 그래서 링의 도착 시각은 시작점으로부터의 각거리만의 함수다.
 *
 * 시작점은 IR 시드에서 정한다 — 같은 문장이면 늘 같은 곳에서 번진다.
 * 수치는 호출자가 `timing` 으로 넘긴다 (`design/screen.json`). 이 파일에
 * 시간 수치를 박지 않는다.
 */
export interface ArrivalTiming {
  /** 링의 먹 선두가 시작점 반대편까지 가는 시간 (초) */
  ringSeconds: number;
  /** 링 바깥으로 p 거리 1 만큼 떨어질 때마다 늦어지는 시간 (초) */
  depthSecondsPerUnit: number;
  /** 획을 따라 먹이 흐르는 속도 (p 단위/초) */
  flowSpeed: number;
  /** 획마다 도착 시각을 흩는 최대 폭 (초) */
  jitterSeconds: number;
  /** 마지막 점이 칠해진 뒤 번짐이 끝나기까지 (초) */
  tailSeconds: number;
}

export interface StrokeArrival {
  /** 점마다 도착 시각 (초). `pts` 와 길이가 같다 */
  times: number[];
  /** `Arrival.parts` 의 색인 */
  part: number;
}

export interface Arrival {
  /** 시작점 각도 (라디안, 0..2π) */
  origin: number;
  /** 번짐 전체 길이 (초) */
  duration: number;
  /** `sk.strokes` 와 같은 순서·같은 길이 */
  strokes: StrokeArrival[];
  /** 묶음 키. 0번은 링, 나머지는 먹이 처음 닿은 순서 — 해독 순서다 */
  parts: string[];
}

const TAU = Math.PI * 2;
const RING_KEY = 'ring|링';

/** 두 각의 차이 (0..π). 방향을 가리지 않는다. */
export function angularDistance(a: number, b: number): number {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return d > Math.PI ? TAU - d : d;
}

/** 링 위 각도 `theta` 에 먹이 닿는 시각. 시작점 기준 대칭이다. */
export function ringTimeAt(theta: number, origin: number, timing: ArrivalTiming): number {
  return (timing.ringSeconds * angularDistance(theta, origin)) / Math.PI;
}

const angleOf = (p: Pt) => Math.atan2(p[1], p[0]);
const radiusOf = (p: Pt) => Math.hypot(p[0], p[1]);
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function arrival(sk: SkeletonResult, look: LookParams, timing: ArrivalTiming): Arrival {
  const rnd = mulberry32(subSeed(sk.seed, 'arrival'));
  const origin = rnd() * TAU;

  const raw: number[][] = sk.strokes.map((s) => {
    if (s.pts.length === 0) return [];
    // 링(본체·겹선·양보의 지나침)은 각도만으로 정한다
    if (s.role === 'ring') return s.pts.map((p) => ringTimeAt(angleOf(p), origin, timing));

    // 뿌리 = 링에 가장 가까운 점. 먹은 링에서 뿌리로 건너가 거기서 양 끝으로 흐른다.
    let root = 0;
    for (let i = 1; i < s.pts.length; i++) {
      if (radiusOf(s.pts[i]!) < radiusOf(s.pts[root]!)) root = i;
    }
    const rp = s.pts[root]!;
    const t0 = ringTimeAt(angleOf(rp), origin, timing)
      + Math.max(0, radiusOf(rp) - look.pR) * timing.depthSecondsPerUnit
      + rnd() * timing.jitterSeconds;

    const times = new Array<number>(s.pts.length).fill(0);
    times[root] = t0;
    for (let i = root + 1; i < s.pts.length; i++) {
      times[i] = times[i - 1]! + dist(s.pts[i - 1]!, s.pts[i]!) / timing.flowSpeed;
    }
    for (let i = root - 1; i >= 0; i--) {
      times[i] = times[i + 1]! + dist(s.pts[i + 1]!, s.pts[i]!) / timing.flowSpeed;
    }
    return times;
  });

  // 묶음: 링은 0번, 나머지는 첫 도착 순 (같으면 키의 코드 단위 순 — 로캘 비교 금지)
  const first = new Map<string, number>();
  sk.strokes.forEach((s, i) => {
    const k = partKeyOf(s);
    const m = raw[i]!.length > 0 ? Math.min(...raw[i]!) : Infinity;
    first.set(k, Math.min(first.get(k) ?? Infinity, m));
  });
  const others = [...first.keys()].filter((k) => k !== RING_KEY).sort((a, b) =>
    (first.get(a)! - first.get(b)!) || (a < b ? -1 : a > b ? 1 : 0));
  const parts = [RING_KEY, ...others];
  const index = new Map(parts.map((k, i) => [k, i]));

  let last = 0;
  for (const ts of raw) for (const t of ts) last = Math.max(last, t);

  return {
    origin,
    duration: last + timing.tailSeconds,
    strokes: sk.strokes.map((s, i) => ({ times: raw[i]!, part: index.get(partKeyOf(s))! })),
    parts,
  };
}
