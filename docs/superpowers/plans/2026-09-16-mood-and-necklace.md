# 계획 II-b — 문장 종류 표지와 목걸이 제작 가능성

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문장 종류(`mood`)를 그림에 드러내고, 투각 펜던트 20mm 로 실제 제작 가능한 목걸이 경로를 만들 수 있게 한다.

**Architecture:** 계획 II 의 엔진(`src/render/*`)은 그대로 두고 두 방향으로 넓힌다. (1) `mood` 표지 획을 획 어휘에 추가해 6시 슬롯에 그린다 — 스펙 6.2 가 요구하는데 계획 II 가 빠뜨렸다. (2) 제작 가능성 검증을 래스터 기반으로 새로 만들고(`manufacture.ts`), 목걸이는 화면 룩을 굵히는 대신 **전용 룩 파일**(`design/look-necklace.json`)을 갖는다. 사용자가 조형을 직접 맞추는 자리는 언제나 `spikes/look-lab.html` 이므로, 랩이 엔진을 따라가도록 같이 고친다.

**Tech Stack:** TypeScript 5, Vitest 2, tsx. 룩 랩은 의존성 없는 단일 HTML + WebGL2. 새 런타임 의존성을 추가하지 않는다.

## Global Constraints

- **비영리.** 광고·수익화·유료 기능을 넣지 않는다. 런타임 유료 API 의존을 코어에 넣지 않는다.
- **원칙 1 (결정성):** 같은 입력은 항상 같은 로고그램을 낳는다. 불규칙성은 난수가 아니라 정규화된 IR 의 해시를 시드로 하는 의사난수로 만든다.
- **원칙 2 (모든 획은 의미를 담당한다):** 장식을 위해 존재하는 획은 없다. 형태의 차이는 반드시 의미의 차이에서 온다.
- **링 안쪽은 비운다.** 덩어리·가시·고리·표지가 모두 링의 바깥 면 밖에만 존재한다. 겹쳐 쌓기는 바깥으로 간다. **예외 없다.**
- **링은 언제나 하나다.** 동심 링을 쓰지 않는다.
- **조형 파라미터는 룩 JSON 이 유일한 출처다.** 새 조형 수치는 `design/look-v3.json` 에 키를 추가하고 `LOOK_KEYS` 에 등록한다. 코드에 박지 않는다.
- **개수 상한:** 단어 10개, 이름 8음절 (`MAX_WORDS`, `MAX_SYLLABLES`).
- **룩 랩이 조형의 기준 구현이다.** 엔진과 랩의 같은 규칙이 어긋나면 안 된다 (`src/render/vocab.ts` 의 `hair()` 주석 참조).
- **목걸이 물리 제약 (스펙 12.3):** 투각 펜던트, 바깥 지름 20mm, 최소 선폭 0.5mm, 최소 틈 0.5mm, 한 덩어리 연결, 떠 있는 조각 금지.
- **원본 영화 이미지(`Reference/`)를 저장소에 커밋하지 않는다.**
- 커밋 메시지는 한국어로 쓰고 마지막 줄은 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` 이다. `git add -A` 를 쓰지 않는다.

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `spikes/look-lab.html` | 조형 실험실. 사용자가 눈으로 맞추는 자리 | 1, 3, 7 |
| `src/render/vocab.ts` | 획 어휘. `ringStrokes`, `bloomStrokes` 에 `moodStrokes` 추가 | 2 |
| `src/render/compose.ts` | 조립. mood 표지 획을 붙인다 | 2 |
| `src/render/look.ts` | 룩 로더. 새 키 2개 등록, 목걸이 룩 로더 추가 | 2, 6 |
| `design/look-v3.json` | 화면 확정 룩. mood 키 추가 | 2 |
| `src/render/manufacture.ts` | **신규.** 래스터 기반 제작 가능성 검증 (선폭·틈·연결·구멍) | 4, 5 |
| `src/render/necklace.ts` | 목걸이 내보내기. 전용 룩과 새 검증을 쓴다 | 6 |
| `design/look-necklace.json` | **신규.** 목걸이 전용 조형 | 6, 7 |

**의존 순서:** 1 → (2 → 3) → (4 → 5) → 6 → 7. Task 1 과 Task 4 는 서로 독립이므로 병렬 실행 가능하다. Task 7 은 **사용자가 랩에서 목걸이 조형을 확정한 뒤에** 실행한다.

---

## Task 1: 룩 랩 — 이름을 소리대로 그린다

룩 랩의 `nameSpiral` 은 음절 **개수**만 쓴다. 그래서 어떤 이름을 넣어도 같은 호가 개수만큼 바깥으로 쌓일 뿐이고, 사용자가 "고유명사를 넣으면 똑같은 작은 덩어리만 늘어난다"고 관찰한 그대로다. 엔진(`src/render/name.ts`)은 이미 음운 자질로 그리고 받침 27개가 전부 구별되는 것을 테스트로 고정해 두었다. 랩만 옛 규칙에 남아 있다.

**Files:**
- Modify: `spikes/look-lab.html`

**Interfaces:**
- Produces (랩 내부 전역): `decomposeHangul(ch)`, `syllabify(text)`, `consonantFeatures(id)`, `vowelFeatures(id)`, `nameSpiral(angle, syllables, seedKey, out, ctx)`
- 엔진 `src/core/phonology.ts`, `src/render/name.ts` 의 규칙을 그대로 옮긴 것이다. 두 곳이 어긋나면 안 된다.

- [ ] **Step 1: 음운 표를 랩에 추가**

`spikes/look-lab.html` 에서 `// ── 자질 → 조형 파라미터 ──` 주석 **바로 위**에 다음을 넣는다. 값은 `src/core/phonology.ts` 와 같아야 한다.

```js
// ── 음운 자질 ──
// src/core/phonology.ts 를 그대로 옮긴 것이다. 엔진과 랩이 어긋나면 안 된다.
const HANGUL_BASE = 0xac00, HANGUL_LAST = 0xd7a3;
const ONSETS = ['g','kk','n','d','tt','l','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const NUCLEI = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const CODAS = ['','g','kk','gs','n','nj','nh','d','l','lg','lm','lb','ls','lt','lp','lh','m','b','bs','s','ss','ng','j','ch','k','t','p','h'];

function decomposeHangul(ch) {
  const cp = ch.codePointAt(0);
  if (cp === undefined || cp < HANGUL_BASE || cp > HANGUL_LAST) return null;
  const code = cp - HANGUL_BASE;
  return {
    onset: ONSETS[Math.floor(code / 588)] ?? '',
    nucleus: NUCLEI[Math.floor((code % 588) / 28)] ?? 'a',
    coda: CODAS[code % 28] ?? '',
  };
}

function syllabify(text) {
  const out = [];
  for (const ch of text) { const s = decomposeHangul(ch); if (s) out.push(s); }
  return out;
}

const CONSONANTS = {
  'b':  { place: 0, manner: 'stop',      tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'p':  { place: 0, manner: 'stop',      tense: 1, secondPlace: null, secondManner: null, secondTense: null },
  'pp': { place: 0, manner: 'stop',      tense: 2, secondPlace: null, secondManner: null, secondTense: null },
  'm':  { place: 0, manner: 'nasal',     tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'd':  { place: 1, manner: 'stop',      tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  't':  { place: 1, manner: 'stop',      tense: 1, secondPlace: null, secondManner: null, secondTense: null },
  'tt': { place: 1, manner: 'stop',      tense: 2, secondPlace: null, secondManner: null, secondTense: null },
  'n':  { place: 1, manner: 'nasal',     tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'l':  { place: 1, manner: 'liquid',    tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  's':  { place: 1, manner: 'fricative', tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'ss': { place: 1, manner: 'fricative', tense: 2, secondPlace: null, secondManner: null, secondTense: null },
  'z':  { place: 1, manner: 'fricative', tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'j':  { place: 2, manner: 'affricate', tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'ch': { place: 2, manner: 'affricate', tense: 1, secondPlace: null, secondManner: null, secondTense: null },
  'jj': { place: 2, manner: 'affricate', tense: 2, secondPlace: null, secondManner: null, secondTense: null },
  'g':  { place: 3, manner: 'stop',      tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'k':  { place: 3, manner: 'stop',      tense: 1, secondPlace: null, secondManner: null, secondTense: null },
  'kk': { place: 3, manner: 'stop',      tense: 2, secondPlace: null, secondManner: null, secondTense: null },
  'ng': { place: 3, manner: 'nasal',     tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'h':  { place: 4, manner: 'fricative', tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  '':   { place: 3, manner: 'none',      tense: 0, secondPlace: null, secondManner: null, secondTense: null },
  'gs': { place: 3, manner: 'stop',   tense: 0, secondPlace: 1, secondManner: 'fricative', secondTense: 0 },
  'nj': { place: 1, manner: 'nasal',  tense: 0, secondPlace: 2, secondManner: 'affricate', secondTense: 0 },
  'nh': { place: 1, manner: 'nasal',  tense: 0, secondPlace: 4, secondManner: 'fricative', secondTense: 0 },
  'lg': { place: 1, manner: 'liquid', tense: 0, secondPlace: 3, secondManner: 'stop',      secondTense: 0 },
  'lm': { place: 1, manner: 'liquid', tense: 0, secondPlace: 0, secondManner: 'nasal',     secondTense: 0 },
  'lb': { place: 1, manner: 'liquid', tense: 0, secondPlace: 0, secondManner: 'stop',      secondTense: 0 },
  'ls': { place: 1, manner: 'liquid', tense: 0, secondPlace: 1, secondManner: 'fricative', secondTense: 0 },
  'lt': { place: 1, manner: 'liquid', tense: 0, secondPlace: 1, secondManner: 'stop',      secondTense: 1 },
  'lp': { place: 1, manner: 'liquid', tense: 0, secondPlace: 0, secondManner: 'stop',      secondTense: 1 },
  'lh': { place: 1, manner: 'liquid', tense: 0, secondPlace: 4, secondManner: 'fricative', secondTense: 0 },
  'bs': { place: 0, manner: 'stop',   tense: 0, secondPlace: 1, secondManner: 'fricative', secondTense: 0 },
};
const NEUTRAL_CONSONANT = { place: 2, manner: 'stop', tense: 0, secondPlace: null, secondManner: null, secondTense: null };
const consonantFeatures = (id) => CONSONANTS[id] ?? NEUTRAL_CONSONANT;

const VOWELS = {
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
const NEUTRAL_VOWEL = { height: 0.5, back: 0.5, round: 0 };
const vowelFeatures = (id) => VOWELS[id] ?? NEUTRAL_VOWEL;

/** 이름 상한. 엔진의 MAX_SYLLABLES 와 같아야 한다. */
const MAX_SYLLABLES = 8;
const MANNER_SHAPE = { stop: 0.0, fricative: 0.35, nasal: 0.7, liquid: 1.0, affricate: 0.5, none: 0.15 };
```

