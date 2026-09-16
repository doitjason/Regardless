import type { Pt } from './geometry';
import type { Role } from '../core/ir';
import type { LookParams } from './look';

/**
 * 획 하나 — 중심선과 각 점에서의 굵기.
 *
 * 이 자료형이 두 렌더러의 공통 입력이다. SVG 렌더러는 `taperOutline` 으로
 * 닫힌 윤곽을 만들고, 화면 렌더러(계획 III)는 같은 데이터를 삼각형으로
 * 만든다. 그러므로 획 어휘는 SVG 문자열을 만들지 않는다.
 */
export interface Stroke {
  pts: Pt[];
  /** `pts` 와 길이가 같다 */
  widths: number[];
  /** 사람이 읽을 라벨. 분해 보기와 목걸이 검증에 쓴다 */
  label: string;
  /** 이 획을 낳은 역할. 링은 `'ring'` */
  role: Role | 'ring';
}

/** 링을 따라가는 호. `bow` 는 가운데가 바깥으로 부푸는 양. */
export function arcPts(r: number, a0: number, span: number, bow: number, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + span * t;
    const rr = r + bow * Math.sin(Math.PI * t);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

/** 2차 베지어. */
export function bezPts(a: Pt, b: Pt, c: Pt, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u*u*a[0] + 2*u*t*b[0] + t*t*c[0], u*u*a[1] + 2*u*t*b[1] + t*t*c[1]]);
  }
  return pts;
}

/**
 * 반경 `minR` 안쪽으로 들어온 점을 밖으로 밀어낸다.
 *
 * **링 안쪽은 비운다**는 제약을 구조적으로 보장하는 장치다. 각 생성기가
 * 알아서 조심하는 방식으로는 지켜지지 않는다 — 휨이 큰 가시나 깊이가 깊은
 * 덩어리가 실제로 안쪽으로 새어 나갔다. 모든 생성기가 마지막에 이 함수를
 * 거치게 하면 새어 나갈 길이 없다.
 */
export function clampOutside(pts: Pt[], minR: number): Pt[] {
  if (minR <= 0) return pts;
  return pts.map((p) => {
    const r = Math.hypot(p[0], p[1]);
    if (r >= minR) return p;
    // 원점이면 방향이 없으므로 +x 로 민다
    if (r < 1e-12) return [minR, 0] as Pt;
    const k = minR / r;
    return [p[0] * k, p[1] * k] as Pt;
  });
}

/** 획이 도달하는 가장 안쪽 반경 (굵기의 절반을 뺀 값). */
export function strokeMinRadius(s: Stroke): number {
  let m = Infinity;
  for (let i = 0; i < s.pts.length; i++) {
    const p = s.pts[i]!;
    const w = s.widths[i] ?? 0;
    m = Math.min(m, Math.hypot(p[0], p[1]) - w / 2);
  }
  return m;
}

/**
 * 링 바깥 면. 모든 표시가 이 밖에 있어야 한다.
 *
 * `vocab.ts`·`name.ts`·`compose.ts` 세 곳이 각자 이 식을 다시 썼었다 —
 * 링 안쪽을 비운다는 규칙이 이 프로젝트에서 가장 자주 깨진 불변식인데,
 * 세 곳 중 한 곳만 고치면 아무 테스트도 잡지 못하는 모양이었다. 여기
 * 한 곳으로 모은다.
 */
export function ringFloor(look: LookParams): number {
  return look.pR - look.pRingBase;
}

/** 깊이만큼 바깥으로 쌓은 표면. 덩어리·이름 획이 여기서부터 자란다. */
export function bloomSurface(look: LookParams, depth: number): number {
  return look.pR + look.pRingBase * 0.5 + depth * look.cBloomThick * 0.80; // 룩 JSON 후보 (목걸이 룩에서 달라질 값 — 쌓기 계수)
}

/**
 * 점마다 자기 반폭만큼 더 밀어 굵기까지 링 밖에 두는 클램프.
 *
 * 중심선만 `floor` 로 밀면 굵기의 절반만큼 여전히 안쪽으로 번진다
 * (`strokeMinRadius` 는 굵기를 뺀다). 점마다 자기 폭의 절반만큼 더 민다.
 */
export function pushOutside(pts: readonly Pt[], widths: number[], floor: number): Pt[] {
  return pts.map((p, i) => clampOutside([p], floor + (widths[i] ?? 0) / 2)[0]!);
}
