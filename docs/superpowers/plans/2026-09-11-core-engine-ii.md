# 코어 엔진 II — 조형 확정 이후 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확정된 조형(`design/look-v3.json`)을 따라 IR을 SVG 로고그램으로 그리고, 목걸이 각인 파일까지 뽑는다.

**Architecture:** 획 어휘가 **중심선 + 굵기 배열**(`Stroke`)을 낳고, 그 위에서 두 갈래로 나뉜다 — SVG 렌더러는 `taperOutline`으로 닫힌 윤곽을 만들고, 화면 렌더러(계획 III)는 같은 데이터를 삼각형으로 만든다. 조형 파라미터는 코드에 박지 않고 `design/look-v3.json`에서 읽는다. 모든 표시는 링 바깥에만 존재하며 이를 구조적으로 보장한다.

**Tech Stack:** TypeScript 5, Vitest 2, 런타임 의존성 없음

## Global Constraints

설계 문서 `docs/superpowers/specs/2026-09-11-heptapod-b-design.md`에서 그대로 가져온 전역 제약. 모든 태스크에 암묵적으로 포함된다.

- **원칙 1 (결정성):** 같은 입력은 항상 같은 로고그램을 낳는다. 유기적 불규칙성은 난수가 아니라 **정규화된 IR의 해시를 시드로 하는 의사난수**로 만든다.
- **원칙 2 (모든 획은 의미를 담당한다):** 장식을 위해 존재하는 획은 없다. 형태의 차이는 반드시 의미의 차이에서 온다. **주 표시**(덩어리 층)는 역할 슬롯에서 위치가 나오고, **수반 표시**(가시·겹선·고리)는 주 표시의 자질과 시드에서 결정적으로 유도된다.
- **링 안쪽은 비운다.** 덩어리·가시·고리가 모두 링의 바깥 면 밖에만 존재한다. 겹쳐 쌓기는 바깥으로 간다. **예외 없다.**
- **링은 언제나 하나다.** 동심 링을 쓰지 않는다. 문장이 여럿이면 하나의 링을 각도로 나눠 갖고, 역할 지도가 각 구획 안으로 압축된다.
- **개수 상한:** 단어 10개. 넘는 입력은 잘라낸다.

> **문장 여러 개는 이 계획의 범위가 아니다.** 스펙 9.5.1b 는 문장이 여럿이면 하나의 링을 각도 구획으로 나눠 갖는다고 정했다. 그런데 현재 `IR` 은 `constituents` 와 `mood` 하나로 **문장 하나**를 나타낸다. 다중 문장을 그리려면 IR 확장이 필요하고, IR 을 낳는 것은 파서이므로 **계획 III(파서)** 에서 함께 다룬다. 이 계획은 문장 하나를 그린다.
- **역할 지도 (3축 대칭):** 12시 행위 ↔ 6시 양상 / 2시 주체 ↔ 8시 대상 / 4시 시간 ↔ 10시 장소. 홀수 슬롯은 바로 앞 짝수 슬롯의 부속 — 1시 행위수식, 3시 주체수식, 5시 시간수식, 7시 정도, 9시 대상수식, 11시 방향.
- **의미 자질 8차원 (각 0..1):** `animacy` `agency` `concreteness` `valence` `intensity` `temporality` `boundedness` `sociality`.
- **엔진 버전:** `"1.0.0"`. 내보낸 SVG에 입력·IR·엔진 버전을 메타데이터로 반드시 embed한다.
- **조형 파라미터는 `design/look-v3.json`이 유일한 출처다.** 코드에 수치를 박지 않는다. 조형이 바뀌면 JSON만 갈아끼운다.
- **비영리.** 런타임 유료 API 의존을 코어에 넣지 않는다.

### 이미 있는 것 (계획 1에서 완료)

| 파일 | 내보내는 것 |
|---|---|
| `src/version.ts` | `ENGINE_VERSION = '1.0.0'` |
| `src/core/hash.ts` | `fnv1a(s)`, `mulberry32(seed)` — **동결됨. 고치지 말 것** |
| `src/core/ir.ts` | `Role`, `Syllable`, `Constituent`, `Mood`, `IR`, `constituentKey`, `sortedConstituents`, `canonicalize`, `seedOf`, `subSeed` |
| `src/core/lexicon.ts` | `SemanticFeatures`, `FEATURE_KEYS`, `LexiconEntry`, `Lexicon`, `loadSeedLexicon`, `lookup`, `averageFeatures`, `NEUTRAL_FEATURES` |
| `src/core/phonology.ts` | `decomposeHangul`, `syllabify`, `consonantFeatures`, `vowelFeatures`, `Manner`, `ConsonantFeatures`, `VowelFeatures` |
| `src/render/geometry.ts` | `Pt`, `WidthFn`, `sampleCubic`, `taperOutline`, `ringOutline`, `minWidthOf` |

현재 87개 테스트가 통과한다. 새 테스트가 기존 것을 깨뜨려서는 안 된다.

### 폐기된 것

계획 1의 **Task 4 후반(자질 → 획 파라미터), Task 5(획 어휘), Task 6(조립), Task 7(불변식), Task 8 후반(음절 나선), Task 9(목걸이), Task 10(CLI)** 은 조형 확정 전에 쓴 것이라 폐기한다. 이 계획이 대체한다. 계획 1의 Task 1·2·3과 사전·음운은 유효하다.

---

## File Structure

```
design/look-v3.json          조형 확정값 (있음) — 유일한 수치 출처

src/render/look.ts           LookParams 타입, JSON 로드와 검증
src/render/profile.ts        smoothJit, widthProfile — 굵기 프로파일
src/render/mapping.ts        SemanticFeatures → ShapeParams
src/render/stroke.ts         Stroke 타입, clampOutside, strokeMinRadius
src/render/vocab.ts          획 어휘 — 링·겹선·덩어리·가시·고리
src/render/name.ts           음절 나선 (음운 자질 → 획)
src/render/layout.ts         구획 분할과 덩어리 배치
src/render/compose.ts        render(ir, lex, look, opts) → RenderResult
src/render/necklace.ts       목걸이 프리셋과 각인 가능성 검증
src/cli.ts                   IR JSON → SVG 파일
src/render/geometry.ts       (있음) + outlineOf 추가
```

**경계:** `core/`는 SVG를 모른다. `render/vocab.ts`와 `render/name.ts`는 `Stroke`만 낳고 SVG 문자열을 만들지 않는다. `compose.ts`만이 SVG를 안다.

---

## Task 1: 조형 파라미터 로드

수치를 코드에 박지 않는다는 제약을 지탱하는 층이다. JSON이 코드가 기대하는 키를 전부 갖고 있는지 로드 시점에 검증한다.

**Files:**
- Create: `src/render/look.ts`
- Test: `tests/render/look.test.ts`

**Interfaces:**
- Consumes: `design/look-v3.json`
- Produces:
  - `LOOK_KEYS: readonly string[]` — 59개 파라미터 이름
  - `type LookKey = typeof LOOK_KEYS[number]`
  - `type LookParams = Record<LookKey, number>`
  - `loadLook(): LookParams`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/look.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadLook, LOOK_KEYS } from '../../src/render/look';

const look = loadLook();

