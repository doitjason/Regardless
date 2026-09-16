import type { Pt } from '../../src/render/geometry';

/** SVG path d 문자열에서 좌표쌍만 뽑는다. 테스트 전용. */
export function parsePathPoints(d: string): Pt[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push([Number(nums[i]), Number(nums[i + 1])]);
  }
  return out;
}
