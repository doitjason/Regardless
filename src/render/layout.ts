import type { LookParams } from './look';
import { sortedConstituents, seedOf, type Constituent, type IR, type Role } from '../core/ir';
import { fnv1a, mulberry32 } from '../core/hash';

/**
 * 12슬롯 역할 지도 — 3축 대칭 (설계 문서 8.2).
 *
 *   축 1: 12시 행위 ↔  6시 양상
 *   축 2:  2시 주체 ↔  8시 대상
 *   축 3:  4시 시간 ↔ 10시 장소
 *
 * 짝인 역할을 마주보게 둔 결과, 주체·대상 반전이 축 2의 180° 회전이 된다.
 * 홀수 슬롯은 바로 앞 짝수 슬롯의 부속이다.
 */
export const ROLE_SLOT: Record<Role, number> = {
  '행위': 0, '행위수식': 1,
  '주체': 2, '주체수식': 3,
  '시간': 4, '시간수식': 5,
  '양상': 6, '정도': 7,
  '대상': 8, '대상수식': 9,
  '장소': 10, '방향': 11,
};

/** 슬롯 번호를 각도로. 0이 12시, 시계방향. */
export function slotAngle(slot: number, jitter: number): number {
  return Math.PI / 2 - ((slot + jitter) / 12) * Math.PI * 2;
}

/**
 * 단어 상한. 넘으면 덩어리가 겹쳐 쌓이다 링에서 너무 멀어진다 (설계 문서 9.5.1b).
 *
 * 문장 상한(5개)은 여기 없다. 현재 `IR` 은 문장 하나를 나타내므로 다중 문장은
 * IR 확장이 필요하고, 그것은 파서(계획 III)에서 다룬다.
 */
export const MAX_WORDS = 10;

export interface Placement {
  item: Constituent;
  /** 덩어리 중심 각도 */
  angle: number;
  /** 같은 덩어리 안에서 겹쳐 쌓는 깊이. 바깥으로 쌓인다 */
  depth: number;
}

const wrapPi = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/**
 * 성분들을 덩어리에 배분하고 각 덩어리의 각도를 정한다.
 *
 * 개념마다 자기 덩어리를 만들면 개념이 많을 때 원형 윤곽이 깨진다. 실제
 * 로고그램은 덩어리가 1~3군데뿐이고 복잡함은 그 안의 밀도로 온다. 그래서
 * 덩어리 수는 `cZones` 로 고정되고 개념들이 나눠 담긴다.
 *
 * 덩어리 각도는 구성원 슬롯 각도의 원형 평균이다 — 역할 지도가 위치를 정한다.
 *
 * 성분은 canonical 순서로 순회하므로 파서가 어떤 순서로 뱉어도 결과가 같다.
 */
export function layout(ir: IR, look: LookParams): { placements: Placement[]; total: number } {
  const items = sortedConstituents(ir).slice(0, MAX_WORDS);
  if (items.length === 0) throw new Error('layout: IR에 성분이 없다');

  const zones = Math.max(1, Math.min(Math.round(look.cZones), items.length));
  const buckets: Constituent[][] = Array.from({ length: zones }, () => []);
  items.forEach((it, i) => buckets[i % zones]!.push(it));

  const rnd = mulberry32(fnv1a(`zone|${seedOf(ir)}`));
  const fallback = rnd() * Math.PI * 2;

  const placements: Placement[] = [];
  buckets.forEach((members, zi) => {
    if (members.length === 0) return;
    let sx = 0, sy = 0;
    for (const m of members) {
      const a = slotAngle(ROLE_SLOT[m.role], 0.5);
      sx += Math.cos(a); sy += Math.sin(a);
    }
    const center = (sx * sx + sy * sy) > 1e-12
      ? Math.atan2(sy, sx)
      : fallback + (zi / zones) * Math.PI * 2;

    members.forEach((m, mi) => {
      const spread = (mi - (members.length - 1) / 2) * look.cBloomSpan * 0.30;
      placements.push({ item: m, angle: wrapPi(center + spread), depth: mi });
    });
  });

  return { placements, total: items.length };
}
