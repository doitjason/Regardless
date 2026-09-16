import { describe, it, expect } from 'vitest';
import { render, scaleFor, type RenderResult } from '../../src/render/compose';
import { loadLook } from '../../src/render/look';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { syllabify } from '../../src/core/phonology';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const look = loadLook();
const lex = loadSeedLexicon();
const ir = (cs: Constituent[], mood: IR['mood'] = 'declarative'): IR =>
  ({ constituents: cs, mood, engineVersion: ENGINE_VERSION });
const C = (lemma: string, role: Constituent['role']): Constituent =>
  ({ kind: 'concept', lemma, role });

const LOVE = C('사랑','행위'), ME_S = C('나','주체'), YOU_O = C('너','대상');
const YOU_S = C('너','주체'), ME_O = C('나','대상');

describe('원칙 1 — 결정성', () => {
  it('같은 IR을 두 번 렌더하면 완전히 같은 SVG가 나온다', () => {
    const a = render(ir([LOVE, ME_S, YOU_O]), lex, look);
    const b = render(ir([LOVE, ME_S, YOU_O]), lex, look);
    expect(a.svg).toBe(b.svg);
    expect(a.seed).toBe(b.seed);
  });

  it('열 번 반복해도 같다', () => {
    const first = render(ir([LOVE, ME_S, YOU_O]), lex, look).svg;
    for (let i = 0; i < 10; i++) {
      expect(render(ir([LOVE, ME_S, YOU_O]), lex, look).svg).toBe(first);
    }
  });

  it('여러 입력에 대해 결정적이다', () => {
    const cases: Constituent[][] = [
      [LOVE],
      [LOVE, ME_S],
      [LOVE, ME_S, YOU_O],
      [LOVE, ME_S, YOU_O, C('영원','시간수식')],
      [C('기다림','행위'), YOU_S, ME_O],
      [LOVE, ME_S, { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') }],
    ];
    for (const cs of cases) {
      expect(render(ir(cs), lex, look).svg).toBe(render(ir(cs), lex, look).svg);
    }
  });
});

describe('원칙 1 — 의미 동일성', () => {
  it('성분 순서가 달라도 같은 SVG가 나온다', () => {
    const a = render(ir([LOVE, ME_S, YOU_O]), lex, look).svg;
    expect(render(ir([YOU_O, LOVE, ME_S]), lex, look).svg).toBe(a);
    expect(render(ir([ME_S, YOU_O, LOVE]), lex, look).svg).toBe(a);
  });

  it('한국어와 영어가 같은 IR로 수렴하면 같은 그림이 나온다', () => {
    const fromKorean = ir([LOVE, ME_S, YOU_O]);   // 나는 너를 사랑해
    const fromEnglish = ir([ME_S, LOVE, YOU_O]);  // I love you
    expect(render(fromEnglish, lex, look).svg).toBe(render(fromKorean, lex, look).svg);
  });
});

describe('원칙 2 — 의미 차이가 형태에 나타난다', () => {
  it('주체와 대상이 뒤바뀌면 다른 SVG가 나온다', () => {
    const a = render(ir([LOVE, ME_S, YOU_O]), lex, look).svg;
    const b = render(ir([LOVE, YOU_S, ME_O]), lex, look).svg;
    expect(b).not.toBe(a);
  });

  it('정서가가 반대인 어휘는 다른 SVG를 낳는다', () => {
    const love = render(ir([LOVE, ME_S, YOU_O]), lex, look).svg;
    const hate = render(ir([C('미움','행위'), ME_S, YOU_O]), lex, look).svg;
    expect(hate).not.toBe(love);
  });

  it('이름이 다르면 다른 SVG를 낳는다', () => {
    const mk = (name: string) => render(ir([LOVE, ME_S,
      { kind: 'phonetic', role: '대상', syllables: syllabify(name) }]), lex, look).svg;
    expect(mk('루이즈')).not.toBe(mk('한나'));
    expect(mk('정호')).not.toBe(mk('호정'));
  });

  it('모든 획이 어떤 라벨에든 귀속된다', () => {
    for (const s of render(ir([LOVE, ME_S, YOU_O]), lex, look).strokes) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});

describe('조형 불변식', () => {
  // p 공간의 링 안쪽 면을 화면 좌표로
  const floorPx = (size: number) => (look.pR - look.pRingBase) * scaleFor(size);

  it('링 안쪽에 아무것도 없다', () => {
    // 이 프로젝트에서 가장 자주 깨졌던 제약이다.
    const size = 300, cx = size / 2, cy = size / 2;
    const cases: Constituent[][] = [
      [LOVE],
      [LOVE, ME_S, YOU_O],
      Array.from({ length: 10 }, (_, i) => C(['사랑','시간','나','너','아이','약속','선택','빛','물','하늘'][i]!, '행위')),
      [LOVE, { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') }],
    ];
    for (const cs of cases) {
      const { strokes } = render(ir(cs), lex, look);
      expect(strokes.length).toBeGreaterThan(0);
      let worst = Infinity;
      // 링 자신은 제외한다 — 링의 채워진 외곽선은 원래 안쪽 가장자리(약 75.8px,
      // floorPx 81.67px 보다 안쪽)까지 그려진다. 그건 링 그 자체이지 "링 안쪽을
      // 파고드는 표시"가 아니다. 이 불변식이 실제로 잡으려는 것은 비링 획이다
      // (planII-final-review.md P5/P6 의 "비링 최소 r" 열).
      for (const s of strokes) {
        if (s.role === 'ring') continue;
        // 패스의 d 에서만 좌표를 읽는다. SVG 전체를 훑으면 <metadata> 의
        // IR JSON 에 든 숫자(engineVersion "1.0.0" 등)를 좌표로 오인한다.
        const nums = s.d.match(/-?\d+\.\d+/g) ?? [];
        expect(nums.length).toBeGreaterThan(0);
        for (let i = 0; i + 1 < nums.length; i += 2) {
          worst = Math.min(worst, Math.hypot(Number(nums[i]) - cx, Number(nums[i + 1]) - cy));
        }
      }
      // 실측 여유는 floorPx 에서 약 0.9px 뿐이다(위 문서의 "비링 최소 r" 82.56px
      // vs floorPx 81.67px). 종전의 floorPx*0.92(75.1px)는 8배 느슨해 링 안쪽을
      // 파고드는 회귀도 통과시켰다. floorPx-1 로 조여 곡선 윤곽선 오프셋만큼만
      // 여유를 둔다(m6). 이 값이 실패하면 여유를 되돌리지 말고 실제 최소값을 보고한다.
      expect(worst, `성분 ${cs.length}개 — 비링 획이 링 안쪽 가장자리(floorPx-1)를 지켜야 한다`)
        .toBeGreaterThan(floorPx(size) - 1);
    }
  });

  it('링은 하나다 — ring 획이 정해진 개수뿐이다', () => {
    const ringCount = render(ir([LOVE, ME_S, YOU_O]), lex, look)
      .strokes.filter((s) => s.role === 'ring').length;
    expect(ringCount).toBe(look.cGaps + 1 + look.cDouble);
  });

  it('복잡도 예산 — 성분이 늘어도 획 수가 예산 지수만큼만 늘어난다', () => {
    const n = (cs: Constituent[]) => render(ir(cs), lex, look).strokes.length;
    const one = n([LOVE]);
    const six = n([LOVE, ME_S, YOU_O, C('영원','시간수식'), C('어제','시간'), C('여기','장소')]);
    // `six < one * 6` 은 예산이 완전히 꺼져 있어도(선형 증가) 통과하는 거의
    // 공허한 검사였다(m7). 예산이 꺼지면 성분 수만큼 6배로 늘어나고, 예산이
    // 살아 있으면(`bud = n^-cBudget`) 6^(1-cBudget) 근처로만 늘어난다 — 그
    // 실제 지수로 상한을 다시 세운다. 30% 여유는 예산이 덩어리 수(cZones)
    // 단위로만 나뉘는 등 정수 반올림 오차를 흡수한다.
    expect(six).toBeLessThan(one * Math.pow(6, 1 - look.cBudget) * 1.3);
    // 예산이 아무것도 못 그리게 망가지는 회귀(획 수 0 등)도 함께 잡는다.
    expect(six).toBeGreaterThan(one);
  });
});

describe('골든 파일 — 의도치 않은 조형 변화 감지', () => {
  // 이 스냅샷은 의도치 않은 조형 변화를 잡는 그물이다.
  // `design/look-v3.json` 을 바꾸면 전부 달라지는 것이 정상이므로 그때는
  // `npx vitest run tests/render/invariants.test.ts -u` 로 갱신하고,
  // 커밋 메시지에 어떤 조형을 왜 바꿨는지 적는다.
  // 룩을 바꾸지 않았는데 이 테스트가 깨졌다면 회귀다 — 갱신하지 말고 원인을 찾는다.
  const golden: Array<[string, IR]> = [
    ['사랑', ir([LOVE])],
    ['나는 너를 사랑해', ir([LOVE, ME_S, YOU_O])],
    ['너는 나를 사랑해', ir([LOVE, YOU_S, ME_O])],
    ['나는 너를 영원히 사랑해', ir([LOVE, ME_S, YOU_O, C('영원','시간수식')])],
    ['나는 루이즈를 사랑해', ir([LOVE, ME_S,
      { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') }])],
  ];

  // 전체 SVG 스냅샷은 34KB 한 줄이라 사람이 diff 를 읽을 수 없다. 역할별
  // 획 수·경계·최소 폭처럼 작은 요약을 나란히 고정해 두면, "룩을 의도적으로
  // 바꿨다"와 "조립이 깨졌다"를 diff 에서 구별할 수 있다.
  const fingerprint = (svg: string, strokes: RenderResult['strokes']) => {
    const nums = (svg.match(/ d="[^"]+"/g) ?? []).join(' ').match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
    const r2 = (n: number) => Math.round(n * 10) / 10;
    return {
      획수: strokes.length,
      역할: [...new Set(strokes.map((s) => String(s.role)))].sort().join(','),
      경계: [r2(Math.min(...xs)), r2(Math.min(...ys)), r2(Math.max(...xs)), r2(Math.max(...ys))],
      최소폭: r2(Math.min(...strokes.map((s) => s.minWidth)) * 100) / 100,
    };
  };

  for (const [name, input] of golden) {
    it(`${name} 의 SVG가 고정되어 있다`, () => {
      expect(render(input, lex, look).svg).toMatchSnapshot();
    });

    it(`${name} 의 조형 요약`, () => {
      const { svg, strokes } = render(input, lex, look);
      expect(fingerprint(svg, strokes)).toMatchSnapshot();
    });
  }
});
