import { describe, it, expect } from 'vitest';
import { nameStrokes } from '../../src/render/name';
import { loadLook } from '../../src/render/look';
import { syllabify } from '../../src/core/phonology';
import { strokeMinRadius } from '../../src/render/stroke';
import { mulberry32 } from '../../src/core/hash';

const look = loadLook();
const r = () => mulberry32(23);
const ctx = (o = {}) => ({ angle: 0.7, depth: 0, n: 1, label: '루이즈', role: '대상' as const, ...o });

describe('nameStrokes', () => {
  it('음절마다 획을 낸다', () => {
    const one = nameStrokes(look, syllabify('루'), ctx(), r()).length;
    const three = nameStrokes(look, syllabify('루이즈'), ctx(), r()).length;
    expect(three).toBeGreaterThan(one);
  });

  it('순서를 반경에 인코딩한다 — 뒤 음절이 바깥이다', () => {
    const s = nameStrokes(look, syllabify('루이즈'), ctx(), r());
    const radOf = (i: number) => Math.hypot(s[i]!.pts[0]![0], s[i]!.pts[0]![1]);
    expect(radOf(s.length - 1)).toBeGreaterThan(radOf(0));
  });

  it('링 안쪽으로 넘어오지 않는다', () => {
    const floor = look.pR - look.pRingBase;
    for (const depth of [0, 2, 5]) {
      for (const s of nameStrokes(look, syllabify('루이즈'), ctx({ depth }), r())) {
        expect(strokeMinRadius(s)).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('순서가 다른 이름은 다른 결과를 낸다 — 정호와 호정', () => {
    const a = JSON.stringify(nameStrokes(look, syllabify('정호'), ctx(), r()));
    const b = JSON.stringify(nameStrokes(look, syllabify('호정'), ctx(), r()));
    expect(a).not.toBe(b);
  });

  it('종성이 다르면 다른 결과를 낸다 — 갈과 갉', () => {
    // 겹종성이 단자음과 같은 자질을 받으면 이 검사가 깨진다 (스펙 9.3.1)
    const a = JSON.stringify(nameStrokes(look, syllabify('갈'), ctx(), r()));
    const b = JSON.stringify(nameStrokes(look, syllabify('갉'), ctx(), r()));
    expect(a).not.toBe(b);
  });

  it('조음 방법이 다르면 다른 결과를 낸다 — 루와 누', () => {
    const a = JSON.stringify(nameStrokes(look, syllabify('루'), ctx(), r()));
    const b = JSON.stringify(nameStrokes(look, syllabify('누'), ctx(), r()));
    expect(a).not.toBe(b);
  });

  it('모음이 다르면 다른 결과를 낸다 — 가와 기', () => {
    const a = JSON.stringify(nameStrokes(look, syllabify('가'), ctx(), r()));
    const b = JSON.stringify(nameStrokes(look, syllabify('기'), ctx(), r()));
    expect(a).not.toBe(b);
  });

  it('모든 획이 이름 라벨과 역할을 갖는다', () => {
    for (const s of nameStrokes(look, syllabify('루이즈'), ctx(), r())) {
      expect(s.label).toBe('루이즈');
      expect(s.role).toBe('대상');
    }
  });

  it('중심선과 굵기 배열의 길이가 같다', () => {
    for (const s of nameStrokes(look, syllabify('루이즈'), ctx(), r())) {
      expect(s.widths).toHaveLength(s.pts.length);
    }
  });

  it('음절이 없으면 던진다', () => {
    expect(() => nameStrokes(look, [], ctx(), r())).toThrow();
  });

  it('결정적이다', () => {
    expect(nameStrokes(look, syllabify('루이즈'), ctx(), r()))
      .toEqual(nameStrokes(look, syllabify('루이즈'), ctx(), r()));
  });
});