- [ ] **Step 2: `nameSpiral` 을 엔진 규칙으로 교체**

`spikes/look-lab.html` 의 `function nameSpiral(angle, count, seedKey, out, ctx = {}) { … }` 블록 전체(현재 `for` 루프가 호 하나와 고정 개수 가시만 그린다)를 아래로 바꾼다.

```js
/**
 * 이름의 음절 나선 — src/render/name.ts 를 그대로 옮긴 것이다.
 *
 * 옛 랩은 음절 **개수**만 썼다. 그래서 어떤 이름을 넣어도 같은 호가 개수만큼
 * 쌓였고, 이름끼리 구별되지 않았다 (원칙 2 위반). 이제 소리를 읽는다 —
 * 초성의 조음 위치·방법·긴장도가 굵기·부풂·장력을, 모음의 고저·전후설·
 * 원순성이 호 길이·기울기·곁가지를, 종성이 끝의 표지를 정한다.
 */
function nameSpiral(angle, syllables, seedKey, out, ctx = {}) {
  const syls = syllables.slice(0, MAX_SYLLABLES);
  if (syls.length === 0) return;
  const rnd = rng(fnv1a(seedKey));
  const depth = ctx.depth ?? 0;
  const R = ctx.R ?? val.pR;
  const J = val.cJitter;
  const floor = R - val.pRingBase;
  const surf = R + val.pRingBase * 0.5 + depth * val.cBloomThick * 0.80;
  const step = val.cBloomThick * 0.95;

  // 점마다 자기 반폭만큼 링 밖으로 민다 (엔진 pushOutside 와 같다)
  const push = (pts, ws) => {
    const safe = pts.map((p, i) => {
      const need = floor + (ws[i] ?? 0) / 2;
      const r = Math.hypot(p[0], p[1]);
      if (r >= need) return p;
      if (r < 1e-12) return [need, 0];
      const k = need / r;
      return [p[0] * k, p[1] * k];
    });
    strip(safe, ws, out);
  };

  syls.forEach((syl, i) => {
    const c = consonantFeatures(syl.onset);
    const v = vowelFeatures(syl.nucleus);

    const thick = val.cBloomThick * Math.max(0.12, 0.55 - i * 0.06)
                * (0.55 + c.place * 0.16) * (1 + c.tense * 0.18);
    const span = val.cBloomSpan * (0.45 + v.height * 0.55) * Math.max(0.2, 1 - i * 0.08);
    const lean = (v.back - 0.5) * 0.6;
    const bow = val.cBloomThick * (0.12 + (MANNER_SHAPE[c.manner] ?? 0.3) * 0.5);

    const r = surf + i * step;
    const a0 = angle + i * 0.13 + lean * 0.2 - span * 0.5;
    const pts = arcPts(r + thick * 0.44, a0, span, bow, 22);
    push(pts, profile(pts.length, thick, val.pRingBase * 0.5, 'bloom', rnd, J * 0.7));

    if (syl.coda !== '') {
      const cc = consonantFeatures(syl.coda);
      const e = pts[pts.length - 1];
      const ea = Math.atan2(e[1], e[0]) + (cc.place - 2) * 0.18;
      const L = val.cFringeLen * (0.5 + cc.place * 0.12);
      const bend0 = 0.15 + (MANNER_SHAPE[cc.manner] ?? 0.3) * 0.6;
      const tip = [e[0] + Math.cos(ea) * L, e[1] + Math.sin(ea) * L];
      const mid = [e[0] + Math.cos(ea + bend0) * L * 0.55, e[1] + Math.sin(ea + bend0) * L * 0.55];
      const cp = bezPts(e, mid, tip, 7);
      const w0 = val.cFringeFine * (1.0 + cc.place * 0.15) * (1 + cc.tense * 0.22);
      push(cp, profile(cp.length, w0, w0 * val.cFringeTip, 'hair', rnd, 0.4));

      // 겹종성이면 두 번째 자음의 표지를 하나 더. 갈과 갉이 구별되어야 한다.
      if (cc.secondManner !== null) {
        const sa = ea - 0.55;
        const L2 = L * 0.7;
        const bend2 = -(0.1 + (MANNER_SHAPE[cc.secondManner] ?? 0.3) * 0.5);
        const tip2 = [e[0] + Math.cos(sa) * L2, e[1] + Math.sin(sa) * L2];
        const mid2 = [e[0] + Math.cos(sa + bend2) * L2 * 0.55, e[1] + Math.sin(sa + bend2) * L2 * 0.55];
        const cp2 = bezPts(e, mid2, tip2, 6);
        const w2 = val.cFringeFine * (0.7 + (cc.secondPlace ?? 2) * 0.12) * (1 + (cc.secondTense ?? 0) * 0.22);
        push(cp2, profile(cp2.length, w2, w2 * val.cFringeTip, 'hair', rnd, 0.4));
      }
    }

    if (v.round === 1) {
      const m = pts[Math.floor(pts.length * 0.5)];
      const ma = Math.atan2(m[1], m[0]) + 0.5;
      const L = val.cFringeLen * 0.55;
      const tip = [m[0] + Math.cos(ma) * L, m[1] + Math.sin(ma) * L];
      const mid = [m[0] + Math.cos(ma + 0.3) * L * 0.55, m[1] + Math.sin(ma + 0.3) * L * 0.55];
      const cp = bezPts(m, mid, tip, 6);
      push(cp, profile(cp.length, val.cFringeFine * 0.8, val.cFringeFine * 0.8 * val.cFringeTip, 'hair', rnd, 0.4));
    }
  });
}
```

- [ ] **Step 3: 호출부를 음절 배열로 바꾼다**

같은 파일에서 세 곳을 고친다.

(a) `buildGeometry` 의 이름 분기 — 현재 `nameSpiral(a, m.count, \`name|${m.key}\`, out, { R, depth: mi, n: nIn });` 를 다음으로 바꾼다.

```js
          nameSpiral(a, m.syllables, `name|${m.key}`, out, { R, depth: mi });
```

(b) `specFromText` 의 이름 수집 — 현재 `names.push({ role, count: Math.max(1, Math.min(5, [...w].length)), key: w });` 를 다음으로 바꾼다.

```js
    else names.push({ role, syllables: syllabify(w), key: w });
```

(c) 프리셋 `'이름 포함'` 의 `names` — 현재 `names: [{ role: '대상', count: 3, key: '루이즈' }]` 를 다음으로 바꾼다.

```js
      names: [{ role: '대상', syllables: syllabify('루이즈'), key: '루이즈' }],
```

- [ ] **Step 4: 한글이 아닌 입력을 음소 폴백에서 제외**

`specFromText` 는 라틴 문자 입력(`Louise`)에 대해 `syllabify` 가 빈 배열을 내므로 아무것도 그리지 않게 된다. `names.push` 직전에 다음 가드를 넣는다.

```js
    else {
      const syl = syllabify(w);
      // 한글이 아니면 그릴 음운 정보가 없다. 랩은 설계 도구이므로 조용히 건너뛴다.
      if (syl.length > 0) names.push({ role, syllables: syl, key: w });
    }
```

(이 가드를 넣으면 Step 3(b) 의 한 줄 교체는 필요 없다. 둘 중 이 형태를 최종으로 남긴다.)

- [ ] **Step 5: 랩을 열어 눈으로 확인**

브라우저에서 `spikes/look-lab.html` 을 연다. 확인 항목:

1. 자유 입력에 `루이즈` → 음절 3개가 서로 다른 굵기·길이의 호로 바깥으로 감긴다.
2. 자유 입력에 `갈 갉` → 두 덩어리의 끝 표지가 서로 다르다 (겹받침이 표지 두 개).
3. 자유 입력에 `박 밤 밥` → 세 덩어리가 서로 다르다.
4. 프리셋 `이름 포함` 이 에러 없이 그려진다 (브라우저 콘솔에 에러 없음).
5. 삼각형 수(HUD)가 0이 아니다.

