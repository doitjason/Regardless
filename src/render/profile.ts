export type ProfileKind = 'blade' | 'lens' | 'bloom' | 'spike' | 'hair' | 'flat';

const TAU = Math.PI * 2;

/**
 * 획을 따라 부드럽게 변하는 떨림.
 *
 * 점마다 독립 난수를 쓰면 고주파가 되어 획이 구슬처럼 울퉁불퉁해진다.
 * 붓의 떨림은 저주파이므로 낮은 주파수의 정현파 몇 개를 합친다.
 */
export function smoothJit(rnd: () => number, amp: number): (t: number) => number {
  const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU] as const;
  const fq = [1.3 + rnd() * 1.4, 3.1 + rnd() * 2.2, 6.5 + rnd() * 3.5] as const;
  return (t) => 1 + amp * (
      0.58 * Math.sin(t * fq[0] * TAU + ph[0])
    + 0.28 * Math.sin(t * fq[1] * TAU + ph[1])
    + 0.14 * Math.sin(t * fq[2] * TAU + ph[2]));
}

/**
 * 중심선 위 n개 점에서의 굵기.
 *
 * - `blade` 뿌리가 두껍고 급격히 얇아지는 쐐기
 * - `lens`  가운데가 두꺼운 렌즈
 * - `bloom` 렌즈보다 더 오래 두꺼움을 유지하는 덩어리
 * - `spike` 빠르게 뾰족해지는 가시
 * - `hair`  가시. **끝이 바늘처럼 뾰족해지지 않는다** — 지수를 완만하게 두고
 *           `w1`을 뿌리 대비 비율로 받아 끝을 뭉툭하게 남긴다
 * - `flat`  w0 에서 w1 로 곧게
 */
export function widthProfile(
  n: number, w0: number, w1: number, kind: ProfileKind, rnd: () => number, jit: number,
): number[] {
  const out: number[] = [];
  const j = smoothJit(rnd, 0.42 * jit);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    let v: number;
    if (kind === 'blade')      v = w0 * Math.pow(1 - t, 1.35) * (1 + 0.55 * Math.sin(Math.PI * t)) + w1;
    else if (kind === 'lens')  v = w0 * Math.pow(Math.sin(Math.PI * t), 0.62) + w1;
    else if (kind === 'bloom') v = w0 * Math.pow(Math.sin(Math.PI * t), 0.38) + w1;
    else if (kind === 'spike') v = w0 * Math.pow(1 - t, 2.2) + w1;
    else if (kind === 'hair')  v = w0 * Math.pow(1 - t, 1.35) + w1;
    else if (kind === 'flat')  v = w0 * (1 - t) + w1 * t;
    else {
      // ProfileKind 에 새 종류를 추가하고 여기 분기를 빠뜨리면 컴파일이 실패한다.
      // 빠뜨린 종류가 조용히 flat 으로 그려지는 것을 막는다.
      const unreachable: never = kind;
      throw new Error(`widthProfile: 알 수 없는 kind "${String(unreachable)}"`);
    }
    // 하한은 폭이 0 이하가 되는 것만 막는다. 눈에 보이는 최소 굵기를 강제하는
    // 곳이 아니다 — 물리적 최소 선폭은 목걸이 내보내기가 따로 건다.
    // 하한을 크게 잡으면 호출자가 hair 에 준 끝 굵기(w1)를 덮어 뭉툭한 끝의
    // 비율이 깨진다.
    out.push(Math.max(1e-6, v * j(t)));
  }
  return out;
}
