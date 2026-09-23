import type { Constituent, Role } from './ir';
import { lookup, type Lexicon, type LexiconEntry } from './lexicon';
import { syllabify } from './phonology';

/**
 * 한국어 → 성분 (설계 문서 7.3).
 *
 * 형태소 분석기를 외부 의존성으로 들이지 않는다. 브라우저에서 돌아야 하고,
 * 결정적이어야 하기 때문이다. 어절을 공백으로 자르고 조사·어미 표에 맞춘다.
 *
 * `mood` 는 여기서 보지 않는다 — `detectMoodKo` 가 먼저 표지어를 덜어낸
 * 문장이 들어온다.
 *
 * ## 한 어절을 읽는 순서 (계획 III 최종 리뷰 C1·C2·C3)
 *
 * 1. **어절 전체를 사전에서 찾는다.** `가을` `사랑` `고양이` 처럼 끝 글자가
 *    조사와 같은 표제어가 조사 떼기에 스스로를 잃지 않게 한다 (C2).
 * 2. **조사를 떼고 남은 어간을 사전에서 그대로 찾는다.** 여기서는 짐작하지
 *    않는다. 조사가 붙었다는 것은 그 어간이 명사라는 뜻이므로, `살이` 의
 *    `살` 을 `살다` 로, `안에` 의 `안` 을 `안다` 로 짐작하면 확신에 찬 오답이
 *    된다 (C3). 찾지 못하면 조사가 준 역할 그대로 음소 폴백이다.
 *    예외는 조사와 **모양이 같은 용언 어미** 뿐이다 (`사랑하는` 의 `는`,
 *    `기다려도` 의 `도`). 그 경우에도 어미가 붙을 수 있는 모양일 때만,
 *    기본형이 사전의 용언일 때만 받는다 — `HOMOGRAPH_ENDINGS` 참고.
 * 3. **조사가 없으면 용언 어미를 뗀다.** 어미를 뗀 자리의 받침 녹음(`본다`
 *    `기다릴게` `합니다` `했다`)을 되돌린 후보 어간들을 만들고, 기본형이
 *    사전의 용언인 첫 후보를 쓴다 (C1).
 * 4. 모두 실패하면 음소 폴백. 어미가 분명한 흔적을 남겼으면(`바라보다`)
 *    역할은 행위다.
 *
 * 확신에 찬 오답은 음소 폴백보다 나쁘다 — 폴백은 적어도 "모른다" 고 말하지만,
 * 오답은 다른 개념을 진짜인 것처럼 그린다. 그래서 짐작은 좁게, 검증은 사전으로 한다.
 */

type ParticleRole = Role | '에';

/**
 * 조사 → 역할. 긴 것부터 검사한다 (에서 가 에 보다 먼저).
 *
 * `이랑` 은 반드시 `랑` 보다 앞에 와야 한다 — `이랑` 으로 끝나는 말은 `랑` 으로도
 * 끝나므로, `랑` 을 먼저 검사하면 `이` 한 글자가 어간에 눌어붙는다. 나머지
 * 새 항목들은 서로 꼬리를 공유하지 않는다.
 *
 * `까지` 와 `부터` 는 시간이 아니라 방향으로 둔다 — 둘 다 범위의 끝/시작을
 * 가리키는 경계 표지이지 특정 시점 자체가 아니고("여기서부터 저기까지" 처럼
 * 공간에도 그대로 쓰인다), 6시 슬롯(시간)은 특정 시점에 남겨 둔다.
 * `처럼` 과 `보다` 는 둘 다 비교 조사이므로 같은 역할(대상수식)을 준다.
 *
 * `conditional` 인 조사는 앞말이 사전에서 바로 찾아질 때만 조사로 인정한다.
 * `보다` 는 동사 `보다` 와 표기가 같아서 `바라보다` 를 `바라` + `보다` 로
 * 쪼갠다. `하고` 는 `사랑하고` 의 어미와 표기가 같다 — 그래서 앞말이 행위
 * 표제어(`사랑`)면 조사가 아니라 용언 어미로 읽는다.
 */
