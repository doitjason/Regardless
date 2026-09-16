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

function labelOf(c: Constituent): string {
  return c.kind === 'concept' ? c.lemma : c.syllables.map((s) => `${s.onset}${s.nucleus}${s.coda}`).join('');
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
 * 덩어리는 역할 지도에서 이웃한 성분끼리 묶는다: 성분을 슬롯 순으로 정렬한
 * 뒤, 가장 큰 빈 구간(연속한 슬롯 사이의 원형 간격) 다음에서 시작해 연속
 * 구간으로 자른다. 이렇게 하면 11시·1시처럼 12시를 가로지르는 이웃도
 * 한 덩어리가 된다. 자르는 크기는 예전 라운드로빈과 같은 분포(균등하게
 * 나누고 남는 만큼 앞쪽 덩어리에 하나씩)를 그대로 써서, 겹쳐 쌓는 깊이의
 * 상한(`ceil(n/zones) - 1`)은 바뀌지 않는다.
 *
 * 덩어리 각도는 구성원 슬롯 각도의 원형 평균이다 — 역할 지도가 위치를 정한다.
 * 다만 한 역할이 덩어리 하나의 몫보다 많은 단어를 가지면, 정렬-회전-절단만
 * 으로는 그 역할을 다른 덩어리와 안 섞을 수 없어 덩어리가 여전히 먼 역할을
 * 함께 담을 수 있다 — 정확히 상쇄되는 경우(원형 평균이 원점 근처로 뭉개지는
 * 경우)는 시드된 폴백 각도로 받는다.
 *
 * 성분은 canonical 순서로 순회하므로 파서가 어떤 순서로 뱉어도 결과가 같다.
 */
export function layout(ir: IR, look: LookParams): { placements: Placement[]; total: number } {
  const items = sortedConstituents(ir).slice(0, MAX_WORDS);
  if (items.length === 0) throw new Error('layout: IR에 성분이 없다');

  // 지도 밖 역할이나 알 수 없는 kind 를 조용히 받으면 슬롯이 undefined 가
  // 되어 NaN 각도 → 시드 폴백으로 흡수되고, 같은 덩어리를 공유하는 멀쩡한
  // 성분까지 끌고 간다 (계획 II 최종 리뷰 I2). 사전 미등재 표제어처럼 던진다.
  for (const c of items) {
    if (c.kind !== 'concept' && c.kind !== 'phonetic') {
      throw new Error(`layout: 알 수 없는 성분 종류 "${String((c as { kind: unknown }).kind)}"`);
    }
    if (!(c.role in ROLE_SLOT)) {
      throw new Error(`layout: 알 수 없는 역할 "${c.role}" (성분 "${labelOf(c)}")`);
    }
  }

  const zones = Math.max(1, Math.min(Math.round(look.cZones), items.length));

  // 슬롯 순으로 안정 정렬 (동점은 canonical 순서 유지 — Array.prototype.sort 는 안정적).
  const bySlot = [...items].sort((a, b) => ROLE_SLOT[a.role] - ROLE_SLOT[b.role]);
  const n = bySlot.length;
  const slots = bySlot.map((it) => ROLE_SLOT[it.role]);

  // 가장 큰 원형 빈 구간 다음에서 시작하도록 회전 지점을 찾는다.
  // 동점이면 가장 작은 인덱스를 쓴다 (엄격한 `>` 로 스캔).
  let rotateAt = 0, maxGap = -1;
  for (let i = 0; i < n; i++) {
    const prev = slots[(i - 1 + n) % n]!;
    const gap = (slots[i]! - prev + 12) % 12;
    if (gap > maxGap) { maxGap = gap; rotateAt = i; }
  }
  const rotated = [...bySlot.slice(rotateAt), ...bySlot.slice(0, rotateAt)];

  // 연속 구간으로 자른다. 크기는 라운드로빈과 같은 분포를 낸다.
  const base = Math.floor(n / zones), extra = n % zones;
  const buckets: Constituent[][] = [];
  let cursor = 0;
  for (let z = 0; z < zones; z++) {
    const size = base + (z < extra ? 1 : 0);
    buckets.push(rotated.slice(cursor, cursor + size));
    cursor += size;
  }

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