- [ ] **Step 6: 커밋**

```bash
git add spikes/look-lab.html
git commit -m "fix(look-lab): 이름을 음절 개수가 아니라 소리로 그린다

랩의 nameSpiral 은 음절 개수와 시드만 썼다. 그래서 어떤 이름을 넣어도
같은 호가 개수만큼 쌓였고 이름끼리 구별되지 않았다 — 원칙 2 위반이다.
엔진 name.ts 는 이미 음운 자질로 그리고 받침 27개 구별을 테스트로
고정해 두었는데 랩만 옛 규칙에 남아 있었다.

phonology 표와 나선 규칙을 엔진과 같게 옮긴다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 엔진 — 문장 종류 표지 획

스펙 6.2: `mood`는 IR 의 문장 수준 속성이고 `양상`(6시 슬롯)은 그것이 그려지는 자리다. **렌더러는 `mood !== 'declarative'` 일 때 6시에 표지 획을 그린다** — 의문이면 갈고리, 부정·의지는 각각의 표지 획. 계획 II 는 이것을 구현하지 않았고 어디에도 유예를 적지 않았다. 지금은 `mood`가 시드에만 들어가서 "사랑해"와 "사랑해?"가 **의미와 무관하게 통째로 다른 그림**이 된다 — 원칙 2 위반이다.

**Files:**
- Modify: `design/look-v3.json` (키 2개 추가), `src/render/look.ts` (`LOOK_KEYS` 에 등록), `src/render/vocab.ts` (`moodStrokes` 추가), `src/render/compose.ts` (호출)
- Test: `tests/render/vocab-mood.test.ts` (신규), `tests/render/compose.test.ts` (추가), `tests/render/look.test.ts` (키 개수)

**Interfaces:**
- Consumes: `LookParams`, `Stroke`, `arcPts`, `bezPts`, `ringFloor`, `bloomSurface`, `pushOutside`, `widthProfile`, `slotAngle`/`ROLE_SLOT` (`src/render/layout.ts`), `Mood` (`src/core/ir.ts`)
- Produces:
  - `moodStrokes(look: LookParams, mood: Mood, rnd: () => number): Stroke[]` — `mood === 'declarative'` 이면 빈 배열
  - 새 룩 키 `cMoodLen`(표지 길이 배수), `cMoodThick`(표지 굵기 배수)

- [ ] **Step 1: 룩 키 두 개를 추가**

`design/look-v3.json` 의 `"cJitter": 1.8,` 줄 **바로 아래**에 추가한다.

```json
  "cMoodLen": 0.16,
  "cMoodThick": 0.026,
```

`src/render/look.ts` 의 `LOOK_KEYS` 배열에서 `'cJitter',` 뒤에 `'cMoodLen', 'cMoodThick',` 를 넣는다. `tests/render/look.test.ts` 에 키 개수를 고정한 단언이 있으면 59 → 61 로 고친다 (`grep -n "59" tests/render/look.test.ts` 로 확인).

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/render/vocab-mood.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { moodStrokes } from '../../src/render/vocab';
import { loadLook } from '../../src/render/look';
import { ringFloor } from '../../src/render/stroke';
import { slotAngle, ROLE_SLOT } from '../../src/render/layout';
import { mulberry32 } from '../../src/core/hash';
import type { Mood } from '../../src/core/ir';

const look = loadLook();
const r = () => mulberry32(11);
const MOODS: Mood[] = ['interrogative', 'negative', 'volitional'];

describe('moodStrokes', () => {
  it('평서문은 표지를 그리지 않는다', () => {
    expect(moodStrokes(look, 'declarative', r())).toHaveLength(0);
  });

  it('의문·부정·의지는 각각 획을 낸다', () => {
    for (const m of MOODS) {
      expect(moodStrokes(look, m, r()).length, m).toBeGreaterThan(0);
    }
  });

  it('셋은 서로 다른 그림이다 — 문장 종류가 형태로 드러난다', () => {
    const seen = new Map<string, Mood>();
    for (const m of MOODS) {
      const key = JSON.stringify(moodStrokes(look, m, r()));
      expect(seen.get(key), `${m} 와 ${seen.get(key)} 가 같다`).toBeUndefined();
      seen.set(key, m);
    }
  });

  it('표지는 6시 양상 슬롯 근처에 놓인다', () => {
    const want = slotAngle(ROLE_SLOT['양상'], 0);
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) {
        for (const p of s.pts) {
          const a = Math.atan2(p[1], p[0]);
          const d = Math.abs(((a - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          expect(d, `${m}`).toBeLessThan(Math.PI / 6);
        }
      }
    }
  });

  it('링 안쪽으로 넘어오지 않는다', () => {
    const floor = ringFloor(look);
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) {
        s.pts.forEach((p, i) => {
          expect(Math.hypot(p[0], p[1]) - (s.widths[i] ?? 0) / 2, m)
            .toBeGreaterThanOrEqual(floor - 1e-9);
        });
      }
    }
  });

  it('캔버스 반경 0.9 를 넘지 않는다', () => {
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) {
        s.pts.forEach((p, i) => {
          expect(Math.hypot(p[0], p[1]) + (s.widths[i] ?? 0) / 2, m).toBeLessThanOrEqual(0.9);
        });
      }
    }
  });

  it('모든 획이 양상 라벨과 역할을 갖는다 — 주인 없는 획이 없다', () => {
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) {
        expect(s.role).toBe('양상');
        expect(s.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('중심선과 굵기 배열의 길이가 같다', () => {
    for (const m of MOODS) {
      for (const s of moodStrokes(look, m, r())) expect(s.widths.length).toBe(s.pts.length);
    }
  });

  it('결정적이다', () => {
    expect(JSON.stringify(moodStrokes(look, 'interrogative', r())))
      .toBe(JSON.stringify(moodStrokes(look, 'interrogative', r())));
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/vocab-mood.test.ts`
Expected: FAIL — `moodStrokes` 가 `src/render/vocab.ts` 에 없다

- [ ] **Step 4: 구현**

`src/render/vocab.ts` 끝에 추가한다. 임포트가 부족하면 파일 상단의 기존 임포트에 합친다 (`bezPts`, `ringFloor`, `bloomSurface`, `pushOutside`, `widthProfile`, `arcPts`). `Mood` 는 `import type { Mood } from '../core/ir';`, 슬롯 각도는 `import { ROLE_SLOT, slotAngle } from './layout';` 로 가져온다.

```ts
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
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/vocab-mood.test.ts`
Expected: PASS — 9 tests passed

"6시 근처" 가 실패하면 `slotAngle(ROLE_SLOT['양상'], 0)` 대신 랩·엔진이 쓰는 반 슬롯 오프셋(`0.5`)을 쓰는지 확인한다. 표지는 슬롯 중앙에 놓는 것이 맞으므로 **테스트가 아니라 구현의 오프셋을 맞춘다.**

- [ ] **Step 6: `compose.ts` 에 연결**

`buildStrokes` 안에서 링 획을 넣는 줄 바로 다음에 추가한다 (성분 루프보다 먼저).

```ts
  // 문장 종류 표지 — 6시 양상 슬롯. 평서문이면 빈 배열이다 (설계 문서 6.2).
  all.push(...moodStrokes(look, ir.mood, mulberry32(subSeed(seed, 'mood'))));
```

`import { ringStrokes, bloomStrokes, moodStrokes } from './vocab';` 로 임포트를 합친다.

- [ ] **Step 7: 조립 테스트 추가**

`tests/render/compose.test.ts` 에 넣는다.

```ts
  it('문장 종류가 달라지면 그림이 달라진다 (설계 문서 6.2)', () => {
    const a = render(three, lex, look).svg;
    const q = render(ir([C('사랑','행위'), C('나','주체'), C('너','대상')], 'interrogative'), lex, look).svg;
    expect(q).not.toBe(a);
  });

  it('평서문에는 양상 표지가 없고 의문문에는 있다', () => {
    const decl = render(three, lex, look).strokes;
    const ques = render(ir([C('사랑','행위'), C('나','주체'), C('너','대상')], 'interrogative'), lex, look).strokes;
    expect(decl.some((s) => s.role === '양상')).toBe(false);
    expect(ques.some((s) => s.role === '양상')).toBe(true);
  });
```

- [ ] **Step 8: 전체 테스트와 골든 갱신**

Run: `npm test`
Expected: 골든 스냅샷은 **바뀌지 않는다** — 골든 입력이 전부 평서문이기 때문이다. 만약 골든이 깨지면 `mood` 표지가 평서문에도 그려지고 있다는 뜻이므로 구현을 고친다.

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 9: 커밋**