const PARTICLES: { suffix: string; role: ParticleRole; conditional?: boolean }[] = [
  { suffix: '에서', role: '장소' },
  { suffix: '에게', role: '대상' },
  { suffix: '한테', role: '대상' },
  { suffix: '으로', role: '방향' },
  { suffix: '이랑', role: '대상' },   // 공동격 (받침 있는 말 뒤)
  { suffix: '까지', role: '방향' },
  { suffix: '부터', role: '방향' },
  { suffix: '처럼', role: '대상수식' },
  { suffix: '보다', role: '대상수식', conditional: true }, // 비교 — 동사 '보다' 와 표기가 같다
  { suffix: '하고', role: '대상', conditional: true },     // 공동격 — 용언 어미 '-하고' 와 표기가 같다
  { suffix: '마다', role: '시간수식' },
  { suffix: '로', role: '방향' },
  { suffix: '는', role: '주체' },
  { suffix: '은', role: '주체' },
  { suffix: '가', role: '주체' },
  { suffix: '이', role: '주체' },
  { suffix: '를', role: '대상' },
  { suffix: '을', role: '대상' },
  { suffix: '에', role: '에' },   // 시간/장소 중의 — 사전의 기본 역할로 가른다 (particleRole)
  { suffix: '의', role: '주체수식' },
  { suffix: '도', role: '주체' },
  { suffix: '만', role: '대상' },
  { suffix: '와', role: '대상' },   // 공동격 (받침 없는 말 뒤)
  { suffix: '과', role: '대상' },   // 공동격 (받침 있는 말 뒤)
  { suffix: '랑', role: '대상' },   // 공동격 캐주얼 (받침 없는 말 뒤) — '이랑' 다음에 검사
];

/**
 * 대명사 이형태 → 기본형. 조사 앞에서 형태가 바뀌는 대명사들이다
 * (나+가 → 내가, 너+가 → 네가, 저+가 → 제가). 조사만 떼고 나면 이 이형태가
 * 어간 자리에 남는다.
 *
 * `PARTICLES` 표에 `'내가'` 같은 통짜 항목을 추가하지 않는 이유: 그러면
 * 조사 규칙이 아니라 대명사 하나를 위한 특수 사례가 조사 표에 섞여
 * 들어간다. 조사 분리는 조사 분리대로 하고, 분리 후 어간을 정규화하는
 * 별도의 작은 표로 두는 편이 각 표의 책임을 분명히 한다.
 */
const PRONOUN_VARIANTS: Record<string, string> = {
  '내': '나',
  '네': '너',
  '제': '저',
  // 3인칭 대명사 → `사람`. 영어 파서가 she/he/they/him/her/them 을 같은 항목
  // `사람` 으로 보내므로, 두 언어가 같은 그림을 내려면 여기서도 그래야 한다
  // (스펙 6.1). 그녀·그·그들은 일부러 한 그림으로 접는다 — 성별과 수를 가르는
  // 표제어가 사전에 없고, 음소 폴백으로 두면 `그녀가 나를 사랑해` 와
  // `She loves me` 가 다른 목걸이가 된다. 복수 `그들` 은 `lookupNoun` 의
  // `들` 벗기기로 `그` 에 닿는다. 조사 없이 홀로 선 `그` 는 관형사다 —
  // `DETERMINERS` 참고.
  '그녀': '사람',
  '그': '사람',
};

/**
 * 지시 관형사. 조사 없이 홀로 서고 뒤에 어절이 이어지면 뒤 명사를 꾸밀
 * 뿐이므로 그리지 않는다 (`그 사람이` → `사람`). 조사가 붙은 `그가`·`그를` 은
 * 대명사다 — 어절 자체가 `그` 가 아니므로 여기 걸리지 않는다.
 */
const DETERMINERS = new Set(['그', '이', '저']);

// ─── 한글 음절 산수 ─────────────────────────────────────────────────────────
//
// `phonology.ts` 의 ONSETS/NUCLEI/CODAS 테이블은 내보내지 않으므로, 여기서는
// 색인 산수만으로 좁게 다시 구현한다. 아래 색인 상수들은 그 배열 순서와
// 반드시 같아야 한다 — 그 배열이 바뀌면 여기도 같이 바뀌어야 한다.

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const NUCLEUS_COUNT = 21;
const CODA_COUNT = 28;

const ONSET_EMPTY = 11;  // ONSETS 의 '' (빈 초성 ㅇ)
const ONSET_H = 18;      // ONSETS 의 'h' (ㅎ)
const NUCLEUS_A = 0;     // ㅏ
const NUCLEUS_AE = 1;    // ㅐ
const NUCLEUS_EO = 4;    // ㅓ
const NUCLEUS_EU = 18;   // ㅡ — '음' 합성용

/** 종성 색인 (CODAS 배열 순서). */
export const CODA = {
  NONE: 0, N: 4, NH: 6, D: 7, L: 8, M: 16, B: 17, BS: 18, SS: 20,
} as const;

