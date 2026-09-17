import type { LookParams } from './look';
import type { ShapeParams } from './mapping';
import type { Role, Mood } from '../core/ir';
import type { Pt } from './geometry';
import { widthProfile, smoothJit } from './profile';
import { arcPts, bezPts, ringFloor, bloomSurface, pushOutside, type Stroke } from './stroke';
import { ROLE_SLOT, slotAngle } from './layout';

/**
 * 링 — 로고그램의 뼈대인 원 하나.
 *
 * 끊김을 넣어 여러 호로 나누고, 같은 자리를 한 번 더 지나간 겹선을 더한다.
 * 겹선은 **바깥에만** 둔다 — 링 안쪽을 비우는 방침 때문이다.
 *
 * 굵기는 완만하게만 변한다. 양 끝이 살짝 가늘어져 붓이 떨어진 느낌을 낸다.
 */
export function ringStrokes(look: LookParams, rnd: () => number): Stroke[] {
  const out: Stroke[] = [];
  const R = look.pR;
  const J = look.cJitter;
  const gaps = Math.max(0, Math.round(look.cGaps));
  const segs = gaps + 1;
  const gapEach = gaps > 0 ? (look.cGapSize * Math.PI * 2) / gaps : 0;
  const segSpan = (Math.PI * 2 - gapEach * gaps) / segs;

  let a = rnd() * Math.PI * 2;
  for (let s = 0; s < segs; s++) {
    const n = Math.max(24, Math.round(segSpan * 46));
    const pts = arcPts(R, a, segSpan, (rnd() - 0.5) * look.pWobble * 1.6, n);
    const j = smoothJit(rnd, 0.55 * J);
    const widths: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      // 끝을 가늘게 빼는 것은 **끊긴 끝**의 붓 자국이다. 틈이 없으면 링은
      // 닫힌 고리이고 양 끝은 서로 맞닿는 이음매이므로, 가늘게 빼면 그 자리에
      // 홈이 생긴다 — 투각에서는 이 홈이 하한 미만의 살이 된다.
      const taper = gaps === 0
        ? 1
        : 0.45 + 0.55 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.12)), 0.30);
      widths.push(Math.max(0.0018, (look.pRingBase + look.pRingAmp * (j(t) - 1) * 1.8) * taper * j(t)));
    }
    out.push({ pts, widths, label: '링', role: 'ring' });
    a += segSpan + gapEach;
  }

  const doubles = Math.max(0, Math.round(look.cDouble));
  for (let i = 0; i < doubles; i++) {
    const span = 0.5 + rnd() * 2.4;
    const st = rnd() * Math.PI * 2;
    const off = look.cDoubleGap * (0.7 + rnd() * 0.8);
    const n = Math.max(18, Math.round(span * 34));
    const pts = arcPts(R + off, st, span, (rnd() - 0.5) * 0.012 * J, n);
    const widths = widthProfile(
      pts.length, look.pRingBase * (0.30 + rnd() * 0.45), 0.0005, 'lens', rnd, J);
    out.push({ pts, widths, label: '링 겹선', role: 'ring' });
  }

  return out;
}

export interface BloomCtx {
  /** 덩어리 중심 각도 */
  angle: number;
  /** 같은 자리에 겹쳐 쌓는 깊이. **바깥으로** 쌓인다 */
  depth: number;
  /** 로고그램 전체의 성분 수. 복잡도 예산의 분모 */
  n: number;
  label: string;
  role: Role;
}

/**
 * 먹물 덩어리 — 링을 따라 부풀어오른 짙은 질량과 거기 돋은 가시.
 *
 * 확정 조형에서 **가시가 주역이다.** 덩어리는 작고 좁으며 부풀지 않고
 * (`cBloomOut` 0), 존재감은 가시가 만든다. 흩어진 반점은 쓰지 않는다
 * (`cSpeck` 0) — 참고 이미지의 튄 자국은 채택하지 않았다.
 *
 * 깊이는 **바깥으로** 쌓는다. 안쪽으로 쌓으면 개념이 많을 때 반경이 0을
 * 지나 음수가 되어 원 안이 표시로 가득 찬다. 실제로 그렇게 됐다.
 *
 * 자질이 기하에 닿는 자리 (설계 문서 8.4):
 * - `valence`(`sp.lean`) → `hair`의 방향과 휨 — 가시가 한쪽으로 쏠리고 휜다.
 * - `intensity`(`sp.reachK`) → 긴 가시(더듬이)의 도달 거리.
 * - `boundedness`(`sp.tipK`) → `hair`의 끝 굵기 — 한정어는 뭉툭하게 뭉치고
 *   비한정어는 가늘게 페이드한다.
 * - `temporality`(`sp.harmonic`) → 덩어리 층의 굵기 물결 주파수.
 * - `agency`·`sociality`(`sp.fringeK`) → 가시 개수. `concreteness`
 *   (`sp.thickK`, `sp.fringeLenK`) → 덩어리 두께·가시 길이. `animacy`
 *   (`sp.loop`) → 부속 고리.
 */