```bash
git add design/look-v3.json src/render/look.ts src/render/vocab.ts src/render/compose.ts tests/render/vocab-mood.test.ts tests/render/compose.test.ts tests/render/look.test.ts
git commit -m "feat: 문장 종류 표지 획 — 6시 양상 슬롯

스펙 6.2 는 mood != declarative 일 때 6시에 표지 획을 그리라고 한다.
계획 II 가 이것을 빠뜨려, 문장 종류가 시드에만 들어가고 형태에는 닿지
않았다. '사랑해' 와 '사랑해?' 가 의미와 무관하게 통째로 다른 그림이
되었다 — 원칙 2 위반이다.

의문은 갈고리(원작 규칙), 부정은 흐름을 끊는 막대, 의지는 벌어지는
두 갈래. 평서문은 표지가 없다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 룩 랩 — 문장 종류 토글

사용자가 표지 조형을 눈으로 판단할 수 있어야 한다. 랩에 버튼 네 개를 놓고 Task 2 와 같은 규칙으로 그린다.

**Files:**
- Modify: `spikes/look-lab.html`

**Interfaces:**
- Consumes: Task 2 의 `cMoodLen`, `cMoodThick` 와 표지 규칙
- Produces (랩 내부): 전역 `moodMode`, 함수 `moodMark(out)`

- [ ] **Step 1: 룩 슬라이더 두 개 추가**

`spikes/look-lab.html` 의 파라미터 정의 배열(각 항목이 `['cJitter', '흔들림', …]` 꼴)에서 `cJitter` 항목 **바로 아래**에 추가한다. 형식은 `[키, 라벨, 최소, 최대, 기본, 스텝?]` 이 아니라 **그 파일의 기존 항목과 같은 열 순서**를 따른다 — `grep -n "cJitter" spikes/look-lab.html` 로 현재 형식을 확인하고 맞춘다.

```js
    ['cMoodLen',   '표지 길이',      0.04, 0.32, 0.16, 0.16, 0.005],
    ['cMoodThick', '표지 굵기',      0.008, 0.06, 0.026, 0.026, 0.001],
```

- [ ] **Step 2: 표지 그리기 함수 추가**

`nameSpiral` 정의 아래에 넣는다.

```js
/** 문장 종류 표지 — src/render/vocab.ts 의 moodStrokes 와 같은 규칙이다. */
let moodMode = 'declarative';

function moodMark(out) {
  if (moodMode === 'declarative') return;
  const rnd = rng(fnv1a(`mood|${moodMode}`));
  const R = val.pR;
  const floor = R - val.pRingBase;
  const surf = R + val.pRingBase * 0.5;
  const base = slotAngle(ROLE_SLOT['양상'], 0);
  const L = val.cMoodLen, W = val.cMoodThick, J = val.cJitter;

  const push = (pts, ws) => {
    const safe = pts.map((p, i) => {
      const need = floor + (ws[i] ?? 0) / 2;
      const r = Math.hypot(p[0], p[1]);
      if (r >= need) return p;
      if (r < 1e-12) return [need, 0];
      const k = need / r;
      return [p[0] * k, p[1] * k];
    });
    strip(safe, ws, out);
  };

  if (moodMode === 'interrogative') {
    const span = L * 1.6;
    const arc = arcPts(surf + W * 0.5, base - span * 0.5, span, W * 0.4, 20);
    push(arc, profile(arc.length, W, W * 0.45, 'bloom', rnd, J * 0.5));
    const e = arc[arc.length - 1];
    const ea = Math.atan2(e[1], e[0]);
    const tip = [e[0] + Math.cos(ea + 0.9) * L, e[1] + Math.sin(ea + 0.9) * L];
    const mid = [e[0] + Math.cos(ea + 0.2) * L * 0.7, e[1] + Math.sin(ea + 0.2) * L * 0.7];
    const hook = bezPts(e, mid, tip, 10);
    push(hook, profile(hook.length, W * 0.8, W * 0.8 * val.cFringeTip, 'hair', rnd, 0.4));
    return;
  }

  if (moodMode === 'negative') {
    const bar = [];
    for (let i = 0; i <= 12; i++) {
      const rr = surf + L * (i / 12);
      bar.push([Math.cos(base) * rr, Math.sin(base) * rr]);
    }
    push(bar, profile(bar.length, W * 1.5, W * 1.5, 'flat', rnd, J * 0.4));
    return;
  }

  for (const side of [-1, 1]) {
    const a0 = base + side * 0.10;
    const root = [Math.cos(a0) * surf, Math.sin(a0) * surf];
    const dir = a0 + side * 0.45;
    const tip = [root[0] + Math.cos(dir) * L * 1.3, root[1] + Math.sin(dir) * L * 1.3];
    const mid = [root[0] + Math.cos(dir - side * 0.25) * L * 0.7,
                 root[1] + Math.sin(dir - side * 0.25) * L * 0.7];
    const pts = bezPts(root, mid, tip, 10);
    push(pts, profile(pts.length, W * 1.1, W * 1.1 * val.cFringeTip, 'hair', rnd, 0.4));
  }
}
```

- [ ] **Step 3: 조립부에서 호출**

`buildGeometry` 에서 링을 그린 직후(`ringGeometry(...)` 다음 줄)에 넣는다.

```js
  moodMark(out);
```

- [ ] **Step 4: 버튼 네 개 추가**

먼저 HTML 에서 프리셋 버튼 줄 바로 아래에 빈 줄을 하나 만든다. `<div class="btns" id="presets"></div>` 다음 줄에 넣는다.

```html
    <div class="btns" id="moods"></div>
```

그리고 프리셋 버튼을 채우는 코드를 찾아(`grep -n "presets" spikes/look-lab.html`), 그 함수 정의 **바로 아래**에 다음을 넣는다. `rebuild` 는 프리셋 버튼이 클릭 시 호출하는 갱신 함수의 실제 이름으로 바꾼다 — 프리셋 클릭 핸들러가 무엇을 부르는지 보고 같은 것을 부른다.

```js
const MOODS = [['declarative','평서'], ['interrogative','의문'],
               ['negative','부정'], ['volitional','의지']];

function buildMoodButtons() {
  const box = document.getElementById('moods');
  box.innerHTML = '';
  for (const [value, label] of MOODS) {
    const b = document.createElement('button');
    b.textContent = label;
    if (value === moodMode) b.className = 'on';
    b.onclick = () => { moodMode = value; buildMoodButtons(); rebuild(); };
    box.appendChild(b);
  }
}
buildMoodButtons();
```

- [ ] **Step 5: 눈으로 확인**

브라우저에서 랩을 연다. 확인 항목:

1. 평서 → 6시에 아무것도 없다.
2. 의문 → 6시에 갈고리가 있다.
3. 부정 → 6시에 굵은 막대가 있다.
4. 의지 → 6시에 두 갈래가 있다.
5. 표지가 링 안쪽으로 들어가지 않는다.
6. `표지 길이`·`표지 굵기` 슬라이더가 실제로 표지를 바꾼다.

- [ ] **Step 6: 커밋**

```bash
git add spikes/look-lab.html
git commit -m "feat(look-lab): 문장 종류 표지와 슬라이더

엔진 moodStrokes 와 같은 규칙으로 6시 표지를 그린다. 사용자가 의문·
부정·의지 표지의 조형을 눈으로 판단하고 길이·굵기를 맞출 수 있다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 엔진 — 제작 가능성 검증 (래스터)

현재 `validateNecklace` 는 획마다의 최소 폭만 본다. 스펙 12.3 의 실패 유형 — 좁은 틈, 떨어진 조각, 너무 작은 구멍 — 은 획 하나만 봐서는 알 수 없다. **그림 전체를 실척 격자에 채워서** 판정한다.

**Files:**
- Create: `src/render/manufacture.ts`
- Test: `tests/render/manufacture.test.ts`

**Interfaces:**
- Consumes: `Stroke` (`src/render/stroke.ts`), `P_SPAN` (`src/render/compose.ts`)
- Produces:
  - `interface MillOptions { diameterMm: number; minStrokeMm: number; minGapMm: number; pxPerMm: number }`
  - `interface MillReport { violations: string[]; components: number; thinPx: number; narrowGapPx: number; smallHoles: number[] }`
  - `rasterize(strokes: readonly Stroke[], opts: MillOptions): { grid: Uint8Array; n: number }`
  - `checkManufacturable(strokes: readonly Stroke[], opts: MillOptions): MillReport`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/render/manufacture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rasterize, checkManufacturable, type MillOptions } from '../../src/render/manufacture';
