import type { SkeletonResult } from '../../src/render/compose';
import type { Arrival } from '../../src/render/arrival';

/** 정점 하나 = [x, y, t, part] */
export const FLOATS_PER_VERTEX = 4;

/**
 * 골격 + 번짐 시간표 → 마스크 텍스처에 그릴 삼각형 정점.
 *
 * 획마다 중심선의 양옆으로 반폭만큼 벌린 띠를 만든다 (룩랩 `strip` 과 같은
 * 방식). 좌표는 p 공간 그대로다 — 화면 배율은 셰이더의 `uHalf` 가 맡는다.
 * `t` 는 전체 길이로 나눈 0..1 이어서 8비트 텍스처 채널에 담을 수 있다.
 */
export function maskVertices(sk: SkeletonResult, arr: Arrival): Float32Array {
  const out: number[] = [];
  sk.strokes.forEach((s, si) => {
    const n = s.pts.length;
    if (n < 2) return;
    const a = arr.strokes[si]!;
    const part = a.part;
    const L: [number, number][] = [];
    const R: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const h = s.widths[i]! / 2;
      const pv = s.pts[Math.max(i - 1, 0)]!;
      const nx = s.pts[Math.min(i + 1, n - 1)]!;
      let dx = nx[0] - pv[0], dy = nx[1] - pv[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const p = s.pts[i]!;
      L.push([p[0] - dy * h, p[1] + dx * h]);
      R.push([p[0] + dy * h, p[1] - dx * h]);
    }
    const t = (i: number) => Math.min(1, Math.max(0, a.times[i]! / arr.duration));
    const v = (q: [number, number], i: number) => out.push(q[0], q[1], t(i), part);
    for (let i = 0; i < n - 1; i++) {
      v(L[i]!, i); v(R[i]!, i); v(L[i + 1]!, i + 1);
      v(R[i]!, i); v(R[i + 1]!, i + 1); v(L[i + 1]!, i + 1);
    }
  });
  return new Float32Array(out);
}
