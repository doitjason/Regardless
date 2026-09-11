# 코어 엔진 (IR → SVG) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 언어 중립 의미 표현(IR)을 받아 헵타포드 B 양식의 SVG 로고그램을 결정적으로 생성하는 순수 함수와, 그것으로 목걸이 각인 파일을 뽑는 CLI를 만든다.

**Architecture:** `render(ir, lexicon, opts) → RenderResult` 하나의 순수 함수. 브라우저 API에 의존하지 않으므로 Node에서 실행되고 테스트된다. 난수는 정규화된 IR의 해시를 시드로 하는 의사난수이며, 성분마다 별도의 서브시드를 갖기 때문에 성분 순회 순서가 결과에 영향을 주지 않는다. 출력은 SVG 문자열과 함께 획별 메타데이터를 반환해, 후속 계획의 "분해 보기" UI와 목걸이 검증이 같은 데이터를 쓴다.

**Tech Stack:** TypeScript 5, Vitest 2, Vite 5 (후속 계획에서 사용), 런타임 의존성 없음

## Global Constraints

설계 문서 `docs/superpowers/specs/2026-09-11-heptapod-b-design.md`에서 그대로 가져온 프로젝트 전역 제약. 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **원칙 1 (결정성):** 같은 입력은 항상 같은 로고그램을 낳는다. 렌더러에 생성 모델을 쓰지 않는다. 유기적 불규칙성은 난수가 아니라 **정규화된 IR의 해시를 시드로 하는 의사난수**로 만든다.
- **원칙 2 (모든 획은 의미를 담당한다):** 장식을 위해 존재하는 획은 없다. 형태의 차이는 반드시 의미의 차이에서 온다.
- **엔진 버전:** `engineVersion` 문자열을 도입하고, 내보낸 SVG에 입력·IR·엔진 버전을 메타데이터로 **반드시 embed**한다. 이번 계획의 값은 `"1.0.0"`.
- **시드 계산:** `canonicalize(IR)` → FNV-1a 32비트 해시 → mulberry32. 정렬을 거치므로 파서가 성분을 어떤 순서로 뱉어도 시드가 같다.
- **12슬롯 격자는 내부 계산에만 쓰고 출력에 그리지 않는다.**
- **역할 지도 (3축 대칭):** 12시 행위 ↔ 6시 양상 / 2시 주체 ↔ 8시 대상 / 4시 시간 ↔ 10시 장소. 홀수 슬롯은 바로 앞 짝수 슬롯의 부속 — 1시 행위수식, 3시 주체수식, 5시 시간수식, 7시 정도, 9시 대상수식, 11시 방향.
- **의미 자질 8차원 (각 0..1):** `animacy` `agency` `concreteness` `valence` `intensity` `temporality` `boundedness` `sociality`.
- **원본 38개 JPEG을 저장소에 커밋하거나 앱에 번들링하지 않는다.** 로컬 참조 자료로만 쓴다. `.gitignore`의 `reference/originals/`가 이를 막는다.
- **비영리.** 런타임 유료 API 의존을 코어에 넣지 않는다.
- **씨앗 글리프는 이번 계획의 범위가 아니다.** 설계 문서 8.3의 씨앗 + 보간 방식 중, 이번 계획은 씨앗이 없을 때의 **자질 → 기하 유도 경로**만 구현한다. 이 경로는 씨앗이 도입된 후에도 미등재 영역의 폴백으로 계속 쓰인다.

### 이번 계획이 덮는 스펙 범위

| 스펙 절 | 이 계획 | 비고 |
|---|---|---|
| 3 설계 원칙 | Task 1, 2, 7 | 결정성 불변식 테스트로 강제 |
| 6 IR | Task 2 | |
| 7.1 의미 자질 · 7.2 사전 스키마 | Task 4 | 사전은 고정 픽스처 12항목. 자가 성장은 계획 4 |
| 7.3 · 7.4 파서 | — | **계획 2** |
| 8 시각 문법 | Task 3, 4, 5, 6 | 8.3 씨앗은 **계획 5** |
| 9 음소 폴백 | Task 8 | |
| 10 사전 시스템 | — | **계획 4** |
| 11 앱 기능 | — | **계획 3** (단 11.1-5 분해 보기용 데이터는 Task 6에서 산출) |
| 12.1 SVG 내보내기 | Task 6, 10 | **PNG는 브라우저 래스터화가 필요하므로 계획 3** |
| 12.2 목걸이 내보내기 | Task 9, 10 | |
| 13.2 모듈 경계 | 전체 | `core/`와 `render/`만. `ui/` `worker/`는 후속 |
| 14 테스트 전략 | Task 7, 9 | |

---

## File Structure

```
package.json                  프로젝트 매니페스트, 스크립트
tsconfig.json                 TypeScript 설정
vitest.config.ts              테스트 설정

src/version.ts                ENGINE_VERSION 상수 (단일 진실 공급원)

src/core/hash.ts              fnv1a, mulberry32 — 결정성의 토대
src/core/ir.ts                IR 타입, canonicalize, seedOf, subSeed
src/core/lexicon.ts           사전 타입과 조회. 자질의 출처
src/core/phonology.ts         한글 음절 분해, 자모 → 음성 자질

src/render/geometry.ts        Pt, sampleCubic, taperOutline, ringOutline, minWidthOf
src/render/mapping.ts         의미 자질 → StrokeParams. 원칙 2가 사는 곳
src/render/roles.ts           ROLE_SLOT, slotAngle
src/render/strokes.ts         획 어휘 — branch, arcHug, loop, ink, hook
src/render/cluster.ts         음절 나선 (음성 자질 → 획)
src/render/compose.ts         render(ir, lexicon, opts) → RenderResult
src/render/necklace.ts        목걸이 프리셋과 검증

src/cli.ts                    IR JSON 파일 → SVG 파일

data/lexicon.seed.json        고정 사전 픽스처 (12항목)
fixtures/love-you.ir.json     CLI 테스트용 IR

tests/helpers/path.ts         테스트용 SVG path d 파서
tests/core/hash.test.ts
tests/core/ir.test.ts
tests/core/phonology.test.ts
tests/render/geometry.test.ts
tests/render/mapping.test.ts
tests/render/strokes.test.ts
tests/render/compose.test.ts
tests/render/cluster.test.ts
tests/render/invariants.test.ts   결정성 · 의미 동일성 · 역할 구별 · 골든 파일
tests/render/necklace.test.ts
tests/cli.test.ts
```

**경계 원칙:** `core/`는 SVG 문자열을 만들지 않는다. `render/`는 한국어 문법을 모른다. `render/`가 `core/`를 import하는 방향만 허용한다. 역방향 import는 없다.

---

## Task 1: 프로젝트 셋업과 결정성 토대

결정성은 이 프로젝트의 1번 원칙이고, 그것을 떠받치는 건 해시 함수와 의사난수 두 개다. 먼저 만들고 고정한다.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/version.ts`, `src/core/hash.ts`
- Test: `tests/core/hash.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `ENGINE_VERSION: string` — `src/version.ts`
  - `fnv1a(s: string): number` — 32비트 부호 없는 정수 반환
  - `mulberry32(seed: number): () => number` — `[0, 1)` 난수 생성기

- [ ] **Step 1: 프로젝트 파일 생성**

`package.json`:

```json
{
  "name": "heptapod-b",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "glyph": "tsx src/cli.ts"
  },
  "devDependencies": {
    "@types/node": "^22.7.4",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

`src/version.ts`:

```ts
/**
 * 렌더 규칙의 버전. 이 값이 바뀌면 같은 IR이라도 다른 그림이 나올 수 있다.
 * 내보낸 SVG에 반드시 기록해 수년 후 재현을 보장한다 (설계 문서 원칙 1 단서 조항).
 */
export const ENGINE_VERSION = '1.0.0';
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `node_modules/` 생성, 에러 없이 종료

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/core/hash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fnv1a, mulberry32 } from '../../src/core/hash';

