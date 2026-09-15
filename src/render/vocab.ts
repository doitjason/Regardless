import type { LookParams } from './look';
import { widthProfile, smoothJit } from './profile';
import { arcPts, type Stroke } from './stroke';

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