import type { Stroke } from '../../src/render/stroke';
import { arcPts } from '../../src/render/stroke';

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
    // 0.5mm 는 p 로 0.045. 두 링 사이 간격이 그보다 좁도록 놓는다.
    const rep = checkManufacturable([ring(0.50, 1.2), ring(0.56, 1.2)], OPTS);
    expect(rep.narrowGapPx).toBeGreaterThan(0);
    expect(rep.violations.join(' ')).toMatch(/틈/);
  });

  it('너무 작은 구멍은 구멍 위반으로 잡는다', () => {
    const rep = checkManufacturable([ring(0.02, 1.2)], OPTS);
    expect(rep.smallHoles.length).toBeGreaterThan(0);
    expect(rep.violations.join(' ')).toMatch(/구멍/);
  });

  it('결정적이다', () => {
    const a = checkManufacturable([ring(0.5, 1.2)], OPTS);
    const b = checkManufacturable([ring(0.5, 1.2)], OPTS);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/manufacture.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/render/manufacture"`

- [ ] **Step 3: 구현**

`src/render/manufacture.ts`:

```ts
import { P_SPAN } from './compose';
import type { Stroke } from './stroke';

/**
 * 제작 가능성 검증 (설계 문서 12.3).
 *
 * 획 하나하나의 폭만 봐서는 투각 펜던트의 실패를 알 수 없다. 좁은 틈은
 * 메워지고, 떨어진 조각은 떨어져 나가고, 작은 구멍은 뚫리지 않는다. 이들은
 * **그림 전체의 성질**이므로 실척 격자에 채워 놓고 판정한다.
 *
 * 화소 단위는 mm 다 — `pxPerMm` 로 해상도를 정한다. 20mm 펜던트를 20px/mm 로
 * 보면 400×400 격자이고, 0.5mm 하한은 10화소다.
 */
export interface MillOptions {
  /** 펜던트 바깥 지름 (mm). p 공간 반경 P_SPAN 이 이 지름의 절반에 대응한다 */
  diameterMm: number;
  /** 최소 선폭 (mm) */
  minStrokeMm: number;
  /** 최소 틈 (mm) */
  minGapMm: number;
  /** 격자 해상도 (화소/mm) */
  pxPerMm: number;
}

export interface MillReport {
  /** 사람이 읽는 위반 목록. 비어 있으면 제작 가능 */
  violations: string[];
  /** 잉크 덩어리 수. 1이어야 한다 */
  components: number;
  /** 최소 선폭보다 가는 부분의 화소 수 */
  thinPx: number;
  /** 최소 틈보다 좁은 틈의 화소 수 */
  narrowGapPx: number;
  /** 최소 틈보다 작은 구멍들의 지름 (mm) */
  smallHoles: number[];
}

const idx = (n: number, x: number, y: number) => y * n + x;

/** p 공간 → 화소. 반경 P_SPAN 이 지름의 절반에 닿는다. */
function toPx(n: number, diameterMm: number, pxPerMm: number, p: readonly [number, number]) {
  const scale = (diameterMm * pxPerMm * 0.5) / P_SPAN;
  return { x: n / 2 + p[0] * scale, y: n / 2 - p[1] * scale };
}

/** 획들을 격자에 채운다. 1 = 잉크. */
export function rasterize(
  strokes: readonly Stroke[], opts: MillOptions,
): { grid: Uint8Array; n: number } {
  const n = Math.round(opts.diameterMm * opts.pxPerMm);
  const grid = new Uint8Array(n * n);
  const scale = (opts.diameterMm * opts.pxPerMm * 0.5) / P_SPAN;

  const disc = (cx: number, cy: number, r: number) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(n - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(n - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) grid[idx(n, x, y)] = 1;
      }
    }
  };

  for (const s of strokes) {
    for (let i = 0; i < s.pts.length; i++) {
      const a = toPx(n, opts.diameterMm, opts.pxPerMm, s.pts[i]!);
      const ra = Math.max(0.5, ((s.widths[i] ?? 0) / 2) * scale);
      disc(a.x, a.y, ra);
      // 점 사이를 이어 채운다 — 원만 찍으면 성긴 중심선에서 끊긴다
      if (i + 1 < s.pts.length) {
        const b = toPx(n, opts.diameterMm, opts.pxPerMm, s.pts[i + 1]!);
        const rb = Math.max(0.5, ((s.widths[i + 1] ?? 0) / 2) * scale);
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          disc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, ra + (rb - ra) * t);
        }
      }
    }
  }
  return { grid, n };
}

/** 반경 r(화소) 원판으로 침식 */
function erode(grid: Uint8Array, n: number, r: number): Uint8Array {
  const out = new Uint8Array(n * n);
  const rr = r * r;
  const off: number[] = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dy * dy <= rr) off.push(dx, dy);
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!grid[idx(n, x, y)]) continue;
      let ok = 1;
      for (let k = 0; k < off.length && ok; k += 2) {
        const nx = x + off[k]!, ny = y + off[k + 1]!;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n || !grid[idx(n, nx, ny)]) ok = 0;
      }
      out[idx(n, x, y)] = ok;
    }
  }
  return out;
}

/** 반경 r(화소) 원판으로 팽창 */
function dilate(grid: Uint8Array, n: number, r: number): Uint8Array {
  const out = new Uint8Array(n * n);
  const rr = r * r;
  const off: number[] = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dy * dy <= rr) off.push(dx, dy);
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!grid[idx(n, x, y)]) continue;
      for (let k = 0; k < off.length; k += 2) {
        const nx = x + off[k]!, ny = y + off[k + 1]!;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n) out[idx(n, nx, ny)] = 1;
      }
    }
  }
  return out;
}

/** 4-이웃 연결 성분. `want` 값을 가진 화소들을 묶는다. */
function components(grid: Uint8Array, n: number, want: number): { sizes: number[]; label: Int32Array } {
  const label = new Int32Array(n * n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== want || label[i] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % n, y = (p / n) | 0;
      if (x > 0 && grid[p - 1] === want && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1); }
      if (x < n - 1 && grid[p + 1] === want && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && grid[p - n] === want && label[p - n] === -1) { label[p - n] = id; stack.push(p - n); }
      if (y < n - 1 && grid[p + n] === want && label[p + n] === -1) { label[p + n] = id; stack.push(p + n); }
    }
    sizes.push(size);
  }
  return { sizes, label };
}

/**
 * 제작 가능성 판정. 위반이 없으면 `violations` 가 빈 배열이다.
 *
 * - 선폭: 최소 선폭의 반지름으로 침식했다가 되돌렸을 때(열기) 사라지는 부분이
 *   하한보다 가는 곳이다.
 * - 틈: 잉크를 최소 틈의 반만큼 부풀렸다 되돌리면(닫기) 좁은 틈이 메워진다.
 *   메워진 화소가 좁은 틈이다.
 * - 연결: 잉크 덩어리가 둘 이상이면 떨어져 나간다.
 * - 구멍: 바깥과 이어지지 않은 배경 덩어리가 구멍이다. 지름이 최소 틈보다
 *   작으면 뚫리지 않는다.
 */
export function checkManufacturable(
  strokes: readonly Stroke[], opts: MillOptions,
): MillReport {
  const { grid, n } = rasterize(strokes, opts);
  const violations: string[] = [];

  const rThin = (opts.minStrokeMm * opts.pxPerMm) / 2;
  const opened = dilate(erode(grid, n, rThin), n, rThin);
  let thinPx = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] && !opened[i]) thinPx++;
  if (thinPx > 0) {
    violations.push(`최소 선폭 ${opts.minStrokeMm}mm 보다 가는 부분이 ${thinPx}화소 있다`);
  }

  const rGap = (opts.minGapMm * opts.pxPerMm) / 2;
  const closed = erode(dilate(grid, n, rGap), n, rGap);
  let narrowGapPx = 0;
  for (let i = 0; i < grid.length; i++) if (!grid[i] && closed[i]) narrowGapPx++;
  if (narrowGapPx > 0) {
    violations.push(`최소 틈 ${opts.minGapMm}mm 보다 좁은 틈이 ${narrowGapPx}화소 있다`);
  }

  const ink = components(grid, n, 1);
  if (ink.sizes.length !== 1) {
    violations.push(`잉크가 ${ink.sizes.length}조각이다 — 투각 펜던트는 한 덩어리여야 한다`);
  }

  // 구멍 — 바깥 테두리에 닿지 않는 배경 덩어리
  const bg = components(grid, n, 0);
  const outer = new Set<number>();
  for (let x = 0; x < n; x++) {
    outer.add(bg.label[idx(n, x, 0)]!);
    outer.add(bg.label[idx(n, x, n - 1)]!);
    outer.add(bg.label[idx(n, 0, x)]!);
    outer.add(bg.label[idx(n, n - 1, x)]!);
  }
  const smallHoles: number[] = [];
  bg.sizes.forEach((size, id) => {
    if (outer.has(id)) return;
    // 같은 넓이의 원으로 환산한 지름 (mm)
    const dMm = (2 * Math.sqrt(size / Math.PI)) / opts.pxPerMm;
    if (dMm < opts.minGapMm) smallHoles.push(Number(dMm.toFixed(3)));
  });
  if (smallHoles.length > 0) {
    violations.push(`최소 틈 ${opts.minGapMm}mm 보다 작은 구멍이 ${smallHoles.length}개 있다`);
  }

  return { violations, components: ink.sizes.length, thinPx, narrowGapPx, smallHoles };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run tests/render/manufacture.test.ts`
Expected: PASS — 8 tests passed

테스트가 느리면(> 5초) `OPTS.pxPerMm` 을 10 으로 낮춘다. 그래도 0.5mm 하한이 5화소라 판정은 성립한다.

- [ ] **Step 5: 전체 테스트와 타입 검사**

Run: `npm test && npm run typecheck`
Expected: 전부 통과 (골든 불변)

- [ ] **Step 6: 커밋**

```bash
git add src/render/manufacture.ts tests/render/manufacture.test.ts
git commit -m "feat: 투각 제작 가능성 검증 — 선폭·틈·연결·구멍

획마다의 폭만 보는 검사로는 투각 펜던트의 실패를 알 수 없다. 좁은 틈은
메워지고, 떨어진 조각은 떨어져 나가고, 작은 구멍은 뚫리지 않는다. 이들은
그림 전체의 성질이므로 실척 격자에 채워 놓고 판정한다.

의존성을 더하지 않고 열기·닫기·연결 성분만으로 판정한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 현재 조형이 왜 제작 불가인지 기록

Task 4 의 검증을 확정 룩 v3 에 걸어, 스펙 12.3 이 말로 적은 실패를 **수치로 고정**한다. 목걸이 룩을 맞출 때 이 숫자가 기준선이 된다.

**Files:**
- Test: `tests/render/necklace.test.ts` (추가)

**Interfaces:**
- Consumes: `buildStrokes` (`src/render/compose.ts`), `checkManufacturable`, `MillOptions`

- [ ] **Step 1: 테스트 추가**

`tests/render/necklace.test.ts` 끝에 넣는다. 이 파일의 예시 IR 은 `sample` 이라는 이름이고 `three` 같은 헬퍼는 없다 — 아래 코드는 `sample` 을 쓴다. 파일 상단 임포트에 다음을 합친다: `import { buildStrokes } from '../../src/render/compose';`, `import { checkManufacturable, type MillOptions } from '../../src/render/manufacture';`.

```ts
describe('투각 20mm 제작 가능성 — 화면 룩 기준선', () => {
  const mill: MillOptions = { diameterMm: 20, minStrokeMm: 0.5, minGapMm: 0.5, pxPerMm: 10 };

  it('확정 화면 룩은 투각으로 만들 수 없다 — 위반을 수치로 고정한다', () => {
    const { strokes } = buildStrokes(sample, lex, look);
    const rep = checkManufacturable(strokes, mill);
    // 이 테스트는 "지금은 안 된다"를 고정한다. 목걸이 룩(Task 8)이 확정되면
    // 그 룩으로 위반 0 을 요구하는 테스트가 따로 생긴다.
    expect(rep.violations.length).toBeGreaterThan(0);
    expect(rep.thinPx).toBeGreaterThan(0);
  });

  it('무엇이 위반인지 사람이 읽을 수 있게 적힌다', () => {
    const { strokes } = buildStrokes(sample, lex, look);
    for (const v of checkManufacturable(strokes, mill).violations) {
      expect(v).toMatch(/mm|조각/);
    }
  });
});
```

- [ ] **Step 2: 실행하고 실제 수치를 본문에 남긴다**

Run: `npx vitest run tests/render/necklace.test.ts`
Expected: PASS

그다음 수치를 뽑는다. 이 스크립트는 저장소 **밖** scratch 디렉터리에 두고 커밋하지 않는다.

```ts
// <scratch>/mill-baseline.ts — npx tsx <scratch>/mill-baseline.ts 로 실행
import { buildStrokes } from './src/render/compose';
import { loadLook } from './src/render/look';
import { loadSeedLexicon } from './src/core/lexicon';
import { checkManufacturable } from './src/render/manufacture';
import { ENGINE_VERSION } from './src/version';
import type { IR } from './src/core/ir';

const ir: IR = {
  constituents: [
    { kind: 'concept', lemma: '사랑', role: '행위' },
    { kind: 'concept', lemma: '나', role: '주체' },
    { kind: 'concept', lemma: '너', role: '대상' },
  ],
  mood: 'declarative',
  engineVersion: ENGINE_VERSION,
};

const { strokes } = buildStrokes(ir, loadSeedLexicon(), loadLook());
const rep = checkManufacturable(strokes, {
  diameterMm: 20, minStrokeMm: 0.5, minGapMm: 0.5, pxPerMm: 10,
});
console.log(JSON.stringify({
  violations: rep.violations, components: rep.components,
  thinPx: rep.thinPx, narrowGapPx: rep.narrowGapPx, smallHoles: rep.smallHoles.length,
}, null, 2));
```

임포트 경로는 스크립트 위치에 맞게 절대 경로로 바꾼다. 출력한 수치를 `docs/superpowers/specs/2026-09-11-heptapod-b-design.md` 의 12.3 절 끝에 한 문단으로 적는다: 가는 부분 N화소, 좁은 틈 M화소, 잉크 조각 K개, 작은 구멍 J개 (지름 20mm, 하한 0.5mm, 10화소/mm 기준).

- [ ] **Step 3: 커밋**

```bash
git add tests/render/necklace.test.ts docs/superpowers/specs/2026-09-11-heptapod-b-design.md
git commit -m "test: 화면 룩이 투각 20mm 로 제작 불가임을 수치로 고정

스펙 12.3 이 말로 적은 실패를 검증기로 재현해 기준선으로 남긴다.
목걸이 룩을 맞출 때 이 숫자가 출발점이 된다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 목걸이 전용 룩과 내보내기 연결

**Files:**
- Create: `design/look-necklace.json`
- Modify: `src/render/look.ts` (목걸이 룩 로더), `src/render/necklace.ts`
- Test: `tests/render/necklace.test.ts` (추가), `tests/render/look.test.ts` (추가)

**Interfaces:**
- Consumes: `loadLook(source?)`, `buildStrokes`, `checkManufacturable`
- Produces:
  - `loadNecklaceLook(): LookParams`
  - `NecklaceOptions` 에 `minGapMm: number` 추가, 기본값 `{ diameterMm: 20, minStrokeMm: 0.5, minGapMm: 0.5, size: 600 }`
  - `renderForNecklace(ir, lex, opts?)` — **룩 인자를 받지 않는다.** 목걸이 룩을 스스로 쓴다
  - `validateNecklace(result, opts)` 는 그대로 두되 `checkManufacturable` 결과를 합쳐 반환

- [ ] **Step 1: 목걸이 룩 파일 만들기**

`design/look-necklace.json` 을 만든다. **`design/look-v3.json` 을 그대로 복사한 뒤** 다음 세 가지만 바꾼다. (이 값들은 출발점이고, 최종 조형은 Task 7 에서 사용자가 랩으로 확정한다.)

```json
  "_": "목걸이 룩 — 투각 펜던트 20mm 출발점 (2026-09-16). 화면 룩과 같은 키를 갖되 수치가 다르다. 최종값은 룩 랩 목걸이 모드에서 확정한다.",
  "_모델": "가시는 적고 굵고 짧다. 링 틈과 링 바깥 겹선은 쓰지 않는다 — 투각에서 틈은 메워지고 겹선은 떨어져 나간다.",
```

바꿀 값: `"cGaps": 0`, `"cDouble": 0`, `"cFringe": 8`, `"cFringeFine": 0.05`, `"cWhisker": 2`, `"pRingBase": 0.05`.

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/render/look.test.ts` 에 추가:

```ts
  it('목걸이 룩도 같은 키 계약을 만족한다', () => {
    const n = loadNecklaceLook();
    const s = loadLook();
    expect(Object.keys(n).sort()).toEqual(Object.keys(s).sort());
  });

  it('목걸이 룩은 링 틈과 겹선을 쓰지 않는다', () => {
    const n = loadNecklaceLook();
    expect(n.cGaps).toBe(0);
    expect(n.cDouble).toBe(0);
  });
```

`tests/render/necklace.test.ts` 에 추가:

```ts
  it('목걸이 내보내기는 목걸이 룩을 쓴다 — 화면 룩과 다른 그림이다', () => {
    const a = renderForNecklace(sample, lex).svg;
    const b = render(sample, lex, loadLook(), { size: DEFAULT_NECKLACE.size }).svg;
    expect(a).not.toBe(b);
  });

  it('검증이 제작 위반을 함께 보고한다', () => {
    const r = renderForNecklace(sample, lex);
    const { strokes } = buildStrokes(sample, lex, loadNecklaceLook());
    const problems = validateNecklace(r, DEFAULT_NECKLACE, strokes);
    // 목걸이 룩이 아직 출발점이므로 위반이 있을 수 있다. 형식만 고정한다.
    for (const p of problems) expect(typeof p).toBe('string');
  });
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/render/look.test.ts tests/render/necklace.test.ts`
Expected: FAIL — `loadNecklaceLook` 가 없고, `renderForNecklace` 가 룩 인자를 요구한다

- [ ] **Step 4: 구현**

`src/render/look.ts` 끝에 추가한다 (`raw` 를 읽는 기존 방식과 같은 방식으로 JSON 을 임포트한다):

```ts
// 파일 첫 줄의 기존 임포트와 같은 형식이다 (`with { type: 'json' }`)
import necklaceRaw from '../../design/look-necklace.json' with { type: 'json' };

/**
 * 목걸이 전용 조형 (설계 문서 12.3).
 *
 * 화면 룩을 하한까지 굵혀 내보내면 가시가 사각 막대가 되고 링 틈은 메워진다.
 * 투각은 제약이 다르므로 수치를 따로 갖는다. 키 계약은 화면 룩과 같다.
 */
export function loadNecklaceLook(): LookParams {
  return loadLook(necklaceRaw as Record<string, unknown>);
}
```

`src/render/necklace.ts` 를 고친다:

```ts
export interface NecklaceOptions {
  diameterMm: number;
  minStrokeMm: number;
  /** 최소 틈 (mm). 투각은 틈이 좁으면 메워진다 */
  minGapMm: number;
  size: number;
}

export const DEFAULT_NECKLACE: NecklaceOptions = {
  diameterMm: 20,
  minStrokeMm: 0.5,
  minGapMm: 0.5,
  size: 600,
};

export function renderForNecklace(
  ir: IR, lex: Lexicon, opts: Partial<NecklaceOptions> = {},
): RenderResult {
  const merged: NecklaceOptions = { ...DEFAULT_NECKLACE, ...opts };
  const look = loadNecklaceLook();
  return render(ir, lex, look, {
    size: merged.size,
    minStrokeWidth: floorPxOf(merged) / scaleFor(merged.size),
  });
}
```

`validateNecklace` 는 **기존 폭·닫힘 루프를 그대로 두고**, 함수 끝의 `return problems;` 앞에 아래를 끼워 넣는다. 시그니처에 선택 인자 `strokes` 를 더하고, 파일 상단에 `import { checkManufacturable } from './manufacture';` 와 `import type { Stroke } from './stroke';` 를 더한다.

```ts
export function validateNecklace(
  result: RenderResult,
  opts: NecklaceOptions,
  /** p 공간 골격. 주면 틈·연결·구멍까지 본다 (설계 문서 12.3) */
  strokes?: readonly Stroke[],
): string[] {
  // … 기존 폭·닫힘 검사 루프는 그대로 …

  if (strokes) {
    const rep = checkManufacturable(strokes, {
      diameterMm: opts.diameterMm,
      minStrokeMm: opts.minStrokeMm,
      minGapMm: opts.minGapMm,
      pxPerMm: 10,
    });
    problems.push(...rep.violations);
  }
  return problems;
}
```

`src/cli.ts` 의 `--necklace` 경로에서 `renderForNecklace(ir, lex, look, …)` 의 `look` 인자를 뺀다. 또 `--min-stroke-mm` 를 검증하는 기존 코드 옆에 `--min-gap-mm` 를 같은 방식으로 더하고(`CliArgs` 에 `minGapMm?: number`), `DEFAULT_NECKLACE` 와 합쳐 `renderForNecklace` 에 넘긴다. 검증 실패 메시지 형식은 기존 숫자 인자와 같게 쓴다.

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npm test && npm run typecheck`
Expected: 전부 통과. 화면 골든은 바뀌지 않는다 (목걸이 룩은 목걸이 경로에서만 쓰인다).

- [ ] **Step 6: 커밋**

```bash
git add design/look-necklace.json src/render/look.ts src/render/necklace.ts src/cli.ts tests/render/look.test.ts tests/render/necklace.test.ts
git commit -m "feat: 목걸이 전용 룩과 제작 검증 연결

화면 룩을 하한까지 굵히는 방식은 가시를 사각 막대로 만들었다. 투각은
제약이 다르므로 같은 키 계약 위에 수치를 따로 갖는다. 링 틈과 겹선은
쓰지 않는다 — 틈은 메워지고 겹선은 떨어져 나간다.

내보내기가 목걸이 룩을 쓰고, 검증이 선폭·틈·연결·구멍을 함께 본다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 룩 랩 목걸이 모드 (사용자가 조형을 확정하는 자리)

**Files:**
- Modify: `spikes/look-lab.html`

**Interfaces:**
- Produces (랩 내부): 전역 `necklaceMode`, 함수 `millCheck(tris)`; `design/look-necklace.json` 으로 붙여 넣을 JSON 내보내기

- [ ] **Step 1: 모드 버튼**

HTML 의 토글 버튼 줄에서 `<button id="bPng">PNG</button>` **앞**에 넣는다.

```html
      <button id="bMill">목걸이</button>
```

스크립트에서 다른 토글 버튼(`bMask` 등)이 등록되는 곳을 찾아(`grep -n "bMask" spikes/look-lab.html`) 바로 아래에 같은 형태로 등록한다. 목걸이 모드는 마스크 보기(연기 없이 검은 실루엣)를 함께 켜서 골격 그대로 보이게 한다.

```js
let necklaceMode = false;
document.getElementById('bMill').onclick = (e) => {
  necklaceMode = !necklaceMode;
  e.target.classList.toggle('on', necklaceMode);
  // 목걸이는 각인 경로라 연기가 없다 — 골격 실루엣으로 본다
  showMask = necklaceMode;
  document.getElementById('bMask').classList.toggle('on', showMask);
  rebuild();
};
```

`showMask` 와 `rebuild` 는 랩의 실제 변수·함수 이름으로 바꾼다 (마스크 버튼 핸들러가 무엇을 토글하고 무엇을 호출하는지 보고 같은 것을 쓴다).

- [ ] **Step 2: 검사를 랩에서 실행**

랩은 삼각형 배열(`out`)을 갖고 있으므로 캔버스 2D 로 같은 삼각형을 채워 격자를 만든 뒤, 엔진 `checkManufacturable` 과 같은 열기·닫기·연결 성분 판정을 한다. 다음을 `moodMark` 아래에 넣는다.

```js
/**
 * 제작 가능성 검사 — src/render/manufacture.ts 와 같은 판정이다.
 * 삼각형을 오프스크린 캔버스에 채워 실척 격자를 만든 뒤 열기·닫기·연결을 본다.
 */
function millCheck(tris, mm = { diameterMm: 20, minStrokeMm: 0.5, minGapMm: 0.5, pxPerMm: 10 }) {
  const n = Math.round(mm.diameterMm * mm.pxPerMm);
  const cv = document.createElement('canvas');
  cv.width = n; cv.height = n;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  const scale = (mm.diameterMm * mm.pxPerMm * 0.5) / 0.9; // P_SPAN = 0.9
  for (let i = 0; i < tris.length; i += 6) {
    g.beginPath();
    g.moveTo(n / 2 + tris[i] * scale,     n / 2 - tris[i + 1] * scale);
    g.lineTo(n / 2 + tris[i + 2] * scale, n / 2 - tris[i + 3] * scale);
    g.lineTo(n / 2 + tris[i + 4] * scale, n / 2 - tris[i + 5] * scale);
    g.closePath();
    g.fill();
  }
  const img = g.getImageData(0, 0, n, n).data;
  const ink = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) ink[i] = img[i * 4 + 3] > 128 ? 1 : 0;
  return millReport(ink, n, mm);
}
```

그리고 바로 위에 `millReport` 를 넣는다. 판정과 메시지 문구가 엔진 `src/render/manufacture.ts` 와 같아야 한다 — 랩에서 통과한 조형이 엔진에서 떨어지면 안 된다.

```js
function millErode(grid, n, r) {
  const out = new Uint8Array(n * n), rr = r * r, off = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
      if (dx * dx + dy * dy <= rr) off.push(dx, dy);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!grid[y * n + x]) continue;
    let ok = 1;
    for (let k = 0; k < off.length && ok; k += 2) {
      const nx = x + off[k], ny = y + off[k + 1];
      if (nx < 0 || ny < 0 || nx >= n || ny >= n || !grid[ny * n + nx]) ok = 0;
    }
    out[y * n + x] = ok;
  }
  return out;
}

