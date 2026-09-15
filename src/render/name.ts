import type { LookParams } from './look';
import type { Pt } from './geometry';
import type { Role, Syllable } from '../core/ir';
import { consonantFeatures, vowelFeatures } from '../core/phonology';
import { widthProfile } from './profile';
import { arcPts, bezPts, clampOutside, type Stroke } from './stroke';

export interface NameCtx {
  angle: number;
  depth: number;
  n: number;
  label: string;
  role: Role;
}

/** 조음 방법 → 획의 형태 가중치 */
const MANNER_SHAPE: Record<string, number> = {
  stop: 0.0, fricative: 0.35, nasal: 0.7, liquid: 1.0, affricate: 0.5, none: 0.15,
};

/**
 * 이름의 음절 나선 (설계 문서 9.2, 9.3).
 *
 * 순서를 각도가 아니라 **반경**에 인코딩한다. 링 둘레에 읽는 방향이
 * 생기지 않으므로 비선형 표기법과 충돌하지 않는다.
 *
 * 원래는 안쪽으로 감겨 들어갔으나, 링 안쪽을 비우기로 했으므로 바깥으로
 * 감아 나간다. 순서를 반경에 담는다는 원리는 그대로다.
 *
 * 음성 자질이 형태를 정한다 — 조음 방법은 획의 휨, 조음 위치는 굵기,
 * 긴장도는 장력, 모음 고저는 길이, 전후설은 감기는 방향, 원순성은 곁가지.
 * 표기가 아니라 소리를 인코딩하므로 "루이즈"와 "Louise"가 같은 그림이 된다.
 */
export function nameStrokes(
  look: LookParams, syllables: Syllable[], ctx: NameCtx, rnd: () => number,
): Stroke[] {
  if (syllables.length === 0) throw new Error('nameStrokes: 음절이 없다');

  const out: Stroke[] = [];
  const { angle, label, role } = ctx;
  const depth = Math.max(0, ctx.depth);
  const J = look.cJitter;
  const floor = look.pR - look.pRingBase;
  const surf = look.pR + look.pRingBase * 0.5 + depth * look.cBloomThick * 0.80;
  const step = look.cBloomThick * 0.95;

  // 중심선만 floor 로 밀면 굵기의 절반만큼 여전히 안쪽으로 번진다
  // (strokeMinRadius 는 굵기를 뺀다). 점마다 자기 반폭만큼 더 민다.
  const push = (pts: readonly Pt[], widths: number[]) => {
    const safe = pts.map((p, i) => clampOutside([p], floor + (widths[i] ?? 0) / 2)[0]!);
    out.push({ pts: safe, widths, label, role });
  };

  syllables.forEach((syl, i) => {
    const c = consonantFeatures(syl.onset);
    const v = vowelFeatures(syl.nucleus);
    const hasCoda = syl.coda !== '';

    // 조음 위치 → 굵기, 긴장도 → 장력
    const thick = look.cBloomThick * (0.55 - i * 0.06)
                * (0.55 + c.place * 0.16) * (1 + c.tense * 0.18);
    // 모음 고저 → 호 길이, 전후설 → 감기는 방향
    const span = look.cBloomSpan * (0.45 + v.height * 0.55) * (1 - i * 0.08);
    const lean = (v.back - 0.5) * 0.6;
    // 조음 방법 → 바깥으로 부푸는 정도
    const bow = look.cBloomThick * (0.12 + (MANNER_SHAPE[c.manner] ?? 0.3) * 0.5);

    const r = surf + i * step;
    const a0 = angle + i * 0.13 + lean * 0.2 - span * 0.5;
    const pts = arcPts(r + thick * 0.44, a0, span, bow, 22);
    push(pts, widthProfile(pts.length, thick, look.pRingBase * 0.5, 'bloom', rnd, J * 0.7));

    // 종성이 있으면 획 끝에 표지를 붙인다.
    // 조음 위치 → 각도·길이·굵기, 조음 방법 → 곁가지가 휘는 정도, 긴장도 → 뿌리 굵기.
    if (hasCoda) {
      const cc = consonantFeatures(syl.coda);
      const e = pts[pts.length - 1]!;
      const ea = Math.atan2(e[1], e[0]) + (cc.place - 2) * 0.18;
      const L = look.cFringeLen * (0.5 + cc.place * 0.12);
      const bend0 = 0.15 + (MANNER_SHAPE[cc.manner] ?? 0.3) * 0.6;
      const tip: Pt = [e[0] + Math.cos(ea) * L, e[1] + Math.sin(ea) * L];
      const mid: Pt = [e[0] + Math.cos(ea + bend0) * L * 0.55, e[1] + Math.sin(ea + bend0) * L * 0.55];
      const cp = bezPts(e, mid, tip, 7);
      const w0 = look.cFringeFine * (1.0 + cc.place * 0.15) * (1 + cc.tense * 0.22);
      push(cp, widthProfile(cp.length, w0, w0 * look.cFringeTip, 'hair', rnd, 0.4));

      // 겹종성이면 두 번째 자음의 표지를 하나 더. 갈과 갉이 구별되어야 한다.
      if (cc.secondManner !== null) {
        const sa = ea - 0.55;
        const L2 = L * 0.7;
        const bend2 = -(0.1 + (MANNER_SHAPE[cc.secondManner] ?? 0.3) * 0.5);
        const tip2: Pt = [e[0] + Math.cos(sa) * L2, e[1] + Math.sin(sa) * L2];
        const mid2: Pt = [e[0] + Math.cos(sa + bend2) * L2 * 0.55, e[1] + Math.sin(sa + bend2) * L2 * 0.55];
        const cp2 = bezPts(e, mid2, tip2, 6);
        const w2 = look.cFringeFine * (0.7 + (cc.secondPlace ?? 2) * 0.12) * (1 + (cc.secondTense ?? 0) * 0.22);
        push(cp2, widthProfile(cp2.length, w2, w2 * look.cFringeTip, 'hair', rnd, 0.4));
      }
    }

    // 원순 모음 → 곁가지
    if (v.round === 1) {
      const m = pts[Math.floor(pts.length * 0.5)]!;
      const ma = Math.atan2(m[1], m[0]) + 0.5;
      const L = look.cFringeLen * 0.55;
      const tip: Pt = [m[0] + Math.cos(ma) * L, m[1] + Math.sin(ma) * L];
      const mid: Pt = [m[0] + Math.cos(ma + 0.3) * L * 0.55, m[1] + Math.sin(ma + 0.3) * L * 0.55];
      const cp = bezPts(m, mid, tip, 6);
      push(cp, widthProfile(cp.length, look.cFringeFine * 0.8, look.cFringeFine * 0.8 * look.cFringeTip, 'hair', rnd, 0.4));
    }
  });

  return out;
}
