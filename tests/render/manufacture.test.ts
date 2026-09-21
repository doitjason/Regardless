import { describe, it, expect } from 'vitest';
import {
  rasterize, checkManufacturable, cleanForManufacture, checkManufacturableShape as reportOfCleaned,
  type MillOptions,
} from '../../src/render/manufacture';
import type { Stroke } from '../../src/render/stroke';
import { arcPts } from '../../src/render/stroke';
import type { Pt } from '../../src/render/geometry';

const OPTS: MillOptions = { diameterMm: 20, minStrokeMm: 0.5, minGapMm: 0.5, pxPerMm: 20 };

/** p 공간 반경 r 의 닫힌 원 획 하나. 굵기는 mm 단위를 p 로 환산해 받는다. */
const ring = (r: number, widthMm: number, opts = OPTS): Stroke => {
  const pts = arcPts(r, 0, Math.PI * 2, 0, 200);
  const wp = (widthMm / opts.diameterMm) * 2 * 0.9; // mm → p (지름 20mm 가 p 1.8)
  return { pts, widths: pts.map(() => wp), label: 'ring', role: 'ring' };
};

describe('rasterize', () => {
  it('격자 크기가 지름과 해상도에서 나온다', () => {
    const { n } = rasterize([ring(0.5, 1)], OPTS);
    expect(n).toBe(Math.round(OPTS.diameterMm * OPTS.pxPerMm));
  });

  it('획이 있으면 잉크 화소가 있고, 없으면 없다', () => {
    const { grid } = rasterize([ring(0.5, 1)], OPTS);
    expect(grid.some((v) => v === 1)).toBe(true);
    expect(rasterize([], OPTS).grid.every((v) => v === 0)).toBe(true);
  });
});