interface Jamo { onset: number; nucleus: number; coda: number }

/** 한 음절을 초성·중성·종성 색인으로 분해한다. 한글 음절이 아니면 null. */
function decompose(ch: string): Jamo | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined || cp < HANGUL_BASE || cp > HANGUL_LAST) return null;
  const code = cp - HANGUL_BASE;
  return {
    onset: Math.floor(code / (NUCLEUS_COUNT * CODA_COUNT)),
    nucleus: Math.floor((code % (NUCLEUS_COUNT * CODA_COUNT)) / CODA_COUNT),
    coda: code % CODA_COUNT,
  };
}

function compose(j: Jamo): string {
  return String.fromCodePoint(HANGUL_BASE + j.onset * NUCLEUS_COUNT * CODA_COUNT + j.nucleus * CODA_COUNT + j.coda);
}

/** 마지막 음절의 자모. 비었거나 한글이 아니면 null. */
function lastJamo(s: string): Jamo | null {
  return s.length > 0 ? decompose(s.charAt(s.length - 1)) : null;
}

/** 마지막 음절의 받침 색인. 한글이 아니면 -1. */
export function lastCoda(s: string): number {
  return lastJamo(s)?.coda ?? -1;
}

/** 마지막 음절을 바꾼 문자열. 마지막 글자가 한글 음절이 아니면 null. */
function mapLast(s: string, f: (j: Jamo) => Jamo): string | null {
  const j = lastJamo(s);
  return j ? s.slice(0, -1) + compose(f(j)) : null;
}

/** 마지막 음절의 받침을 바꾼다 (`기다릴` → `기다리`, `산` → `살`). */
export function withLastCoda(s: string, coda: number): string | null {
  return mapLast(s, (j) => ({ ...j, coda }));
}

/**
 * 축약모음 되돌리기: 마지막 음절의 중성이 여/워/와/왜 면 각각 이/우/오/외 로
 * 바꾼다 (기다려→기다리, 그리워→그리우, 봐→보, 돼→되). `해` 는 `하` 로 되돌린다.
 *
 * ㅐ→ㅏ 는 `해` 하나만 되돌린다. `하+여 → 해` 만이 이 방향의 축약이고,
 * 다른 ㅐ 음절까지 되돌리면 `재 → 자 → 자다` 처럼 명사가 동사로 짐작된다.
 */
const VOWEL_REVERSION: Record<number, number> = {
  6: 20,  // ㅕ → ㅣ
  14: 13, // ㅝ → ㅜ
  9: 8,   // ㅘ → ㅗ
  10: 11, // ㅙ → ㅚ
};

function revertContractedVowel(s: string): string | null {
  const j = lastJamo(s);
  if (!j) return null;
  if (j.onset === ONSET_H && j.nucleus === NUCLEUS_AE && j.coda === CODA.NONE) {
    return s.slice(0, -1) + '하';
  }
  const reverted = VOWEL_REVERSION[j.nucleus];
  if (reverted === undefined) return null;
  return s.slice(0, -1) + compose({ ...j, nucleus: reverted });
}

/** ㅡ 탈락 되돌리기: 기뻐 → 기쁘, 아파 → 아프 (받침 없는 ㅓ/ㅏ 를 ㅡ 로). */
function revertEuDrop(s: string): string | null {
  const j = lastJamo(s);
  if (!j || j.coda !== CODA.NONE || (j.nucleus !== NUCLEUS_A && j.nucleus !== NUCLEUS_EO)) return null;
  return s.slice(0, -1) + compose({ ...j, nucleus: NUCLEUS_EU });
}

/** 마지막 음절이 축약모음(여/워/와/왜) 이거나 `해` 인가. */
function endsInContractedVowel(s: string): boolean {
  const j = lastJamo(s);
  if (!j || j.coda !== CODA.NONE) return false;
  if (j.onset === ONSET_H && j.nucleus === NUCLEUS_AE) return true;
  return VOWEL_REVERSION[j.nucleus] !== undefined;
}

/**
 * ㅆ받침으로 굳어붙은 과거형을 되돌린다: `했→하`, `왔→오`, `만났→만나`,
 * `기다렸→기다리`. 과거 어미의 모음이 어간 마지막 음절에 녹아 ㅆ받침으로만
 * 남은 경우다. 중성이 축약모음이면 되돌리고, 아니면(ㅏ·ㅓ 처럼 어간과 어미
 * 모음이 같아 줄어든 경우) 받침만 지운다.
 */
