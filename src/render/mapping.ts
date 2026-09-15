import type { SemanticFeatures } from '../core/lexicon';

/** 개념 하나의 조형 배수. 조형 파라미터(look)에 곱해진다. */
export interface ShapeParams {
  /** 덩어리 두께 배수 */ thickK: number;
  /** 덩어리 호 폭 배수 */ spanK: number;
  /** 긴 가시가 뻗는 거리 배수 (강도) */ reachK: number;
  /** 가시가 쏠리고 휘는 방향. -1..1 (정서가) */ lean: number;
  /** 가시 개수 배수 */ fringeK: number;
  /** 가시 길이 배수 */ fringeLenK: number;
  /** 가시 끝 뭉툭함 배수 (한정성 — 한정=뭉친 끝, 비한정=가는 끝) */ tipK: number;
  /** 겹선 배수 */ doubleK: number;
  /** 부속 고리 유무 */ loop: boolean;
  /** 덩어리 굵기 물결의 주파수 (정수, 시간성) */ harmonic: number;
}

/**
 * 의미 자질 → 조형 배수 (설계 문서 8.4, 9.5.1b).
 *
 * 원칙 2를 지키려면 8개 자질이 모두 어딘가에 도달해야 한다. 어느 자질이
 * 쓰이지 않으면 그 의미 차이가 형태에 나타나지 않는다.
 * `tests/render/mapping.test.ts` 가 자질별로 이를 검증하고,
 * `tests/render/vocab-bloom.test.ts` 가 그 배수가 실제 기하(좌표·굵기)까지
 * 닿는지 검증한다 — 배수만 보는 검사로는 죽은 자질을 잡지 못한다.
 *
 * 전체 사상:
 * - `agency`, `sociality` → `fringeK` (가시 개수)
 * - `valence` → `lean` (가시가 쏠리고 휘는 방향, `vocab.ts`의 `hair`가 소비)
 * - `intensity` → `reachK` (긴 가시의 도달 거리, `vocab.ts`의 긴 가시가 소비)
 * - `concreteness` → `thickK`, `fringeLenK` (덩어리 두께, 가시 길이)
 * - `boundedness` → `tipK` (가시 끝 뭉툭함, `vocab.ts`의 `hair`가 소비)
 * - `temporality` → `doubleK`, `harmonic` (덩어리 굵기 물결의 주파수)
 * - `animacy` → `loop` (부속 고리 유무)
 *
 * 두께 배수의 바닥을 높게 잡은 이유: 층 축소와 난수가 곱해지면 실효 두께가
 * 절반으로 줄어 추상어의 덩어리가 얇은 초승달처럼 보인다.
 *
 * 주의: 조형 파라미터가 0인 채널(`cBloomOut`, `cSpeck`)에 자질을 태우면 그
 * 자질은 죽는다 — 확정 룩(`design/look-v3.json`)에서 실제로 그렇게 죽었다.
 * (옛 `outK`는 `cBloomOut * outK`로만 쓰였고, 옛 `speckK`는 반점 획 자체가
 * 그려지지 않아 아무 데도 닿지 않았다.) 새 배수를 추가할 때는 그 배수가
 * 곱해지는 조형 파라미터가 확정 룩에서 0이 아닌지 반드시 확인한다.
 */
export function conceptParams(f: SemanticFeatures): ShapeParams {
  const social = f.agency + f.sociality;
  return {
    thickK: 0.78 + f.concreteness * 0.62,
    spanK: 0.60 + f.sociality * 0.80,
    reachK: 0.70 + f.intensity * 0.50,
    lean: (f.valence - 0.5) * 2.0,
    fringeK: 0.35 + social * 0.60,
    fringeLenK: 1.25 - f.concreteness * 0.55,
    tipK: 0.70 + f.boundedness * 0.60,
    doubleK: 0.40 + f.temporality * 1.20,
    loop: f.animacy >= 0.5,
    harmonic: 2 + Math.round(f.temporality * 6),
  };
}