function millDilate(grid, n, r) {
  const out = new Uint8Array(n * n), rr = r * r, off = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
      if (dx * dx + dy * dy <= rr) off.push(dx, dy);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!grid[y * n + x]) continue;
    for (let k = 0; k < off.length; k += 2) {
      const nx = x + off[k], ny = y + off[k + 1];
      if (nx >= 0 && ny >= 0 && nx < n && ny < n) out[ny * n + nx] = 1;
    }
  }
  return out;
}

function millComponents(grid, n, want) {
  const label = new Int32Array(n * n).fill(-1), sizes = [], stack = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== want || label[i] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(i); label[i] = id;
    while (stack.length) {
      const p = stack.pop(); size++;
      const x = p % n, y = (p / n) | 0;
      if (x > 0 && grid[p - 1] === want && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1); }
      if (x < n - 1 && grid[p + 1] === want && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && grid[p - n] === want && label[p - n] === -1) { label[p - n] = id; stack.push(p - n); }
      if (y < n - 1 && grid[p + n] === want && label[p + n] === -1) { label[p + n] = id; stack.push(p + n); }
    }
    sizes.push(size);
  }
  return { sizes, label };
}

/** 위반 목록과, 화면에 겹쳐 그릴 위반 마스크를 함께 낸다. */
function millReport(ink, n, mm) {
  const violations = [];
  const rThin = (mm.minStrokeMm * mm.pxPerMm) / 2;
  const opened = millDilate(millErode(ink, n, rThin), n, rThin);
  const thinMask = new Uint8Array(n * n);
  let thinPx = 0;
  for (let i = 0; i < ink.length; i++) if (ink[i] && !opened[i]) { thinMask[i] = 1; thinPx++; }
  if (thinPx) violations.push(`최소 선폭 ${mm.minStrokeMm}mm 보다 가는 부분이 ${thinPx}화소 있다`);

  const rGap = (mm.minGapMm * mm.pxPerMm) / 2;
  const closed = millErode(millDilate(ink, n, rGap), n, rGap);
  const gapMask = new Uint8Array(n * n);
  let narrowGapPx = 0;
  for (let i = 0; i < ink.length; i++) if (!ink[i] && closed[i]) { gapMask[i] = 1; narrowGapPx++; }
  if (narrowGapPx) violations.push(`최소 틈 ${mm.minGapMm}mm 보다 좁은 틈이 ${narrowGapPx}화소 있다`);

  const inkC = millComponents(ink, n, 1);
  if (inkC.sizes.length !== 1)
    violations.push(`잉크가 ${inkC.sizes.length}조각이다 — 투각 펜던트는 한 덩어리여야 한다`);

  const bg = millComponents(ink, n, 0);
  const outer = new Set();
  for (let x = 0; x < n; x++) {
    outer.add(bg.label[x]); outer.add(bg.label[(n - 1) * n + x]);
    outer.add(bg.label[x * n]); outer.add(bg.label[x * n + n - 1]);
  }
  const smallHoles = [];
  bg.sizes.forEach((size, id) => {
    if (outer.has(id)) return;
    const dMm = (2 * Math.sqrt(size / Math.PI)) / mm.pxPerMm;
    if (dMm < mm.minGapMm) smallHoles.push(+dMm.toFixed(3));
  });
  if (smallHoles.length)
    violations.push(`최소 틈 ${mm.minGapMm}mm 보다 작은 구멍이 ${smallHoles.length}개 있다`);

  return { violations, components: inkC.sizes.length, thinPx, narrowGapPx, smallHoles, thinMask, gapMask, n };
}
```

- [ ] **Step 3: 위반을 눈에 보이게 표시**

목걸이 모드에서 지오메트리를 다시 만들 때마다 검사를 돌리고, 결과를 HUD 에 적고, 위반 화소를 캔버스 위에 반투명으로 겹쳐 그린다. `#stage` 안, `<canvas id="c">` **다음 줄**에 겹칠 캔버스를 둔다.