function revertFusedPast(s: string): string | null {
  const j = lastJamo(s);
  if (!j || j.coda !== CODA.SS) return null;
  const stripped = s.slice(0, -1) + compose({ ...j, coda: CODA.NONE });
  return revertContractedVowel(stripped) ?? stripped;
}

/** 어간에 명사형(ㅁ/음)을 붙인다 — 기다리→기다림, 웃→웃음, 미우→미움. */
function nominalize(stem: string): string | null {
  const j = lastJamo(stem);
  if (!j) return null;
  if (j.coda === CODA.NONE) return stem.slice(0, -1) + compose({ ...j, coda: CODA.M });
  return stem + compose({ onset: ONSET_EMPTY, nucleus: NUCLEUS_EU, coda: CODA.M });
}

// ─── 사전 조회 ──────────────────────────────────────────────────────────────

/**
 * 명사 자리의 직접 조회. 짐작하지 않는다 — 대명사 이형태(내→나)와 복수
 * `들`(사람들→사람)만 벗긴다. 둘 다 뜻을 바꾸지 않는 형태 변화다.
 */
function lookupNoun(s: string, lex: Lexicon): LexiconEntry | undefined {
  const direct = lookup(lex, PRONOUN_VARIANTS[s] ?? s);
  if (direct) return direct;
  if (s.length > 1 && s.endsWith('들')) {
    const sg = s.slice(0, -1);
    return lookup(lex, PRONOUN_VARIANTS[sg] ?? sg);
  }
  return undefined;
}

/**
 * `X하다` 의 어근 X 로 받아들일 수 있는 항목인가.
 *
 * `사랑하다 → 사랑`, `생각하다 → 생각` 처럼 하다 동사의 뜻은 어근 명사의
 * 뜻이다. 어근은 행위 명사이거나 사물·추상 명사(대상)여야 한다. 사람 명사
 * (`친구하다`)나 대명사(`너하고` 의 `너하`)에 닿으면 사람이 행위가 된다.
 */
function isHadaRoot(e: LexiconEntry): boolean {
  if (e.defaultRole === '행위') return true;
  return e.defaultRole === '대상' && e.features.animacy < 0.5;
}

/**
 * 어간 → 용언 표제어. 짐작이므로 모든 결과를 검증한다.
 *
 * 1) 기본형 `어간+다` 가 사전의 행위 표제어(또는 그 별칭)인가 — 가장 곧은 길이다.
 *    `기다리다` 는 `기다림` 의 별칭이므로 `기다림` 이 돌아온다.
 * 2) 어간이 `…하` 면 어근을 찾는다 (`사랑하 → 사랑`) — `isHadaRoot` 참고.
 * 3) 명사형 `어간+ㅁ` 이 행위 표제어인가 (`그리우 → 그리움`). 명사형은
 *    `보 → 봄` 처럼 우연히 다른 낱말에 걸리기 쉬우므로 행위만 받는다.
 *
 * 반환값은 사전 항목 그 자체다 — 호출자는 `entry.lemma` 를 쓴다. 후보 문자열은
 * 별칭일 수 있으므로 IR 에 새기면 같은 개념이 두 이름으로 갈라진다.
 */
export function verbEntry(stem: string, lex: Lexicon): LexiconEntry | undefined {
  if (stem.length === 0) return undefined;
  const plain = lookup(lex, `${stem}다`);
  if (plain && plain.defaultRole === '행위') return plain;
  if (stem.length >= 2 && stem.endsWith('하')) {
    const rootText = stem.slice(0, -1);
    const root = lookup(lex, rootText);
    if (root && isHadaRoot(root)) return root;
    // 형용사 어간 + -어하다: 그리워하 → 그리우 → 그리움, 두려워하 → 두려움,
    // ㅡ 탈락 어간: 기뻐하 → 기쁘 → 기쁨, 슬퍼하 → 슬픔
    for (const adj of [revertContractedVowel(rootText), revertEuDrop(rootText)]) {
      const nomRoot = adj ? nominalize(adj) : null;
      const e = nomRoot ? lookup(lex, nomRoot) : undefined;
      if (e && e.defaultRole === '행위') return e;
    }
  }
  const nom = nominalize(stem);
  if (nom) {
    const e = lookup(lex, nom);
    if (e && e.defaultRole === '행위') return e;
  }
  return undefined;
}

// ─── 용언 어미 ──────────────────────────────────────────────────────────────

