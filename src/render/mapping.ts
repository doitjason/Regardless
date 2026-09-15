import type { SemanticFeatures } from '../core/lexicon';

/** 개념 하나의 조형 배수. 조형 파라미터(look)에 곱해진다. */
export interface ShapeParams {
  /** 덩어리 두께 배수 */ thickK: number;
  /** 덩어리 호 폭 배수 */ spanK: number;
  /** 바깥으로 치우치는 정도 배수 */ outK: number;
  /** 감기는 방향. -1..1 */ lean: number;
  /** 가시 개수 배수 */ fringeK: number;
  /** 가시 길이 배수 */ fringeLenK: number;
  /** 흩어진 반점 배수 */ speckK: number;
  /** 겹선 배수 */ doubleK: number;
  /** 부속 고리 유무 */ loop: boolean;
  /** 링 굵기 변화 주파수 (정수) */ harmonic: number;
}

/**
 * 의미 자질 → 조형 배수 (설계 문서 8.4, 9.5.1b).
 *
 * 원칙 2를 지키려면 8개 자질이 모두 어딘가에 도달해야 한다. 어느 자질이
 * 쓰이지 않으면 그 의미 차이가 형태에 나타나지 않는다.
 * `tests/render/mapping.test.ts` 가 자질별로 이를 검증한다.
 *
 * 두께 배수의 바닥을 높게 잡은 이유: 층 축소와 난수가 곱해지면 실효 두께가
 * 절반으로 줄어 추상어의 덩어리가 얇은 초승달처럼 보인다.
 */
export function conceptParams(f: SemanticFeatures): ShapeParams {
  const social = f.agency + f.sociality;
  return {
    thickK: 0.78 + f.concreteness * 0.62,
    spanK: 0.60 + f.sociality * 0.80,
    outK: 0.45 + f.intensity * 1.05,
    lean: (f.valence - 0.5) * 2.0,
    fringeK: 0.35 + social * 0.60,
    fringeLenK: 1.25 - f.concreteness * 0.55,
    speckK: 0.35 + (1 - f.boundedness) * 1.20,
    doubleK: 0.40 + f.temporality * 1.20,
    loop: f.animacy >= 0.5,
    harmonic: 2 + Math.round(f.temporality * 6),
  };
}