export function bloomStrokes(
  look: LookParams, sp: ShapeParams, ctx: BloomCtx, rnd: () => number,
): Stroke[] {
  const out: Stroke[] = [];
  const J = look.cJitter;
  const { angle, label, role } = ctx;
  const depth = Math.max(0, ctx.depth);

  // 링 바깥 면. 모든 표시가 이 선 밖에만 존재한다.
  const floor = ringFloor(look);
  const surf = bloomSurface(look, depth);
  const dk = 1 / (1 + depth * 0.20); // 룩 JSON 후보 (목걸이 룩에서 달라질 값 — 깊이 축소)

  // 복잡도 예산 — 개념이 많으면 각자 몫이 줄어든 총량이 대체로 일정하다
  const bud = Math.pow(Math.max(1, ctx.n), -look.cBudget);

  const span0 = look.cBloomSpan * sp.spanK;
  const st0 = angle - span0 * 0.5;

  const push = (pts: readonly Pt[], widths: number[], lbl: string) => {
    out.push({ pts: pushOutside(pts, widths, floor), widths, label: lbl, role });
  };

  // ── 덩어리 층 ──
  const layers = Math.max(1, Math.round(look.cLayers));
  for (let k = 0; k < layers; k++) {
    const sk = (1 - k * 0.24) * dk; // 룩 JSON 후보 (목걸이 룩에서 달라질 값 — 층 축소)
    const span = span0 * (0.70 + rnd() * 0.55) * sk;
    const st = st0 + (rnd() - 0.5) * span0 * 0.30 * J;
    const thick = look.cBloomThick * sp.thickK * sk * (0.7 + rnd() * 0.5);
    const bow = look.cBloomThick * look.cBloomOut * (0.3 + rnd() * 0.6);
    const n = Math.max(16, Math.round(span * 44));
    const pts = arcPts(surf + thick * 0.44, st, span, bow, n);
    const widths = widthProfile(pts.length, thick, look.pRingBase * 0.5, 'bloom', rnd, J * 0.7);
    if (rnd() < 0.5) widths.reverse();
    // 시간성 — 덩어리 굵기 물결의 주파수. 층마다 sp.harmonic 번 오르내린다.
    for (let i = 0; i < widths.length; i++) {
      const tmod = widths.length === 1 ? 0 : i / (widths.length - 1);
      widths[i] = Math.max(1e-6, widths[i]! * (1 + 0.16 * Math.sin(sp.harmonic * Math.PI * tmod)));
    }
    push(pts, widths, label);
  }

  // ── 가시 ──
  // 덩어리의 호 전체에 걸쳐 고르게 돋는다. 한 각도에서만 나면 붓 하나가
  // 튄 것처럼 보인다. 방향은 반경 방향에서 ±(퍼짐/2) 안이므로 항상 바깥이다.
  //
  // 이 함수는 spikes/look-lab.html 의 fringe() 를 그대로 옮긴 것이다 — 룩 랩이
  // 사람이 눈으로 맞추고 확정한 기준 구현이고, 이 함수는 그 결과를 재현할
  // 뿐이다. 랩의 fringe() 가 하는 일을 한 함수로 합쳤다: (1) 호출부에서
  // 정하는 방향 퍼짐(S 항, sp.lean 으로 한쪽을 민다), (2) fringe() 안에서
  // 그 방향에 한 번 더 얹는 잔지터((rnd()-0.5)*0.5), (3) 호출부 길이 배율 ×
  // fringe() 안쪽 길이 배율(두 번 흩는다), (4) 휨, (5) 폭 프로파일. 랩과
  // 난수를 뽑는 순서를 맞춰 두었다 — 랩이 바뀌면 이 함수도 같이 바뀌어야 한다.
  const hair = (
    a: number, rootR: number, len: number, wide: number, spread: number,
    lenBase: number, lenRange: number,
  ) => {
    const at: Pt = [Math.cos(a) * rootR, Math.sin(a) * rootR];
    // 정서가 — 가시가 쏠리는 방향(dir)과 휘는 방향(b)을 sp.lean 쪽으로 민다.
    // 클램프로 바깥 반평면 안에 묶는다 — 안 그러면 링 클램프가 가시를 눌러
    // 납작하게 만든다. 룩 랩은 이 클램프를 호출부 항에만 걸지만, 엔진은
    // fringe() 가 한 번 더 얹는 잔지터까지 합친 "합성 방향 오프셋"에 건다.
    const S = Math.min(spread, 2.6);
    const callOffset = (rnd() - 0.5) * S + sp.lean * S * 0.22;
    const extraJitter = (rnd() - 0.5) * 0.5;
    const dir = a + Math.max(-1.5, Math.min(1.5, callOffset + extraJitter));
    // 길이 — 랩처럼 두 번 흩는다: 호출부 배율(lenBase..lenBase+lenRange) 다음
    // fringe() 안쪽 배율(0.6..1.4). 평균은 한 번 흩는 것과 같지만 분산이 랩과 같아진다.
    const L = len * (lenBase + rnd() * lenRange) * (0.6 + rnd() * 0.8);
    const b = (rnd() - 0.5) * look.cFringeBend + sp.lean * look.cFringeBend * 0.35;
    const tip: Pt = [at[0] + Math.cos(dir) * L, at[1] + Math.sin(dir) * L];
    const mid: Pt = [at[0] + Math.cos(dir + b) * L * 0.55, at[1] + Math.sin(dir + b) * L * 0.55];
    const pts = bezPts(at, mid, tip, 7);
    const root = wide * (0.7 + rnd() * 0.8);
    // 한정성 — 가시 끝 굵기. 한정어는 뭉툭하게 뭉치고 비한정어는 가늘게 페이드한다.
    const tipW = root * Math.min(0.95, look.cFringeTip * sp.tipK);
    push(pts, widthProfile(pts.length, root, tipW, 'hair', rnd, 0.4), label);
  };

  const fCount = Math.max(0, Math.round(look.cFringe * sp.fringeK * bud * dk));
  const fLen = look.cFringeLen * sp.fringeLenK * dk;
  for (let i = 0; i < fCount; i++) {
    const t = Math.min(1, Math.max(0, (i + 0.5) / fCount + (rnd() - 0.5) / fCount));
    hair(st0 + span0 * t,
         surf + look.cBloomThick * (0.25 + rnd() * 0.55),
         fLen, look.cFringeFine, look.cFringeSpan, 0.55, 0.9);
  }

  // 긴 가시 — 몇 개만 길게 뻗는 더듬이. 강도가 도달 거리를 정한다.
  const wCount = Math.max(0, Math.round(look.cWhisker * sp.fringeK * bud));
  for (let i = 0; i < wCount; i++) {
    hair(st0 + span0 * rnd(),
         surf + look.cBloomThick * 0.4,
         look.cWhiskerLen * dk * sp.reachK, look.cFringeFine * 1.25, look.cFringeSpan * 1.2, 0.6, 0.7);
  }

  // ── 작은 닫힌 고리 — 생물성 ──
  if (sp.loop) {
    const la = st0 + span0 * (0.15 + rnd() * 0.7);
    const rr = 0.020 * dk; // 룩 JSON 후보 (목걸이 룩에서 달라질 값 — 고리 반경)
    const lr = surf + look.cBloomThick * 0.9 + rr;
    const c0: Pt = [Math.cos(la) * lr, Math.sin(la) * lr];
    const ring = arcPts(rr, 0, Math.PI * 2, 0, 18).map((q) => [q[0] + c0[0], q[1] + c0[1]] as Pt);
    push(ring, widthProfile(ring.length, look.pRingBase * 0.8, look.pRingBase * 0.8, 'flat', rnd, J), label);
  }

  // ── 겹선 — 덩어리 옆을 따라 한 번 더. 바깥쪽으로만 ──
  const dN = Math.max(0, Math.round(look.cDouble * sp.doubleK * bud));
  for (let i = 0; i < dN; i++) {
    const span = span0 * (0.7 + rnd() * 0.9);
    const st = st0 - span * 0.15;
    const off = look.cDoubleGap * (0.8 + rnd());
    const n = Math.max(14, Math.round(span * 34));
    const pts = arcPts(surf + off, st, span, 0, n);
    push(pts, widthProfile(pts.length, look.pRingBase * 0.55, 0.0004, 'lens', rnd, J), label);
  }

  return out;
}