/**
 * 용언 어미 한 줄.
 *
 * - `fuse`: 어미의 첫소리가 어간 마지막 음절의 받침으로 녹아드는 경우
 *   (`보+ㄴ다 → 본다`, `기다리+ㄹ게 → 기다릴게`, `하+ㅂ니다 → 합니다`).
 *   그 받침을 지운 후보를 만든다. ㄴ 은 ㄹ 어간의 ㄹ 탈락도 되돌린다 (`산다 → 살`).
 * - `addL`: ㄹ 어간이 이 어미 앞에서 ㄹ 을 잃는다 (`살+는 → 사는`, `살+니 → 사니`).
 * - `restore`: 어미가 어간 마지막 음절을 통째로 바꾼 경우의 원래 음절
 *   (`사랑한` 의 `한` → `하`).
 * - `gate`: 어미를 뗀 나머지가 이 조건을 만족할 때만 본다.
 * - `strong`: 사전에 없어도 용언이라고 믿을 만한 어미. 폴백 역할을 행위로 둔다.
 */
interface Ending {
  e: string;
  fuse?: number;
  addL?: boolean;
  restore?: string;
  gate?: (rem: string) => boolean;
  strong?: boolean | ((rem: string) => boolean);
}

/** 과거·존재·부정의 받침(ㅆ·ㅄ·ㄶ)으로 끝나는 어간 — 했/있/없/않. 명사에는 드물다. */
export function endsInPredicateCoda(s: string): boolean {
  const c = lastCoda(s);
  return c === CODA.SS || c === CODA.BS || c === CODA.NH;
}

const isHaOrPredicate = (rem: string) =>
  (rem.length >= 2 && rem.endsWith('하')) || endsInPredicateCoda(rem);

/**
 * 두 음절 이상의 어근 + `해` (`행복해`, `좋아해`). 사전에 없어도 하다 용언이다.
 * 두 음절짜리(`새해`, `동해`, `이해`)는 명사가 흔하므로 넣지 않는다.
 */
const isHaeForm = (s: string) => s.length >= 3 && s.endsWith('해');

/**
 * 조사가 없는 어절에 붙는 용언 어미. 모두 시도하고(긴 것부터), 기본형이
 * 사전의 용언인 첫 후보를 쓴다. 어미가 맞아도 사전 검증을 통과하지 못하면
 * 다음 어미로 넘어간다.
 *
 * 조사와 표기가 같은 어미(`는/은/을/도/만`)는 여기 없다 — 조사 떼기가 먼저
 * 가져가므로, `HOMOGRAPH_ENDINGS` 에서 따로 다룬다.
 *
 * 맨 `지` 는 `하` 나 과거 받침 뒤에서만 본다. `가지`(나뭇가지) 처럼 `지` 로
 * 끝나는 명사가 흔하고, `-지 않/못/마` 는 태도 판정이 이미 기본형으로
 * 바꿔 놓는다.
 */
const VERB_ENDINGS: Ending[] = [
  { e: '으려고' },
  { e: '습니다', strong: true },
  { e: '습니까', strong: true },
  { e: '니다', fuse: CODA.B, addL: true, strong: (rem) => lastCoda(rem) === CODA.B },
  { e: '니까', fuse: CODA.B, addL: true },
  { e: '는다', strong: true },
  { e: '어요', strong: true }, { e: '아요', strong: true }, { e: '여요', strong: true },
  { e: '으세요' }, { e: '세요', addL: true },
  { e: '는데', addL: true }, { e: '은데' },
  { e: '어서' }, { e: '아서' },
  { e: '지만' }, { e: '지요' },
  { e: '으면' }, { e: '으며' }, { e: '으러' }, { e: '려고' },
  { e: '을게' }, { e: '을래' }, { e: '을까' },
  { e: '나요', addL: true },
  // 한 음절 + 다 는 받침이 있을 때만 용언으로 믿는다 (밝다·좋다·있다). 받침 없는
  // 것(소다)과 받침 ㄴ(판다·혼다)은 외래 명사가 흔하다.
  { e: '다', fuse: CODA.N, strong: (rem) => rem.length >= 2 || lastCoda(rem) > CODA.N },
  { e: '어', strong: (rem) => lastCoda(rem) === CODA.SS },
  { e: '아', strong: (rem) => lastCoda(rem) === CODA.SS },
  { e: '여' },
  { e: '요', strong: isHaeForm }, { e: '서', strong: isHaeForm },
  { e: '고' }, { e: '지', gate: isHaOrPredicate }, { e: '죠' }, { e: '던' },
  { e: '면' }, { e: '며' }, { e: '러' },
  { e: '게', fuse: CODA.L }, { e: '래', fuse: CODA.L }, { e: '까', fuse: CODA.L },
  { e: '자' },
  { e: '니', addL: true }, { e: '냐', addL: true }, { e: '나', addL: true },
  // 하다 동사의 관형형·명사형: 사랑한 / 사랑할 / 사랑함
  { e: '한', restore: '하' }, { e: '할', restore: '하' }, { e: '함', restore: '하' },
];