describe('loadLook', () => {
  it('선언된 파라미터를 모두 담고 있다', () => {
    for (const k of LOOK_KEYS) {
      expect(typeof look[k], k).toBe('number');
      expect(Number.isFinite(look[k]), k).toBe(true);
    }
  });

  it('JSON에만 있고 선언되지 않은 파라미터가 없다', () => {
    // 랩에서 슬라이더를 추가했는데 여기 선언을 빠뜨리면 조용히 무시된다.
    expect(Object.keys(look).sort()).toEqual([...LOOK_KEYS].sort());
  });

  it('확정 조형의 핵심 판단이 값에 남아 있다', () => {
    // 이 값들이 바뀌면 조형이 바뀐 것이다. 바뀌었다면 스펙 9.5.1b도 함께 고쳐야 한다.
    expect(look.pWobble).toBe(0);        // 정원. 찌그러짐 없음
    expect(look.cSpeck).toBe(0);         // 흩어진 반점은 쓰지 않는다
    expect(look.cBloomOut).toBe(0);      // 덩어리는 부풀지 않는다
    expect(look.cZones).toBeGreaterThanOrEqual(1);
    expect(look.pR).toBeGreaterThan(0);
    expect(look.pRingBase).toBeGreaterThan(0);
  });

  it('같은 객체를 반복해서 돌려주지 않는다 — 호출자가 고쳐도 원본이 안 바뀐다', () => {
    const a = loadLook();
    a.pR = 999;
    expect(loadLook().pR).not.toBe(999);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/look.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/look"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/look.ts`:

```ts
import raw from '../../design/look-v3.json' with { type: 'json' };

/**
 * 조형 파라미터 이름. `design/look-v3.json` 의 키와 정확히 일치해야 한다.
 *
 * 수치를 코드에 박지 않는다는 것이 이 층의 존재 이유다. 조형이 바뀌면
 * JSON 만 갈아끼우고 코드는 건드리지 않는다. 랩에서 슬라이더를 추가했는데
 * 여기 선언을 빠뜨리면 그 값이 조용히 무시되므로, 로드 시점에 양쪽이
 * 정확히 일치하는지 검사한다.
 */
export const LOOK_KEYS = [
  // 링
  'pR', 'pRingBase', 'pRingAmp', 'pWobble',
  'cGaps', 'cGapSize', 'cDouble', 'cDoubleGap',
  // 먹물 덩어리
  'cZones', 'cBloomSpan', 'cBloomThick', 'cBloomOut', 'cLayers', 'cBudget',
  // 가시 · 반점
  'cFringe', 'cFringeLen', 'cFringeFine', 'cFringeTip', 'cFringeBend',
  'cFringeSpan', 'cWhisker', 'cWhiskerLen', 'cSpeck', 'cSpeckR', 'cJitter',
  // 먹물 (화면 렌더러용 — 계획 III 에서 쓴다)
  'pSharp', 'pSoft', 'pDScale', 'pErode', 'pContrast', 'pFloor', 'pCore',
  'pGrainAmp', 'pGrainA', 'pGrainX', 'pInkWarp', 'pInkWarpF', 'pInkWarpS',
  // 연기
  'pFray', 'pFrayFall', 'pWisp', 'pWispFall', 'pPlume', 'pPlumeFall',
  'pGate', 'pDissolve', 'pTopFade',
  // 색 · 분위기
  'pInk', 'pInkCore', 'pBgTop', 'pBgMid', 'pBgBot', 'pFog', 'pGrain', 'pVig', 'pPaper',
  // 분사 애니메이션
  'pSprayAng', 'pLeadTurb', 'pFrontSoft',
] as const;

export type LookKey = (typeof LOOK_KEYS)[number];
export type LookParams = Record<LookKey, number>;

/**
 * 확정 조형을 읽는다. 호출할 때마다 새 객체를 돌려주므로
 * 호출자가 값을 바꿔도 다음 호출에 영향을 주지 않는다.
 */
export function loadLook(): LookParams {
  const src = raw as unknown as Record<string, unknown>;
  const out = {} as LookParams;
  const missing: string[] = [];
  for (const k of LOOK_KEYS) {
    const v = src[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) { missing.push(k); continue; }
    out[k] = v;
  }
  if (missing.length > 0) {
    throw new Error(`look-v3.json 에 없거나 숫자가 아닌 파라미터: ${missing.join(', ')}`);
  }
  const extra = Object.keys(src).filter((k) => !k.startsWith('_') && !(LOOK_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) {
    throw new Error(`look-v3.json 에 선언되지 않은 파라미터가 있다: ${extra.join(', ')}`);
  }
  return out;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/look.test.ts`
Expected: PASS — 4 tests passed

테스트가 "JSON에만 있고 선언되지 않은 파라미터" 로 실패하면 `LOOK_KEYS` 에 그 키를 추가한다. **테스트를 완화하지 말 것** — 빠뜨린 파라미터는 조용히 무시되어 조형이 달라진다.

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 기존 87개 + 새 4개 통과, 타입 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/render/look.ts tests/render/look.test.ts
git commit -m "feat: 조형 파라미터 로드와 검증

수치를 코드에 박지 않는다는 제약을 지탱하는 층. design/look-v3.json 이
유일한 출처이고, 코드가 기대하는 키와 JSON 의 키가 정확히 일치하는지
로드 시점에 검사한다. 한쪽에만 있는 파라미터는 조용히 무시되어
조형이 달라지므로 예외를 던진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 굵기 프로파일

붓의 떨림은 저주파다. 점마다 독립 난수를 쓰면 고주파가 되어 획이 구슬처럼 울퉁불퉁해진다 — 조형 실험에서 실제로 그렇게 됐다.

**Files:**
- Create: `src/render/profile.ts`
- Test: `tests/render/profile.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 수학)
- Produces:
  - `type ProfileKind = 'blade' | 'lens' | 'bloom' | 'spike' | 'hair' | 'flat'`
  - `smoothJit(rnd: () => number, amp: number): (t: number) => number`
  - `widthProfile(n: number, w0: number, w1: number, kind: ProfileKind, rnd: () => number, jit: number): number[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/profile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { smoothJit, widthProfile } from '../../src/render/profile';
import { mulberry32 } from '../../src/core/hash';

const r = () => mulberry32(42);

describe('smoothJit', () => {
  it('진폭 0이면 항상 1이다', () => {
    const j = smoothJit(r(), 0);
    for (let i = 0; i <= 20; i++) expect(j(i / 20)).toBeCloseTo(1, 9);
  });

  it('같은 시드는 같은 함수를 낳는다', () => {
    const a = smoothJit(r(), 0.4), b = smoothJit(r(), 0.4);
    for (let i = 0; i <= 20; i++) expect(a(i / 20)).toBeCloseTo(b(i / 20), 12);
  });

  it('저주파다 — 이웃 표본 사이의 변화가 작다', () => {
    // 점마다 독립 난수를 쓰면 이 검사가 깨진다. 그 경우 획이 구슬처럼 된다.
    const j = smoothJit(r(), 0.5);
    const N = 400;
    let maxStep = 0;
    for (let i = 1; i <= N; i++) maxStep = Math.max(maxStep, Math.abs(j(i / N) - j((i - 1) / N)));
    expect(maxStep).toBeLessThan(0.02);
  });
});

describe('widthProfile', () => {
  it('요청한 개수만큼 낸다', () => {
    expect(widthProfile(17, 0.05, 0.01, 'lens', r(), 0)).toHaveLength(17);
  });

  it('모든 값이 양수다', () => {
    for (const kind of ['blade', 'lens', 'bloom', 'spike', 'hair', 'flat'] as const) {
      for (const w of widthProfile(40, 0.05, 0.004, kind, r(), 1.8)) {
        expect(w, kind).toBeGreaterThan(0);
      }
    }
  });

  it('lens 와 bloom 은 가운데가 가장 두껍다', () => {
    for (const kind of ['lens', 'bloom'] as const) {
      const w = widthProfile(41, 0.06, 0, kind, r(), 0);
      const mid = w[20]!;
      expect(mid, kind).toBeGreaterThan(w[0]!);
      expect(mid, kind).toBeGreaterThan(w[40]!);
    }
  });

  it('hair 는 끝이 뿌리 대비 w1 만큼 남는다 — 바늘처럼 뾰족해지지 않는다', () => {
    const root = 0.02, tip = root * 0.48;
    const w = widthProfile(31, root, tip, 'hair', r(), 0);
    expect(w[30]!).toBeCloseTo(tip, 6);
    expect(w[30]! / w[0]!).toBeGreaterThan(0.3);
  });

  it('spike 는 hair 보다 빨리 가늘어진다', () => {
    const s = widthProfile(31, 0.02, 0, 'spike', r(), 0);
    const h = widthProfile(31, 0.02, 0, 'hair', r(), 0);
    expect(s[15]!).toBeLessThan(h[15]!);
  });

  it('flat 은 w0 에서 w1 로 곧게 간다', () => {
    const w = widthProfile(11, 0.02, 0.01, 'flat', r(), 0);
    expect(w[0]!).toBeCloseTo(0.02, 6);
    expect(w[10]!).toBeCloseTo(0.01, 6);
    expect(w[5]!).toBeCloseTo(0.015, 6);
  });

  it('blade 는 뿌리가 가장 두껍다', () => {
    const w = widthProfile(31, 0.06, 0, 'blade', r(), 0);
    expect(w[0]!).toBeGreaterThan(w[30]!);
  });

  it('결정적이다', () => {
    const a = widthProfile(25, 0.04, 0.002, 'bloom', r(), 1.2);
    const b = widthProfile(25, 0.04, 0.002, 'bloom', r(), 1.2);
    expect(a).toEqual(b);
  });

  it('길이 1도 처리한다', () => {
    expect(widthProfile(1, 0.03, 0.01, 'lens', r(), 0)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/profile.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/profile"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/profile.ts`:

```ts
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
    else                       v = w0 * (1 - t) + w1 * t;
    out.push(Math.max(0.0004, v * j(t)));
  }
  return out;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/profile.test.ts`
Expected: PASS — 12 tests passed

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/render/profile.ts tests/render/profile.test.ts
git commit -m "feat: 굵기 프로파일과 저주파 떨림

붓의 떨림은 저주파다. 점마다 독립 난수를 쓰면 고주파가 되어 획이
구슬처럼 울퉁불퉁해진다 — 조형 실험에서 실제로 그렇게 됐다.
낮은 주파수의 정현파 셋을 합쳐 만든다.

hair 프로파일은 끝을 뭉툭하게 남긴다. 참고 이미지의 가시는 끝이
바늘처럼 뾰족해지지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 자질 → 조형 파라미터

**원칙 2가 사는 곳이다.** 8개 자질이 모두 어떤 조형 파라미터에든 도달해야 한다. 어느 자질이 쓰이지 않으면 그 의미 차이가 형태에 나타나지 않는다.

**Files:**
- Create: `src/render/mapping.ts`
- Test: `tests/render/mapping.test.ts`

**Interfaces:**
- Consumes: `SemanticFeatures`, `FEATURE_KEYS`, `loadSeedLexicon`, `lookup` from `src/core/lexicon`
- Produces:
  - `interface ShapeParams { thickK; spanK; outK; lean; fringeK; fringeLenK; speckK; doubleK; loop; harmonic }`
  - `conceptParams(f: SemanticFeatures): ShapeParams`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { conceptParams } from '../../src/render/mapping';
import { loadSeedLexicon, lookup, FEATURE_KEYS, type SemanticFeatures } from '../../src/core/lexicon';

const lex = loadSeedLexicon();
const mid: SemanticFeatures = {
  animacy: 0.5, agency: 0.5, concreteness: 0.5, valence: 0.5,
  intensity: 0.5, temporality: 0.5, boundedness: 0.5, sociality: 0.5,
};
const withF = (o: Partial<SemanticFeatures>): SemanticFeatures => ({ ...mid, ...o });

describe('conceptParams — 8개 자질이 모두 조형에 도달한다', () => {
  it('어느 자질을 바꿔도 결과가 달라진다', () => {
    // 자질 하나가 아무 파라미터에도 닿지 않으면 그 의미 차이가 형태에
    // 나타나지 않는다. 원칙 2 위반이다.
    const base = JSON.stringify(conceptParams(mid));
    for (const k of FEATURE_KEYS) {
      const lo = JSON.stringify(conceptParams(withF({ [k]: 0.02 } as Partial<SemanticFeatures>)));
      const hi = JSON.stringify(conceptParams(withF({ [k]: 0.98 } as Partial<SemanticFeatures>)));
      expect(lo, `${k} 가 조형에 도달하지 않는다`).not.toBe(hi);
      expect([lo, hi].includes(base) && lo === hi, k).toBe(false);
    }
  });

  it('구상어가 더 두껍다', () => {
    expect(conceptParams(withF({ concreteness: 0.95 })).thickK)
      .toBeGreaterThan(conceptParams(withF({ concreteness: 0.05 })).thickK);
  });

  it('관계성이 크면 덩어리가 넓게 퍼진다', () => {
    expect(conceptParams(withF({ sociality: 0.95 })).spanK)
      .toBeGreaterThan(conceptParams(withF({ sociality: 0.05 })).spanK);
  });

  it('정서가가 감김 방향의 부호를 정한다', () => {
    expect(conceptParams(withF({ valence: 0.95 })).lean).toBeGreaterThan(0);
    expect(conceptParams(withF({ valence: 0.05 })).lean).toBeLessThan(0);
  });

  it('추상어의 가시가 더 길다', () => {
    expect(conceptParams(withF({ concreteness: 0.05 })).fringeLenK)
      .toBeGreaterThan(conceptParams(withF({ concreteness: 0.95 })).fringeLenK);
  });

  it('생물성이 부속 고리를 켠다', () => {
    expect(conceptParams(withF({ animacy: 0.9 })).loop).toBe(true);
    expect(conceptParams(withF({ animacy: 0.1 })).loop).toBe(false);
  });

  it('시간성이 링 굵기 변화 주파수를 정하고, 정수다', () => {
    const hi = conceptParams(withF({ temporality: 0.95 })).harmonic;
    const lo = conceptParams(withF({ temporality: 0.05 })).harmonic;
    expect(hi).toBeGreaterThan(lo);
    expect(Number.isInteger(hi)).toBe(true);
    expect(Number.isInteger(lo)).toBe(true);
  });

  it('모든 배수가 양수다 — 음수면 획이 뒤집힌다', () => {
    for (const k of FEATURE_KEYS) {
      for (const v of [0, 1]) {
        const p = conceptParams(withF({ [k]: v } as Partial<SemanticFeatures>));
        for (const key of ['thickK', 'spanK', 'outK', 'fringeK', 'fringeLenK', 'speckK', 'doubleK'] as const) {
          expect(p[key], `${k}=${v} → ${key}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('conceptParams — 씨앗 사전에서의 동작', () => {
  it('사랑과 미움은 감김 방향만 반대다', () => {
    const love = conceptParams(lookup(lex, '사랑')!.features);
    const hate = conceptParams(lookup(lex, '미움')!.features);
    expect(Math.sign(love.lean)).not.toBe(Math.sign(hate.lean));
    expect(Math.abs(love.thickK - hate.thickK)).toBeLessThan(0.1);
    expect(Math.abs(love.spanK - hate.spanK)).toBeLessThan(0.1);
  });

  it('고양이와 개는 조형 파라미터가 가깝다', () => {
    const cat = conceptParams(lookup(lex, '고양이')!.features);
    const dog = conceptParams(lookup(lex, '개')!.features);
    for (const k of ['thickK', 'spanK', 'outK', 'fringeK', 'fringeLenK'] as const) {
      expect(Math.abs(cat[k] - dog[k]), k).toBeLessThan(0.15);
    }
    expect(cat.loop).toBe(dog.loop);
  });

  it('사전의 모든 어휘가 유한한 파라미터를 낸다', () => {
    for (const [lemma, e] of Object.entries(lex)) {
      const p = conceptParams(e.features);
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'number') expect(Number.isFinite(v), `${lemma}.${k}`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/mapping.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/mapping"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/mapping.ts`:

```ts
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
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/mapping.test.ts`
Expected: PASS — 11 tests passed

"어느 자질을 바꿔도 결과가 달라진다" 가 실패하면 그 자질이 어떤 파라미터에도 닿지 않는 것이다. **테스트를 완화하지 말고** 사상을 고친다.

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/render/mapping.ts tests/render/mapping.test.ts
git commit -m "feat: 의미 자질 → 조형 배수

원칙 2가 사는 곳이다. 8개 자질이 모두 어떤 조형 파라미터에든 도달해야
한다. 어느 자질이 쓰이지 않으면 그 의미 차이가 형태에 나타나지 않는다.
자질을 하나씩 흔들어 결과가 달라지는지 검사하는 테스트로 강제한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Stroke 타입과 링 바깥 보장

모든 획이 통과하는 자료형과, **링 안쪽을 비운다**는 제약을 구조적으로 보장하는 장치다. 각 생성기가 알아서 조심하는 방식으로는 지켜지지 않는다 — 조형 실험에서 실제로 새어 나갔다.

**Files:**
- Create: `src/render/stroke.ts`
- Test: `tests/render/stroke.test.ts`

**Interfaces:**
- Consumes: `Pt` from `src/render/geometry`, `Role` from `src/core/ir`
- Produces:
  - `interface Stroke { pts: Pt[]; widths: number[]; label: string; role: Role | 'ring' }`
  - `clampOutside(pts: Pt[], minR: number): Pt[]`
  - `strokeMinRadius(s: Stroke): number`
  - `arcPts(r: number, a0: number, span: number, bow: number, n: number): Pt[]`
  - `bezPts(a: Pt, b: Pt, c: Pt, n: number): Pt[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/stroke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampOutside, strokeMinRadius, arcPts, bezPts, type Stroke } from '../../src/render/stroke';
import type { Pt } from '../../src/render/geometry';

const rad = (p: Pt) => Math.hypot(p[0], p[1]);

describe('arcPts', () => {
  it('n + 1 개의 점을 낸다', () => {
    expect(arcPts(1, 0, Math.PI, 0, 12)).toHaveLength(13);
  });

  it('bow 가 0이면 모든 점이 반경 r 위에 있다', () => {
    for (const p of arcPts(0.5, 0.3, 1.2, 0, 24)) expect(rad(p)).toBeCloseTo(0.5, 9);
  });

  it('bow 가 양수면 가운데가 바깥으로 부푼다', () => {
    const pts = arcPts(0.5, 0, 1.0, 0.1, 20);
    expect(rad(pts[10]!)).toBeGreaterThan(0.5);
    expect(rad(pts[0]!)).toBeCloseTo(0.5, 9);
  });
});

describe('bezPts', () => {
  it('양 끝점이 a 와 c 다', () => {
    const pts = bezPts([0, 0], [1, 2], [2, 0], 10);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[10]).toEqual([2, 0]);
  });
});

describe('clampOutside', () => {
  it('반경이 minR 이상인 점은 그대로 둔다', () => {
    const pts: Pt[] = [[1, 0], [0, 2]];
    expect(clampOutside(pts, 0.5)).toEqual(pts);
  });

  it('안쪽으로 들어온 점을 반경 minR 로 밀어낸다', () => {
    const out = clampOutside([[0.1, 0]], 0.5);
    expect(rad(out[0]!)).toBeCloseTo(0.5, 9);
    // 방향은 유지된다
    expect(out[0]![1]).toBeCloseTo(0, 9);
    expect(out[0]![0]).toBeGreaterThan(0);
  });

  it('원점은 임의 방향으로 밀되 반경은 minR 이다', () => {
    const out = clampOutside([[0, 0]], 0.5);
    expect(rad(out[0]!)).toBeCloseTo(0.5, 9);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const pts: Pt[] = [[0.1, 0]];
    clampOutside(pts, 0.5);
    expect(pts[0]).toEqual([0.1, 0]);
  });

  it('minR 이 0 이하면 그대로 돌려준다', () => {
    const pts: Pt[] = [[0.1, 0], [0, 0]];
    expect(clampOutside(pts, 0)).toEqual(pts);
  });
});

describe('strokeMinRadius', () => {
  it('중심선에서 굵기의 절반을 뺀 최소 반경을 낸다', () => {
    const s: Stroke = {
      pts: [[1, 0], [0, 1]],
      widths: [0.2, 0.4],
      label: '테스트', role: 'ring',
    };
    // (1,0) 에서 1 - 0.1 = 0.9, (0,1) 에서 1 - 0.2 = 0.8
    expect(strokeMinRadius(s)).toBeCloseTo(0.8, 9);
  });

  it('점이 없으면 Infinity 를 낸다', () => {
    expect(strokeMinRadius({ pts: [], widths: [], label: '', role: 'ring' })).toBe(Infinity);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/stroke.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/stroke"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/stroke.ts`:

```ts
import type { Pt } from './geometry';
import type { Role } from '../core/ir';

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
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/stroke.test.ts`
Expected: PASS — 11 tests passed

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/render/stroke.ts tests/render/stroke.test.ts
git commit -m "feat: Stroke 타입과 링 바깥 보장

중심선 + 굵기 배열이 두 렌더러의 공통 입력이다. SVG 는 윤곽선을,
화면은 삼각형을 만든다. 그래서 획 어휘는 SVG 를 모른다.

clampOutside 는 링 안쪽을 비운다는 제약을 구조적으로 보장한다. 각
생성기가 알아서 조심하는 방식으로는 지켜지지 않았다 — 휨이 큰 가시와
깊이가 깊은 덩어리가 실제로 안쪽으로 새어 나갔다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 획 어휘 — 링과 겹선

**Files:**
- Create: `src/render/vocab.ts`
- Test: `tests/render/vocab-ring.test.ts`

**Interfaces:**
- Consumes: `LookParams` from `src/render/look`; `widthProfile`, `smoothJit` from `src/render/profile`; `Stroke`, `arcPts`, `strokeMinRadius` from `src/render/stroke`
- Produces:
  - `ringStrokes(look: LookParams, rnd: () => number): Stroke[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/vocab-ring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ringStrokes } from '../../src/render/vocab';
import { loadLook } from '../../src/render/look';
import { mulberry32 } from '../../src/core/hash';

const look = loadLook();
const r = () => mulberry32(7);

describe('ringStrokes', () => {
  it('끊김 수 + 1 개의 호와 겹선들을 낸다', () => {
    const s = ringStrokes(look, r());
    expect(s.length).toBe(look.cGaps + 1 + look.cDouble);
  });

  it('모든 획의 역할이 ring 이다', () => {
    for (const s of ringStrokes(look, r())) expect(s.role).toBe('ring');
  });

  it('중심선과 굵기 배열의 길이가 같다', () => {
    for (const s of ringStrokes(look, r())) expect(s.widths).toHaveLength(s.pts.length);
  });

  it('모든 굵기가 양수다', () => {
    for (const s of ringStrokes(look, r())) for (const w of s.widths) expect(w).toBeGreaterThan(0);
  });

  it('모든 점이 링 반경 근처에 있다 — 링은 하나다', () => {
    // 동심 링을 만들면 이 검사가 깨진다.
    for (const s of ringStrokes(look, r())) {
      for (const p of s.pts) {
        const rad = Math.hypot(p[0], p[1]);
        expect(rad).toBeGreaterThan(look.pR * 0.9);
        expect(rad).toBeLessThan(look.pR * 1.15);
      }
    }
  });

  it('겹선은 링 바깥에만 있다', () => {
    const all = ringStrokes(look, r());
    const doubles = all.slice(look.cGaps + 1);
    expect(doubles).toHaveLength(look.cDouble);
    for (const s of doubles) {
      for (const p of s.pts) expect(Math.hypot(p[0], p[1])).toBeGreaterThanOrEqual(look.pR);
    }
  });

  it('끊김이 있으면 호들이 원을 다 덮지 않는다', () => {
    if (look.cGaps === 0) return;
    const s = ringStrokes(look, r()).slice(0, look.cGaps + 1);
    const covered = s.reduce((acc, st) => {
      const a0 = Math.atan2(st.pts[0]![1], st.pts[0]![0]);
      const a1 = Math.atan2(st.pts[st.pts.length - 1]![1], st.pts[st.pts.length - 1]![0]);
      let d = a1 - a0;
      while (d < 0) d += Math.PI * 2;
      return acc + d;
    }, 0);
    expect(covered).toBeLessThan(Math.PI * 2);
  });

  it('결정적이다', () => {
    expect(ringStrokes(look, r())).toEqual(ringStrokes(look, r()));
  });

  it('링 굵기를 키우면 획이 두꺼워진다', () => {
    const thin = ringStrokes({ ...look, pRingBase: 0.01 }, r());
    const thick = ringStrokes({ ...look, pRingBase: 0.05 }, r());
    const avg = (ss: ReturnType<typeof ringStrokes>) =>
      ss[0]!.widths.reduce((a, b) => a + b, 0) / ss[0]!.widths.length;
    expect(avg(thick)).toBeGreaterThan(avg(thin));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/vocab-ring.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/vocab"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/vocab.ts`:

```ts
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
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/vocab-ring.test.ts`
Expected: PASS — 9 tests passed

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/render/vocab.ts tests/render/vocab-ring.test.ts
git commit -m "feat: 획 어휘 — 링과 겹선

링은 언제나 하나다. 끊김으로 여러 호로 나누고 겹선을 더한다. 겹선은
바깥에만 둔다. 굵기는 완만하게만 변하고 양 끝이 가늘어져 붓이 떨어진
느낌을 낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 획 어휘 — 먹물 덩어리와 가시

확정 조형에서 **가시가 주역이다.** 덩어리는 작고 좁으며 부풀지 않고(`cBloomOut 0`), 존재감은 가시가 만든다. 흩어진 반점은 쓰지 않는다(`cSpeck 0`).

**Files:**
- Modify: `src/render/vocab.ts`
- Test: `tests/render/vocab-bloom.test.ts`

**Interfaces:**
- Consumes: Task 5의 `vocab.ts`, `ShapeParams` from `src/render/mapping`, `clampOutside`, `bezPts` from `src/render/stroke`
- Produces:
  - `interface BloomCtx { angle: number; depth: number; n: number; label: string; role: Role }`
  - `bloomStrokes(look: LookParams, sp: ShapeParams, ctx: BloomCtx, rnd: () => number): Stroke[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/vocab-bloom.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bloomStrokes } from '../../src/render/vocab';
import { loadLook } from '../../src/render/look';
import { conceptParams } from '../../src/render/mapping';
import { loadSeedLexicon, lookup } from '../../src/core/lexicon';
import { strokeMinRadius } from '../../src/render/stroke';
import { mulberry32 } from '../../src/core/hash';

const look = loadLook();
const lex = loadSeedLexicon();
const sp = conceptParams(lookup(lex, '사랑')!.features);
const r = () => mulberry32(11);
const ctx = (o = {}) => ({ angle: 0.4, depth: 0, n: 1, label: '사랑', role: '행위' as const, ...o });

describe('bloomStrokes', () => {
  it('획을 여러 개 낸다', () => {
    expect(bloomStrokes(look, sp, ctx(), r()).length).toBeGreaterThan(look.cLayers);
  });

  it('중심선과 굵기 배열의 길이가 같다', () => {
    for (const s of bloomStrokes(look, sp, ctx(), r())) {
      expect(s.widths).toHaveLength(s.pts.length);
    }
  });

  it('모든 획이 개념의 라벨과 역할을 갖는다', () => {
    for (const s of bloomStrokes(look, sp, ctx(), r())) {
      expect(s.label).toBe('사랑');
      expect(s.role).toBe('행위');
    }
  });

  it('링 안쪽으로 넘어오지 않는다', () => {
    // 이 프로젝트에서 가장 자주 깨졌던 제약이다.
    const floor = look.pR - look.pRingBase;
    for (const depth of [0, 1, 2, 5, 9]) {
      for (const s of bloomStrokes(look, sp, ctx({ depth }), r())) {
        expect(strokeMinRadius(s), `depth=${depth} ${s.label}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('깊이가 깊을수록 바깥으로 간다 — 안쪽이 아니다', () => {
    const inner = Math.min(...bloomStrokes(look, sp, ctx({ depth: 0 }), r()).map(strokeMinRadius));
    const outer = Math.min(...bloomStrokes(look, sp, ctx({ depth: 3 }), r()).map(strokeMinRadius));
    expect(outer).toBeGreaterThan(inner);
  });

  it('복잡도 예산 — 개념이 많으면 획 수가 줄어든다', () => {
    const one = bloomStrokes(look, sp, ctx({ n: 1 }), r()).length;
    const many = bloomStrokes(look, sp, ctx({ n: 10 }), r()).length;
    expect(many).toBeLessThan(one);
  });

  it('반점 수가 0이면 반점 획을 만들지 않는다', () => {
    // 확정 조형은 cSpeck 0 이다.
    const s = bloomStrokes(look, sp, ctx(), r());
    expect(s.some((x) => x.label.includes('반점'))).toBe(false);
  });

  it('가시 개수를 0으로 하면 덩어리 층만 남는다', () => {
    const bare = bloomStrokes({ ...look, cFringe: 0, cWhisker: 0 }, sp, ctx(), r());
    expect(bare.length).toBeLessThan(bloomStrokes(look, sp, ctx(), r()).length);
    expect(bare.length).toBeGreaterThanOrEqual(1);
  });

  it('가시 끝이 뭉툭하다 — 끝 굵기가 0이 아니다', () => {
    const all = bloomStrokes(look, sp, ctx(), r());
    const hairs = all.filter((s) => s.pts.length <= 10 && s.widths.length <= 10);
    expect(hairs.length).toBeGreaterThan(0);
    for (const h of hairs) {
      expect(h.widths[h.widths.length - 1]!).toBeGreaterThan(0.0004);
    }
  });

  it('결정적이다', () => {
    expect(bloomStrokes(look, sp, ctx(), r())).toEqual(bloomStrokes(look, sp, ctx(), r()));
  });

  it('각도를 바꾸면 결과가 달라진다', () => {
    const a = bloomStrokes(look, sp, ctx({ angle: 0.4 }), r());
    const b = bloomStrokes(look, sp, ctx({ angle: 2.1 }), r());
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/vocab-bloom.test.ts`
Expected: FAIL — `bloomStrokes is not exported`

- [ ] **Step 3: 구현을 `src/render/vocab.ts` 에 추가**

파일 맨 위 import 를 **다음 블록 전체로** 교체 (이것이 최종 형태다):

```ts
import type { LookParams } from './look';
import type { ShapeParams } from './mapping';
import type { Role } from '../core/ir';
import type { Pt } from './geometry';
import { widthProfile, smoothJit } from './profile';
import { arcPts, bezPts, clampOutside, type Stroke } from './stroke';
```

파일 끝에 추가:

```ts
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

  // 복잡도 예산 — 개념이 많으면 각자 몫이 줄어 총량이 대체로 일정하다
  const bud = Math.pow(Math.max(1, ctx.n), -look.cBudget);

  const span0 = look.cBloomSpan * sp.spanK;
  const st0 = angle - span0 * 0.5;

  const push = (pts: readonly Pt[], widths: number[], lbl: string) => {
    out.push({ pts: clampOutside([...pts], floor), widths, label: lbl, role });
  };

  // ── 덩어리 층 ──
  const layers = Math.max(1, Math.round(look.cLayers));
  for (let k = 0; k < layers; k++) {
    const sk = (1 - k * 0.24) * dk;
    const span = span0 * (0.70 + rnd() * 0.55) * sk;
    const st = st0 + (rnd() - 0.5) * span0 * 0.30 * J;
    const thick = look.cBloomThick * sp.thickK * sk * (0.7 + rnd() * 0.5);
    const bow = look.cBloomThick * look.cBloomOut * sp.outK * (0.3 + rnd() * 0.6);
    const n = Math.max(16, Math.round(span * 44));
    const pts = arcPts(surf + thick * 0.44, st, span, bow, n);
    const widths = widthProfile(pts.length, thick, look.pRingBase * 0.5, 'bloom', rnd, J * 0.7);
    if (rnd() < 0.5) widths.reverse();
    push(pts, widths, label);
  }

  // ── 가시 ──
  // 덩어리의 호 전체에 걸쳐 고르게 돋는다. 한 각도에서만 나면 붓 하나가
  // 튄 것처럼 보인다. 방향은 반경 방향에서 ±(퍼짐/2) 안이므로 항상 바깥이다.
  const hair = (a: number, rootR: number, len: number, wide: number, spread: number) => {
    const at: Pt = [Math.cos(a) * rootR, Math.sin(a) * rootR];
    const dir = a + (rnd() - 0.5) * Math.min(spread, 2.6);
    const L = len * (0.6 + rnd() * 0.8);
    const b = (rnd() - 0.5) * look.cFringeBend;
    const tip: Pt = [at[0] + Math.cos(dir) * L, at[1] + Math.sin(dir) * L];
    const mid: Pt = [at[0] + Math.cos(dir + b) * L * 0.55, at[1] + Math.sin(dir + b) * L * 0.55];
    const pts = bezPts(at, mid, tip, 7);
    const root = wide * (0.7 + rnd() * 0.8);
    push(pts, widthProfile(pts.length, root, root * look.cFringeTip, 'hair', rnd, 0.4), label);
  };

  const fCount = Math.max(0, Math.round(look.cFringe * sp.fringeK * bud * dk));
  const fLen = look.cFringeLen * sp.fringeLenK * dk;
  for (let i = 0; i < fCount; i++) {
    const t = Math.min(1, Math.max(0, (i + 0.5) / fCount + (rnd() - 0.5) / fCount));
    hair(st0 + span0 * t,
         surf + look.cBloomThick * (0.25 + rnd() * 0.55),
         fLen, look.cFringeFine, look.cFringeSpan);
  }

  // 긴 가시 — 몇 개만 길게 뻗는 더듬이
  const wCount = Math.max(0, Math.round(look.cWhisker * sp.fringeK * bud));
  for (let i = 0; i < wCount; i++) {
    hair(st0 + span0 * rnd(),
         surf + look.cBloomThick * 0.4,
         look.cWhiskerLen * dk, look.cFringeFine * 1.25, look.cFringeSpan * 1.2);
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
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/vocab-bloom.test.ts`
Expected: PASS — 11 tests passed

"링 안쪽으로 넘어오지 않는다" 가 실패하면 `clampOutside` 를 거치지 않는 경로가 있는 것이다. **모든 `out.push` 가 `push` 헬퍼를 통과해야 한다.**

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/render/vocab.ts tests/render/vocab-bloom.test.ts
git commit -m "feat: 획 어휘 — 먹물 덩어리와 가시

확정 조형에서 가시가 주역이다. 덩어리는 작고 좁으며 부풀지 않고
존재감은 가시가 만든다. 흩어진 반점은 채택하지 않았다.

깊이는 바깥으로 쌓는다. 안쪽으로 쌓으면 개념이 많을 때 반경이 0을
지나 음수가 되어 원 안이 표시로 가득 찬다.

모든 획이 clampOutside 를 거치므로 링 안쪽으로 새어 나갈 길이 없다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 음절 나선

설계 문서 9.2. 이름을 그린다. 순서를 각도가 아니라 **반경**에 인코딩하되, 링 안쪽을 비우므로 **바깥으로** 감아 나간다.

**Files:**
- Create: `src/render/name.ts`
- Test: `tests/render/name.test.ts`

**Interfaces:**
- Consumes: `Syllable` from `src/core/ir`; `consonantFeatures`, `vowelFeatures` from `src/core/phonology`; `LookParams`; `Stroke`, `arcPts`, `bezPts`, `clampOutside`, `strokeMinRadius`; `widthProfile`
- Produces:
  - `interface NameCtx { angle: number; depth: number; n: number; label: string; role: Role }`
  - `nameStrokes(look: LookParams, syllables: Syllable[], ctx: NameCtx, rnd: () => number): Stroke[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/name.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/name.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/name"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/name.ts`:

```ts
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

  const push = (pts: readonly Pt[], widths: number[]) => {
    out.push({ pts: clampOutside([...pts], floor), widths, label, role });
  };

  syllables.forEach((syl, i) => {
    const c = consonantFeatures(syl.onset);
    const v = vowelFeatures(syl.nucleus);
    const hasCoda = syl.coda !== '';
    const c2 = c.secondManner !== null;

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

    // 종성이 있으면 획 끝에 표지를 붙인다
    if (hasCoda) {
      const cc = consonantFeatures(syl.coda);
      const e = pts[pts.length - 1]!;
      const ea = Math.atan2(e[1], e[0]) + (cc.place - 2) * 0.18;
      const L = look.cFringeLen * (0.5 + cc.place * 0.12);
      const tip: Pt = [e[0] + Math.cos(ea) * L, e[1] + Math.sin(ea) * L];
      const mid: Pt = [e[0] + Math.cos(ea + 0.4) * L * 0.55, e[1] + Math.sin(ea + 0.4) * L * 0.55];
      const cp = bezPts(e, mid, tip, 7);
      const w0 = look.cFringeFine * (1.0 + cc.place * 0.15);
      push(cp, widthProfile(cp.length, w0, w0 * look.cFringeTip, 'hair', rnd, 0.4));

      // 겹종성이면 두 번째 자음의 표지를 하나 더. 갈과 갉이 구별되어야 한다.
      if (c2 || cc.secondManner !== null) {
        const sa = ea - 0.55;
        const L2 = L * 0.7;
        const tip2: Pt = [e[0] + Math.cos(sa) * L2, e[1] + Math.sin(sa) * L2];
        const mid2: Pt = [e[0] + Math.cos(sa - 0.3) * L2 * 0.55, e[1] + Math.sin(sa - 0.3) * L2 * 0.55];
        const cp2 = bezPts(e, mid2, tip2, 6);
        const w2 = look.cFringeFine * (0.7 + (cc.secondPlace ?? 2) * 0.12);
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
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/name.test.ts`
Expected: PASS — 11 tests passed

"갈과 갉" 이 실패하면 겹종성이 단자음과 같은 자질을 받고 있는 것이다 — `src/core/phonology.ts` 의 `secondPlace`/`secondManner`/`secondTense` 가 쓰이는지 확인한다. **테스트를 완화하지 말 것.**

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/render/name.ts tests/render/name.test.ts
git commit -m "feat: 음절 나선 — 이름을 그린다

순서를 각도가 아니라 반경에 인코딩한다. 링 둘레에 읽는 방향이 생기지
않으므로 비선형 표기법과 충돌하지 않는다. 링 안쪽을 비우기로 했으므로
바깥으로 감아 나간다.

음성 자질이 형태를 정한다. 겹종성은 두 번째 자음의 표지를 하나 더
붙여 갈과 갉이 구별되게 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 배치 — 구획과 덩어리

**Files:**
- Create: `src/render/layout.ts`
- Test: `tests/render/layout.test.ts`

**Interfaces:**
- Consumes: `Role`, `IR`, `Constituent`, `sortedConstituents`, `constituentKey` from `src/core/ir`; `LookParams`
- Produces:
  - `ROLE_SLOT: Record<Role, number>`
  - `slotAngle(slot: number, jitter: number): number`
  - `MAX_WORDS = 10`
  - `interface Placement { item: Constituent; angle: number; depth: number }`
  - `layout(ir: IR, look: LookParams): { placements: Placement[]; total: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ROLE_SLOT, slotAngle, layout, MAX_WORDS } from '../../src/render/layout';
import { loadLook } from '../../src/render/look';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const look = loadLook();
const ir = (cs: Constituent[], mood: IR['mood'] = 'declarative'): IR =>
  ({ constituents: cs, mood, engineVersion: ENGINE_VERSION });
const C = (lemma: string, role: Constituent['role']): Constituent =>
  ({ kind: 'concept', lemma, role });

describe('역할 지도', () => {
  it('3축 대칭이다 — 짝인 역할이 6슬롯 떨어져 있다', () => {
    expect(Math.abs(ROLE_SLOT['행위'] - ROLE_SLOT['양상'])).toBe(6);
    expect(Math.abs(ROLE_SLOT['주체'] - ROLE_SLOT['대상'])).toBe(6);
    expect(Math.abs(ROLE_SLOT['시간'] - ROLE_SLOT['장소'])).toBe(6);
  });

  it('주 역할은 짝수, 부속은 홀수 슬롯이다', () => {
    for (const r of ['행위','주체','시간','양상','대상','장소'] as const) {
      expect(ROLE_SLOT[r] % 2, r).toBe(0);
    }
    for (const r of ['행위수식','주체수식','시간수식','정도','대상수식','방향'] as const) {
      expect(ROLE_SLOT[r] % 2, r).toBe(1);
    }
  });

  it('부속 슬롯은 자기 주 역할 바로 다음 칸이다', () => {
    expect(ROLE_SLOT['행위수식']).toBe(ROLE_SLOT['행위'] + 1);
    expect(ROLE_SLOT['주체수식']).toBe(ROLE_SLOT['주체'] + 1);
    expect(ROLE_SLOT['시간수식']).toBe(ROLE_SLOT['시간'] + 1);
    expect(ROLE_SLOT['정도']).toBe(ROLE_SLOT['양상'] + 1);
    expect(ROLE_SLOT['대상수식']).toBe(ROLE_SLOT['대상'] + 1);
    expect(ROLE_SLOT['방향']).toBe(ROLE_SLOT['장소'] + 1);
  });

  it('12개 슬롯이 모두 정확히 한 번씩 쓰인다', () => {
    expect(Object.values(ROLE_SLOT).sort((a, b) => a - b))
      .toEqual([0,1,2,3,4,5,6,7,8,9,10,11]);
  });

  it('슬롯 0은 12시, 슬롯 6은 6시다', () => {
    expect(slotAngle(0, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(slotAngle(6, 0)).toBeCloseTo(-Math.PI / 2, 9);
  });
});

describe('layout', () => {
  const three = ir([C('사랑','행위'), C('나','주체'), C('너','대상')]);

  it('성분마다 배치를 하나씩 낸다', () => {
    expect(layout(three, look).placements).toHaveLength(3);
    expect(layout(three, look).total).toBe(3);
  });

  it('성분 순서가 달라도 같은 배치를 낸다', () => {
    const a = layout(three, look).placements;
    const b = layout(ir([C('너','대상'), C('사랑','행위'), C('나','주체')]), look).placements;
    expect(b).toEqual(a);
  });

  it('역할이 뒤바뀌면 배치가 달라진다', () => {
    const a = layout(three, look).placements;
    const b = layout(ir([C('사랑','행위'), C('너','주체'), C('나','대상')]), look).placements;
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it('덩어리 수가 겹쳐 쌓는 깊이를 정한다', () => {
    // 성분이 덩어리 수보다 많으면 남는 것들이 깊이로 쌓여야 한다.
    // 개념마다 자기 덩어리를 만들면 깊이가 전부 0이 되고 원형 윤곽이 깨진다.
    const n = 8;
    const many = ir(Array.from({ length: n }, (_, i) =>
      ({ kind: 'concept', lemma: `w${i}`, role: '행위' } as Constituent)));
    // 사전에 없는 표제어여도 layout 은 자질을 보지 않으므로 동작한다
    const zones = Math.max(1, Math.min(Math.round(look.cZones), n));
    const depths = layout(many, look).placements.map((p) => p.depth);
    expect(Math.max(...depths)).toBe(Math.ceil(n / zones) - 1);
    // 덩어리마다 깊이가 0부터 시작한다
    expect(depths.filter((d) => d === 0)).toHaveLength(zones);
  });

  it('단어 상한을 넘으면 잘라낸다', () => {
    const over = ir(Array.from({ length: MAX_WORDS + 6 }, (_, i) =>
      ({ kind: 'concept', lemma: `w${i}`, role: '행위' } as Constituent)));
    expect(layout(over, look).placements.length).toBeLessThanOrEqual(MAX_WORDS);
  });

  it('깊이는 0 이상이다', () => {
    for (const p of layout(three, look).placements) expect(p.depth).toBeGreaterThanOrEqual(0);
  });

  it('성분이 없으면 던진다', () => {
    expect(() => layout(ir([]), look)).toThrow();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/layout.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/layout"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/layout.ts`:

```ts
import type { LookParams } from './look';
import { sortedConstituents, seedOf, type Constituent, type IR, type Role } from '../core/ir';
import { fnv1a, mulberry32 } from '../core/hash';

/**
 * 12슬롯 역할 지도 — 3축 대칭 (설계 문서 8.2).
 *
 *   축 1: 12시 행위 ↔  6시 양상
 *   축 2:  2시 주체 ↔  8시 대상
 *   축 3:  4시 시간 ↔ 10시 장소
 *
 * 짝인 역할을 마주보게 둔 결과, 주체·대상 반전이 축 2의 180° 회전이 된다.
 * 홀수 슬롯은 바로 앞 짝수 슬롯의 부속이다.
 */
export const ROLE_SLOT: Record<Role, number> = {
  '행위': 0, '행위수식': 1,
  '주체': 2, '주체수식': 3,
  '시간': 4, '시간수식': 5,
  '양상': 6, '정도': 7,
  '대상': 8, '대상수식': 9,
  '장소': 10, '방향': 11,
};

/** 슬롯 번호를 각도로. 0이 12시, 시계방향. */
export function slotAngle(slot: number, jitter: number): number {
  return Math.PI / 2 - ((slot + jitter) / 12) * Math.PI * 2;
}

/**
 * 단어 상한. 넘으면 덩어리가 겹쳐 쌓이다 링에서 너무 멀어진다 (설계 문서 9.5.1b).
 *
 * 문장 상한(5개)은 여기 없다. 현재 `IR` 은 문장 하나를 나타내므로 다중 문장은
 * IR 확장이 필요하고, 그것은 파서(계획 III)에서 다룬다.
 */
export const MAX_WORDS = 10;

export interface Placement {
  item: Constituent;
  /** 덩어리 중심 각도 */
  angle: number;
  /** 같은 덩어리 안에서 겹쳐 쌓는 깊이. 바깥으로 쌓인다 */
  depth: number;
}

const wrapPi = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/**
 * 성분들을 덩어리에 배분하고 각 덩어리의 각도를 정한다.
 *
 * 개념마다 자기 덩어리를 만들면 개념이 많을 때 원형 윤곽이 깨진다. 실제
 * 로고그램은 덩어리가 1~3군데뿐이고 복잡함은 그 안의 밀도로 온다. 그래서
 * 덩어리 수는 `cZones` 로 고정되고 개념들이 나눠 담긴다.
 *
 * 덩어리 각도는 구성원 슬롯 각도의 원형 평균이다 — 역할 지도가 위치를 정한다.
 *
 * 성분은 canonical 순서로 순회하므로 파서가 어떤 순서로 뱉어도 결과가 같다.
 */
export function layout(ir: IR, look: LookParams): { placements: Placement[]; total: number } {
  const items = sortedConstituents(ir).slice(0, MAX_WORDS);
  if (items.length === 0) throw new Error('layout: IR에 성분이 없다');

  const zones = Math.max(1, Math.min(Math.round(look.cZones), items.length));
  const buckets: Constituent[][] = Array.from({ length: zones }, () => []);
  items.forEach((it, i) => buckets[i % zones]!.push(it));

  const rnd = mulberry32(fnv1a(`zone|${seedOf(ir)}`));
  const fallback = rnd() * Math.PI * 2;

  const placements: Placement[] = [];
  buckets.forEach((members, zi) => {
    if (members.length === 0) return;
    let sx = 0, sy = 0;
    for (const m of members) {
      const a = slotAngle(ROLE_SLOT[m.role], 0.5);
      sx += Math.cos(a); sy += Math.sin(a);
    }
    const center = (sx * sx + sy * sy) > 1e-12
      ? Math.atan2(sy, sx)
      : fallback + (zi / zones) * Math.PI * 2;

    members.forEach((m, mi) => {
      const spread = (mi - (members.length - 1) / 2) * look.cBloomSpan * 0.30;
      placements.push({ item: m, angle: wrapPi(center + spread), depth: mi });
    });
  });

  return { placements, total: items.length };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/layout.test.ts`
Expected: PASS — 14 tests passed

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/render/layout.ts tests/render/layout.test.ts
git commit -m "feat: 역할 지도와 덩어리 배치

덩어리 수는 개념 수와 무관하게 고정되고 개념들이 나눠 담긴다. 개념마다
자기 덩어리를 만들면 개념이 많을 때 원형 윤곽이 깨진다.

성분을 canonical 순서로 순회하므로 파서가 어떤 순서로 뱉어도 배치가
같다. 단어 상한 10개를 넘으면 잘라낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: 조립 — IR에서 SVG로

**Files:**
- Create: `src/render/compose.ts`
- Modify: `src/render/geometry.ts` — `outlineOf` 추가
- Test: `tests/render/compose.test.ts`

**Interfaces:**
- Consumes: 앞의 모든 태스크
- Produces:
  - `outlineOf(pts: Pt[], widths: number[]): string` — `geometry.ts`
  - `interface RenderOptions { size?: number; minStrokeWidth?: number }`
  - `interface StrokeMeta { d: string; role: string; label: string; minWidth: number }`
  - `interface RenderResult { svg: string; strokes: StrokeMeta[]; seed: number; engineVersion: string }`
  - `render(ir: IR, lex: Lexicon, look: LookParams, opts?: RenderOptions): RenderResult`

- [ ] **Step 1: `geometry.ts` 에 `outlineOf` 추가**

`src/render/geometry.ts` 끝에 추가:

```ts
/**
 * 굵기가 배열로 주어진 획의 닫힌 윤곽선.
 *
 * `taperOutline` 은 굵기를 함수로 받지만, 획 어휘는 점마다의 굵기를 배열로
 * 낳는다. 함수로 감싸 보간하면 표본 위치가 어긋나므로 배열을 직접 쓴다.
 */
export function outlineOf(pts: Pt[], widths: number[]): string {
  if (pts.length < 2) throw new Error(`outlineOf: needs >= 2 points, got ${pts.length}`);
  if (widths.length !== pts.length) {
    throw new Error(`outlineOf: widths(${widths.length}) != pts(${pts.length})`);
  }
  const last = pts.length - 1;
  return taperOutline(pts, (t) => widths[Math.round(t * last)] ?? 0);
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/render/compose.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render } from '../../src/render/compose';
import { outlineOf } from '../../src/render/geometry';
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
const three = ir([C('사랑','행위'), C('나','주체'), C('너','대상')]);

describe('outlineOf', () => {
  it('닫힌 패스를 낸다', () => {
    const d = outlineOf([[0,0],[1,0],[2,0]], [0.2, 0.2, 0.2]);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('길이가 안 맞으면 던진다', () => {
    expect(() => outlineOf([[0,0],[1,0]], [0.2])).toThrow();
  });
});

describe('render', () => {
  it('유효한 SVG 문서를 낸다', () => {
    const { svg } = render(three, lex, look);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 300 300"');
  });

  it('입력·IR·엔진 버전을 메타데이터로 담는다', () => {
    const { svg } = render(three, lex, look);
    expect(svg).toContain(`data-engine-version="${ENGINE_VERSION}"`);
    expect(svg).toContain('<metadata>');
    expect(svg).toContain('사랑');
  });

  it('12분할 격자를 그리지 않는다', () => {
    expect(render(three, lex, look).svg).not.toContain('<line');
  });

  it('링과 각 성분의 획 메타데이터를 낸다', () => {
    const { strokes } = render(three, lex, look);
    expect(strokes.some((s) => s.role === 'ring')).toBe(true);
    for (const label of ['사랑','나','너']) {
      expect(strokes.some((s) => s.label === label), label).toBe(true);
    }
  });

  it('획 메타데이터의 역할이 실제 성분 역할과 일치한다', () => {
    const { strokes } = render(three, lex, look);
    expect(strokes.find((s) => s.label === '나')!.role).toBe('주체');
    expect(strokes.find((s) => s.label === '너')!.role).toBe('대상');
    expect(strokes.find((s) => s.label === '사랑')!.role).toBe('행위');
  });

  it('모든 획이 라벨을 갖는다 — 소유자 없는 획이 없다', () => {
    for (const s of render(three, lex, look).strokes) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it('음소 성분을 그린다', () => {
    const withName = ir([
      C('사랑','행위'), C('나','주체'),
      { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') },
    ]);
    const { strokes } = render(withName, lex, look);
    expect(strokes.some((s) => s.role === '대상')).toBe(true);
  });

  it('사전에 없는 표제어는 던진다', () => {
    expect(() => render(ir([C('없는말','행위')]), lex, look)).toThrow(/없는말/);
  });

  it('성분이 없으면 던진다', () => {
    expect(() => render(ir([]), lex, look)).toThrow();
  });

  it('size 옵션이 viewBox 에 반영된다', () => {
    expect(render(three, lex, look, { size: 512 }).svg).toContain('viewBox="0 0 512 512"');
  });

  it('seed 와 engineVersion 을 반환한다', () => {
    const r = render(three, lex, look);
    expect(typeof r.seed).toBe('number');
    expect(r.engineVersion).toBe(ENGINE_VERSION);
  });

  it('모든 패스가 닫혀 있다', () => {
    const { svg } = render(three, lex, look);
    for (const d of svg.match(/ d="[^"]+"/g) ?? []) expect(d.endsWith('Z"')).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/compose.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/compose"`

- [ ] **Step 4: 최소 구현 작성**

`src/render/compose.ts`:

```ts
import { seedOf, subSeed, constituentKey, type Constituent, type IR, type Role } from '../core/ir';
import { mulberry32 } from '../core/hash';
import { lookup, type Lexicon } from '../core/lexicon';
import { ENGINE_VERSION } from '../version';
import type { LookParams } from './look';
import { conceptParams } from './mapping';
import { outlineOf, type Pt } from './geometry';
import { ringStrokes, bloomStrokes } from './vocab';
import { nameStrokes } from './name';
import { layout } from './layout';
import type { Stroke } from './stroke';

/**
 * 획 어휘가 쓰는 p 공간에서 로고그램이 차지하는 반지름 여유.
 * 반경 0.45 의 링이 화면 반쪽의 0.5 를 차지하도록 잡은 값이다.
 */
export const P_SPAN = 0.9;

/** p 공간 → 화면 좌표 배율. `necklace.ts` 가 단위를 환산할 때도 쓴다. */
export function scaleFor(size: number): number {
  return (size * 0.5) / P_SPAN;
}

export interface RenderOptions {
  /** viewBox 한 변. 기본 300 */
  size?: number;
  /**
   * 모든 획 폭의 하한. **p 공간 단위다** (화면 픽셀이 아니다).
   * 기본 0 (제한 없음). 목걸이 모드에서 쓴다 — `necklace.ts` 가
   * mm 하한을 `scaleFor` 로 환산해 넘긴다.
   */
  minStrokeWidth?: number;
}

export interface StrokeMeta {
  d: string;
  role: Role | 'ring';
  /** 사람이 읽을 라벨. 분해 보기 UI 가 쓴다 */
  label: string;
  minWidth: number;
}

export interface RenderResult {
  svg: string;
  strokes: StrokeMeta[];
  seed: number;
  engineVersion: string;
}

const INK = '#16120e';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function labelOf(c: Constituent): string {
  if (c.kind === 'concept') return c.lemma;
  return c.syllables.map((s) => `${s.onset}${s.nucleus}${s.coda}`).join('');
}

/**
 * IR → SVG. 순수 함수이며 브라우저 API 에 의존하지 않는다.
 *
 * 성분은 canonical 순서로 순회하고 성분마다 독립된 서브시드를 쓰기 때문에,
 * 파서가 성분을 어떤 순서로 뱉어도 결과가 같다 (원칙 1).
 *
 * 조형 수치는 전부 `look` 에서 온다. 이 파일에 수치를 박지 않는다.
 */
export function render(
  ir: IR, lex: Lexicon, look: LookParams, opts: RenderOptions = {},
): RenderResult {
  const size = opts.size ?? 300;
  const floor = opts.minStrokeWidth ?? 0;
  const seed = seedOf(ir);
  const { placements, total } = layout(ir, look);

  const scale = scaleFor(size);
  const cx = size / 2, cy = size / 2;

  const all: Stroke[] = [];

  // ── 링 ──
  all.push(...ringStrokes(look, mulberry32(subSeed(seed, 'ring'))));

  // ── 성분 ──
  for (const pl of placements) {
    const key = constituentKey(pl.item);
    const rnd = mulberry32(subSeed(seed, key));
    const label = labelOf(pl.item);
    if (pl.item.kind === 'phonetic') {
      all.push(...nameStrokes(look, pl.item.syllables,
        { angle: pl.angle, depth: pl.depth, n: total, label, role: pl.item.role }, rnd));
    } else {
      const entry = lookup(lex, pl.item.lemma);
      if (!entry) throw new Error(`render: 사전에 없는 표제어 "${pl.item.lemma}"`);
      const sp = conceptParams(entry.features);
      all.push(...bloomStrokes(look, sp,
        { angle: pl.angle, depth: pl.depth, n: total, label, role: pl.item.role }, rnd));
    }
  }

  // ── SVG ──
  const body: string[] = [];
  const strokes: StrokeMeta[] = [];
  for (const s of all) {
    if (s.pts.length < 2) continue;
    const widths = floor > 0 ? s.widths.map((w) => Math.max(w, floor)) : s.widths;
    // p 공간에서 화면 좌표로. y 는 위쪽이 + 이므로 뒤집는다.
    const pts: Pt[] = s.pts.map((p) => [cx + p[0] * scale, cy - p[1] * scale]);
    const d = outlineOf(pts, widths.map((w) => w * scale));
    body.push(`<path d="${d}" fill="${INK}" fill-rule="nonzero"/>`);
    strokes.push({ d, role: s.role, label: s.label, minWidth: Math.min(...widths) * scale });
  }

  const meta = escapeXml(JSON.stringify({ ir, seed, engineVersion: ENGINE_VERSION }));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" data-engine-version="${ENGINE_VERSION}">` +
    `<metadata>${meta}</metadata>` + body.join('') + `</svg>`;

  return { svg, strokes, seed, engineVersion: ENGINE_VERSION };
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/compose.test.ts`
Expected: PASS — 14 tests passed

- [ ] **Step 6: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 7: 커밋**

```bash
git add src/render/compose.ts src/render/geometry.ts tests/render/compose.test.ts
git commit -m "feat: IR에서 SVG로 조립

성분을 canonical 순서로 순회하고 성분마다 독립된 서브시드를 쓴다.
파서가 어떤 순서로 뱉어도 결과가 같다.

조형 수치는 전부 look 에서 온다. 이 파일에 수치를 박지 않는다.
획별 메타데이터를 함께 내어 분해 보기와 목걸이 검증이 같은 데이터를 쓴다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: 불변식 테스트와 골든 파일

설계 문서 14절의 핵심 테스트다. **이 테스트가 깨지면 원칙이 깨진 것이므로, 구현을 고쳐서 통과시켜야 하고 테스트를 완화해서는 안 된다.**

**Files:**
- Test: `tests/render/invariants.test.ts`

**Interfaces:**
- Consumes: `render`, `loadLook`, `loadSeedLexicon`, `syllabify`
- Produces: 없음 (테스트 전용)

- [ ] **Step 1: 불변식 테스트 작성**

`tests/render/invariants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, scaleFor } from '../../src/render/compose';
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
      for (const s of strokes) {
        // 패스의 d 에서만 좌표를 읽는다. SVG 전체를 훑으면 <metadata> 의
        // IR JSON 에 든 숫자(engineVersion "1.0.0" 등)를 좌표로 오인한다.
        const nums = s.d.match(/-?\d+\.\d+/g) ?? [];
        expect(nums.length).toBeGreaterThan(0);
        for (let i = 0; i + 1 < nums.length; i += 2) {
          worst = Math.min(worst, Math.hypot(Number(nums[i]) - cx, Number(nums[i + 1]) - cy));
        }
      }
      expect(worst, `성분 ${cs.length}개`).toBeGreaterThan(floorPx(size) * 0.92);
    }
  });

  it('링은 하나다 — ring 획이 정해진 개수뿐이다', () => {
    const ringCount = render(ir([LOVE, ME_S, YOU_O]), lex, look)
      .strokes.filter((s) => s.role === 'ring').length;
    expect(ringCount).toBe(look.cGaps + 1 + look.cDouble);
  });

  it('복잡도 예산 — 성분이 늘어도 획 수가 비례해서 늘지 않는다', () => {
    const n = (cs: Constituent[]) => render(ir(cs), lex, look).strokes.length;
    const one = n([LOVE]);
    const six = n([LOVE, ME_S, YOU_O, C('영원','시간수식'), C('어제','시간'), C('여기','장소')]);
    expect(six).toBeLessThan(one * 6);
  });
});

describe('골든 파일 — 의도치 않은 조형 변화 감지', () => {
  const golden: Array<[string, IR]> = [
    ['사랑', ir([LOVE])],
    ['나는 너를 사랑해', ir([LOVE, ME_S, YOU_O])],
    ['너는 나를 사랑해', ir([LOVE, YOU_S, ME_O])],
    ['나는 너를 영원히 사랑해', ir([LOVE, ME_S, YOU_O, C('영원','시간수식')])],
    ['나는 루이즈를 사랑해', ir([LOVE, ME_S,
      { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') }])],
  ];
  for (const [name, input] of golden) {
    it(`${name} 의 SVG가 고정되어 있다`, () => {
      expect(render(input, lex, look).svg).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 2: 테스트 실행 — 스냅샷이 생성된다**

Run: `npx vitest run tests/render/invariants.test.ts`
Expected: PASS — 16 tests passed, `5 snapshots written`

실패했을 때 흔한 원인:
- `compose.ts` 가 `layout()` 대신 `ir.constituents` 를 직접 순회한다 → 의미 동일성 실패
- 성분별 `subSeed` 대신 공유 난수기를 쓴다 → 의미 동일성 실패
- 덩어리 각도가 `ROLE_SLOT` 이 아니라 표제어 해시에서 나온다 → 역할 구별 실패
- 어느 생성기가 `clampOutside` 를 거치지 않는다 → 링 안쪽 검사 실패

- [ ] **Step 3: 스냅샷이 안정적인지 재실행으로 확인**

Run: `npx vitest run tests/render/invariants.test.ts`
Expected: PASS — `5 snapshots passed`, written 0

- [ ] **Step 4: 전체 테스트 실행**

Run: `npm test`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add tests/render/invariants.test.ts tests/render/__snapshots__
git commit -m "test: 결정성·의미 동일성·역할 구별·링 안쪽 비움 불변식

설계 문서 14절의 핵심 테스트. 이것이 깨지면 원칙이 깨진 것이므로
구현을 고쳐야 하고 테스트를 완화해서는 안 된다.

링 안쪽 비움 검사는 렌더된 SVG 의 모든 좌표를 훑어 중심까지의 거리를
잰다. 이 프로젝트에서 가장 자주 깨졌던 제약이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: 목걸이 내보내기

설계 문서 12.2. **이 프로젝트의 실제 목적물이다.**

**주의:** 화면 렌더러는 침식(`pErode` 상한)을 거치므로 링이 얇고 끊겨 보이지만, 각인용 SVG 는 침식을 거치지 않아 골격 그대로의 두꺼운 링이 나온다. 이 차이를 눈으로 확인해야 한다.

**Files:**
- Create: `src/render/necklace.ts`
- Test: `tests/render/necklace.test.ts`

**Interfaces:**
- Consumes: `render`, `RenderResult` from `src/render/compose`; `IR`; `Lexicon`; `LookParams`
- Produces:
  - `interface NecklaceOptions { diameterMm: number; minStrokeMm: number; size: number }`
  - `DEFAULT_NECKLACE: NecklaceOptions`
  - `renderForNecklace(ir, lex, look, opts?): RenderResult`
  - `validateNecklace(result: RenderResult, opts: NecklaceOptions): string[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/necklace.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderForNecklace, validateNecklace, DEFAULT_NECKLACE } from '../../src/render/necklace';
import { render } from '../../src/render/compose';
import { loadLook } from '../../src/render/look';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { syllabify } from '../../src/core/phonology';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const look = loadLook();
const lex = loadSeedLexicon();
const sample: IR = {
  constituents: [
    { kind: 'concept', lemma: '사랑', role: '행위' },
    { kind: 'concept', lemma: '나', role: '주체' },
    { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') },
  ],
  mood: 'declarative',
  engineVersion: ENGINE_VERSION,
};

const floorPx = (o: typeof DEFAULT_NECKLACE) => (o.minStrokeMm / o.diameterMm) * o.size;

describe('renderForNecklace', () => {
  it('모든 획 폭이 하한 이상이다', () => {
    const r = renderForNecklace(sample, lex, look);
    const floor = floorPx(DEFAULT_NECKLACE);
    for (const s of r.strokes) expect(s.minWidth, s.label).toBeGreaterThanOrEqual(floor - 1e-6);
  });

  it('모든 패스가 닫혀 있다', () => {
    const { svg } = renderForNecklace(sample, lex, look);
    for (const d of svg.match(/ d="[^"]+"/g) ?? []) expect(d.endsWith('Z"')).toBe(true);
  });

  it('엔진 버전과 IR을 메타데이터로 담는다 — 수년 후 재현용', () => {
    const { svg } = renderForNecklace(sample, lex, look);
    expect(svg).toContain(`data-engine-version="${ENGINE_VERSION}"`);
    expect(svg).toContain('<metadata>');
  });

  it('화면용보다 큰 좌표계를 쓴다 — 정밀도 확보', () => {
    expect(renderForNecklace(sample, lex, look).svg).toContain('viewBox="0 0 600 600"');
  });

  it('결정적이다', () => {
    expect(renderForNecklace(sample, lex, look).svg)
      .toBe(renderForNecklace(sample, lex, look).svg);
  });

  it('최소 선폭을 바꾸면 결과가 달라진다', () => {
    const minOf = (r: ReturnType<typeof renderForNecklace>) =>
      Math.min(...r.strokes.map((s) => s.minWidth));
    expect(minOf(renderForNecklace(sample, lex, look, { minStrokeMm: 1.2 })))
      .toBeGreaterThan(minOf(renderForNecklace(sample, lex, look, { minStrokeMm: 0.2 })));
  });
});

describe('validateNecklace', () => {
  it('목걸이 모드 출력은 위반이 없다', () => {
    expect(validateNecklace(renderForNecklace(sample, lex, look), DEFAULT_NECKLACE)).toEqual([]);
  });

  it('화면용 출력은 위반을 보고한다', () => {
    const v = validateNecklace(render(sample, lex, look, { size: 600 }), DEFAULT_NECKLACE);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/폭/);
  });

  it('위반 메시지에 어느 획인지 담는다', () => {
    const v = validateNecklace(render(sample, lex, look, { size: 600 }), DEFAULT_NECKLACE);
    expect(v.some((x) => /사랑|나|루이즈|링/.test(x))).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/necklace.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/necklace"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/necklace.ts`:

```ts
import { render, scaleFor, type RenderResult } from './compose';
import type { IR } from '../core/ir';
import type { Lexicon } from '../core/lexicon';
import type { LookParams } from './look';

export interface NecklaceOptions {
  /** 펜던트 지름 (mm) */
  diameterMm: number;
  /** 물리적으로 재현 가능한 최소 선폭 (mm). 제작소 공정에 맞춰 조정한다 */
  minStrokeMm: number;
  /** SVG 좌표계 한 변. 화면용보다 크게 잡아 정밀도를 확보한다 */
  size: number;
}

/**
 * 기본 프리셋. 지름 20mm 펜던트, 최소 선폭 0.6mm.
 * 최소 선폭은 실제 제작소 공정을 확인해 확정한다.
 */
export const DEFAULT_NECKLACE: NecklaceOptions = {
  diameterMm: 20,
  minStrokeMm: 0.6,
  size: 600,
};

const floorPxOf = (o: NecklaceOptions): number => (o.minStrokeMm / o.diameterMm) * o.size;

/**
 * 목걸이 각인용 렌더 (설계 문서 12.2).
 *
 * 각인·레이저컷은 너무 얇은 획을 재현하지 못한다. 화면에서 사라지는 붓끝이
 * 실물에서는 소실되거나 반대로 뭉친다. 그래서 굵기 하한을 걸어 다시 그린다.
 *
 * 화면 렌더러는 침식을 거치므로 링이 얇고 끊겨 보이지만, 각인용은 침식을
 * 거치지 않아 골격 그대로의 두꺼운 링이 나온다. 이 차이는 의도된 것이다.
 */
export function renderForNecklace(
  ir: IR, lex: Lexicon, look: LookParams, opts: Partial<NecklaceOptions> = {},
): RenderResult {
  const merged: NecklaceOptions = { ...DEFAULT_NECKLACE, ...opts };
  return render(ir, lex, look, {
    size: merged.size,
    // 하한은 mm → 화면 px → p 공간 순으로 환산한다.
    // `RenderOptions.minStrokeWidth` 는 p 공간 단위다.
    minStrokeWidth: floorPxOf(merged) / scaleFor(merged.size),
  });
}

/** 각인 가능성 검증. 위반 목록을 반환하며, 빈 배열이면 통과. */
export function validateNecklace(result: RenderResult, opts: NecklaceOptions): string[] {
  const floor = floorPxOf(opts);
  const problems: string[] = [];
  for (const s of result.strokes) {
    if (s.minWidth < floor - 1e-6) {
      problems.push(
        `획 "${s.label}" (${String(s.role)}) 의 최소 폭 ${s.minWidth.toFixed(3)}px 가 ` +
        `하한 ${floor.toFixed(3)}px 미만이다`);
    }
    if (!s.d.trimEnd().endsWith('Z')) {
      problems.push(`획 "${s.label}" (${String(s.role)}) 의 패스가 닫혀 있지 않다`);
    }
  }
  return problems;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/necklace.test.ts`
Expected: PASS — 9 tests passed

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/render/necklace.ts tests/render/necklace.test.ts
git commit -m "feat: 목걸이 각인용 내보내기와 검증

각인은 너무 얇은 획을 재현하지 못한다. 굵기 하한을 걸어 다시 그리고,
모든 획이 하한 이상인지와 패스가 닫혀 있는지 검증한다.

화면 렌더러는 침식을 거쳐 링이 얇고 끊겨 보이지만 각인용은 침식을
거치지 않아 골격 그대로의 두꺼운 링이 나온다. 의도된 차이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: CLI

이 태스크가 끝나면 **웹앱 없이도 목걸이 파일을 뽑을 수 있다.**

**Files:**
- Create: `src/cli.ts`, `fixtures/love-louise.ir.json`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `render`, `renderForNecklace`, `validateNecklace`, `DEFAULT_NECKLACE`, `loadLook`, `loadSeedLexicon`
- Produces:
  - `interface CliArgs { input: string; out: string; necklace: boolean; size?: number; minStrokeMm?: number }`
  - `parseArgs(argv: string[]): CliArgs`
  - `runCli(argv: string[]): Promise<number>`

- [ ] **Step 1: 픽스처 작성**

`fixtures/love-louise.ir.json`:

```json
{
  "constituents": [
    { "kind": "concept", "lemma": "사랑", "role": "행위" },
    { "kind": "concept", "lemma": "나", "role": "주체" },
    {
      "kind": "phonetic", "role": "대상",
      "syllables": [
        { "onset": "l", "nucleus": "u", "coda": "" },
        { "onset": "", "nucleus": "i", "coda": "" },
        { "onset": "j", "nucleus": "eu", "coda": "" }
      ]
    }
  ],
  "mood": "declarative",
  "engineVersion": "1.0.0"
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/cli.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, runCli } from '../src/cli';

const tmp = mkdtempSync(join(tmpdir(), 'heptapod-cli-'));
const created: string[] = [];
const outPath = (name: string): string => {
  const p = join(tmp, name);
  created.push(p);
  return p;
};
afterEach(() => { for (const p of created.splice(0)) if (existsSync(p)) rmSync(p); });

describe('parseArgs', () => {
  it('필수 인자를 읽는다', () => {
    const a = parseArgs(['--ir', 'a.json', '--out', 'b.svg']);
    expect(a.input).toBe('a.json');
    expect(a.out).toBe('b.svg');
    expect(a.necklace).toBe(false);
  });

  it('--necklace 플래그를 읽는다', () => {
    expect(parseArgs(['--ir','a.json','--out','b.svg','--necklace']).necklace).toBe(true);
  });

  it('--size 와 --min-stroke-mm 을 숫자로 읽는다', () => {
    const a = parseArgs(['--ir','a.json','--out','b.svg','--size','512','--min-stroke-mm','0.8']);
    expect(a.size).toBe(512);
    expect(a.minStrokeMm).toBeCloseTo(0.8, 6);
  });

  it('--ir 이 없으면 던진다', () => {
    expect(() => parseArgs(['--out','b.svg'])).toThrow(/--ir/);
  });

  it('--out 이 없으면 던진다', () => {
    expect(() => parseArgs(['--ir','a.json'])).toThrow(/--out/);
  });
});

describe('runCli', () => {
  it('화면용 SVG 파일을 쓰고 0을 반환한다', async () => {
    const out = outPath('screen.svg');
    expect(await runCli(['--ir','fixtures/love-louise.ir.json','--out',out])).toBe(0);
    const svg = readFileSync(out, 'utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 300 300"');
  });

  it('--necklace 로 각인용 SVG를 쓴다', async () => {
    const out = outPath('necklace.svg');
    expect(await runCli(['--ir','fixtures/love-louise.ir.json','--out',out,'--necklace'])).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('viewBox="0 0 600 600"');
  });

  it('두 번 실행하면 바이트 단위로 같은 파일을 쓴다 — 원칙 1', async () => {
    const a = outPath('det-a.svg'), b = outPath('det-b.svg');
    await runCli(['--ir','fixtures/love-louise.ir.json','--out',a,'--necklace']);
    await runCli(['--ir','fixtures/love-louise.ir.json','--out',b,'--necklace']);
    expect(readFileSync(a,'utf8')).toBe(readFileSync(b,'utf8'));
  });

  it('없는 파일을 주면 0이 아닌 코드를 반환한다', async () => {
    expect(await runCli(['--ir','fixtures/없음.json','--out',outPath('x.svg')])).not.toBe(0);
  });

  it('사전에 없는 표제어가 있으면 0이 아닌 코드를 반환한다', async () => {
    const bad = outPath('bad.ir.json');
    writeFileSync(bad, JSON.stringify({
      constituents: [{ kind: 'concept', lemma: '없는말', role: '행위' }],
      mood: 'declarative', engineVersion: '1.0.0',
    }));
    expect(await runCli(['--ir',bad,'--out',outPath('y.svg')])).not.toBe(0);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/cli.test.ts`
Expected: FAIL — `Failed to resolve import "../src/cli"`

- [ ] **Step 4: 최소 구현 작성**

`src/cli.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { render } from './render/compose';
import { renderForNecklace, validateNecklace, DEFAULT_NECKLACE } from './render/necklace';
import { loadLook } from './render/look';
import { loadSeedLexicon } from './core/lexicon';
import type { IR } from './core/ir';

export interface CliArgs {
  input: string;
  out: string;
  necklace: boolean;
  size?: number;
  minStrokeMm?: number;
}

const USAGE = `
사용법: npm run glyph -- --ir <IR.json> --out <out.svg> [옵션]

옵션:
  --necklace              목걸이 각인용으로 내보낸다 (최소 선폭 보정)
  --size <px>             SVG 좌표계 한 변. 화면용 기본 300, 각인용 기본 600
  --min-stroke-mm <mm>    각인 최소 선폭. 기본 ${DEFAULT_NECKLACE.minStrokeMm}
`.trim();

export function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const input = get('--ir');
  const out = get('--out');
  if (!input) throw new Error(`--ir 이 필요하다\n\n${USAGE}`);
  if (!out) throw new Error(`--out 이 필요하다\n\n${USAGE}`);
  const sizeRaw = get('--size');
  const mmRaw = get('--min-stroke-mm');
  return {
    input, out,
    necklace: argv.includes('--necklace'),
    ...(sizeRaw !== undefined ? { size: Number(sizeRaw) } : {}),
    ...(mmRaw !== undefined ? { minStrokeMm: Number(mmRaw) } : {}),
  };
}

export async function runCli(argv: string[]): Promise<number> {
  let args: CliArgs;
  try { args = parseArgs(argv); }
  catch (e) { console.error((e as Error).message); return 2; }

  let ir: IR;
  try { ir = JSON.parse(readFileSync(args.input, 'utf8')) as IR; }
  catch (e) {
    console.error(`IR 파일을 읽을 수 없다: ${args.input}\n${(e as Error).message}`);
    return 3;
  }

  const lex = loadSeedLexicon();
  const look = loadLook();
  try {
    if (args.necklace) {
      const opts = {
        ...(args.size !== undefined ? { size: args.size } : {}),
        ...(args.minStrokeMm !== undefined ? { minStrokeMm: args.minStrokeMm } : {}),
      };
      const result = renderForNecklace(ir, lex, look, opts);
      const merged = { ...DEFAULT_NECKLACE, ...opts };
      const problems = validateNecklace(result, merged);
      if (problems.length > 0) {
        console.error('각인 가능성 검증 실패:');
        for (const p of problems) console.error(`  - ${p}`);
        return 5;
      }
      writeFileSync(args.out, result.svg, 'utf8');
      console.log(`각인용 SVG를 썼다: ${args.out} (최소 선폭 ${merged.minStrokeMm}mm, 지름 ${merged.diameterMm}mm)`);
    } else {
      const result = render(ir, lex, look, args.size !== undefined ? { size: args.size } : {});
      writeFileSync(args.out, result.svg, 'utf8');
      console.log(`SVG를 썼다: ${args.out} (획 ${result.strokes.length}개, 시드 ${result.seed})`);
    }
  } catch (e) {
    console.error(`렌더 실패: ${(e as Error).message}`);
    return 4;
  }
  return 0;
}

// 직접 실행될 때만 프로세스를 종료시킨다. 테스트는 runCli 를 직접 부른다.
if (process.argv[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(await runCli(process.argv.slice(2)));
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/cli.test.ts`
Expected: PASS — 11 tests passed

- [ ] **Step 6: CLI를 실제로 실행해 결과물을 확인**

Run: `npm run glyph -- --ir fixtures/love-louise.ir.json --out out-necklace.svg --necklace`
Expected: `각인용 SVG를 썼다: out-necklace.svg (최소 선폭 0.6mm, 지름 20mm)`

생성된 SVG를 브라우저로 열어 눈으로 확인한다. **화면 렌더러와 달라 보이는 것이 정상이다** — 각인용은 침식을 거치지 않으므로 링이 두껍고 끊기지 않는다.

- [ ] **Step 7: `.gitignore` 에 출력물 추가**

`.gitignore` 에 다음 줄을 추가한다 (이미 있으면 건너뛴다):

```
out-*.svg
```

- [ ] **Step 8: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과

- [ ] **Step 9: 커밋**

```bash
git add src/cli.ts fixtures/love-louise.ir.json tests/cli.test.ts .gitignore
git commit -m "feat: CLI — IR 파일에서 화면용·각인용 SVG 생성

웹앱 없이도 목걸이 파일을 뽑을 수 있다. 자연어 입력은 계획 III에서 붙는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 완료 조건

- [ ] `npm test` 가 전부 통과한다
- [ ] `npm run typecheck` 가 에러 없이 끝난다
- [ ] 같은 IR을 두 번 렌더하면 **바이트 단위로 같은 SVG**가 나온다
- [ ] 성분 순서를 섞어도 같은 SVG가 나온다
- [ ] 주체·대상을 뒤바꾸면 다른 SVG가 나온다
- [ ] `정호`와 `호정`, `갈`과 `갉`이 다른 SVG를 낳는다
- [ ] **렌더된 SVG의 어떤 좌표도 링 안쪽에 없다**
- [ ] 조형 수치가 코드에 박혀 있지 않다 — `design/look-v3.json` 만 고치면 형태가 바뀐다
- [ ] `npm run glyph -- --ir <파일> --out <파일> --necklace` 로 **각인 가능성 검증을 통과한 SVG**를 얻는다
- [ ] 골든 스냅샷 5개가 고정되어, 이후 변경이 조형을 건드리면 테스트가 알려준다

**이 시점에서 목걸이를 제작할 수 있다.** IR JSON을 손으로 쓰면 되고, 자연어 입력은 계획 III에서 붙는다.

---

## 다음 계획

| 계획 | 내용 | 이 계획에 대한 의존 |
|---|---|---|
| III. 파서 | 한국어·영어 → IR (스펙 7.3, 7.4) | `core/ir.ts` 의 IR 타입, `core/phonology.ts` 의 `syllabify` |
| IV. 화면 렌더러 | 마스크 텍스처 + 스모크 셰이더 + 분사 애니메이션 (스펙 9.5) | `Stroke` 를 삼각형으로 변환. `spikes/look-lab.html` 이 참조 구현 |
| V. 웹앱 | UI, 분해 보기, 공유 URL, PNG 내보내기, 사전 브라우저 (스펙 11, 12.1) | `RenderResult.strokes` 가 분해 보기 데이터 |
| VI. 사전 자가 성장 | 빌드타임 생성, Worker, 잠정 등재 (스펙 10) | `core/lexicon.ts` 의 `LexiconEntry` 스키마 |