describe('checkManufacturable', () => {
  it('충분히 굵은 링 하나는 통과한다', () => {
    const rep = checkManufacturable([ring(0.5, 1.2)], OPTS);
    expect(rep.violations, rep.violations.join(' / ')).toHaveLength(0);
    expect(rep.components).toBe(1);
  });

  it('하한보다 가는 링은 선폭 위반으로 잡는다', () => {
    const rep = checkManufacturable([ring(0.5, 0.2)], OPTS);
    expect(rep.thinPx).toBeGreaterThan(0);
    expect(rep.violations.join(' ')).toMatch(/선폭/);
  });

  it('떨어진 두 조각은 연결 위반으로 잡는다', () => {
    const rep = checkManufacturable([ring(0.30, 1.2), ring(0.75, 1.2)], OPTS);
    expect(rep.components).toBe(2);
    expect(rep.violations.join(' ')).toMatch(/조각|연결/);
  });

  it('하한보다 좁은 틈은 틈 위반으로 잡는다', () => {
    // 0.5mm 는 p 로 0.045. 두 링 사이 간격이 그보다 뚜렷이 좁도록 놓는다.
    // (반지름 0.65 는 실제 간격이 약 0.47mm 로 0.5mm 문턱에 거의 붙어 있어
    // 틈 판정의 반 화소 래스터화 여유(I1)에 그대로 들어가버린다 — 경계에
    // 붙은 값 대신 여유를 두어 확실한 위반을 시험한다.)
    const rep = checkManufacturable([ring(0.50, 1.2), ring(0.63, 1.2)], OPTS);
    expect(rep.narrowGapPx).toBeGreaterThan(0);
    expect(rep.violations.join(' ')).toMatch(/틈/);
  });

  it('너무 작은 구멍은 구멍 위반으로 잡는다', () => {
    const rep = checkManufacturable([ring(0.06, 1.2)], OPTS);
    expect(rep.smallHoles.length).toBeGreaterThan(0);
    expect(rep.violations.join(' ')).toMatch(/구멍/);
  });

  it('결정적이다', () => {
    const a = checkManufacturable([ring(0.5, 1.2)], OPTS);
    const b = checkManufacturable([ring(0.5, 1.2)], OPTS);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('굽은 획의 실제 윤곽에서 생기는 얇은 살을 잡는다', () => {
    // 예각으로 꺾인 획. 중심선에 원판을 찍으면 두껍게 보이지만,
    // 실제로 잘리는 윤곽선은 안쪽에서 살이 얇아진다.
    const a = 40 * Math.PI / 180;
    const arm = 0.35;
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) pts.push([-arm + (arm * i) / 10, 0]);
    for (let i = 1; i <= 10; i++) pts.push([Math.cos(Math.PI - a) * (arm * i) / 10, Math.sin(Math.PI - a) * (arm * i) / 10]);
    const wp = (0.7 / OPTS.diameterMm) * 2 * 0.9;
    const v: Stroke = { pts, widths: pts.map(() => wp), label: 'v', role: 'ring' };
    expect(checkManufacturable([v], OPTS).thinPx).toBeGreaterThan(0);
  });

  it('해상도를 바꿔도 판정이 같다', () => {
    const cases: Stroke[][] = [[ring(0.5, 1.2)], [ring(0.5, 0.2)], [ring(0.30, 1.2), ring(0.75, 1.2)]];
    for (const strokes of cases) {
      const lo = checkManufacturable(strokes, { ...OPTS, pxPerMm: 20 });
      const hi = checkManufacturable(strokes, { ...OPTS, pxPerMm: 40 });
      expect(lo.violations.length > 0, JSON.stringify(lo.violations)).toBe(hi.violations.length > 0);
      expect(lo.components).toBe(hi.components);
    }
  });

  it('하한을 볼 수 없는 해상도는 던진다', () => {
    expect(() => checkManufacturable([ring(0.5, 1.2)], { ...OPTS, pxPerMm: 10 })).toThrow(/pxPerMm/);
  });

  it('길고 얇은 구멍을 넓이가 아니라 폭으로 잰다', () => {
    // 넓이는 크지만 폭이 0.5mm 미만인 슬릿. 넓이 환산 지름으로는 통과한다.
    // 원안의 수치(두께 0.06, 중심선 간격 0.04)는 위아래 변의 두께가 서로
    // 겹쳐 구멍 자체가 생기지 않았다 — 두께를 1mm 상당(0.09, 선폭 하한을
    // 넉넉히 넘겨 자체로는 위반이 안 되는 값)으로, 중심선 간격을 0.108
    // (틈 0.018 ≈ 0.2mm)로 다시 잡아 실제로 좁고 긴 구멍이 남게 했다.
    const t = 0.09;
    const cy = 0.054;
    const half = 0.5;
    const slit: Stroke[] = [
      { pts: [[-half, cy], [half, cy]], widths: [t, t], label: 'a', role: 'ring' },
      { pts: [[-half, -cy], [half, -cy]], widths: [t, t], label: 'b', role: 'ring' },
      { pts: [[-half, cy], [-half, -cy]], widths: [t, t], label: 'c', role: 'ring' },
      { pts: [[half, cy], [half, -cy]], widths: [t, t], label: 'd', role: 'ring' },
    ];
    const rep = checkManufacturable(slit, OPTS);
    expect(rep.smallHoles.length, JSON.stringify(rep)).toBeGreaterThan(0);
  });
});

describe('cleanForManufacture', () => {
  it('정리한 모양은 자기 검사를 통과한다', () => {
    const strokes = [ring(0.5, 1.2), ring(0.62, 0.15)];   // 둘째 링은 하한보다 가늘다
    const cleaned = cleanForManufacture(strokes, OPTS);
    expect(cleaned.rings.length).toBeGreaterThan(0);
    // 정리한 폴리곤을 다시 검사하면 위반이 없어야 한다
    expect(reportOfCleaned(cleaned, OPTS).violations).toHaveLength(0);
  });

  it('하한보다 가는 부분은 잘려 나간다', () => {
    const thin = cleanForManufacture([ring(0.5, 1.2), ring(0.75, 0.1)], OPTS);
    const far = thin.rings.flatMap((r) => r.pts).map((p) => Math.hypot(p[0], p[1]));
    expect(Math.max(...far)).toBeLessThan(0.70);   // 가는 바깥 링이 사라졌다
  });

  it('결정적이다', () => {
    const a = cleanForManufacture([ring(0.5, 1.2)], OPTS);
    const b = cleanForManufacture([ring(0.5, 1.2)], OPTS);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('링 안쪽 구멍은 살아남는다 — 메우면 안 된다', () => {
    const cleaned = cleanForManufacture([ring(0.5, 1.2)], OPTS);
    expect(cleaned.rings.some((r) => r.hole)).toBe(true);
  });
});