/**
 * 조사와 표기가 같은 용언 어미. 조사를 떼고 남은 어간이 사전에 없을 때만
 * 본다. 조사 뒤이므로 가장 좁게 읽는다 — 기본형이 곧바로 사전의 용언이어야
 * 한다(`어간+다`, 또는 하다 어근). 명사형 짐작이나 축약모음 되돌리기는 하지
 * 않는다(C3). `도`·`만` 은 앞의 연결 어미(`-어도`, `-지만`)가 이미 용언임을
 * 말해 주므로, 그 앞부분을 조사 없는 어절처럼 다시 읽는다.
 */
const HOMOGRAPH_ENDINGS: Record<string, Ending[]> = {
  '는': [{ e: '는', addL: true }],
};
// `은`·`을` 은 여기 없다. 받침 있는 명사 + 은/을 과 받침 있는 어간 + 은/을
// (관형형)이 모양으로 전혀 구별되지 않는다 — `마음 안은 따뜻해` 의 `안은` 과
// `너를 안은 채` 의 `안은` 이 같은 글자다. 명사가 이긴다 (C3). 반면 `는` 은
// 받침 있는 명사 뒤에 오지 않으므로(`안는` 은 명사+조사가 될 수 없다) 받는다.

/** 어미를 뗀 나머지 → 후보 어간들 (앞에 있을수록 먼저 시도한다). */
function stemCandidates(rem: string, end: Ending): string[] {
  const out: string[] = [];
  const push = (s: string | null) => { if (s && s.length > 0 && !out.includes(s)) out.push(s); };

  if (end.restore !== undefined) {
    push(rem + end.restore);
    return out;
  }
  const bases: string[] = [rem];
  // 시제층: 먹었 → 먹, 기다리겠 → 기다리, 했 → 하, 봤 → 보
  const last = rem.charAt(rem.length - 1);
  if (rem.length > 1 && (last === '었' || last === '았' || last === '였' || last === '겠')) {
    bases.push(rem.slice(0, -1));
  } else {
    const unfused = revertFusedPast(rem);
    if (unfused) bases.push(unfused);
  }

  for (const b of bases) {
    push(b);
    const c = lastCoda(b);
    if (end.fuse !== undefined && c === end.fuse) {
      push(withLastCoda(b, CODA.NONE));                  // 본 → 보, 기다릴 → 기다리, 합 → 하
      if (end.fuse === CODA.N || end.addL) push(withLastCoda(b, CODA.L)); // 산 → 살, 삽(니다) → 살 (ㄹ 탈락)
    }
    if (end.addL && c === CODA.NONE) push(withLastCoda(b, CODA.L)); // 사(는) → 살
    if (c === CODA.L) push(withLastCoda(b, CODA.D));      // ㄷ 불규칙: 걸(어) → 걷, 들(어) → 듣
    push(revertContractedVowel(b));                       // 봐(요) → 보, 기다려(서) → 기다리
  }
  return out;
}

/**
 * 어미 없이 어간+아/어 가 한 음절로 줄어든 어절인가 — `가`, `만나`, `봐`,
 * `기다려`, `사랑해`. 받침 있는 어절(`안`, `살`, `잔`)은 여기 들지 않는다:
 * 받침 있는 어간은 어미 없이 홀로 쓰이지 않으므로, 그런 어절은 명사다.
 */
function zeroEndingCandidates(word: string): string[] {
  const j = lastJamo(word);
  if (!j || j.coda !== CODA.NONE) return [];
  if (endsInContractedVowel(word)) {
    const r = revertContractedVowel(word);
    return r ? [r] : [];
  }
  return j.nucleus === NUCLEUS_A || j.nucleus === NUCLEUS_EO ? [word] : [];
}

interface VerbReading {
  entry?: LexiconEntry;
  /** 사전에 없지만 어미가 분명했을 때, 어미를 뗀 나머지 (음소 폴백용). */
  strongRem?: string;
}