```html
    <canvas id="mill" style="position:absolute;left:0;top:0;width:100%;height:100%;
      pointer-events:none;z-index:3;display:none"></canvas>
```

그리고 `millCheck` 아래에 표시 함수를 넣는다. 지오메트리를 만든 직후(랩의 `rebuild` 끝)에서 `showMill(out)` 를 호출한다 — 목걸이 모드가 꺼져 있으면 함수가 스스로 숨긴다.

```js
/** 위반 화소를 겹쳐 그린다. 가는 선은 빨강, 메워질 틈은 주황. */
function showMill(tris) {
  const cv = document.getElementById('mill');
  const hud = document.getElementById('fps');
  if (!necklaceMode) { cv.style.display = 'none'; return; }
  const rep = millCheck(tris);
  const n = rep.n;
  cv.width = n; cv.height = n;
  cv.style.display = 'block';
  const g = cv.getContext('2d');
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    if (rep.thinMask[i]) { img.data[i*4] = 255; img.data[i*4+3] = 190; }
    else if (rep.gapMask[i]) { img.data[i*4] = 255; img.data[i*4+1] = 150; img.data[i*4+3] = 170; }
  }
  g.putImageData(img, 0, 0);
  hud.textContent = rep.violations.length
    ? `제작 불가 — ${rep.violations.join(' · ')}`
    : `제작 가능 — 지름 20mm · 최소 선폭 0.5mm · 최소 틈 0.5mm · 한 덩어리`;
}
```

