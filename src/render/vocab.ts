import type { LookParams } from './look';
import type { ShapeParams } from './mapping';
import type { Role } from '../core/ir';
import type { Pt } from './geometry';
import { widthProfile, smoothJit } from './profile';
import { arcPts, bezPts, clampOutside, type Stroke } from './stroke';

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
      const taper = 0.45 + 0.55 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.12)), 0.30);
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
  const floor = look.pR - look.pRingBase;
  const surf = look.pR + look.pRingBase * 0.5 + depth * look.cBloomThick * 0.80;
  const dk = 1 / (1 + depth * 0.20);

  // 복잡도 예산 — 개념이 많으면 각자 몫이 줄어든 총량이 대체로 일정하다
  const bud = Math.pow(Math.max(1, ctx.n), -look.cBudget);

  const span0 = look.cBloomSpan * sp.spanK;
  const st0 = angle - span0 * 0.5;

  // 중심선만 floor 로 밀면 굵기의 절반만큼 여전히 안쪽으로 번진다
  // (strokeMinRadius 는 굵기를 뺀다). 점마다 자기 반폭만큼 더 민다.
  const push = (pts: readonly Pt[], widths: number[], lbl: string) => {
    const safe = pts.map((p, i) => clampOutside([p], floor + (widths[i] ?? 0) / 2)[0]!);
    out.push({ pts: safe, widths, label: lbl, role });
  };

  // ── 덩어리 층 ──
  const layers = Math.max(1, Math.round(look.cLayers));
  for (let k = 0; k < layers; k++) {
    const sk = (1 - k * 0.24) * dk;
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
  const hair = (a: number, rootR: number, len: number, wide: number, spread: number) => {
    const at: Pt = [Math.cos(a) * rootR, Math.sin(a) * rootR];
    // 정서가 — 가시가 쏠리는 방향(dir)과 휘는 방향(b)을 sp.lean 쪽으로 민다.
    // 클램프로 바깥 반평면 안에 묶는다 — 안 그러면 링 클램프가 가시를 눌러
    // 납작하게 만든다.
    const S = Math.min(spread, 2.6);
    const dir = a + Math.max(-1.5, Math.min(1.5, (rnd() - 0.5) * S + sp.lean * S * 0.22));
    const L = len * (0.6 + rnd() * 0.8);
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
         fLen, look.cFringeFine, look.cFringeSpan);
  }

  // 긴 가시 — 몇 개만 길게 뻗는 더듬이. 강도가 도달 거리를 정한다.
  const wCount = Math.max(0, Math.round(look.cWhisker * sp.fringeK * bud));
  for (let i = 0; i < wCount; i++) {
    hair(st0 + span0 * rnd(),
         surf + look.cBloomThick * 0.4,
         look.cWhiskerLen * dk * sp.reachK, look.cFringeFine * 1.25, look.cFringeSpan * 1.2);
  }

  // ── 작은 닫힌 고리 — 생물성 ──
  if (sp.loop) {
    const la = st0 + span0 * (0.15 + rnd() * 0.7);
    const rr = 0.020 * dk;
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