/** 어절을 용언으로 읽어 본다. `endings` 를 긴 것부터 모두 시도한다. */
function readAsVerb(word: string, lex: Lexicon, endings: Ending[], zero: boolean): VerbReading {
  let strongRem: string | undefined;
  for (const end of endings) {
    if (!(word.length > end.e.length && word.endsWith(end.e))) continue;
    const rem = word.slice(0, -end.e.length);
    if (end.gate && !end.gate(rem)) continue;
    for (const c of stemCandidates(rem, end)) {
      const e = verbEntry(c, lex);
      if (e) return { entry: e };
    }
    const strong = typeof end.strong === 'function' ? end.strong(rem) : end.strong === true;
    if (strong && strongRem === undefined) strongRem = rem;
  }
  if (zero) {
    for (const c of zeroEndingCandidates(word)) {
      const e = verbEntry(c, lex);
      if (e) return { entry: e };
    }
    if (strongRem === undefined && isHaeForm(word)) strongRem = word;
  }
  return strongRem === undefined ? {} : { strongRem: hadaRootOf(strongRem) };
}

/**
 * 폴백 음절에서 하다 용언의 `하` 를 덜어낸다 — 사전에 있는 하다 용언이
 * 어근(`사랑해 → 사랑`)으로 그려지듯, 없는 것도 어근(`행복했 → 행복`)만 나선으로
 * 그린다. 하다 용언이 아니면 그대로 둔다.
 */
function hadaRootOf(rem: string): string {
  const b = lastCoda(rem) === CODA.N || lastCoda(rem) === CODA.B || lastCoda(rem) === CODA.L
    ? withLastCoda(rem, CODA.NONE) : null;
  for (const c of [rem, revertFusedPast(rem), revertContractedVowel(rem), b]) {
    if (c && c.length >= 2 && c.endsWith('하')) return c.slice(0, -1);
  }
  return rem;
}

/**
 * 서술격 조사(`이다`) — `사랑이다`, `사랑입니다`. 앞말은 사전에서 바로
 * 찾아지는 명사여야 한다. 태도 판정이 `사랑입니까` 를 `사랑이다` 로 바꿔
 * 넘기므로 여기서 받는다. 서술어 자리이므로 역할은 행위다.
 */
const COPULA = ['입니다', '이에요', '이었다', '이었어', '이야', '이다'];

// ─── 어절 → 성분 ────────────────────────────────────────────────────────────

/**
 * `에` 의 시간/장소 (계획 III 최종 리뷰 I5).
 *
 * 스펙 7.3 은 `temporality >= 0.6` 으로 가르라고 했지만, `temporality` 는 7.1 의
 * 조형 자질("시간 관련성")로 매겨졌다. 그래서 `기다림` `약속` `추억` `살다`
 * 처럼 시간과 관련된 **행위·추상** 명사가 시간 칸으로 갔다 — `약속에` 가 6시
 * 방향이 된다. 자질 하나에 조형과 역할 두 책임을 지우면 조형을 다듬을 때마다
 * 역할이 바뀐다. 그래서 역할을 정하는 사전의 필드(`defaultRole`)를 본다:
 * 기본 역할이 시간·시간수식인 낱말만 시간이고, 나머지는 장소다. 미등재어는
 * 자질도 역할도 없으므로 장소다 — 대부분 고유명사이고, 고유명사에 붙는 `에` 는
 * 장소일 가능성이 높다.
 */
function particleRole(role: ParticleRole, entry: LexiconEntry | undefined): Role {
  if (role !== '에') return role;
  return entry && (entry.defaultRole === '시간' || entry.defaultRole === '시간수식') ? '시간' : '장소';
}

/** 어절에서 조사를 떼어 낸다. 떼지 못하면 null. */
function stripParticle(word: string): (typeof PARTICLES)[number] & { stem: string } | null {
  for (const p of PARTICLES) {
    if (word.length > p.suffix.length && word.endsWith(p.suffix)) {
      return { ...p, stem: word.slice(0, -p.suffix.length) };
    }
  }
  return null;
}

function concept(entry: LexiconEntry, role: Role): Constituent {
  // 파서는 양상 역할을 만들지 않는다 (스펙 6.2). 사전의 기본 역할이 양상이면
  // 대상으로 내린다 — 6시 슬롯은 오직 mood 에서만 채워진다.
  return { kind: 'concept', lemma: entry.lemma, role: role === '양상' ? '대상' : role };
}