- [ ] **Step 4: 목걸이 JSON 내보내기**

HTML 의 `<button id="bCopy">JSON 복사</button>` 다음에 넣는다.

```html
        <button id="bCopyMill">목걸이 JSON 복사</button>
```

스크립트에서 `bCopy` 핸들러 아래에 넣는다. `val` 은 현재 파라미터 객체, `out` 요소는 기존 JSON 텍스트 영역이다 (`bCopy` 가 쓰는 것과 같은 것을 쓴다).

```js
document.getElementById('bCopyMill').onclick = () => {
  const json = JSON.stringify({
    _: '목걸이 룩 — 투각 펜던트 20mm (룩 랩 목걸이 모드에서 확정).',
    _모델: '가시는 적고 굵고 짧다. 링 틈과 링 바깥 겹선은 쓰지 않는다 — 투각에서 틈은 메워지고 겹선은 떨어져 나간다.',
    ...val,
  }, null, 2);
  document.getElementById('out').value = json;
  navigator.clipboard?.writeText(json);
};
```

이 출력이 `design/look-necklace.json` 에 그대로 들어간다.

- [ ] **Step 5: 눈으로 확인**

1. 목걸이 모드를 켜면 검은 실루엣과 실척 정보가 보인다.
2. 가시 굵기를 하한 아래로 내리면 빨간 표시가 나타나고, 올리면 사라진다.
3. `덩어리 수`·`가시 개수`를 바꾸면 조각 수 경고가 나타나거나 사라진다.
4. `목걸이 JSON 복사` 결과가 `design/look-necklace.json` 과 같은 키를 갖는다.

- [ ] **Step 6: 커밋**

```bash
git add spikes/look-lab.html
git commit -m "feat(look-lab): 목걸이 모드 — 실척 미리보기와 제작 검사

투각 20mm 기준으로 골격을 실척으로 보여 주고, 하한보다 가는 선과
메워질 틈, 떨어진 조각을 빨갛게 표시한다. 판정은 엔진
manufacture.ts 와 같다 — 랩에서 통과한 조형이 엔진에서 떨어지면 안 된다.

목걸이 룩 JSON 을 그대로 내보낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 목걸이 조형 확정 (사용자 작업 후)

**선행 조건: 사용자가 Task 7 의 랩에서 목걸이 조형을 맞추고 JSON 을 넘겨준다.**

**Files:**
- Modify: `design/look-necklace.json`
- Test: `tests/render/necklace.test.ts`

- [ ] **Step 1: 사용자 JSON 을 반영**

넘겨받은 JSON 으로 `design/look-necklace.json` 을 덮어쓴다. 머리말 두 줄은 유지한다.

- [ ] **Step 2: 위반 0 을 요구하는 테스트로 바꾼다**

`tests/render/necklace.test.ts` 의 "형식만 고정한다" 테스트를 다음으로 교체한다.

```ts
  it('목걸이 룩은 투각 20mm 로 제작 가능하다 — 위반이 없다', () => {
    const { strokes } = buildStrokes(sample, lex, loadNecklaceLook());
    const rep = checkManufacturable(strokes, {
      diameterMm: DEFAULT_NECKLACE.diameterMm,
      minStrokeMm: DEFAULT_NECKLACE.minStrokeMm,
      minGapMm: DEFAULT_NECKLACE.minGapMm,
      pxPerMm: 10,
    });
    expect(rep.violations, rep.violations.join(' / ')).toHaveLength(0);
    expect(rep.components).toBe(1);
  });

  it('단어 10개짜리 문장도 제작 가능하다', () => {
    const ROLES = ['행위','주체','대상','시간','장소','행위수식','주체수식','대상수식','정도','방향'] as const;
    const many: IR = {
      constituents: ['사랑','시간','나','너','아이','약속','선택','빛','물','하늘']
        .map((lemma, i): Constituent => ({ kind: 'concept', lemma, role: ROLES[i]! })),
      mood: 'declarative',
      engineVersion: ENGINE_VERSION,
    };
    const { strokes } = buildStrokes(many, lex, loadNecklaceLook());
    const rep = checkManufacturable(strokes, {
      diameterMm: DEFAULT_NECKLACE.diameterMm,
      minStrokeMm: DEFAULT_NECKLACE.minStrokeMm,
      minGapMm: DEFAULT_NECKLACE.minGapMm,
      pxPerMm: 10,
    });
    expect(rep.violations, rep.violations.join(' / ')).toHaveLength(0);
  });
```

- [ ] **Step 3: 샘플 SVG 를 만들어 눈으로 확인**

`npm run glyph -- --ir fixtures/love-louise.ir.json --out <scratch>/necklace-final.svg --necklace` 를 돌리고 브라우저로 열어 본다. 확인: 링 안쪽이 비어 있고, 가시가 막대로 뭉개지지 않았고, 전체가 한 덩어리로 이어져 있다.

- [ ] **Step 4: 커밋**

```bash
git add design/look-necklace.json tests/render/necklace.test.ts
git commit -m "feat: 목걸이 조형 확정 — 투각 20mm 제작 가능

사용자가 룩 랩 목걸이 모드에서 맞춘 값이다. 선폭·틈·연결·구멍 위반이
0 인 것을 테스트로 고정한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 완료 조건

- [ ] `npm test` 와 `npm run typecheck` 가 통과한다
- [ ] 룩 랩에서 서로 다른 이름이 서로 다른 그림으로 나온다
- [ ] 의문·부정·의지 문장이 6시 표지로 구별되고, 평서문에는 표지가 없다
- [ ] 목걸이 룩으로 렌더한 로고그램이 투각 20mm 제작 검사를 위반 0 으로 통과한다
- [ ] 단어 10개 문장도 위반 0 으로 통과한다
- [ ] 룩 랩 목걸이 모드에서 위반이 빨갛게 보이고, 슬라이더로 고칠 수 있다

**이 시점에서 실제로 제작 주문을 넣을 수 있는 파일이 나온다.**

## 다음 계획

| 계획 | 내용 | 이 계획에 대한 의존 |
|---|---|---|
| III. 파서 | 한국어·영어 → IR, 다중 문장 | `mood` 를 파서가 채운다 (Task 2 가 그리는 자리를 만들어 둔다) |
| IV. 화면 렌더러 | 마스크 + 스모크 셰이더 + 분사 애니메이션 | `buildStrokes` 의 `Stroke[]` |
| V. 웹앱 | UI, 분해 보기, 공유 URL, PNG·목걸이 내보내기, Vercel 배포 | `RenderResult.strokes`, `renderForNecklace` |
| VI. 사전 자가 성장 | 빌드타임 생성, OpenAI 서버리스 함수, 잠정 등재 | `LexiconEntry` 스키마 |