/**
 * 문장 종류 표지 (설계 문서 6.2, 2.3 원작 규칙).
 *
 * `mood` 는 문장 수준 속성이고 6시 양상 슬롯이 그것이 그려지는 자리다.
 * 평서문은 표지가 없다 — 표지가 없다는 것 자체가 평서문의 표시다.
 *
 * 세 표지는 형태로 구별된다:
 * - 의문: 링을 따라간 뒤 끝이 바깥으로 말리는 **갈고리**. 원작 규칙이다.
 * - 부정: 링 바깥 면에 수직으로 얹힌 **짧고 굵은 막대**. 흐름을 끊는 모양이다.
 * - 의지: 바깥으로 벌어지는 **두 갈래**. 아직 일어나지 않은 방향을 가리킨다.
 */
export function moodStrokes(look: LookParams, mood: Mood, rnd: () => number): Stroke[] {
  if (mood === 'declarative') return [];

  const out: Stroke[] = [];
  const floor = ringFloor(look);
  const surf = bloomSurface(look, 0);
  const base = slotAngle(ROLE_SLOT['양상'], 0);
  const L = look.cMoodLen;
  const W = look.cMoodThick;
  const J = look.cJitter;

  const push = (pts: readonly Pt[], widths: number[]) => {
    out.push({ pts: pushOutside(pts, widths, floor), widths, label: mood, role: '양상' });
  };

  if (mood === 'interrogative') {
    // 링을 따라 짧은 호를 그리고, 그 끝에서 바깥으로 말아 올린다
    const span = L * 1.6;
    const arc = arcPts(surf + W * 0.5, base - span * 0.5, span, W * 0.4, 20);
    push(arc, widthProfile(arc.length, W, W * 0.45, 'bloom', rnd, J * 0.5));

    const e = arc[arc.length - 1]!;
    const ea = Math.atan2(e[1], e[0]);
    const tip: Pt = [e[0] + Math.cos(ea + 0.9) * L, e[1] + Math.sin(ea + 0.9) * L];
    const mid: Pt = [e[0] + Math.cos(ea + 0.2) * L * 0.7, e[1] + Math.sin(ea + 0.2) * L * 0.7];
    const hook = bezPts(e, mid, tip, 10);
    push(hook, widthProfile(hook.length, W * 0.8, W * 0.8 * look.cFringeTip, 'hair', rnd, 0.4));
    return out;
  }

  if (mood === 'negative') {
    // 링 바깥 면을 가로지르는 굵은 막대 하나. 반경 방향이다.
    const r0 = surf, r1 = surf + L;
    const bar: Pt[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n, rr = r0 + (r1 - r0) * t;
      bar.push([Math.cos(base) * rr, Math.sin(base) * rr]);
    }
    push(bar, widthProfile(bar.length, W * 1.5, W * 1.5, 'flat', rnd, J * 0.4));
    return out;
  }

  // volitional — 바깥으로 벌어지는 두 갈래
  for (const side of [-1, 1] as const) {
    const a0 = base + side * 0.10;
    const root: Pt = [Math.cos(a0) * surf, Math.sin(a0) * surf];
    const dir = a0 + side * 0.45;
    const tip: Pt = [root[0] + Math.cos(dir) * L * 1.3, root[1] + Math.sin(dir) * L * 1.3];
    const mid: Pt = [
      root[0] + Math.cos(dir - side * 0.25) * L * 0.7,
      root[1] + Math.sin(dir - side * 0.25) * L * 0.7,
    ];
    const pts = bezPts(root, mid, tip, 10);
    push(pts, widthProfile(pts.length, W * 1.1, W * 1.1 * look.cFringeTip, 'hair', rnd, 0.4));
  }
  return out;
}