function phonetic(text: string, role: Role): Constituent | null {
  const syllables = syllabify(text);
  if (syllables.length === 0) return null;
  return { kind: 'phonetic', syllables, role: role === '양상' ? '대상' : role };
}

/** 조사 뒤 어간을 찾는다. 보조사 뒤의 격조사도 한 번 더 뗀다 (`너에게는`, `바다에서도`). */
function nounAfterParticle(
  p: NonNullable<ReturnType<typeof stripParticle>>, lex: Lexicon,
): { entry: LexiconEntry; role: ParticleRole } | null {
  const direct = lookupNoun(p.stem, lex);
  if (direct) return { entry: direct, role: p.role };
  const inner = stripParticle(p.stem);
  if (inner && !inner.conditional) {
    const e = lookupNoun(inner.stem, lex);
    if (e) return { entry: e, role: inner.role };
  }
  return null;
}

function readWord(word: string, lex: Lexicon): Constituent | null {
  // 1) 어절 전체 (C2)
  const whole = lookupNoun(word, lex);
  if (whole) return concept(whole, whole.defaultRole);

  // 2) 조사 → 역할. 조사 뒤 어간은 사전에서 그대로 찾기만 한다 (C3).
  const p = stripParticle(word);
  if (p) {
    const noun = nounAfterParticle(p, lex);
    const acceptParticle = !p.conditional
      || (noun !== null && !(p.suffix === '하고' && noun.entry.defaultRole === '행위'));
    if (acceptParticle) {
      if (noun) return concept(noun.entry, particleRole(noun.role, noun.entry));
      const homograph = readParticleHomograph(word, p.suffix, lex);
      if (homograph) return concept(homograph, '행위');
      return phonetic(p.stem, particleRole(p.role, undefined));
    }
    // 조건부 조사를 인정하지 않았다 — 조사 없는 어절로 읽는다
  }

  // 3) 용언 어미 (C1)
  const verb = readAsVerb(word, lex, VERB_ENDINGS, true);
  if (verb.entry) return concept(verb.entry, '행위');

  // 4) 서술격 조사
  for (const c of COPULA) {
    if (word.length > c.length && word.endsWith(c)) {
      const e = lookupNoun(word.slice(0, -c.length), lex);
      if (e) return concept(e, '행위');
    }
  }

  // 5) 음소 폴백. 어미가 분명하면 어미를 떼고 행위 자리에 둔다.
  if (verb.strongRem !== undefined) return phonetic(verb.strongRem, '행위');
  return phonetic(word, '대상');
}

/**
 * 조사와 표기가 같은 용언 어미로 다시 읽는다 — `사랑하는`, `기다리는`,
 * `먹은`, `잊을`, `기다려도`, `사랑하지만`. 조사 앞 어간이 사전에 없을 때만
 * 불린다. `살이`·`안에`·`안은` 은 여기서 동사가 되지 않는다 — `이`·`에` 는
 * 용언 어미가 아니고, `은`·`을` 은 명사 쪽으로 읽는다 (`HOMOGRAPH_ENDINGS` 참고).
 */
function readParticleHomograph(word: string, suffix: string, lex: Lexicon): LexiconEntry | undefined {
  const endings = HOMOGRAPH_ENDINGS[suffix];
  if (endings) return readAsVerb(word, lex, endings, false).entry;
  if (suffix === '도') {
    // -어도/-아도: 앞부분이 어/아 로 끝나거나 줄어든 모음이면 조사 없는 어절로 읽는다
    const rem = word.slice(0, -1);
    const tail = rem.charAt(rem.length - 1);
    if (tail === '어' || tail === '아' || zeroEndingCandidates(rem).length > 0) {
      return readAsVerb(rem, lex, VERB_ENDINGS, true).entry;
    }
  }
  if (suffix === '만' && word.endsWith('지만')) {
    return readAsVerb(word, lex, VERB_ENDINGS, false).entry;
  }
  return undefined;
}

/** 낱말이 아닌 글자(문장 부호)를 걷어낸다. `나는,` → `나는`. */
function clean(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, '');
}

export function parseKo(text: string, lex: Lexicon): Constituent[] {
  const out: Constituent[] = [];
  const words = text.trim().split(/\s+/).map(clean).filter((w) => w.length > 0);
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? '';
    if (DETERMINERS.has(word) && i + 1 < words.length) continue;
    const c = readWord(word, lex);
    if (c) out.push(c);
  }
  return out;
}