describe('fnv1a', () => {
  it('빈 문자열에 대해 FNV-1a offset basis를 반환한다', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
  });

  it('같은 입력에 항상 같은 값을 반환한다', () => {
    expect(fnv1a('사랑')).toBe(fnv1a('사랑'));
  });

  it('다른 입력에 다른 값을 반환한다', () => {
    expect(fnv1a('사랑')).not.toBe(fnv1a('미움'));
  });

  it('한 글자만 달라도 값이 달라진다', () => {
    expect(fnv1a('정')).not.toBe(fnv1a('종'));
  });

  it('항상 32비트 부호 없는 정수를 반환한다', () => {
    for (const s of ['', 'a', '사랑', 'I love you', '루이즈']) {
      const h = fnv1a(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('mulberry32', () => {
  it('같은 시드는 같은 수열을 낳는다', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('다른 시드는 다른 수열을 낳는다', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('[0, 1) 범위의 값을 낳는다', () => {
    const r = mulberry32(999);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/core/hash.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/hash"`

- [ ] **Step 5: 최소 구현 작성**

`src/core/hash.ts`:

```ts
/**
 * FNV-1a 32비트 해시. 결정성의 토대이므로 구현을 절대 바꾸지 않는다.
 * 바꾸면 모든 기존 로고그램의 형태가 변한다.
 */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 의사난수 생성기. 시드가 같으면 수열이 같다.
 * 이것 역시 구현을 바꾸면 기존 로고그램이 변하므로 고정한다.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/core/hash.test.ts`
Expected: PASS — 8 tests passed

- [ ] **Step 7: 타입 검사**

Run: `npm run typecheck`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 8: 커밋**

```bash
git add package.json tsconfig.json vitest.config.ts src/version.ts src/core/hash.ts tests/core/hash.test.ts
git commit -m "feat: 프로젝트 셋업과 결정적 해시·난수 토대"
```

---

## Task 2: IR 타입, 정규화, 시드 계산

의미 동일성(`나는 너를 사랑해` == `I love you`)이 실제로 성립하는 지점이다. 정규화가 틀리면 설계 문서 6.1이 무의미해진다.

**Files:**
- Create: `src/core/ir.ts`
- Test: `tests/core/ir.test.ts`

**Interfaces:**
- Consumes: `fnv1a` from `src/core/hash`, `ENGINE_VERSION` from `src/version`
- Produces:
  - `type Role` — 12개 역할 문자열 리터럴 유니온
  - `interface Syllable { onset: string; nucleus: string; coda: string }`
  - `type Constituent` — `concept` | `phonetic` 판별 유니온
  - `type Mood = 'declarative' | 'interrogative' | 'negative' | 'volitional'`
  - `interface IR { constituents: Constituent[]; mood: Mood; engineVersion: string }`
  - `constituentKey(c: Constituent): string` — 정렬·서브시드용 안정 키
  - `canonicalize(ir: IR): string`
  - `seedOf(ir: IR): number`
  - `subSeed(seed: number, key: string): number`
  - `sortedConstituents(ir: IR): Constituent[]` — 순회 순서를 고정

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/core/ir.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  canonicalize, seedOf, subSeed, constituentKey, sortedConstituents,
  type IR, type Constituent,
} from '../../src/core/ir';
import { ENGINE_VERSION } from '../../src/version';

const love: Constituent = { kind: 'concept', lemma: '사랑', role: '행위' };
const me: Constituent = { kind: 'concept', lemma: '나', role: '주체' };
const you: Constituent = { kind: 'concept', lemma: '너', role: '대상' };

const ir = (cs: Constituent[], mood: IR['mood'] = 'declarative'): IR => ({
  constituents: cs, mood, engineVersion: ENGINE_VERSION,
});

describe('constituentKey', () => {
  it('개념 성분은 역할과 표제어로 키를 만든다', () => {
    expect(constituentKey(love)).toBe('concept|행위|사랑');
  });

  it('음소 성분은 역할과 음절열로 키를 만든다', () => {
    const name: Constituent = {
      kind: 'phonetic',
      role: '대상',
      syllables: [
        { onset: 'l', nucleus: 'u', coda: '' },
        { onset: '', nucleus: 'i', coda: '' },
      ],
    };
    expect(constituentKey(name)).toBe('phonetic|대상|l.u.-.i.');
  });
});

describe('canonicalize', () => {
  it('성분 순서가 달라도 같은 문자열을 낳는다', () => {
    expect(canonicalize(ir([love, me, you]))).toBe(canonicalize(ir([you, love, me])));
  });

  it('양상이 다르면 다른 문자열을 낳는다', () => {
    expect(canonicalize(ir([love, me, you])))
      .not.toBe(canonicalize(ir([love, me, you], 'interrogative')));
  });

  it('역할이 뒤바뀌면 다른 문자열을 낳는다', () => {
    const swapped: Constituent[] = [
      love,
      { kind: 'concept', lemma: '너', role: '주체' },
      { kind: 'concept', lemma: '나', role: '대상' },
    ];
    expect(canonicalize(ir([love, me, you]))).not.toBe(canonicalize(ir(swapped)));
  });

  it('엔진 버전을 포함한다', () => {
    expect(canonicalize(ir([love]))).toContain(ENGINE_VERSION);
  });
});

describe('seedOf', () => {
  it('성분 순서와 무관하게 같은 시드를 낳는다', () => {
    expect(seedOf(ir([love, me, you]))).toBe(seedOf(ir([you, me, love])));
  });

  it('역할이 뒤바뀌면 다른 시드를 낳는다', () => {
    const swapped: Constituent[] = [
      love,
      { kind: 'concept', lemma: '너', role: '주체' },
      { kind: 'concept', lemma: '나', role: '대상' },
    ];
    expect(seedOf(ir([love, me, you]))).not.toBe(seedOf(ir(swapped)));
  });
});

describe('subSeed', () => {
  it('같은 시드와 키에 같은 값을 낳는다', () => {
    expect(subSeed(123, 'concept|행위|사랑')).toBe(subSeed(123, 'concept|행위|사랑'));
  });

  it('키가 다르면 값이 다르다', () => {
    expect(subSeed(123, 'a')).not.toBe(subSeed(123, 'b'));
  });

  it('시드가 다르면 값이 다르다', () => {
    expect(subSeed(1, 'a')).not.toBe(subSeed(2, 'a'));
  });
});

describe('sortedConstituents', () => {
  it('입력 순서와 무관하게 같은 순서를 낳는다', () => {
    const a = sortedConstituents(ir([love, me, you])).map(constituentKey);
    const b = sortedConstituents(ir([you, love, me])).map(constituentKey);
    expect(a).toEqual(b);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const input = ir([you, love, me]);
    const before = input.constituents.map(constituentKey);
    sortedConstituents(input);
    expect(input.constituents.map(constituentKey)).toEqual(before);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/core/ir.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/ir"`

- [ ] **Step 3: 최소 구현 작성**

`src/core/ir.ts`:

```ts
import { fnv1a } from './hash';

/**
 * 문법 역할. 12슬롯 격자의 각 칸에 대응한다 (설계 문서 8.2).
 * 짝수 슬롯은 주 역할, 홀수 슬롯은 바로 앞 짝수 슬롯의 부속.
 */
export type Role =
  | '행위' | '행위수식'
  | '주체' | '주체수식'
  | '시간' | '시간수식'
  | '양상' | '정도'
  | '대상' | '대상수식'
  | '장소' | '방향';

export interface Syllable {
  /** 초성 음소 id. 빈 초성(ㅇ)은 '' */
  onset: string;
  /** 중성 음소 id */
  nucleus: string;
  /** 종성 음소 id. 없으면 '' */
  coda: string;
}

export type Constituent =
  | { kind: 'concept'; lemma: string; role: Role }
  | { kind: 'phonetic'; syllables: Syllable[]; role: Role };

/**
 * 문장 수준 양상. 6시 양상 슬롯은 오직 이 값에서만 채워지며,
 * 파서는 role이 '양상'인 Constituent를 직접 만들지 않는다 (설계 문서 6.2).
 */
export type Mood = 'declarative' | 'interrogative' | 'negative' | 'volitional';

export interface IR {
  constituents: Constituent[];
  mood: Mood;
  engineVersion: string;
}

/**
 * 성분의 안정적인 키. 정렬과 서브시드 계산에 쓴다.
 * 음절은 `onset.nucleus.coda`를 '-'로 이어 순서를 보존한다 — 이름에서 순서는 의미를 갖는다.
 */
export function constituentKey(c: Constituent): string {
  if (c.kind === 'concept') return `concept|${c.role}|${c.lemma}`;
  const syls = c.syllables.map((s) => `${s.onset}.${s.nucleus}.${s.coda}`).join('-');
  return `phonetic|${c.role}|${syls}`;
}

/** 입력 순서와 무관한 고정 순회 순서. 원본을 변경하지 않는다. */
export function sortedConstituents(ir: IR): Constituent[] {
  return [...ir.constituents].sort((a, b) =>
    constituentKey(a) < constituentKey(b) ? -1 : constituentKey(a) > constituentKey(b) ? 1 : 0,
  );
}

/**
 * IR을 정규 문자열로 만든다. 성분을 정렬하므로 어순 정보가 소멸한다.
 * 이것이 `나는 너를 사랑해` == `너를 나는 사랑해` == `I love you`를 성립시키는 지점이다.
 */
export function canonicalize(ir: IR): string {
  const keys = sortedConstituents(ir).map(constituentKey);
  return JSON.stringify({ c: keys, m: ir.mood, v: ir.engineVersion });
}

/** 렌더러 의사난수의 최상위 시드. */
export function seedOf(ir: IR): number {
  return fnv1a(canonicalize(ir));
}

/**
 * 성분별 서브시드. 성분마다 독립된 난수열을 주기 때문에
 * 성분 순회 순서가 결과에 영향을 주지 않는다.
 */
export function subSeed(seed: number, key: string): number {
  return fnv1a(`${seed}|${key}`);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/core/ir.test.ts`
Expected: PASS — 13 tests passed

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 6: 커밋**

```bash
git add src/core/ir.ts tests/core/ir.test.ts
git commit -m "feat: IR 타입과 의미 동일성 정규화"
```

---

## Task 3: 기하 프리미티브

붓으로 그린 듯한 획은 "굵기가 변하는 선"이다. SVG에는 그런 stroke가 없으므로, 중심선 양쪽으로 오프셋한 **닫힌 윤곽선**을 만들어 채운다. 이 방식은 목걸이 각인이 요구하는 닫힌 패스 조건(설계 문서 12.2)을 처음부터 만족한다.

**Files:**
- Create: `src/render/geometry.ts`, `tests/helpers/path.ts`
- Test: `tests/render/geometry.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type Pt = readonly [number, number]`
  - `type WidthFn = (t: number) => number`
  - `sampleCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): Pt[]`
  - `taperOutline(pts: Pt[], widthAt: WidthFn): string` — SVG path `d`
  - `ringOutline(cx: number, cy: number, r: number, widthAt: WidthFn, steps?: number): string`
  - `minWidthOf(widthAt: WidthFn, samples?: number): number`
  - 테스트 헬퍼 `parsePathPoints(d: string): Pt[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/helpers/path.ts`:

```ts
import type { Pt } from '../../src/render/geometry';

/** SVG path d 문자열에서 좌표쌍만 뽑는다. 테스트 전용. */
export function parsePathPoints(d: string): Pt[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push([Number(nums[i]), Number(nums[i + 1])]);
  }
  return out;
}
```

`tests/render/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  sampleCubic, taperOutline, ringOutline, minWidthOf, type Pt,
} from '../../src/render/geometry';
import { parsePathPoints } from '../helpers/path';

describe('sampleCubic', () => {
  it('steps + 1 개의 점을 낳는다', () => {
    expect(sampleCubic([0, 0], [1, 0], [2, 0], [3, 0], 10)).toHaveLength(11);
  });

  it('양 끝점이 p0과 p3이다', () => {
    const pts = sampleCubic([0, 0], [1, 5], [2, 5], [3, 0], 8);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([3, 0]);
  });

  it('제어점이 일직선이면 직선을 낳는다', () => {
    const pts = sampleCubic([0, 0], [1, 0], [2, 0], [3, 0], 6);
    for (const p of pts) expect(p[1]).toBeCloseTo(0, 10);
  });

  it('steps가 1보다 작으면 던진다', () => {
    expect(() => sampleCubic([0, 0], [0, 0], [0, 0], [0, 0], 0)).toThrow();
  });
});

describe('taperOutline', () => {
  it('닫힌 패스를 낳는다', () => {
    const d = taperOutline([[0, 0], [10, 0], [20, 0]], () => 4);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('수평 직선에 일정 굵기를 주면 폭이 그 값이다', () => {
    const d = taperOutline([[0, 50], [10, 50], [20, 50]], () => 6);
    const ys = parsePathPoints(d).map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6, 3);
  });

  it('굵기가 줄면 끝쪽 폭이 더 좁다', () => {
    const d = taperOutline(
      [[0, 50], [10, 50], [20, 50], [30, 50]],
      (t) => 8 * (1 - t) + 1,
    );
    const pts = parsePathPoints(d);
    // 전반부는 left, 후반부는 right(역순). 첫 점과 마지막 점이 같은 x 위치의 쌍이다.
    const startSpan = Math.abs(pts[0]![1] - pts[pts.length - 1]![1]);
    const midIdx = Math.floor(pts.length / 2);
    const endSpan = Math.abs(pts[midIdx - 1]![1] - pts[midIdx]![1]);
    expect(startSpan).toBeGreaterThan(endSpan);
  });

  it('점이 2개 미만이면 던진다', () => {
    expect(() => taperOutline([[0, 0]], () => 1)).toThrow();
  });
});

describe('ringOutline', () => {
  it('닫힌 서브패스 두 개를 낳는다', () => {
    const d = ringOutline(150, 150, 100, () => 8);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it('모든 점이 r - w/2 이상 r + w/2 이하 반경에 있다', () => {
    const d = ringOutline(150, 150, 100, () => 10);
    for (const [x, y] of parsePathPoints(d)) {
      const rad = Math.hypot(x - 150, y - 150);
      expect(rad).toBeGreaterThanOrEqual(95 - 0.01);
      expect(rad).toBeLessThanOrEqual(105 + 0.01);
    }
  });

  it('바깥과 안쪽 윤곽을 반대 방향으로 감아 구멍을 만든다', () => {
    // 서명 면적의 부호가 서로 반대여야 nonzero fill-rule에서 고리가 된다.
    const d = ringOutline(150, 150, 100, () => 8, 60);
    const [outer, inner] = d.split('Z').slice(0, 2);
    const area = (sub: string): number => {
      const pts = parsePathPoints(sub);
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
        a += p[0] * q[1] - q[0] * p[1];
      }
      return a / 2;
    };
    expect(Math.sign(area(outer!))).not.toBe(Math.sign(area(inner!)));
  });
});

describe('minWidthOf', () => {
  it('일정 함수의 최솟값은 그 값이다', () => {
    expect(minWidthOf(() => 5)).toBeCloseTo(5, 6);
  });

  it('감소 함수의 최솟값은 t=1 값이다', () => {
    expect(minWidthOf((t) => 10 - 9 * t)).toBeCloseTo(1, 3);
  });

  it('중간이 최소인 함수도 잡는다', () => {
    expect(minWidthOf((t) => Math.abs(t - 0.5) * 10 + 0.5)).toBeCloseTo(0.5, 2);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/geometry.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/geometry"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/geometry.ts`:

```ts
export type Pt = readonly [number, number];

/** t(0..1)에서의 획 굵기를 반환하는 함수. */
export type WidthFn = (t: number) => number;

/** 좌표 문자열의 소수점 자리수. 결정성을 위해 고정한다. */
const PRECISION = 3;
const f = (n: number): string => n.toFixed(PRECISION);

function polyline(pts: Pt[]): string {
  return pts.map((p) => `${f(p[0])},${f(p[1])}`).join('L');
}

/** 3차 베지어를 균등 파라미터로 샘플링한다. */
export function sampleCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): Pt[] {
  if (steps < 1) throw new Error(`sampleCubic: steps must be >= 1, got ${steps}`);
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
  return out;
}

/**
 * 중심선을 따라 굵기가 변하는 획의 닫힌 윤곽선을 만든다.
 * SVG에는 굵기 변조 stroke가 없으므로 윤곽선을 채우는 방식을 쓴다.
 * 부수 효과로 목걸이 각인이 요구하는 닫힌 패스 조건을 처음부터 만족한다.
 */
export function taperOutline(pts: Pt[], widthAt: WidthFn): string {
  if (pts.length < 2) throw new Error(`taperOutline: needs >= 2 points, got ${pts.length}`);
  const left: Pt[] = [];
  const right: Pt[] = [];
  const last = pts.length - 1;
  for (let i = 0; i <= last; i++) {
    const t = i / last;
    const h = Math.max(0, widthAt(t)) / 2;
    const prev = pts[Math.max(i - 1, 0)]!;
    const next = pts[Math.min(i + 1, last)]!;
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const p = pts[i]!;
    left.push([p[0] - dy * h, p[1] + dx * h]);
    right.push([p[0] + dy * h, p[1] - dx * h]);
  }
  right.reverse();
  return `M${polyline(left)}L${polyline(right)}Z`;
}

/**
 * 굵기가 각도에 따라 변조되는 고리.
 * 바깥 윤곽은 정방향, 안쪽 윤곽은 역방향으로 감아 nonzero fill-rule에서 구멍이 생긴다.
 */
export function ringOutline(
  cx: number, cy: number, r: number, widthAt: WidthFn, steps = 360,
): string {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const h = Math.max(0, widthAt(t)) / 2;
    outer.push([cx + Math.cos(a) * (r + h), cy + Math.sin(a) * (r + h)]);
    inner.push([cx + Math.cos(a) * (r - h), cy + Math.sin(a) * (r - h)]);
  }
  inner.reverse();
  return `M${polyline(outer)}ZM${polyline(inner)}Z`;
}

/** 굵기 함수의 최솟값. 목걸이 모드 검증에 쓴다. */
export function minWidthOf(widthAt: WidthFn, samples = 128): number {
  let m = Infinity;
  for (let i = 0; i <= samples; i++) m = Math.min(m, widthAt(i / samples));
  return m;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/geometry.test.ts`
Expected: PASS — 14 tests passed

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 6: 커밋**

```bash
git add src/render/geometry.ts tests/helpers/path.ts tests/render/geometry.test.ts
git commit -m "feat: 기하 프리미티브 — 베지어 샘플링, 굵기 변조 윤곽선, 고리"
```

---

## Task 4: 사전과 자질 → 획 파라미터 사상

**원칙 2가 사는 곳이다.** 여기서 8개 자질이 모두 어떤 기하 파라미터에든 도달해야 한다. 어느 자질이 아무 데도 쓰이지 않으면, 그 자질의 차이가 형태에 나타나지 않는다는 뜻이므로 원칙 2 위반이다.

**Files:**
- Create: `src/core/lexicon.ts`, `src/render/mapping.ts`, `data/lexicon.seed.json`
- Test: `tests/render/mapping.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `interface SemanticFeatures` — 8개 숫자 필드
  - `interface LexiconEntry { lemma: string; gloss_en: string; features: SemanticFeatures; defaultRole: Role; seedGlyph: string | null; status: 'confirmed' | 'provisional'; source: 'seed' | 'llm'; addedAt: string }`
  - `type Lexicon = Record<string, LexiconEntry>`
  - `loadSeedLexicon(): Lexicon`
  - `lookup(lex: Lexicon, lemma: string): LexiconEntry | undefined`
  - `averageFeatures(fs: SemanticFeatures[]): SemanticFeatures`
  - `interface StrokeParams { reach: number; baseWidth: number; curl: number; branchCount: 0 | 1 | 2; endStyle: 'blob' | 'fade'; loop: boolean; ringHarmonic: number }`
  - `strokeParamsFor(f: SemanticFeatures): StrokeParams`
  - `FEATURE_KEYS: readonly (keyof SemanticFeatures)[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { strokeParamsFor, FEATURE_KEYS } from '../../src/render/mapping';
import {
  loadSeedLexicon, lookup, averageFeatures, type SemanticFeatures,
} from '../../src/core/lexicon';

const mid: SemanticFeatures = {
  animacy: 0.5, agency: 0.5, concreteness: 0.5, valence: 0.5,
  intensity: 0.5, temporality: 0.5, boundedness: 0.5, sociality: 0.5,
};
const withF = (o: Partial<SemanticFeatures>): SemanticFeatures => ({ ...mid, ...o });

describe('씨앗 사전', () => {
  it('필수 어휘를 담고 있다', () => {
    const lex = loadSeedLexicon();
    for (const w of ['사랑', '미움', '나', '너', '시간', '영원', '고양이', '개']) {
      expect(lookup(lex, w), `${w} 누락`).toBeDefined();
    }
  });

  it('모든 항목이 8개 자질을 0..1 범위로 갖는다', () => {
    const lex = loadSeedLexicon();
    for (const [lemma, e] of Object.entries(lex)) {
      for (const k of FEATURE_KEYS) {
        const v = e.features[k];
        expect(typeof v, `${lemma}.${k}`).toBe('number');
        expect(v, `${lemma}.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${lemma}.${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('모든 항목의 lemma 필드가 키와 일치한다', () => {
    for (const [key, e] of Object.entries(loadSeedLexicon())) {
      expect(e.lemma).toBe(key);
    }
  });

  it('없는 표제어는 undefined를 반환한다', () => {
    expect(lookup(loadSeedLexicon(), '없는단어')).toBeUndefined();
  });
});

describe('averageFeatures', () => {
  it('단일 입력은 그대로 반환한다', () => {
    expect(averageFeatures([mid])).toEqual(mid);
  });

  it('두 값의 평균을 낸다', () => {
    const a = withF({ valence: 0 });
    const b = withF({ valence: 1 });
    expect(averageFeatures([a, b]).valence).toBeCloseTo(0.5, 6);
  });

  it('빈 배열이면 던진다', () => {
    expect(() => averageFeatures([])).toThrow();
  });
});

describe('strokeParamsFor — 8개 자질이 모두 기하에 도달한다', () => {
  it('valence가 curl의 부호를 정한다', () => {
    expect(strokeParamsFor(withF({ valence: 0.95 })).curl).toBeGreaterThan(0);
    expect(strokeParamsFor(withF({ valence: 0.05 })).curl).toBeLessThan(0);
  });

  it('intensity가 커지면 reach가 커진다', () => {
    expect(strokeParamsFor(withF({ intensity: 0.9 })).reach)
      .toBeGreaterThan(strokeParamsFor(withF({ intensity: 0.1 })).reach);
  });

  it('구상어는 굵고 짧고, 추상어는 얇고 길다', () => {
    const concrete = strokeParamsFor(withF({ concreteness: 0.9 }));
    const abstract = strokeParamsFor(withF({ concreteness: 0.1 }));
    expect(concrete.baseWidth).toBeGreaterThan(abstract.baseWidth);
    expect(concrete.reach).toBeLessThan(abstract.reach);
  });

  it('agency와 sociality가 분기 수를 정한다', () => {
    expect(strokeParamsFor(withF({ agency: 0.1, sociality: 0.1 })).branchCount).toBe(0);
    expect(strokeParamsFor(withF({ agency: 0.5, sociality: 0.4 })).branchCount).toBe(1);
    expect(strokeParamsFor(withF({ agency: 0.9, sociality: 0.9 })).branchCount).toBe(2);
  });

  it('boundedness가 획 끝 처리를 정한다', () => {
    expect(strokeParamsFor(withF({ boundedness: 0.9 })).endStyle).toBe('blob');
    expect(strokeParamsFor(withF({ boundedness: 0.1 })).endStyle).toBe('fade');
  });

  it('animacy가 부속 고리 유무를 정한다', () => {
    expect(strokeParamsFor(withF({ animacy: 0.9 })).loop).toBe(true);
    expect(strokeParamsFor(withF({ animacy: 0.1 })).loop).toBe(false);
  });

  it('temporality가 링 변조 주파수를 정한다', () => {
    const hi = strokeParamsFor(withF({ temporality: 0.95 })).ringHarmonic;
    const lo = strokeParamsFor(withF({ temporality: 0.05 })).ringHarmonic;
    expect(hi).toBeGreaterThan(lo);
    expect(Number.isInteger(hi)).toBe(true);
    expect(Number.isInteger(lo)).toBe(true);
  });

  it('사랑과 미움은 valence만 반대이므로 curl 부호만 갈라진다', () => {
    const lex = loadSeedLexicon();
    const love = strokeParamsFor(lookup(lex, '사랑')!.features);
    const hate = strokeParamsFor(lookup(lex, '미움')!.features);
    expect(Math.sign(love.curl)).not.toBe(Math.sign(hate.curl));
  });

  it('고양이와 개는 자질이 가까워 획 파라미터도 가깝다', () => {
    const lex = loadSeedLexicon();
    const cat = strokeParamsFor(lookup(lex, '고양이')!.features);
    const dog = strokeParamsFor(lookup(lex, '개')!.features);
    expect(Math.abs(cat.reach - dog.reach)).toBeLessThan(4);
    expect(Math.abs(cat.baseWidth - dog.baseWidth)).toBeLessThan(1);
    expect(cat.loop).toBe(dog.loop);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/mapping.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/mapping"`

- [ ] **Step 3: 사전 픽스처 작성**

`data/lexicon.seed.json`:

```json
{
  "사랑": {
    "lemma": "사랑", "gloss_en": "love",
    "features": { "animacy": 0.10, "agency": 0.25, "concreteness": 0.12, "valence": 0.94,
                  "intensity": 0.86, "temporality": 0.30, "boundedness": 0.18, "sociality": 0.95 },
    "defaultRole": "행위", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "미움": {
    "lemma": "미움", "gloss_en": "hatred",
    "features": { "animacy": 0.10, "agency": 0.25, "concreteness": 0.12, "valence": 0.06,
                  "intensity": 0.84, "temporality": 0.30, "boundedness": 0.18, "sociality": 0.92 },
    "defaultRole": "행위", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "기다림": {
    "lemma": "기다림", "gloss_en": "waiting",
    "features": { "animacy": 0.12, "agency": 0.30, "concreteness": 0.15, "valence": 0.55,
                  "intensity": 0.50, "temporality": 0.85, "boundedness": 0.20, "sociality": 0.60 },
    "defaultRole": "행위", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "나": {
    "lemma": "나", "gloss_en": "I",
    "features": { "animacy": 0.95, "agency": 0.90, "concreteness": 0.80, "valence": 0.55,
                  "intensity": 0.40, "temporality": 0.20, "boundedness": 0.95, "sociality": 0.35 },
    "defaultRole": "주체", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "너": {
    "lemma": "너", "gloss_en": "you",
    "features": { "animacy": 0.95, "agency": 0.88, "concreteness": 0.80, "valence": 0.60,
                  "intensity": 0.42, "temporality": 0.20, "boundedness": 0.95, "sociality": 0.65 },
    "defaultRole": "대상", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "고양이": {
    "lemma": "고양이", "gloss_en": "cat",
    "features": { "animacy": 0.92, "agency": 0.55, "concreteness": 0.90, "valence": 0.70,
                  "intensity": 0.35, "temporality": 0.10, "boundedness": 0.92, "sociality": 0.25 },
    "defaultRole": "대상", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "개": {
    "lemma": "개", "gloss_en": "dog",
    "features": { "animacy": 0.92, "agency": 0.58, "concreteness": 0.90, "valence": 0.72,
                  "intensity": 0.38, "temporality": 0.10, "boundedness": 0.92, "sociality": 0.32 },
    "defaultRole": "대상", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "시간": {
    "lemma": "시간", "gloss_en": "time",
    "features": { "animacy": 0.05, "agency": 0.15, "concreteness": 0.10, "valence": 0.50,
                  "intensity": 0.45, "temporality": 0.98, "boundedness": 0.10, "sociality": 0.10 },
    "defaultRole": "시간", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "영원": {
    "lemma": "영원", "gloss_en": "forever",
    "features": { "animacy": 0.05, "agency": 0.08, "concreteness": 0.05, "valence": 0.60,
                  "intensity": 0.75, "temporality": 0.96, "boundedness": 0.02, "sociality": 0.10 },
    "defaultRole": "시간수식", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "어제": {
    "lemma": "어제", "gloss_en": "yesterday",
    "features": { "animacy": 0.05, "agency": 0.08, "concreteness": 0.25, "valence": 0.50,
                  "intensity": 0.30, "temporality": 0.92, "boundedness": 0.85, "sociality": 0.10 },
    "defaultRole": "시간", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "여기": {
    "lemma": "여기", "gloss_en": "here",
    "features": { "animacy": 0.05, "agency": 0.05, "concreteness": 0.55, "valence": 0.50,
                  "intensity": 0.28, "temporality": 0.08, "boundedness": 0.80, "sociality": 0.15 },
    "defaultRole": "장소", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  },
  "깊이": {
    "lemma": "깊이", "gloss_en": "deeply",
    "features": { "animacy": 0.05, "agency": 0.05, "concreteness": 0.08, "valence": 0.60,
                  "intensity": 0.92, "temporality": 0.15, "boundedness": 0.10, "sociality": 0.20 },
    "defaultRole": "행위수식", "seedGlyph": null,
    "status": "confirmed", "source": "seed", "addedAt": "2026-09-11"
  }
}
```

- [ ] **Step 4: 사전 모듈 작성**

`src/core/lexicon.ts`:

```ts
import type { Role } from './ir';
import seed from '../../data/lexicon.seed.json' with { type: 'json' };

/** 의미 자질 8차원. 각 0..1 (설계 문서 7.1). */
export interface SemanticFeatures {
  /** 생물성 */ animacy: number;
  /** 행위성 — 능동적 주체가 될 수 있는 정도 */ agency: number;
  /** 구상성 */ concreteness: number;
  /** 정서가 (부정 0 ↔ 긍정 1) */ valence: number;
  /** 강도 */ intensity: number;
  /** 시간 관련성 */ temporality: number;
  /** 한정성 — 셀 수 있는가 / 지속적인가 */ boundedness: number;
  /** 관계성 — 둘 이상의 참여자를 전제하는 정도 */ sociality: number;
}

export interface LexiconEntry {
  lemma: string;
  gloss_en: string;
  features: SemanticFeatures;
  defaultRole: Role;
  /** 씨앗 글리프 id. 계획 5에서 채운다. */
  seedGlyph: string | null;
  status: 'confirmed' | 'provisional';
  source: 'seed' | 'llm';
  addedAt: string;
}

export type Lexicon = Record<string, LexiconEntry>;

export function loadSeedLexicon(): Lexicon {
  return seed as unknown as Lexicon;
}

export function lookup(lex: Lexicon, lemma: string): LexiconEntry | undefined {
  return Object.prototype.hasOwnProperty.call(lex, lemma) ? lex[lemma] : undefined;
}

export function averageFeatures(fs: SemanticFeatures[]): SemanticFeatures {
  if (fs.length === 0) throw new Error('averageFeatures: empty input');
  const acc: SemanticFeatures = {
    animacy: 0, agency: 0, concreteness: 0, valence: 0,
    intensity: 0, temporality: 0, boundedness: 0, sociality: 0,
  };
  for (const f of fs) {
    acc.animacy += f.animacy; acc.agency += f.agency;
    acc.concreteness += f.concreteness; acc.valence += f.valence;
    acc.intensity += f.intensity; acc.temporality += f.temporality;
    acc.boundedness += f.boundedness; acc.sociality += f.sociality;
  }
  const n = fs.length;
  return {
    animacy: acc.animacy / n, agency: acc.agency / n,
    concreteness: acc.concreteness / n, valence: acc.valence / n,
    intensity: acc.intensity / n, temporality: acc.temporality / n,
    boundedness: acc.boundedness / n, sociality: acc.sociality / n,
  };
}

/** 음소 폴백 성분에 쓰는 중립 자질. 이름은 의미 자질을 갖지 않는다. */
export const NEUTRAL_FEATURES: SemanticFeatures = {
  animacy: 0.80, agency: 0.70, concreteness: 0.85, valence: 0.55,
  intensity: 0.45, temporality: 0.15, boundedness: 0.95, sociality: 0.40,
};
```

- [ ] **Step 5: 사상 모듈 작성**

`src/render/mapping.ts`:

```ts
import type { SemanticFeatures } from '../core/lexicon';

export const FEATURE_KEYS = [
  'animacy', 'agency', 'concreteness', 'valence',
  'intensity', 'temporality', 'boundedness', 'sociality',
] as const satisfies readonly (keyof SemanticFeatures)[];

export interface StrokeParams {
  /** 도달 거리 (scale 1 기준 px) */
  reach: number;
  /** 뿌리 굵기 */
  baseWidth: number;
  /** -1..1. 음수는 반대 방향 감김 */
  curl: number;
  /** 부속 갈래 수 */
  branchCount: 0 | 1 | 2;
  /** 획 끝 처리 */
  endStyle: 'blob' | 'fade';
  /** 부속 고리 유무 */
  loop: boolean;
  /** 링 굵기 변조 주파수 (정수) */
  ringHarmonic: number;
}

/**
 * 의미 자질 → 획 파라미터 (설계 문서 8.4).
 *
 * 원칙 2를 지키려면 8개 자질이 모두 어떤 파라미터에든 도달해야 한다.
 * 어느 자질이 쓰이지 않으면 그 의미 차이가 형태에 나타나지 않는다.
 * `tests/render/mapping.test.ts`가 자질별로 이를 검증한다.
 */
export function strokeParamsFor(f: SemanticFeatures): StrokeParams {
  const social = f.agency + f.sociality;
  return {
    // 추상어는 얇고 길게, 구상어는 굵고 짧게
    reach: (14 + f.intensity * 30) * (1.3 - f.concreteness * 0.6),
    baseWidth: 3.0 + f.concreteness * 5.2,
    curl: (f.valence - 0.5) * 2,
    branchCount: social > 1.5 ? 2 : social > 0.7 ? 1 : 0,
    endStyle: f.boundedness >= 0.5 ? 'blob' : 'fade',
    loop: f.animacy >= 0.5,
    ringHarmonic: 2 + Math.round(f.temporality * 6),
  };
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/mapping.test.ts`
Expected: PASS — 16 tests passed

- [ ] **Step 7: 타입 검사**

Run: `npm run typecheck`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 8: 커밋**

```bash
git add src/core/lexicon.ts src/render/mapping.ts data/lexicon.seed.json tests/render/mapping.test.ts
git commit -m "feat: 사전 픽스처와 의미 자질 → 획 파라미터 사상"
```

---

## Task 5: 획 어휘

설계 문서 8.5의 획 어휘를 구현한다. 각 함수는 `Shape[]`을 반환하는 순수 함수이며, SVG 문자열 조립은 하지 않는다 — 그건 Task 6의 일이다.

**Files:**
- Create: `src/render/strokes.ts`
- Test: `tests/render/strokes.test.ts`

**Interfaces:**
- Consumes: `sampleCubic`, `taperOutline`, `minWidthOf`, `Pt`, `WidthFn` from `src/render/geometry`; `StrokeParams` from `src/render/mapping`
- Produces:
  - `type Shape = { kind: 'path'; d: string; minWidth: number } | { kind: 'disc'; cx: number; cy: number; r: number } | { kind: 'circle'; cx: number; cy: number; r: number; strokeWidth: number }`
  - `interface StrokeContext { cx: number; cy: number; radius: number; scale: number; rand: () => number; specks: boolean; minWidth: number }`
  - `branch(ctx: StrokeContext, angle: number, p: StrokeParams, outward: boolean): Shape[]`
  - `arcHug(ctx: StrokeContext, startAngle: number, span: number, offset: number, width: number): Shape[]`
  - `loopMark(ctx: StrokeContext, angle: number, offset: number, r: number): Shape[]`
  - `inkSpray(ctx: StrokeContext, at: Pt, r: number): Shape[]`
  - `hook(ctx: StrokeContext, angle: number, scale: number): Shape[]`
  - `ringWidthFn(harmonic: number, base: number, rand: () => number, floor: number): WidthFn`

**중요 — `StrokeContext.minWidth`는 보고값이 아니라 기하 자체를 바꾼다.** 모든 굵기 함수가 이 값으로 클램프되므로, 목걸이 모드에서 실제 SVG에 하한 미만의 획이 존재하지 않는다. 메타데이터만 올리는 방식으로는 검증은 통과하되 각인이 실패한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/strokes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  branch, arcHug, loopMark, inkSpray, hook, ringWidthFn,
  type StrokeContext, type Shape,
} from '../../src/render/strokes';
import { strokeParamsFor } from '../../src/render/mapping';
import { minWidthOf } from '../../src/render/geometry';
import { mulberry32 } from '../../src/core/hash';
import type { SemanticFeatures } from '../../src/core/lexicon';
import { parsePathPoints } from '../helpers/path';

const ctx = (specks = true, minWidth = 0): StrokeContext => ({
  cx: 150, cy: 150, radius: 95, scale: 1, rand: mulberry32(42), specks, minWidth,
});

const feats: SemanticFeatures = {
  animacy: 0.8, agency: 0.7, concreteness: 0.6, valence: 0.9,
  intensity: 0.7, temporality: 0.4, boundedness: 0.8, sociality: 0.9,
};

describe('branch', () => {
  it('적어도 하나의 path를 낳는다', () => {
    const shapes = branch(ctx(), 0, strokeParamsFor(feats), true);
    expect(shapes.filter((s) => s.kind === 'path').length).toBeGreaterThanOrEqual(1);
  });

  it('획이 링 위의 점에서 시작한다', () => {
    const c = ctx();
    const shapes = branch(c, -Math.PI / 2, strokeParamsFor(feats), true);
    const first = shapes.find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    const pts = parsePathPoints(first.d);
    const near = pts.some((p) => Math.abs(Math.hypot(p[0] - c.cx, p[1] - c.cy) - c.radius) < 6);
    expect(near).toBe(true);
  });

  it('outward=true는 링 밖으로, false는 안쪽으로 뻗는다', () => {
    const c = ctx();
    const maxRad = (shapes: Shape[]): number => {
      let m = 0;
      for (const s of shapes) {
        if (s.kind !== 'path') continue;
        for (const p of parsePathPoints(s.d)) m = Math.max(m, Math.hypot(p[0] - c.cx, p[1] - c.cy));
      }
      return m;
    };
    const out = maxRad(branch(ctx(), 0, strokeParamsFor(feats), true));
    const inn = maxRad(branch(ctx(), 0, strokeParamsFor(feats), false));
    expect(out).toBeGreaterThan(c.radius + 5);
    expect(inn).toBeLessThan(out);
  });

  it('branchCount가 클수록 path 수가 많다', () => {
    const few = branch(ctx(), 0, { ...strokeParamsFor(feats), branchCount: 0 }, true);
    const many = branch(ctx(), 0, { ...strokeParamsFor(feats), branchCount: 2 }, true);
    const n = (s: Shape[]): number => s.filter((x) => x.kind === 'path').length;
    expect(n(many)).toBeGreaterThan(n(few));
  });

  it('loop=true면 circle shape이 하나 늘어난다', () => {
    const withLoop = branch(ctx(), 0, { ...strokeParamsFor(feats), loop: true }, true);
    const without = branch(ctx(), 0, { ...strokeParamsFor(feats), loop: false }, true);
    const n = (s: Shape[]): number => s.filter((x) => x.kind === 'circle').length;
    expect(n(withLoop)).toBe(n(without) + 1);
  });

  it('specks=false면 disc shape을 만들지 않는다', () => {
    const shapes = branch(ctx(false), 0, strokeParamsFor(feats), true);
    expect(shapes.some((s) => s.kind === 'disc')).toBe(false);
  });

  it('같은 시드로 두 번 호출하면 같은 결과를 낳는다', () => {
    const a = branch(ctx(), 0.3, strokeParamsFor(feats), true);
    const b = branch(ctx(), 0.3, strokeParamsFor(feats), true);
    expect(a).toEqual(b);
  });
});

describe('arcHug', () => {
  it('닫힌 path를 낳는다', () => {
    const shapes = arcHug(ctx(), 0, 0.8, 10, 3.5);
    const p = shapes.find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    expect(p.d.endsWith('Z')).toBe(true);
  });

  it('offset만큼 링에서 떨어져 있다', () => {
    const c = ctx();
    const shapes = arcHug(c, 0, 0.8, 12, 3.5);
    const p = shapes.find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    const rads = parsePathPoints(p.d).map((q) => Math.hypot(q[0] - c.cx, q[1] - c.cy));
    const avg = rads.reduce((a, b) => a + b, 0) / rads.length;
    expect(avg).toBeGreaterThan(c.radius + 8);
  });

  it('양 끝이 뾰족하다 — 중앙보다 얇다', () => {
    const shapes = arcHug(ctx(), 0, 0.8, 10, 4);
    const p = shapes.find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    expect(p.minWidth).toBeLessThan(1.5);
  });
});

describe('loopMark', () => {
  it('circle shape 하나를 낳는다', () => {
    const shapes = loopMark(ctx(), 0, 12, 3.4);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.kind).toBe('circle');
  });
});

describe('inkSpray', () => {
  it('specks=true면 중심 disc와 위성 disc들을 낳는다', () => {
    const shapes = inkSpray(ctx(true), [150, 50], 2);
    expect(shapes.filter((s) => s.kind === 'disc').length).toBeGreaterThan(1);
  });

  it('specks=false면 중심 disc 하나만 낳는다', () => {
    const shapes = inkSpray(ctx(false), [150, 50], 2);
    expect(shapes).toHaveLength(1);
  });
});

describe('hook', () => {
  it('닫힌 path를 낳는다 — 의문 표지', () => {
    const shapes = hook(ctx(), Math.PI / 2, 1);
    const p = shapes.find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    expect(p.d.startsWith('M')).toBe(true);
    expect(p.d.endsWith('Z')).toBe(true);
  });

  it('되꺾이는 형태다 — 끝점이 시작점 쪽으로 돌아온다', () => {
    const c = ctx();
    const shapes = hook(c, -Math.PI / 2, 1);
    const p = shapes.find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    const pts = parsePathPoints(p.d);
    const half = Math.floor(pts.length / 2);
    // 중심선 진행 방향이 역전되어, 중간 지점이 끝 지점보다 링에서 더 멀다
    const rad = (i: number): number => Math.hypot(pts[i]![0] - c.cx, pts[i]![1] - c.cy);
    expect(rad(Math.floor(half * 0.6))).toBeGreaterThan(rad(half - 1));
  });
});

describe('ringWidthFn', () => {
  it('base 근처에서 진동한다', () => {
    const w = ringWidthFn(4, 9, mulberry32(7), 0);
    const vals = Array.from({ length: 64 }, (_, i) => w(i / 63));
    expect(Math.min(...vals)).toBeLessThan(9);
    expect(Math.max(...vals)).toBeGreaterThan(9);
  });

  it('항상 양수다 — 링이 끊기지 않는다', () => {
    for (const h of [2, 4, 6, 8]) {
      expect(minWidthOf(ringWidthFn(h, 9, mulberry32(h), 0))).toBeGreaterThan(0);
    }
  });

  it('floor를 주면 그 값 미만으로 내려가지 않는다', () => {
    expect(minWidthOf(ringWidthFn(6, 9, mulberry32(1), 5))).toBeGreaterThanOrEqual(5 - 1e-9);
  });

  it('harmonic이 크면 진동이 잦다 — 부호 변화 횟수가 많다', () => {
    const crossings = (harmonic: number): number => {
      const w = ringWidthFn(harmonic, 9, mulberry32(3), 0);
      let n = 0;
      let prev = w(0) - 9;
      for (let i = 1; i <= 400; i++) {
        const cur = w(i / 400) - 9;
        if (Math.sign(cur) !== Math.sign(prev)) n++;
        prev = cur;
      }
      return n;
    };
    expect(crossings(8)).toBeGreaterThan(crossings(2));
  });
});

describe('minWidth 하한 — 기하 자체가 클램프된다', () => {
  it('minWidth를 주면 branch의 모든 path가 그 폭 이상이다', () => {
    const floor = 3.5;
    const shapes = branch(ctx(false, floor), 0, strokeParamsFor(feats), true);
    for (const s of shapes) {
      if (s.kind === 'path') expect(s.minWidth).toBeGreaterThanOrEqual(floor - 1e-9);
    }
  });

  it('minWidth를 주면 arcHug의 뾰족한 끝도 그 폭 이상이다', () => {
    const floor = 2.0;
    const shapes = arcHug(ctx(false, floor), 0, 0.8, 10, 4);
    const p = shapes.find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    expect(p.minWidth).toBeGreaterThanOrEqual(floor - 1e-9);
  });

  it('minWidth를 주면 hook도 그 폭 이상이다', () => {
    const floor = 2.5;
    const shapes = hook(ctx(false, floor), Math.PI / 2, 1);
    const p = shapes.find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    expect(p.minWidth).toBeGreaterThanOrEqual(floor - 1e-9);
  });

  it('minWidth가 0이면 뾰족한 끝이 그대로 남는다', () => {
    const p = arcHug(ctx(false, 0), 0, 0.8, 10, 4)
      .find((s) => s.kind === 'path') as Extract<Shape, { kind: 'path' }>;
    expect(p.minWidth).toBeLessThan(1.5);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/strokes.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/strokes"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/strokes.ts`:

```ts
import {
  sampleCubic, taperOutline, minWidthOf,
  type Pt, type WidthFn,
} from './geometry';
import type { StrokeParams } from './mapping';

export type Shape =
  /** 채워진 닫힌 윤곽선 */
  | { kind: 'path'; d: string; minWidth: number }
  /** 채워진 원 — 잉크 방울 */
  | { kind: 'disc'; cx: number; cy: number; r: number }
  /** 테두리만 있는 원 — 부속 고리 */
  | { kind: 'circle'; cx: number; cy: number; r: number; strokeWidth: number };

export interface StrokeContext {
  cx: number;
  cy: number;
  /** 주 링의 반경 */
  radius: number;
  /** 전체 크기 배율 */
  scale: number;
  /** 성분별 서브시드로 만든 난수기 */
  rand: () => number;
  /** 잉크 위성 반점을 생성할지. 목걸이 모드에서는 false */
  specks: boolean;
  /**
   * 모든 획 폭의 하한 (px). 0이면 제한 없음.
   *
   * 이 값은 **보고용이 아니라 기하 자체를 바꾼다.** 아래 모든 굵기 함수가
   * 이 값으로 클램프되므로, 목걸이 모드에서 하한 미만의 획이 SVG에 존재하지 않는다.
   * 메타데이터만 보정하면 검증은 통과하되 실제 각인이 실패한다.
   */
  minWidth: number;
}

/** 굵기 함수를 하한으로 클램프한다. */
function clamped(ctx: StrokeContext, fn: WidthFn): WidthFn {
  return ctx.minWidth > 0 ? (t) => Math.max(ctx.minWidth, fn(t)) : fn;
}

/** 링 위 angle에서의 지역 좌표계. */
function frame(ctx: StrokeContext, angle: number) {
  const nx = Math.cos(angle), ny = Math.sin(angle);
  return {
    origin: [ctx.cx + nx * ctx.radius, ctx.cy + ny * ctx.radius] as Pt,
    nx, ny, tx: -ny, ty: nx,
  };
}

export function inkSpray(ctx: StrokeContext, at: Pt, r: number): Shape[] {
  const shapes: Shape[] = [{ kind: 'disc', cx: at[0], cy: at[1], r }];
  if (!ctx.specks) return shapes;
  const n = 2 + Math.floor(ctx.rand() * 3);
  for (let i = 0; i < n; i++) {
    const a = ctx.rand() * Math.PI * 2;
    const d = r * (0.9 + ctx.rand() * 2.0);
    shapes.push({
      kind: 'disc',
      cx: at[0] + Math.cos(a) * d,
      cy: at[1] + Math.sin(a) * d,
      r: r * (0.12 + ctx.rand() * 0.3),
    });
  }
  return shapes;
}

export function loopMark(ctx: StrokeContext, angle: number, offset: number, r: number): Shape[] {
  const f = frame(ctx, angle);
  return [{
    kind: 'circle',
    cx: f.origin[0] + f.nx * offset,
    cy: f.origin[1] + f.ny * offset,
    r: r * ctx.scale,
    strokeWidth: 2.0 * ctx.scale,
  }];
}

/** 링에서 바깥/안쪽으로 뻗는 분기 획. 획 어휘의 주력. */
export function branch(
  ctx: StrokeContext, angle: number, p: StrokeParams, outward: boolean,
): Shape[] {
  const dir = outward ? 1 : -1;
  const reach = p.reach * ctx.scale * dir;
  const sw = p.curl * 0.9;
  const f = frame(ctx, angle);
  const at = (u: number, v: number): Pt => [
    f.origin[0] + f.nx * reach * u + f.tx * reach * v,
    f.origin[1] + f.ny * reach * u + f.ty * reach * v,
  ];

  const spine = sampleCubic(f.origin, at(0.45, sw * 0.5), at(0.95, sw * 1.15), at(0.66, sw * 2.05), 64);
  const w0 = p.baseWidth * ctx.scale;
  const tip = p.endStyle === 'blob' ? 0.5 * ctx.scale : 0.12 * ctx.scale;
  const widthAt = clamped(ctx, (t) => w0 * (1 - t * 0.94) + tip);

  const shapes: Shape[] = [
    { kind: 'path', d: taperOutline(spine, widthAt), minWidth: minWidthOf(widthAt) },
  ];

  const end = spine[spine.length - 1]!;
  if (p.endStyle === 'blob') {
    shapes.push(...inkSpray(ctx, end, (1.5 + Math.abs(p.curl) * 0.9) * ctx.scale));
  }

  for (let i = 0; i < p.branchCount; i++) {
    const frac = 0.38 + i * 0.20;
    const mid = spine[Math.floor(spine.length * frac)]!;
    const tipPt = at(0.30 * dir + i * 0.12, sw * 0.55 + 0.42 * dir * (i === 0 ? 1 : -1));
    const sub = sampleCubic(mid, at(0.22, sw * 0.3), tipPt, tipPt, 44);
    const subW = clamped(ctx, (t) => 3.4 * ctx.scale * (1 - t * 0.95) + 0.35 * ctx.scale);
    shapes.push({ kind: 'path', d: taperOutline(sub, subW), minWidth: minWidthOf(subW) });
    shapes.push(...inkSpray(ctx, tipPt, 1.1 * ctx.scale));
  }

  if (p.loop) shapes.push(...loopMark(ctx, angle + 0.9 * dir, 13 * ctx.scale * dir, 3.4));

  return shapes;
}

/** 링을 따라 감기는 렌즈형 접선 호. */
export function arcHug(
  ctx: StrokeContext, startAngle: number, span: number, offset: number, width: number,
): Shape[] {
  const steps = 60;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = startAngle + span * t;
    pts.push([
      ctx.cx + Math.cos(a) * (ctx.radius + offset),
      ctx.cy + Math.sin(a) * (ctx.radius + offset),
    ]);
  }
  const widthAt = clamped(ctx, (t) =>
    width * ctx.scale * Math.pow(Math.sin(Math.PI * t), 0.72) + 0.3 * ctx.scale);
  return [{ kind: 'path', d: taperOutline(pts, widthAt), minWidth: minWidthOf(widthAt) }];
}

/**
 * 의문 표지. 링에서 뻗어 나가다 되꺾여 돌아온다.
 * 설계 문서 2.3의 "갈고리 모양이 의문문을 표시한다"를 수용한 것.
 */
export function hook(ctx: StrokeContext, angle: number, scale: number): Shape[] {
  const f = frame(ctx, angle);
  const reach = 30 * ctx.scale * scale;
  const at = (u: number, v: number): Pt => [
    f.origin[0] + f.nx * reach * u + f.tx * reach * v,
    f.origin[1] + f.ny * reach * u + f.ty * reach * v,
  ];
  const spine = sampleCubic(f.origin, at(1.05, 0.15), at(1.15, 0.85), at(0.45, 0.70), 64);
  const widthAt = clamped(ctx, (t) => 5.4 * ctx.scale * (1 - t * 0.88) + 0.4 * ctx.scale);
  const shapes: Shape[] = [
    { kind: 'path', d: taperOutline(spine, widthAt), minWidth: minWidthOf(widthAt) },
  ];
  shapes.push(...inkSpray(ctx, spine[spine.length - 1]!, 1.6 * ctx.scale));
  return shapes;
}

/**
 * 링의 굵기 변조 함수. harmonic이 클수록 진동이 잦다.
 * 최솟값을 base의 25%와 floor 중 큰 값으로 클램프해 링이 끊기지 않게 한다.
 */
export function ringWidthFn(
  harmonic: number, base: number, rand: () => number, floor: number,
): WidthFn {
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const k2 = harmonic + 3;
  const lo = Math.max(base * 0.25, floor);
  return (t) => {
    const a = t * Math.PI * 2;
    const v = base * (1 + 0.44 * Math.sin(a * harmonic + p1) + 0.24 * Math.sin(a * k2 + p2));
    return Math.max(lo, v);
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/strokes.test.ts`
Expected: PASS — 23 tests passed

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 6: 커밋**

```bash
git add src/render/strokes.ts tests/render/strokes.test.ts
git commit -m "feat: 획 어휘 — 분기, 접선 호, 고리, 잉크, 의문 갈고리"
```

---

## Task 6: 역할 지도와 조립

IR을 받아 SVG를 내놓는 중심 함수다. 획별 메타데이터를 함께 반환해, 계획 3의 "분해 보기"와 Task 9의 목걸이 검증이 같은 데이터를 쓴다.

**Files:**
- Create: `src/render/roles.ts`, `src/render/compose.ts`
- Test: `tests/render/compose.test.ts`

**Interfaces:**
- Consumes: 모든 이전 태스크
- Produces:
  - `ROLE_SLOT: Record<Role, number>`
  - `slotAngle(slot: number, jitter: number): number`
  - `interface RenderOptions { size?: number; specks?: boolean; minStrokeWidth?: number }`
  - `interface StrokeMeta { d: string; role: Role | 'ring' | 'mood'; label: string; minWidth: number }`
  - `interface RenderResult { svg: string; strokes: StrokeMeta[]; seed: number; engineVersion: string }`
  - `render(ir: IR, lex: Lexicon, opts?: RenderOptions): RenderResult`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/compose.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render } from '../../src/render/compose';
import { ROLE_SLOT, slotAngle } from '../../src/render/roles';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const lex = loadSeedLexicon();
const ir = (cs: Constituent[], mood: IR['mood'] = 'declarative'): IR => ({
  constituents: cs, mood, engineVersion: ENGINE_VERSION,
});
const loveYou = ir([
  { kind: 'concept', lemma: '사랑', role: '행위' },
  { kind: 'concept', lemma: '나', role: '주체' },
  { kind: 'concept', lemma: '너', role: '대상' },
]);

describe('역할 지도', () => {
  it('3축 대칭이다 — 짝인 역할이 6슬롯(180°) 떨어져 있다', () => {
    expect(Math.abs(ROLE_SLOT['행위'] - ROLE_SLOT['양상'])).toBe(6);
    expect(Math.abs(ROLE_SLOT['주체'] - ROLE_SLOT['대상'])).toBe(6);
    expect(Math.abs(ROLE_SLOT['시간'] - ROLE_SLOT['장소'])).toBe(6);
  });

  it('주 역할은 짝수 슬롯, 부속은 홀수 슬롯이다', () => {
    for (const r of ['행위', '주체', '시간', '양상', '대상', '장소'] as const) {
      expect(ROLE_SLOT[r] % 2, r).toBe(0);
    }
    for (const r of ['행위수식', '주체수식', '시간수식', '정도', '대상수식', '방향'] as const) {
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
    const slots = Object.values(ROLE_SLOT).sort((a, b) => a - b);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('슬롯 0은 12시 방향이다', () => {
    expect(slotAngle(0, 0)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('슬롯 6은 6시 방향이다', () => {
    expect(slotAngle(6, 0)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('render', () => {
  it('유효한 SVG 문서를 낳는다', () => {
    const { svg } = render(loveYou, lex);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 300 300"');
  });

  it('입력, IR, 엔진 버전을 메타데이터로 embed한다', () => {
    const { svg } = render(loveYou, lex);
    expect(svg).toContain('data-engine-version="1.0.0"');
    expect(svg).toContain('<metadata>');
    expect(svg).toContain('사랑');
  });

  it('12분할 격자를 그리지 않는다', () => {
    const { svg } = render(loveYou, lex);
    expect(svg).not.toContain('<line');
  });

  it('링과 각 성분에 대한 획 메타데이터를 낸다', () => {
    const { strokes } = render(loveYou, lex);
    expect(strokes.some((s) => s.role === 'ring')).toBe(true);
    for (const label of ['사랑', '나', '너']) {
      expect(strokes.some((s) => s.label === label), label).toBe(true);
    }
  });

  it('획 메타데이터의 역할이 실제 성분 역할과 일치한다', () => {
    const { strokes } = render(loveYou, lex);
    expect(strokes.find((s) => s.label === '나')!.role).toBe('주체');
    expect(strokes.find((s) => s.label === '너')!.role).toBe('대상');
    expect(strokes.find((s) => s.label === '사랑')!.role).toBe('행위');
  });

  it('의문문일 때만 양상 획을 그린다', () => {
    const decl = render(loveYou, lex);
    const ques = render({ ...loveYou, mood: 'interrogative' }, lex);
    expect(decl.strokes.some((s) => s.role === 'mood')).toBe(false);
    expect(ques.strokes.some((s) => s.role === 'mood')).toBe(true);
    expect(ques.strokes.find((s) => s.role === 'mood')!.label).toBe('의문');
  });

  it('밀도가 정보량이다 — 성분이 많으면 획이 많다', () => {
    const one = render(ir([{ kind: 'concept', lemma: '사랑', role: '행위' }]), lex);
    expect(render(loveYou, lex).strokes.length).toBeGreaterThan(one.strokes.length);
  });

  it('사전에 없는 표제어는 던진다', () => {
    expect(() => render(ir([{ kind: 'concept', lemma: '없는말', role: '행위' }]), lex)).toThrow(/없는말/);
  });

  it('성분이 없으면 던진다', () => {
    expect(() => render(ir([]), lex)).toThrow();
  });

  it('size 옵션이 viewBox에 반영된다', () => {
    expect(render(loveYou, lex, { size: 512 }).svg).toContain('viewBox="0 0 512 512"');
  });

  it('seed와 engineVersion을 반환한다', () => {
    const r = render(loveYou, lex);
    expect(typeof r.seed).toBe('number');
    expect(r.engineVersion).toBe(ENGINE_VERSION);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/compose.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/compose"`

- [ ] **Step 3: 역할 지도 작성**

`src/render/roles.ts`:

```ts
import type { Role } from '../core/ir';

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

/** 슬롯 번호를 각도로. 0이 12시, 시계방향. jitter는 슬롯 내 미세 위치(0..1). */
export function slotAngle(slot: number, jitter: number): number {
  return ((slot + jitter) / 12) * Math.PI * 2 - Math.PI / 2;
}
```

- [ ] **Step 4: 조립 모듈 작성**

`src/render/compose.ts`:

```ts
import {
  seedOf, subSeed, sortedConstituents, constituentKey,
  type IR, type Role, type Constituent,
} from '../core/ir';
import { mulberry32 } from '../core/hash';
import {
  lookup, averageFeatures, NEUTRAL_FEATURES,
  type Lexicon, type SemanticFeatures,
} from '../core/lexicon';
import { strokeParamsFor } from './mapping';
import { ringOutline, minWidthOf } from './geometry';
import {
  branch, arcHug, hook, ringWidthFn,
  type Shape, type StrokeContext,
} from './strokes';
import { ROLE_SLOT, slotAngle } from './roles';
import { ENGINE_VERSION } from '../version';

export interface RenderOptions {
  /** viewBox 한 변. 기본 300 */
  size?: number;
  /** 잉크 위성 반점 생성. 기본 true. 목걸이 모드에서는 false */
  specks?: boolean;
  /** 모든 획 폭의 하한. 기본 0 (제한 없음) */
  minStrokeWidth?: number;
}

export interface StrokeMeta {
  d: string;
  role: Role | 'ring' | 'mood';
  /** 사람이 읽을 라벨. 분해 보기 UI가 쓴다 */
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
const MOOD_LABEL = {
  interrogative: '의문', negative: '부정', volitional: '의지', declarative: '',
} as const;

function labelOf(c: Constituent): string {
  if (c.kind === 'concept') return c.lemma;
  return c.syllables.map((s) => `${s.onset}${s.nucleus}${s.coda}`).join('');
}

function featuresOf(c: Constituent, lex: Lexicon): SemanticFeatures {
  if (c.kind !== 'concept') return NEUTRAL_FEATURES;
  const e = lookup(lex, c.lemma);
  if (!e) throw new Error(`render: 사전에 없는 표제어 "${c.lemma}"`);
  return e.features;
}

/**
 * shape을 SVG 요소로. floor 미만인 요소는 **제거하지 않고 하한까지 키운다.**
 *
 * 제거하면 그 획이 담고 있던 의미가 사라져 원칙 2가 깨진다. 예컨대 종성 표지
 * 고리를 지우면 "한"과 "하"가 구별되지 않는다. 설계 문서 12.2가 말하는
 * "미세 요소 정리"는 의미를 갖지 않는 잉크 위성 반점을 뜻하며, 그건 애초에
 * `specks: false`로 생성되지 않는다.
 */
function shapesToSvg(shapes: Shape[], floor: number): string {
  const out: string[] = [];
  const n = (v: number): string => v.toFixed(3);
  for (const s of shapes) {
    if (s.kind === 'path') {
      out.push(`<path d="${s.d}" fill="${INK}" fill-rule="nonzero"/>`);
    } else if (s.kind === 'disc') {
      const r = Math.max(s.r, floor / 2);
      out.push(`<circle cx="${n(s.cx)}" cy="${n(s.cy)}" r="${n(r)}" fill="${INK}"/>`);
    } else {
      // 고리는 테두리 굵기와 반경을 함께 키워야 구멍이 남는다
      const sw = Math.max(s.strokeWidth, floor);
      const r = Math.max(s.r, sw);
      out.push(
        `<circle cx="${n(s.cx)}" cy="${n(s.cy)}" r="${n(r)}" ` +
        `fill="none" stroke="${INK}" stroke-width="${n(sw)}"/>`,
      );
    }
  }
  return out.join('');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * IR → SVG. 순수 함수이며 브라우저 API에 의존하지 않는다.
 *
 * 성분은 canonical 순서로 순회하고 성분마다 독립된 서브시드를 쓰기 때문에,
 * 파서가 성분을 어떤 순서로 뱉어도 결과가 같다 (원칙 1).
 */
export function render(ir: IR, lex: Lexicon, opts: RenderOptions = {}): RenderResult {
  if (ir.constituents.length === 0) throw new Error('render: IR에 성분이 없다');

  const size = opts.size ?? 300;
  const specks = opts.specks ?? true;
  const floor = opts.minStrokeWidth ?? 0;
  const scale = size / 300;
  const cx = size / 2, cy = size / 2, radius = size * 0.315;

  const seed = seedOf(ir);
  const items = sortedConstituents(ir);
  const strokes: StrokeMeta[] = [];
  const body: string[] = [];

  // ── 주 링 ──
  const avg = averageFeatures(items.map((c) => featuresOf(c, lex)));
  const ringParams = strokeParamsFor(avg);
  const ringRand = mulberry32(subSeed(seed, 'ring'));
  const ringW = ringWidthFn(ringParams.ringHarmonic, 9 * scale, ringRand, floor);
  const ringD = ringOutline(cx, cy, radius, ringW, 360);
  body.push(`<path d="${ringD}" fill="${INK}" fill-rule="nonzero"/>`);
  strokes.push({ d: ringD, role: 'ring', label: '링', minWidth: minWidthOf(ringW) });

  // ── 성분별 획 ──
  for (const c of items) {
    const key = constituentKey(c);
    const f = featuresOf(c, lex);
    const p = strokeParamsFor(f);
    const ctx: StrokeContext = {
      cx, cy, radius, scale, specks, minWidth: floor,
      rand: mulberry32(subSeed(seed, key)),
    };
    const angle = slotAngle(ROLE_SLOT[c.role], f.valence);

    const shapes: Shape[] = [
      ...branch(ctx, angle, p, true),
      ...branch(ctx, angle + 0.14, { ...p, reach: p.reach * 0.55, branchCount: 0, loop: false }, false),
      ...arcHug(ctx, angle - 0.40 + f.intensity * 0.2, 0.62 + f.intensity * 0.5, 10 * scale, 3.6),
    ];

    body.push(shapesToSvg(shapes, floor));
    for (const s of shapes) {
      if (s.kind !== 'path') continue;
      // 기하가 이미 floor로 클램프되었으므로 보고값을 따로 올리지 않는다
      strokes.push({ d: s.d, role: c.role, label: labelOf(c), minWidth: s.minWidth });
    }
  }

  // ── 양상 표지 (6시). mood에서만 채워진다 ──
  if (ir.mood !== 'declarative') {
    const ctx: StrokeContext = {
      cx, cy, radius, scale, specks, minWidth: floor,
      rand: mulberry32(subSeed(seed, `mood|${ir.mood}`)),
    };
    const shapes = hook(ctx, slotAngle(ROLE_SLOT['양상'], 0.5), 1);
    body.push(shapesToSvg(shapes, floor));
    for (const s of shapes) {
      if (s.kind !== 'path') continue;
      strokes.push({ d: s.d, role: 'mood', label: MOOD_LABEL[ir.mood], minWidth: s.minWidth });
    }
  }

  const meta = escapeXml(JSON.stringify({ ir, seed, engineVersion: ENGINE_VERSION }));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" data-engine-version="${ENGINE_VERSION}">` +
    `<metadata>${meta}</metadata>` +
    body.join('') +
    `</svg>`;

  return { svg, strokes, seed, engineVersion: ENGINE_VERSION };
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/compose.test.ts`
Expected: PASS — 17 tests passed

- [ ] **Step 6: 타입 검사**

Run: `npm run typecheck`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 7: 커밋**

```bash
git add src/render/roles.ts src/render/compose.ts tests/render/compose.test.ts
git commit -m "feat: 3축 역할 지도와 IR → SVG 조립"
```

---

## Task 7: 불변식 테스트

설계 문서 14절의 핵심 테스트다. **이 테스트가 깨지면 원칙이 깨진 것이므로, 구현을 고쳐서 통과시켜야 하고 테스트를 완화해서는 안 된다.**

**Files:**
- Test: `tests/render/invariants.test.ts` (새로 생성)

**Interfaces:**
- Consumes: `render` from `src/render/compose`, `loadSeedLexicon` from `src/core/lexicon`
- Produces: 없음 (테스트 전용)

- [ ] **Step 1: 불변식 테스트 작성**

`tests/render/invariants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render } from '../../src/render/compose';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const lex = loadSeedLexicon();
const ir = (cs: Constituent[], mood: IR['mood'] = 'declarative'): IR => ({
  constituents: cs, mood, engineVersion: ENGINE_VERSION,
});

const LOVE: Constituent = { kind: 'concept', lemma: '사랑', role: '행위' };
const ME_SUBJ: Constituent = { kind: 'concept', lemma: '나', role: '주체' };
const YOU_OBJ: Constituent = { kind: 'concept', lemma: '너', role: '대상' };
const YOU_SUBJ: Constituent = { kind: 'concept', lemma: '너', role: '주체' };
const ME_OBJ: Constituent = { kind: 'concept', lemma: '나', role: '대상' };

describe('원칙 1 — 결정성', () => {
  it('같은 IR을 두 번 렌더하면 완전히 같은 SVG가 나온다', () => {
    const a = render(ir([LOVE, ME_SUBJ, YOU_OBJ]), lex);
    const b = render(ir([LOVE, ME_SUBJ, YOU_OBJ]), lex);
    expect(a.svg).toBe(b.svg);
    expect(a.seed).toBe(b.seed);
  });

  it('열 번 반복해도 같다', () => {
    const first = render(ir([LOVE, ME_SUBJ, YOU_OBJ]), lex).svg;
    for (let i = 0; i < 10; i++) {
      expect(render(ir([LOVE, ME_SUBJ, YOU_OBJ]), lex).svg).toBe(first);
    }
  });

  it('여러 입력에 대해 결정적이다', () => {
    const cases: Constituent[][] = [
      [LOVE],
      [LOVE, ME_SUBJ],
      [LOVE, ME_SUBJ, YOU_OBJ],
      [LOVE, ME_SUBJ, YOU_OBJ, { kind: 'concept', lemma: '영원', role: '시간수식' }],
      [{ kind: 'concept', lemma: '기다림', role: '행위' }, YOU_SUBJ, ME_OBJ],
    ];
    for (const cs of cases) {
      expect(render(ir(cs), lex).svg).toBe(render(ir(cs), lex).svg);
    }
  });
});

describe('원칙 1 — 의미 동일성 (설계 문서 6.1)', () => {
  it('성분 순서가 달라도 같은 SVG가 나온다', () => {
    const a = render(ir([LOVE, ME_SUBJ, YOU_OBJ]), lex).svg;
    const b = render(ir([YOU_OBJ, LOVE, ME_SUBJ]), lex).svg;
    const c = render(ir([ME_SUBJ, YOU_OBJ, LOVE]), lex).svg;
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('한국어와 영어가 같은 IR로 수렴하면 같은 그림이 나온다', () => {
    // 파서는 계획 2에서 만든다. 여기서는 두 언어가 낳을 IR을 직접 구성해 검증한다.
    const fromKorean = ir([LOVE, ME_SUBJ, YOU_OBJ]);          // 나는 너를 사랑해
    const fromEnglish = ir([ME_SUBJ, LOVE, YOU_OBJ]);          // I love you
    expect(render(fromEnglish, lex).svg).toBe(render(fromKorean, lex).svg);
  });
});

describe('원칙 2 — 역할 구별', () => {
  it('주체와 대상이 뒤바뀌면 다른 SVG가 나온다', () => {
    const a = render(ir([LOVE, ME_SUBJ, YOU_OBJ]), lex).svg;  // 나는 너를 사랑해
    const b = render(ir([LOVE, YOU_SUBJ, ME_OBJ]), lex).svg;  // 너는 나를 사랑해
    expect(b).not.toBe(a);
  });

  it('양상이 다르면 다른 SVG가 나온다', () => {
    const a = render(ir([LOVE, ME_SUBJ, YOU_OBJ]), lex).svg;
    const b = render(ir([LOVE, ME_SUBJ, YOU_OBJ], 'interrogative'), lex).svg;
    const c = render(ir([LOVE, ME_SUBJ, YOU_OBJ], 'negative'), lex).svg;
    expect(b).not.toBe(a);
    expect(c).not.toBe(a);
    expect(c).not.toBe(b);
  });

  it('정서가가 반대인 어휘는 다른 SVG를 낳는다', () => {
    const love = render(ir([LOVE, ME_SUBJ, YOU_OBJ]), lex).svg;
    const hate = render(ir([
      { kind: 'concept', lemma: '미움', role: '행위' }, ME_SUBJ, YOU_OBJ,
    ]), lex).svg;
    expect(hate).not.toBe(love);
  });

  it('모든 획이 어떤 역할에든 귀속된다 — 소유자 없는 획이 없다', () => {
    const { strokes } = render(ir([LOVE, ME_SUBJ, YOU_OBJ], 'interrogative'), lex);
    for (const s of strokes) {
      expect(s.label.length, JSON.stringify(s.role)).toBeGreaterThan(0);
    }
  });
});

describe('골든 파일 — 의도치 않은 조형 변화 감지', () => {
  const golden: Array<[string, IR]> = [
    ['사랑', ir([LOVE])],
    ['나는 너를 사랑해', ir([LOVE, ME_SUBJ, YOU_OBJ])],
    ['너는 나를 사랑해', ir([LOVE, YOU_SUBJ, ME_OBJ])],
    ['나는 너를 영원히 사랑해', ir([LOVE, ME_SUBJ, YOU_OBJ, { kind: 'concept', lemma: '영원', role: '시간수식' }])],
    ['너는 나를 사랑해?', ir([LOVE, YOU_SUBJ, ME_OBJ], 'interrogative')],
    ['나는 어제 여기서 너를 사랑했어', ir([
      LOVE, ME_SUBJ, YOU_OBJ,
      { kind: 'concept', lemma: '어제', role: '시간' },
      { kind: 'concept', lemma: '여기', role: '장소' },
    ])],
  ];

  for (const [name, input] of golden) {
    it(`${name} 의 SVG가 고정되어 있다`, () => {
      expect(render(input, lex).svg).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 2: 테스트 실행 — 스냅샷이 생성된다**

Run: `npx vitest run tests/render/invariants.test.ts`
Expected: PASS — 15 tests passed, `6 snapshots written`

만약 결정성·의미 동일성·역할 구별 테스트가 실패하면, **테스트를 고치지 말고 구현을 고친다.** 흔한 원인:
- `compose.ts`가 `sortedConstituents` 대신 `ir.constituents`를 순회한다 → 의미 동일성 실패
- 성분별 `subSeed` 대신 공유 난수기를 쓴다 → 의미 동일성 실패
- 슬롯 각도가 `ROLE_SLOT[c.role]` 대신 표제어 해시에서 나온다 → 역할 구별 실패

- [ ] **Step 3: 스냅샷이 안정적인지 재실행으로 확인**

Run: `npx vitest run tests/render/invariants.test.ts`
Expected: PASS — `6 snapshots passed`, written 0

- [ ] **Step 4: 전체 테스트 실행**

Run: `npm test`
Expected: PASS — 7개 테스트 파일 전부 통과 (hash, ir, geometry, mapping, strokes, compose, invariants)

- [ ] **Step 5: 커밋**

```bash
git add tests/render/invariants.test.ts tests/render/__snapshots__
git commit -m "test: 결정성·의미 동일성·역할 구별 불변식과 골든 파일"
```

---

## Task 8: 음소 폴백 — 음절 나선

설계 문서 9절. 이름을 그린다. **순서를 각도가 아니라 반경에 인코딩**하는 것이 핵심이며, 링 둘레에 읽는 방향이 생기지 않는지가 검증 대상이다.

**Files:**
- Create: `src/core/phonology.ts`, `src/render/cluster.ts`
- Modify: `src/render/compose.ts` — `phonetic` 성분 분기 추가
- Test: `tests/core/phonology.test.ts`, `tests/render/cluster.test.ts`

**Interfaces:**
- Consumes: `Syllable` from `src/core/ir`; `sampleCubic`, `taperOutline`, `minWidthOf` from `src/render/geometry`; `inkSpray`, `Shape`, `StrokeContext` from `src/render/strokes`
- Produces:
  - `decomposeHangul(ch: string): Syllable | null`
  - `syllabify(text: string): Syllable[]`
  - `type Manner = 'stop' | 'fricative' | 'nasal' | 'liquid' | 'affricate' | 'none'`
  - `interface ConsonantFeatures { place: 0 | 1 | 2 | 3 | 4; manner: Manner; tense: 0 | 1 | 2 }`
  - `interface VowelFeatures { height: number; back: number; round: number }`
  - `consonantFeatures(id: string): ConsonantFeatures`
  - `vowelFeatures(id: string): VowelFeatures`
  - `syllableCluster(ctx: StrokeContext, at: Pt, angle: number, syl: Syllable, scale: number): Shape[]`
  - `nameSpiral(ctx: StrokeContext, baseAngle: number, syllables: Syllable[]): Shape[]`

- [ ] **Step 1: 음운론 실패 테스트 작성**

`tests/core/phonology.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  decomposeHangul, syllabify, consonantFeatures, vowelFeatures,
} from '../../src/core/phonology';

describe('decomposeHangul', () => {
  it('종성 없는 음절을 분해한다', () => {
    expect(decomposeHangul('루')).toEqual({ onset: 'l', nucleus: 'u', coda: '' });
  });

  it('빈 초성(ㅇ)을 빈 문자열로 낸다', () => {
    expect(decomposeHangul('이')).toEqual({ onset: '', nucleus: 'i', coda: '' });
  });

  it('종성 있는 음절을 분해한다', () => {
    expect(decomposeHangul('한')).toEqual({ onset: 'h', nucleus: 'a', coda: 'n' });
  });

  it('정과 종은 초성만 다르다', () => {
    const a = decomposeHangul('정')!;
    const b = decomposeHangul('종')!;
    expect(a.onset).toBe(b.onset);
    expect(a.coda).toBe(b.coda);
    expect(a.nucleus).not.toBe(b.nucleus);
  });

  it('한글이 아니면 null을 낸다', () => {
    expect(decomposeHangul('a')).toBeNull();
    expect(decomposeHangul('1')).toBeNull();
    expect(decomposeHangul('ㄱ')).toBeNull();
  });
});

describe('syllabify', () => {
  it('한글 문자열을 음절 배열로 만든다', () => {
    expect(syllabify('루이즈')).toHaveLength(3);
  });

  it('음절 순서를 보존한다 — 이름에서 순서는 의미다', () => {
    const a = syllabify('정호');
    const b = syllabify('호정');
    expect(a[0]).not.toEqual(b[0]);
  });

  it('한글이 아닌 문자는 건너뛴다', () => {
    expect(syllabify('루 이')).toHaveLength(2);
  });
});

describe('consonantFeatures', () => {
  it('조음 방법을 분류한다', () => {
    expect(consonantFeatures('g').manner).toBe('stop');
    expect(consonantFeatures('s').manner).toBe('fricative');
    expect(consonantFeatures('n').manner).toBe('nasal');
    expect(consonantFeatures('l').manner).toBe('liquid');
    expect(consonantFeatures('j').manner).toBe('affricate');
    expect(consonantFeatures('').manner).toBe('none');
  });

  it('조음 위치가 양순에서 후음으로 증가한다', () => {
    expect(consonantFeatures('b').place).toBeLessThan(consonantFeatures('d').place);
    expect(consonantFeatures('d').place).toBeLessThan(consonantFeatures('j').place);
    expect(consonantFeatures('j').place).toBeLessThan(consonantFeatures('g').place);
    expect(consonantFeatures('g').place).toBeLessThan(consonantFeatures('h').place);
  });

  it('평음·격음·경음의 긴장도를 구별한다', () => {
    expect(consonantFeatures('g').tense).toBe(0);
    expect(consonantFeatures('k').tense).toBe(1);
    expect(consonantFeatures('kk').tense).toBe(2);
  });

  it('모르는 음소는 중립값을 낸다', () => {
    const f = consonantFeatures('zzz');
    expect(f.place).toBeGreaterThanOrEqual(0);
    expect(f.place).toBeLessThanOrEqual(4);
  });
});

describe('vowelFeatures', () => {
  it('고모음이 저모음보다 height가 크다', () => {
    expect(vowelFeatures('i').height).toBeGreaterThan(vowelFeatures('a').height);
    expect(vowelFeatures('u').height).toBeGreaterThan(vowelFeatures('a').height);
  });

  it('후설모음이 전설모음보다 back이 크다', () => {
    expect(vowelFeatures('u').back).toBeGreaterThan(vowelFeatures('i').back);
  });

  it('원순모음을 표시한다', () => {
    expect(vowelFeatures('u').round).toBe(1);
    expect(vowelFeatures('i').round).toBe(0);
  });

  it('모르는 음소는 중립값을 낸다', () => {
    const f = vowelFeatures('zzz');
    expect(f.height).toBeGreaterThanOrEqual(0);
    expect(f.height).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/core/phonology.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/phonology"`

- [ ] **Step 3: 음운론 모듈 작성**

`src/core/phonology.ts`:

```ts
import type { Syllable } from './ir';

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

const ONSETS = [
  'g', 'kk', 'n', 'd', 'tt', 'l', 'm', 'b', 'pp', 's', 'ss',
  '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
] as const;

const NUCLEI = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae',
  'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
] as const;

const CODAS = [
  '', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb',
  'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch',
  'k', 't', 'p', 'h',
] as const;

/** 유니코드 한글 음절 한 글자를 초성·중성·종성으로 분해한다. */
export function decomposeHangul(ch: string): Syllable | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined || cp < HANGUL_BASE || cp > HANGUL_LAST) return null;
  const code = cp - HANGUL_BASE;
  return {
    onset: ONSETS[Math.floor(code / 588)] ?? '',
    nucleus: NUCLEI[Math.floor((code % 588) / 28)] ?? 'a',
    coda: CODAS[code % 28] ?? '',
  };
}

/** 문자열에서 한글 음절만 뽑아 순서대로 배열로 만든다. */
export function syllabify(text: string): Syllable[] {
  const out: Syllable[] = [];
  for (const ch of text) {
    const s = decomposeHangul(ch);
    if (s) out.push(s);
  }
  return out;
}

export type Manner = 'stop' | 'fricative' | 'nasal' | 'liquid' | 'affricate' | 'none';

export interface ConsonantFeatures {
  /** 조음 위치: 0 양순, 1 치조, 2 구개, 3 연구개, 4 후음 */
  place: 0 | 1 | 2 | 3 | 4;
  manner: Manner;
  /** 긴장도: 0 평음, 1 격음, 2 경음 */
  tense: 0 | 1 | 2;
}

const CONSONANTS: Record<string, ConsonantFeatures> = {
  'b':  { place: 0, manner: 'stop',      tense: 0 },
  'p':  { place: 0, manner: 'stop',      tense: 1 },
  'pp': { place: 0, manner: 'stop',      tense: 2 },
  'm':  { place: 0, manner: 'nasal',     tense: 0 },
  'd':  { place: 1, manner: 'stop',      tense: 0 },
  't':  { place: 1, manner: 'stop',      tense: 1 },
  'tt': { place: 1, manner: 'stop',      tense: 2 },
  'n':  { place: 1, manner: 'nasal',     tense: 0 },
  'l':  { place: 1, manner: 'liquid',    tense: 0 },
  's':  { place: 1, manner: 'fricative', tense: 0 },
  'ss': { place: 1, manner: 'fricative', tense: 2 },
  'z':  { place: 1, manner: 'fricative', tense: 0 },
  'j':  { place: 2, manner: 'affricate', tense: 0 },
  'ch': { place: 2, manner: 'affricate', tense: 1 },
  'jj': { place: 2, manner: 'affricate', tense: 2 },
  'g':  { place: 3, manner: 'stop',      tense: 0 },
  'k':  { place: 3, manner: 'stop',      tense: 1 },
  'kk': { place: 3, manner: 'stop',      tense: 2 },
  'ng': { place: 3, manner: 'nasal',     tense: 0 },
  'h':  { place: 4, manner: 'fricative', tense: 0 },
  '':   { place: 3, manner: 'none',      tense: 0 },
};

const NEUTRAL_CONSONANT: ConsonantFeatures = { place: 2, manner: 'stop', tense: 0 };

export function consonantFeatures(id: string): ConsonantFeatures {
  return CONSONANTS[id] ?? NEUTRAL_CONSONANT;
}

export interface VowelFeatures {
  /** 고저: 0 저모음 ~ 1 고모음 */
  height: number;
  /** 전후설: 0 전설 ~ 1 후설 */
  back: number;
  /** 원순성: 0 또는 1 */
  round: number;
}

const VOWELS: Record<string, VowelFeatures> = {
  'a':   { height: 0.05, back: 0.60, round: 0 },
  'ae':  { height: 0.30, back: 0.05, round: 0 },
  'ya':  { height: 0.15, back: 0.55, round: 0 },
  'yae': { height: 0.35, back: 0.05, round: 0 },
  'eo':  { height: 0.40, back: 0.70, round: 0 },
  'e':   { height: 0.50, back: 0.05, round: 0 },
  'yeo': { height: 0.45, back: 0.65, round: 0 },
  'ye':  { height: 0.55, back: 0.05, round: 0 },
  'o':   { height: 0.60, back: 1.00, round: 1 },
  'wa':  { height: 0.30, back: 0.80, round: 1 },
  'wae': { height: 0.40, back: 0.45, round: 1 },
  'oe':  { height: 0.55, back: 0.30, round: 1 },
  'yo':  { height: 0.65, back: 0.95, round: 1 },
  'u':   { height: 1.00, back: 1.00, round: 1 },
  'wo':  { height: 0.50, back: 0.75, round: 1 },
  'we':  { height: 0.55, back: 0.35, round: 1 },
  'wi':  { height: 0.90, back: 0.30, round: 1 },
  'yu':  { height: 0.95, back: 0.95, round: 1 },
  'eu':  { height: 1.00, back: 0.80, round: 0 },
  'ui':  { height: 0.95, back: 0.45, round: 0 },
  'i':   { height: 1.00, back: 0.05, round: 0 },
};

const NEUTRAL_VOWEL: VowelFeatures = { height: 0.5, back: 0.5, round: 0 };

export function vowelFeatures(id: string): VowelFeatures {
  return VOWELS[id] ?? NEUTRAL_VOWEL;
}
```

- [ ] **Step 4: 음운론 테스트가 통과하는지 확인**

Run: `npx vitest run tests/core/phonology.test.ts`
Expected: PASS — 16 tests passed

- [ ] **Step 5: 나선 실패 테스트 작성**

`tests/render/cluster.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { syllableCluster, nameSpiral } from '../../src/render/cluster';
import { syllabify } from '../../src/core/phonology';
import { mulberry32 } from '../../src/core/hash';
import { render } from '../../src/render/compose';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { ENGINE_VERSION } from '../../src/version';
import type { StrokeContext, Shape } from '../../src/render/strokes';
import type { IR, Constituent } from '../../src/core/ir';
import { parsePathPoints } from '../helpers/path';

const ctx = (minWidth = 0): StrokeContext => ({
  cx: 150, cy: 150, radius: 95, scale: 1, rand: mulberry32(7), specks: true, minWidth,
});

const radiiOf = (shapes: Shape[], cx = 150, cy = 150): number[] => {
  const out: number[] = [];
  for (const s of shapes) {
    if (s.kind === 'path') {
      for (const p of parsePathPoints(s.d)) out.push(Math.hypot(p[0] - cx, p[1] - cy));
    } else {
      out.push(Math.hypot(s.cx - cx, s.cy - cy));
    }
  }
  return out;
};

describe('syllableCluster', () => {
  it('적어도 하나의 path를 낳는다', () => {
    const syl = syllabify('루')[0]!;
    const shapes = syllableCluster(ctx(), [150, 55], 0, syl, 1);
    expect(shapes.filter((s) => s.kind === 'path').length).toBeGreaterThanOrEqual(1);
  });

  it('조음 방법이 다르면 형태가 다르다', () => {
    const liquid = syllableCluster(ctx(), [150, 55], 0, syllabify('루')[0]!, 1);
    const nasal = syllableCluster(ctx(), [150, 55], 0, syllabify('누')[0]!, 1);
    const d = (s: Shape[]): string => s.filter((x) => x.kind === 'path').map((x) => (x as any).d).join('');
    expect(d(liquid)).not.toBe(d(nasal));
  });

  it('모음 고저가 획 길이를 바꾼다', () => {
    const span = (t: string): number => {
      const shapes = syllableCluster(ctx(), [150, 55], 0, syllabify(t)[0]!, 1);
      const rs = radiiOf(shapes);
      return Math.max(...rs) - Math.min(...rs);
    };
    expect(span('기')).toBeGreaterThan(span('가'));
  });

  it('종성이 있으면 shape이 더 많다', () => {
    const open = syllableCluster(ctx(), [150, 55], 0, syllabify('하')[0]!, 1);
    const closed = syllableCluster(ctx(), [150, 55], 0, syllabify('한')[0]!, 1);
    expect(closed.length).toBeGreaterThan(open.length);
  });
});

describe('nameSpiral', () => {
  it('음절마다 획 묶음을 만든다', () => {
    const one = nameSpiral(ctx(), 0, syllabify('루'));
    const three = nameSpiral(ctx(), 0, syllabify('루이즈'));
    expect(three.length).toBeGreaterThan(one.length);
  });

  it('순서가 반경에 인코딩된다 — 뒤 음절이 안쪽에 있다', () => {
    const c = ctx();
    const syls = syllabify('루이즈');
    const first = nameSpiral(c, -Math.PI / 2, [syls[0]!]);
    const all = nameSpiral(ctx(), -Math.PI / 2, syls);
    const minFirst = Math.min(...radiiOf(first));
    const minAll = Math.min(...radiiOf(all));
    expect(minAll).toBeLessThan(minFirst);
  });

  it('둘레 각도 범위가 한 슬롯 폭(30°) 안에 머문다 — 읽는 방향을 만들지 않는다', () => {
    const c = ctx();
    const base = -Math.PI / 2;
    const shapes = nameSpiral(c, base, syllabify('루이즈'));
    const angles: number[] = [];
    for (const s of shapes) {
      const pts = s.kind === 'path' ? parsePathPoints(s.d) : [[s.cx, s.cy] as const];
      for (const p of pts) {
        let a = Math.atan2(p[1] - c.cy, p[0] - c.cx) - base;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        angles.push(a);
      }
    }
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeLessThan((Math.PI * 2) / 12 + 0.35);
  });

  it('순서가 다른 이름은 다른 결과를 낳는다', () => {
    const d = (t: string): string =>
      nameSpiral(ctx(), 0, syllabify(t))
        .filter((s) => s.kind === 'path').map((s) => (s as any).d).join('');
    expect(d('정호')).not.toBe(d('호정'));
  });

  it('음절이 없으면 던진다', () => {
    expect(() => nameSpiral(ctx(), 0, [])).toThrow();
  });

  it('minWidth를 주면 모든 path가 그 폭 이상이다 — 각인 가능성', () => {
    const floor = 3.0;
    for (const s of nameSpiral(ctx(floor), 0, syllabify('루이즈'))) {
      if (s.kind === 'path') expect(s.minWidth).toBeGreaterThanOrEqual(floor - 1e-9);
    }
  });
});

describe('compose 통합 — 음소 성분', () => {
  const lex = loadSeedLexicon();
  const ir = (cs: Constituent[]): IR => ({
    constituents: cs, mood: 'declarative', engineVersion: ENGINE_VERSION,
  });
  const louise: Constituent = { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') };

  it('음소 성분을 렌더한다', () => {
    const { strokes } = render(ir([
      { kind: 'concept', lemma: '사랑', role: '행위' },
      { kind: 'concept', lemma: '나', role: '주체' },
      louise,
    ]), lex);
    expect(strokes.some((s) => s.role === '대상' && s.label === '루이즈')).toBe(true);
  });

  it('같은 이름이 다른 역할에 오면 다른 그림이 나온다', () => {
    const asObject = render(ir([
      { kind: 'concept', lemma: '사랑', role: '행위' }, louise,
    ]), lex).svg;
    const asSubject = render(ir([
      { kind: 'concept', lemma: '사랑', role: '행위' },
      { kind: 'phonetic', role: '주체', syllables: syllabify('루이즈') },
    ]), lex).svg;
    expect(asSubject).not.toBe(asObject);
  });

  it('음소 성분도 결정적이다', () => {
    const input = ir([{ kind: 'concept', lemma: '사랑', role: '행위' }, louise]);
    expect(render(input, lex).svg).toBe(render(input, lex).svg);
  });
});
```

- [ ] **Step 6: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/cluster.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/cluster"`

- [ ] **Step 7: 나선 모듈 작성**

`src/render/cluster.ts`:

```ts
import {
  sampleCubic, taperOutline, minWidthOf,
  type Pt, type WidthFn,
} from './geometry';
import { inkSpray, type Shape, type StrokeContext } from './strokes';
import { consonantFeatures, vowelFeatures } from '../core/phonology';
import type { Syllable } from '../core/ir';

/** 나선이 한 음절마다 안쪽으로 들어가는 비율. */
const RADIUS_STEP = 0.27;
/** 나선의 음절당 각도 증가. 한 슬롯(30°) 안에 머물도록 작게 잡는다. */
const ANGLE_STEP = 0.16;

/**
 * 음절 하나를 획 묶음으로 만든다 (설계 문서 9.3).
 * 조음 방법 → 형태, 조음 위치 → 굵기, 긴장도 → 장력,
 * 모음 고저 → 길이, 전후설 → 감김 방향, 원순성 → 곁점.
 */
export function syllableCluster(
  ctx: StrokeContext, at: Pt, angle: number, syl: Syllable, scale: number,
): Shape[] {
  const c = consonantFeatures(syl.onset);
  const v = vowelFeatures(syl.nucleus);
  const s = scale * ctx.scale;

  const len = (17 + v.height * 21) * s;
  const curl = (v.back - 0.5) * 2.1;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const tx = -dy, ty = dx;
  const P = (u: number, w: number): Pt => [
    at[0] + dx * len * u + tx * len * w,
    at[1] + dy * len * u + ty * len * w,
  ];

  // 조음 방법 → 중심선 형태
  let spine: Pt[];
  if (c.manner === 'fricative') {
    spine = [];
    const n = 50;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      spine.push(P(t * 1.15, Math.sin(t * Math.PI * 3) * 0.24 * (curl || 1)));
    }
  } else if (c.manner === 'liquid') {
    spine = sampleCubic(P(0, 0), P(0.5, curl * 0.45), P(1.05, curl * 0.95), P(0.82, curl * 1.7), 50);
  } else if (c.manner === 'affricate') {
    spine = sampleCubic(P(0, 0), P(0.45, curl * 0.2), P(0.9, curl * 0.5), P(1.12, curl * 0.22), 50);
  } else {
    spine = sampleCubic(P(0, 0), P(0.35, curl * 0.12), P(0.78, curl * 0.32), P(1.02, curl * 0.52), 50);
  }

  // 조음 위치 → 굵기, 긴장도 → 장력
  let w0 = (3.8 + c.place * 0.78) * s * (1 + c.tense * 0.2);
  if (c.manner === 'none') w0 *= 0.62;
  const raw: WidthFn = (t) => w0 * (1 - t * 0.78) + 0.32 * s;
  const widthAt: WidthFn = ctx.minWidth > 0 ? (t) => Math.max(ctx.minWidth, raw(t)) : raw;

  const shapes: Shape[] = [
    { kind: 'path', d: taperOutline(spine, widthAt), minWidth: minWidthOf(widthAt) },
  ];
  const end = spine[spine.length - 1]!;

  // 비음이거나 종성이 있으면 닫힌 고리, 파열음이면 뭉친 잉크
  if (c.manner === 'nasal' || syl.coda !== '') {
    shapes.push({ kind: 'circle', cx: end[0], cy: end[1], r: 2.7 * s, strokeWidth: 1.7 * s });
  } else if (c.manner === 'stop') {
    shapes.push(...inkSpray(ctx, end, 1.8 * s));
  }

  // 원순성 → 곁점
  if (v.round === 1) {
    const mid = spine[Math.floor(spine.length * 0.5)]!;
    shapes.push({ kind: 'disc', cx: mid[0] + tx * 4.4 * s, cy: mid[1] + ty * 4.4 * s, r: 1.9 * s });
  }

  // 파찰음 → 갈래
  if (c.manner === 'affricate') {
    const mid = spine[Math.floor(spine.length * 0.58)]!;
    const tip = P(0.88, curl * 0.5 - 0.5);
    const forkRaw: WidthFn = (t) => 2.2 * s * (1 - t * 0.9) + 0.3 * s;
    const forkW: WidthFn = ctx.minWidth > 0 ? (t) => Math.max(ctx.minWidth, forkRaw(t)) : forkRaw;
    const fork = sampleCubic(mid, P(0.72, curl * 0.3 - 0.22), tip, tip, 30);
    shapes.push({ kind: 'path', d: taperOutline(fork, forkW), minWidth: minWidthOf(forkW) });
  }

  return shapes;
}

/**
 * 이름의 음절 나선 (설계 문서 9.2).
 *
 * 순서를 각도가 아니라 **반경**에 인코딩한다. 첫 음절이 링에 붙고
 * 뒤로 갈수록 안쪽으로 감겨 들어간다. 링 둘레에 읽는 방향이 생기지 않는다.
 *
 * 긴 이름은 반경 감소폭을 줄여 중심까지 파고드는 것을 완화한다.
 */
export function nameSpiral(
  ctx: StrokeContext, baseAngle: number, syllables: Syllable[],
): Shape[] {
  if (syllables.length === 0) throw new Error('nameSpiral: 음절이 없다');

  // 음절이 많을수록 한 걸음을 좁혀, 나선이 중심을 뚫지 않게 한다
  const step = Math.min(RADIUS_STEP, 0.72 / syllables.length);
  const shapes: Shape[] = [];

  syllables.forEach((syl, i) => {
    const r = ctx.radius * (1 - i * step);
    const a = baseAngle + i * ANGLE_STEP;
    const at: Pt = [ctx.cx + Math.cos(a) * r, ctx.cy + Math.sin(a) * r];
    const lean = i % 2 === 0 ? -0.30 : 0.45;
    shapes.push(...syllableCluster(ctx, at, a + lean, syl, 1.25));
  });

  return shapes;
}
```

- [ ] **Step 8: compose에 음소 성분 분기 추가**

`src/render/compose.ts` — import 구문에 추가:

```ts
import { nameSpiral } from './cluster';
```

`src/render/compose.ts` — 성분별 획 루프에서 `shapes` 계산 부분을 다음으로 교체:

```ts
    const angle = slotAngle(ROLE_SLOT[c.role], f.valence);

    const shapes: Shape[] = c.kind === 'phonetic'
      ? [
          ...nameSpiral(ctx, slotAngle(ROLE_SLOT[c.role], 0.3), c.syllables),
          ...arcHug(ctx, angle - 0.42, 0.95, 9 * scale, 3.6),
        ]
      : [
          ...branch(ctx, angle, p, true),
          ...branch(ctx, angle + 0.14, { ...p, reach: p.reach * 0.55, branchCount: 0, loop: false }, false),
          ...arcHug(ctx, angle - 0.40 + f.intensity * 0.2, 0.62 + f.intensity * 0.5, 10 * scale, 3.6),
        ];
```

- [ ] **Step 9: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/cluster.test.ts`
Expected: PASS — 13 tests passed

- [ ] **Step 10: 전체 테스트 실행 — 골든 파일이 여전히 통과해야 한다**

Run: `npm test`
Expected: PASS — 전부 통과. 골든 스냅샷은 개념 성분만 쓰므로 변하지 않는다.

만약 스냅샷이 깨졌다면 개념 성분 경로를 실수로 건드린 것이다. Step 8의 교체가 `c.kind === 'phonetic'`이 아닐 때 기존과 동일한 shapes를 만드는지 확인한다.

- [ ] **Step 11: 타입 검사**

Run: `npm run typecheck`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 12: 커밋**

```bash
git add src/core/phonology.ts src/render/cluster.ts src/render/compose.ts tests/core/phonology.test.ts tests/render/cluster.test.ts
git commit -m "feat: 음소 폴백 — 한글 음운 분해와 음절 나선"
```

---

## Task 9: 목걸이 모드 내보내기

설계 문서 12.2. **이 프로젝트의 실제 목적물이다.** 각인·레이저컷은 너무 얇은 획을 재현하지 못하므로, 최소 선폭을 보정하고 하한 미만의 미세 요소를 제거한다.

**Files:**
- Create: `src/render/necklace.ts`
- Test: `tests/render/necklace.test.ts`

**Interfaces:**
- Consumes: `render`, `RenderOptions`, `RenderResult` from `src/render/compose`; `IR` from `src/core/ir`; `Lexicon` from `src/core/lexicon`
- Produces:
  - `interface NecklaceOptions { diameterMm: number; minStrokeMm: number; size?: number }`
  - `DEFAULT_NECKLACE: NecklaceOptions`
  - `renderForNecklace(ir: IR, lex: Lexicon, opts?: Partial<NecklaceOptions>): RenderResult`
  - `validateNecklace(result: RenderResult, opts: NecklaceOptions): string[]` — 위반 목록. 빈 배열이면 통과

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/necklace.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  renderForNecklace, validateNecklace, DEFAULT_NECKLACE,
} from '../../src/render/necklace';
import { render } from '../../src/render/compose';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { syllabify } from '../../src/core/phonology';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const lex = loadSeedLexicon();
const ir = (cs: Constituent[]): IR => ({
  constituents: cs, mood: 'declarative', engineVersion: ENGINE_VERSION,
});
const sample = ir([
  { kind: 'concept', lemma: '사랑', role: '행위' },
  { kind: 'concept', lemma: '나', role: '주체' },
  { kind: 'phonetic', role: '대상', syllables: syllabify('루이즈') },
]);

/** mm 하한을 SVG px로 환산. necklace.ts의 floorPxOf와 같은 식이다. */
const floorPx = (o: typeof DEFAULT_NECKLACE): number =>
  (o.minStrokeMm / o.diameterMm) * (o.size ?? 600);

describe('renderForNecklace', () => {
  it('모든 획 폭이 하한 이상이다', () => {
    const r = renderForNecklace(sample, lex);
    const floor = floorPx(DEFAULT_NECKLACE);
    for (const s of r.strokes) {
      expect(s.minWidth, s.label).toBeGreaterThanOrEqual(floor - 1e-6);
    }
  });

  it('잉크 위성 반점을 만들지 않는다', () => {
    const necklace = renderForNecklace(sample, lex);
    const screen = render(sample, lex);
    const count = (svg: string): number => (svg.match(/<circle/g) ?? []).length;
    expect(count(necklace.svg)).toBeLessThan(count(screen.svg));
  });

  it('모든 path가 닫혀 있다', () => {
    const r = renderForNecklace(sample, lex);
    for (const d of r.svg.match(/d="([^"]+)"/g) ?? []) {
      expect(d.endsWith('Z"')).toBe(true);
    }
  });

  it('엔진 버전과 IR을 메타데이터로 담는다 — 수년 후 재현용', () => {
    const r = renderForNecklace(sample, lex);
    expect(r.svg).toContain(`data-engine-version="${ENGINE_VERSION}"`);
    expect(r.svg).toContain('<metadata>');
  });

  it('화면용보다 큰 좌표계를 쓴다 — 정밀도 확보', () => {
    expect(renderForNecklace(sample, lex).svg).toContain('viewBox="0 0 600 600"');
  });

  it('결정적이다', () => {
    expect(renderForNecklace(sample, lex).svg).toBe(renderForNecklace(sample, lex).svg);
  });

  it('지름과 최소 선폭을 바꿀 수 있다', () => {
    const thick = renderForNecklace(sample, lex, { minStrokeMm: 1.2 });
    const thin = renderForNecklace(sample, lex, { minStrokeMm: 0.2 });
    const minOf = (r: ReturnType<typeof renderForNecklace>): number =>
      Math.min(...r.strokes.map((s) => s.minWidth));
    expect(minOf(thick)).toBeGreaterThan(minOf(thin));
  });
});

describe('validateNecklace', () => {
  it('목걸이 모드 출력은 위반이 없다', () => {
    const r = renderForNecklace(sample, lex);
    expect(validateNecklace(r, DEFAULT_NECKLACE)).toEqual([]);
  });

  it('화면용 출력은 위반을 보고한다', () => {
    const violations = validateNecklace(render(sample, lex, { size: 600 }), DEFAULT_NECKLACE);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/폭/);
  });

  it('위반 메시지에 어느 획인지 담는다', () => {
    const violations = validateNecklace(render(sample, lex, { size: 600 }), DEFAULT_NECKLACE);
    expect(violations.some((v) => /사랑|나|루이즈|링/.test(v))).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/necklace.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/necklace"`

- [ ] **Step 3: 최소 구현 작성**

`src/render/necklace.ts`:

```ts
import { render, type RenderResult } from './compose';
import type { IR } from '../core/ir';
import type { Lexicon } from '../core/lexicon';

export interface NecklaceOptions {
  /** 펜던트 지름 (mm) */
  diameterMm: number;
  /** 물리적으로 재현 가능한 최소 선폭 (mm). 제작소 공정에 맞춰 조정한다 */
  minStrokeMm: number;
  /** SVG 좌표계 한 변. 기본 600 — 화면용보다 크게 잡아 정밀도를 확보한다 */
  size?: number;
}

/**
 * 기본 프리셋. 지름 20mm 펜던트, 최소 선폭 0.6mm.
 * 최소 선폭은 설계 문서 15절의 미결 사항으로, 실제 제작소 공정을 확인해 확정한다.
 */
export const DEFAULT_NECKLACE: NecklaceOptions = {
  diameterMm: 20,
  minStrokeMm: 0.6,
  size: 600,
};

function floorPxOf(opts: NecklaceOptions): number {
  const size = opts.size ?? 600;
  return (opts.minStrokeMm / opts.diameterMm) * size;
}

/**
 * 목걸이 각인용 렌더 (설계 문서 12.2).
 *
 * 1. 최소 선폭 보정 — 굵기 함수 자체를 하한으로 클램프한다 (StrokeContext.minWidth).
 *    보고값만 올리면 검증은 통과하되 실제 각인이 실패한다.
 * 2. 열린 획을 닫힌 윤곽선으로 — taperOutline이 이미 닫힌 패스를 만들므로 자동 충족
 * 3. 미세 요소 정리 — 의미 없는 잉크 위성 반점을 생성하지 않는다 (specks: false).
 *    의미를 담은 요소는 제거가 아니라 하한까지 확대한다
 * 4. 좌표계를 600으로 확대 — 클램프 후에도 획 간 여백이 남도록 정밀도를 확보한다
 */
export function renderForNecklace(
  ir: IR, lex: Lexicon, opts: Partial<NecklaceOptions> = {},
): RenderResult {
  const merged: NecklaceOptions = { ...DEFAULT_NECKLACE, ...opts };
  return render(ir, lex, {
    size: merged.size ?? 600,
    specks: false,
    minStrokeWidth: floorPxOf(merged),
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
        `하한 ${floor.toFixed(3)}px 미만이다`,
      );
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
Expected: PASS — 10 tests passed

- [ ] **Step 5: 전체 테스트 실행**

Run: `npm test`
Expected: PASS — 전부 통과

- [ ] **Step 6: 타입 검사**

Run: `npm run typecheck`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 7: 커밋**

```bash
git add src/render/necklace.ts tests/render/necklace.test.ts
git commit -m "feat: 목걸이 각인용 내보내기와 각인 가능성 검증"
```

---

## Task 10: CLI

이 태스크가 끝나면 **웹앱 없이도 목걸이 파일을 뽑을 수 있다.** 계획 1의 목표가 여기서 달성된다.

**Files:**
- Create: `src/cli.ts`, `fixtures/love-you.ir.json`
- Modify: `package.json` — `glyph` 스크립트는 Task 1에서 이미 추가했으므로 변경 없음
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `render` from `src/render/compose`; `renderForNecklace`, `validateNecklace`, `DEFAULT_NECKLACE` from `src/render/necklace`; `loadSeedLexicon` from `src/core/lexicon`
- Produces:
  - `parseArgs(argv: string[]): CliArgs`
  - `interface CliArgs { input: string; out: string; necklace: boolean; size?: number; minStrokeMm?: number }`
  - `runCli(argv: string[]): Promise<number>` — 종료 코드 반환

- [ ] **Step 1: 픽스처 작성**

`fixtures/love-you.ir.json`:

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
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
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

afterEach(() => {
  for (const p of created.splice(0)) if (existsSync(p)) rmSync(p);
});

describe('parseArgs', () => {
  it('필수 인자를 읽는다', () => {
    const a = parseArgs(['--ir', 'a.json', '--out', 'b.svg']);
    expect(a.input).toBe('a.json');
    expect(a.out).toBe('b.svg');
    expect(a.necklace).toBe(false);
  });

  it('--necklace 플래그를 읽는다', () => {
    expect(parseArgs(['--ir', 'a.json', '--out', 'b.svg', '--necklace']).necklace).toBe(true);
  });

  it('--size와 --min-stroke-mm을 숫자로 읽는다', () => {
    const a = parseArgs(['--ir', 'a.json', '--out', 'b.svg', '--size', '512', '--min-stroke-mm', '0.8']);
    expect(a.size).toBe(512);
    expect(a.minStrokeMm).toBeCloseTo(0.8, 6);
  });

  it('--ir이 없으면 던진다', () => {
    expect(() => parseArgs(['--out', 'b.svg'])).toThrow(/--ir/);
  });

  it('--out이 없으면 던진다', () => {
    expect(() => parseArgs(['--ir', 'a.json'])).toThrow(/--out/);
  });
});

describe('runCli', () => {
  it('화면용 SVG 파일을 쓰고 0을 반환한다', async () => {
    const out = outPath('screen.svg');
    const code = await runCli(['--ir', 'fixtures/love-you.ir.json', '--out', out]);
    expect(code).toBe(0);
    const svg = readFileSync(out, 'utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 300 300"');
  });

  it('--necklace로 각인용 SVG를 쓴다', async () => {
    const out = outPath('necklace.svg');
    const code = await runCli(['--ir', 'fixtures/love-you.ir.json', '--out', out, '--necklace']);
    expect(code).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('viewBox="0 0 600 600"');
  });

  it('두 번 실행하면 바이트 단위로 같은 파일을 쓴다 — 원칙 1', async () => {
    const a = outPath('det-a.svg');
    const b = outPath('det-b.svg');
    await runCli(['--ir', 'fixtures/love-you.ir.json', '--out', a, '--necklace']);
    await runCli(['--ir', 'fixtures/love-you.ir.json', '--out', b, '--necklace']);
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(b, 'utf8'));
  });

  it('없는 파일을 주면 0이 아닌 코드를 반환한다', async () => {
    expect(await runCli(['--ir', 'fixtures/없음.json', '--out', outPath('x.svg')])).not.toBe(0);
  });

  it('사전에 없는 표제어가 있으면 0이 아닌 코드를 반환한다', async () => {
    const bad = outPath('bad.ir.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(bad, JSON.stringify({
      constituents: [{ kind: 'concept', lemma: '없는말', role: '행위' }],
      mood: 'declarative', engineVersion: '1.0.0',
    }));
    expect(await runCli(['--ir', bad, '--out', outPath('y.svg')])).not.toBe(0);
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
  --necklace              목걸이 각인용으로 내보낸다 (최소 선폭 보정, 반점 제거)
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
    input,
    out,
    necklace: argv.includes('--necklace'),
    ...(sizeRaw !== undefined ? { size: Number(sizeRaw) } : {}),
    ...(mmRaw !== undefined ? { minStrokeMm: Number(mmRaw) } : {}),
  };
}

export async function runCli(argv: string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }

  let ir: IR;
  try {
    ir = JSON.parse(readFileSync(args.input, 'utf8')) as IR;
  } catch (e) {
    console.error(`IR 파일을 읽을 수 없다: ${args.input}\n${(e as Error).message}`);
    return 3;
  }

  const lex = loadSeedLexicon();
  try {
    if (args.necklace) {
      const opts = {
        ...(args.size !== undefined ? { size: args.size } : {}),
        ...(args.minStrokeMm !== undefined ? { minStrokeMm: args.minStrokeMm } : {}),
      };
      const result = renderForNecklace(ir, lex, opts);
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
      const result = render(ir, lex, args.size !== undefined ? { size: args.size } : {});
      writeFileSync(args.out, result.svg, 'utf8');
      console.log(`SVG를 썼다: ${args.out} (획 ${result.strokes.length}개, 시드 ${result.seed})`);
    }
  } catch (e) {
    console.error(`렌더 실패: ${(e as Error).message}`);
    return 4;
  }

  return 0;
}

// 직접 실행될 때만 프로세스를 종료시킨다. 테스트는 runCli를 직접 부른다.
// pathToFileURL로 비교하면 Windows 경로 구분자 문제가 생기지 않는다.
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

Run: `npm run glyph -- --ir fixtures/love-you.ir.json --out /tmp/necklace.svg --necklace`
Expected: `각인용 SVG를 썼다: /tmp/necklace.svg (최소 선폭 0.6mm, 지름 20mm)`

Windows에서는 경로를 바꿔서 실행한다:

Run: `npm run glyph -- --ir fixtures/love-you.ir.json --out out-necklace.svg --necklace`
Expected: 같은 메시지. `out-necklace.svg` 파일이 생성됨

- [ ] **Step 7: 생성된 SVG를 브라우저에서 열어 눈으로 확인**

파일을 브라우저로 열어 링과 획이 보이는지, 잉크 반점이 없는지 확인한다. 조형 품질은 계획 5(씨앗 글리프)에서 개선되므로, 지금은 **깨지지 않았는지만** 본다.

- [ ] **Step 8: 임시 출력물 정리와 .gitignore 확인**

`.gitignore`에 다음 줄을 추가한다:

```
out-*.svg
```

- [ ] **Step 9: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과, 타입 에러 없음

- [ ] **Step 10: 커밋**

```bash
git add src/cli.ts fixtures/love-you.ir.json tests/cli.test.ts .gitignore
git commit -m "feat: CLI — IR 파일에서 화면용·각인용 SVG 생성"
```

---

## 완료 조건

계획 1이 끝나면 다음이 성립한다.

- [ ] `npm test` 가 전부 통과한다 (테스트 파일 11개)
- [ ] `npm run typecheck` 가 에러 없이 끝난다
- [ ] 같은 IR을 두 번 렌더하면 **바이트 단위로 같은 SVG**가 나온다
- [ ] 성분 순서를 섞어도 같은 SVG가 나온다 (의미 동일성)
- [ ] 주체·대상을 뒤바꾸면 다른 SVG가 나온다 (역할 구별)
- [ ] 이름을 넣으면 음절 나선이 그려지고, 둘레 각도가 한 슬롯 폭 안에 머문다
- [ ] `npm run glyph -- --ir <파일> --out <파일> --necklace` 로 **각인 가능성 검증을 통과한 SVG**를 얻는다
- [ ] 골든 스냅샷 6개가 고정되어, 이후 변경이 조형을 건드리면 테스트가 알려준다

**이 시점에서 목걸이를 제작할 수 있다.** IR JSON을 손으로 쓰면 되고, 자연어 입력은 계획 2에서 붙는다.

---

## 다음 계획

| 계획 | 내용 | 계획 1에 대한 의존 |
|---|---|---|
| 2. 파서 | 한국어·영어 → IR (스펙 7.3, 7.4) | `core/ir.ts`의 IR 타입, `core/phonology.ts`의 `syllabify` |
| 3. 웹앱 | UI, 잉크 애니메이션, 분해 보기, 공유 URL, 사전 브라우저 (스펙 11) | `RenderResult.strokes`가 분해 보기 데이터 |
| 4. 사전 자가 성장 | 빌드타임 생성, Worker, 잠정 등재 (스펙 10) | `core/lexicon.ts`의 `LexiconEntry` 스키마 |
| 5. 씨앗 글리프 | 영화 38개 분석 → 씨앗 100개 + 자질 공간 보간 (스펙 8.3) | `LexiconEntry.seedGlyph`, `render/mapping.ts` |
