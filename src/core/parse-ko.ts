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
 */

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
 */
const PARTICLES: { suffix: string; role: Role | '에' }[] = [
  { suffix: '에서', role: '장소' },
  { suffix: '에게', role: '대상' },
  { suffix: '한테', role: '대상' },
  { suffix: '으로', role: '방향' },
  { suffix: '이랑', role: '대상' },   // 공동격 (받침 있는 말 뒤)
  { suffix: '까지', role: '방향' },
  { suffix: '부터', role: '방향' },
  { suffix: '처럼', role: '대상수식' },
  { suffix: '보다', role: '대상수식' }, // 비교 — 동사 '보다' 와 표기가 같지만 조사 자리다
  { suffix: '마다', role: '시간수식' },
  { suffix: '로', role: '방향' },
  { suffix: '는', role: '주체' },
  { suffix: '은', role: '주체' },
  { suffix: '가', role: '주체' },
  { suffix: '이', role: '주체' },
  { suffix: '를', role: '대상' },
  { suffix: '을', role: '대상' },
  { suffix: '에', role: '에' },   // 시간/장소 중의 — 자질로 가른다
  { suffix: '의', role: '주체수식' },
  { suffix: '도', role: '주체' },
  { suffix: '만', role: '대상' },
  { suffix: '와', role: '대상' },   // 공동격 (받침 없는 말 뒤)
  { suffix: '과', role: '대상' },   // 공동격 (받침 있는 말 뒤)
  { suffix: '랑', role: '대상' },   // 공동격 캐주얼 (받침 없는 말 뒤) — '이랑' 다음에 검사
];

/**
 * 용언 어미. 긴 것부터 떼어 낸다.
 *
 * `았다/었다/였다` 계열은 어간에 직접 붙는 일반 과거형(보다→보았다, 웃다→웃었다)을
 * 위한 것이다. `하다` 계열 용언의 축약형(했다·했습니다·했어요)은 원래 있던 항목이고,
 * `했어` 는 그 계열에서 빠져 있던 것을 더한다 — '선택했어' 처럼 흔히 쓰이는 형태다.
 */
const ENDINGS = [
  '하겠습니다', '았습니다', '었습니다',
  '했습니다', '합니다',
  '았어요', '었어요', '였어요', '했어요', '했다',
  '하려고',
  '한다', '았다', '었다', '였다', '하다',
  '았어', '었어', '였어', '했어',
  '해요', '하는', '하던', '해도', '해야', '하지', '하러',
  '하고', '하며', '해서', '하면',
  '이다', '입니다', '이야',
  '해', '했', '하', '한', '할', '함',
];

/**
 * 대명사 이형태 → 기본형. 조사 앞에서 형태가 바뀌는 대명사들이다
 * (나+가 → 내가, 너+가 → 네가, 저+가 → 제가). `stripParticle` 이 조사만
 * 떼고 나면 이 이형태가 어간 자리에 남는다.
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
};

const isHangul = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0xac00 && c <= 0xd7a3;
};

/**
 * 축약형 되돌리기 (스펙 7.3의 나머지 절반).
 *
 * `보았다`, `기다려`, `만났다` 처럼 어미를 떼도 사전 표제어가 아닌 어간이 남는
 * 경우가 있다 — 동사 원형이 아니라 활용형이기 때문이다. 이 표제어 문제를 풀기
 * 위해 세 가지 되돌리기를 시도한다: 어간을 명사형으로 바꾸기(보다→봄,
 * 기다리다→기다림), `하` 를 마저 떼기(사랑하다→사랑), ㅆ받침 과거형을
 * 되돌리기(만났다→만나, 왔다→오). 이 되돌리기는 사전 조회에만 쓴다 — 결과
 * lemma 는 찾아낸 표제어 그대로 쓰고, 원래 어간이 무엇이었는지는 버린다.
 * 그리고 짐작으로 찾은 표제어는 용언성 명사일 때만 받아들인다 —
 * `isVerbalGuess` 참고.
 *
 * 한글 음절 합성은 `phonology.ts` 의 분해를 거꾸로 한 것이다. 그 파일의
 * ONSETS/NUCLEI/CODAS 테이블은 내보내지 않으므로(고치지 말라는 지시도 있고),
 * 여기서는 색인 산수만으로 좁게 다시 구현한다 — 우리가 실제로 쓰는 자모
 * 몇 개(ㅁ 받침, ㅡ 중성, 빈 초성, 축약모음 5개)만 색인 상수로 박아 둔다.
 * 이 상수들은 `phonology.ts` 의 ONSETS/NUCLEI/CODAS 배열 순서와 반드시
 * 같아야 한다 — 그 배열이 바뀌면 여기도 같이 바뀌어야 한다.
 */
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const NUCLEUS_COUNT = 21;
const CODA_COUNT = 28;

const ONSET_EMPTY = 11;   // phonology.ts ONSETS 의 '' (빈 초성 ㅇ)
const NUCLEUS_EU = 18;    // phonology.ts NUCLEI 의 'eu' (ㅡ) — '음' 합성용
const CODA_M = 16;        // phonology.ts CODAS 의 'm' (홑받침 ㅁ)
const CODA_SS = 20;       // phonology.ts CODAS 의 'ss' (쌍시옷 받침) — 축약된 과거형에 남는 받침

/** 한 음절을 초성·중성·종성 색인으로 분해한다. 한글 음절이 아니면 null. */
function decomposeIndices(ch: string): { onset: number; nucleus: number; coda: number } | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined || cp < HANGUL_BASE || cp > HANGUL_LAST) return null;
  const code = cp - HANGUL_BASE;
  return {
    onset: Math.floor(code / (NUCLEUS_COUNT * CODA_COUNT)),
    nucleus: Math.floor((code % (NUCLEUS_COUNT * CODA_COUNT)) / CODA_COUNT),
    coda: code % CODA_COUNT,
  };
}

/** 초성·중성·종성 색인을 한 음절로 합성한다 (분해의 역연산). */
function composeHangul(onset: number, nucleus: number, coda: number): string {
  return String.fromCodePoint(HANGUL_BASE + onset * NUCLEUS_COUNT * CODA_COUNT + nucleus * CODA_COUNT + coda);
}

/**
 * 어간에 명사형(ㅁ/음)을 붙인 후보를 만든다 — 사전 조회 전용.
 * 받침이 없으면 마지막 음절에 ㅁ 받침을 바로 붙인다 (기다리→기다림).
 * 받침이 있으면 음절 '음' 을 새로 붙인다 (웃→웃음).
 */
function nominalize(stem: string): string | null {
  const lastCh = stem.charAt(stem.length - 1);
  const d = decomposeIndices(lastCh);
  if (!d) return null;
  const head = stem.slice(0, -1);
  if (d.coda === 0) return head + composeHangul(d.onset, d.nucleus, CODA_M);
  return stem + composeHangul(ONSET_EMPTY, NUCLEUS_EU, CODA_M);
}

/** `하다` 어근으로 되돌리는 후보를 만든다 — 사랑하→사랑, 약속하→약속. */
function deHa(stem: string): string | null {
  return stem.length > 1 && stem.endsWith('하') ? stem.slice(0, -1) : null;
}

/**
 * 축약모음 되돌리기: 어절 마지막 음절의 중성이 여/워/와/애/에 면 각각
 * 이/우/오/아/어 로 바꾼 후보를 만든다 (기다려→기다리, 그리워→그리우).
 * 사전 조회에만 쓰고, 못 찾으면 원래 어절로 돌아간다 — 호출 쪽의 책임이다.
 */
const VOWEL_REVERSION: Record<number, number> = {
  6: 20,  // 여 → 이
  14: 13, // 워 → 우
  9: 8,   // 와 → 오
  1: 0,   // 애 → 아
  5: 4,   // 에 → 어
};

function revertContractedVowel(stem: string): string | null {
  const lastCh = stem.charAt(stem.length - 1);
  const d = decomposeIndices(lastCh);
  if (!d) return null;
  const reverted = VOWEL_REVERSION[d.nucleus];
  if (reverted === undefined) return null;
  return stem.slice(0, -1) + composeHangul(d.onset, reverted, d.coda);
}

/**
 * ㅆ받침으로 굳어붙은 과거형을 되돌린다 (스펙 7.3의 세 번째 되돌리기).
 *
 * `났다`, `왔다`, `했다` 처럼 과거 어미(았다/었다/였다)의 모음이 어간 마지막
 * 음절에 녹아들어 ㅆ받침으로만 남는 경우가 있다 — `만나+았다→만났다` 처럼
 * 어간과 어미의 모음이 같아 그대로 줄기도 하고, `오+았다→왔다` 처럼 모음이
 * 합쳐지기도 한다. ENDINGS 표의 고정 문자열로는 잡을 수 없다 — 녹아든
 * 음절의 초성이 어간마다 다르기 때문이다(났 은 ㄴ, 왔 은 초성 없음, 했 은 ㅎ).
 * 그래서 어미 표 대신 구조로 판정한다: 어간이 '다' 로 끝나고 그 앞 음절이
 * ㅆ받침이면 그 두 글자를 통째로 떼어 낸다. 중성이 축약모음표에 있으면
 * 그것도 되돌리고(왔→오, 했→하), 없으면(났 의 ㅏ처럼 어간·어미 모음이
 * 같아 그대로 줄어든 경우) 중성은 두고 받침만 지운다(났→나).
 */
function revertFusedPastCoda(stem: string): string | null {
  if (stem.length < 2 || !stem.endsWith('다')) return null;
  const fusedCh = stem.charAt(stem.length - 2);
  const d = decomposeIndices(fusedCh);
  if (!d || d.coda !== CODA_SS) return null;
  const nucleus = VOWEL_REVERSION[d.nucleus] ?? d.nucleus;
  return stem.slice(0, -2) + composeHangul(d.onset, nucleus, 0);
}

/**
 * 짐작(명사형 만들기·축약모음 되돌리기·하 떼기)으로 찾은 표제어는 용언성
 * 명사(defaultRole '행위')일 때만 받아들인다. 짐작은 형태만 보고 사전을
 * 뒤지는 것이라 `보다→봄` 처럼 엉뚱한 명사(계절 '봄')에 우연히 걸릴 수
 * 있는데, 확신에 찬 오답은 음소 폴백(모르는 말)보다 나쁘다 — 폴백은 적어도
 * "모른다"고 말하지만 오답은 틀린 뜻을 진짜인 것처럼 그린다. 직접 조회로
 * 찾은 표제어는 이 가드를 거치지 않는다.
 */
function isVerbalGuess(entry: LexiconEntry): boolean {
  return entry.defaultRole === '행위';
}

/** 한 후보 어간에 명사형 만들기 → 하 떼기 순서로 사전을 조회한다. 짐작 가드를 거친다. */
function resolveViaTricks(
  candidate: string,
  lex: Lexicon,
): { lemma: string; entry: LexiconEntry } | null {
  const nominalized = nominalize(candidate);
  if (nominalized) {
    const e = lookup(lex, nominalized);
    if (e && isVerbalGuess(e)) return { lemma: nominalized, entry: e };
  }
  const rooted = deHa(candidate);
  if (rooted) {
    const e = lookup(lex, rooted);
    if (e && isVerbalGuess(e)) return { lemma: rooted, entry: e };
  }
  return null;
}

/**
 * 직접 조회가 실패한 어간을 축약형 되돌리기로 다시 찾는다.
 * 1) 어간 그대로 명사형/하-제거 시도
 * 2) 안 되면 ㅆ받침 과거형을 되돌린 어간으로 직접 조회 + 같은 두 가지 시도
 * 3) 안 되면 축약모음을 되돌린 어간으로 직접 조회 + 같은 두 가지 시도
 * 모두 실패하면 null — 호출 쪽은 원래 어간으로 음소 폴백을 그대로 쓴다.
 * 여기서 나가는 모든 결과는 짐작이므로 `isVerbalGuess` 가드를 거친다.
 */
function resolveContractedStem(stem: string, lex: Lexicon): { lemma: string; entry: LexiconEntry } | null {
  const direct = resolveViaTricks(stem, lex);
  if (direct) return direct;

  const fusedPast = revertFusedPastCoda(stem);
  if (fusedPast) {
    const e = lookup(lex, fusedPast);
    if (e && isVerbalGuess(e)) return { lemma: fusedPast, entry: e };
    const viaTricks = resolveViaTricks(fusedPast, lex);
    if (viaTricks) return viaTricks;
  }

  const reverted = revertContractedVowel(stem);
  if (reverted && reverted !== stem) {
    const e = lookup(lex, reverted);
    if (e && isVerbalGuess(e)) return { lemma: reverted, entry: e };
    const viaTricks = resolveViaTricks(reverted, lex);
    if (viaTricks) return viaTricks;
  }
  return null;
}

/** 어절에서 조사를 떼어 낸다. 떼지 못하면 role 은 null. */
function stripParticle(word: string): { stem: string; role: Role | '에' | null } {
  for (const { suffix, role } of PARTICLES) {
    if (word.length > suffix.length && word.endsWith(suffix)) {
      return { stem: word.slice(0, -suffix.length), role };
    }
  }
  return { stem: word, role: null };
}

/** 용언 어미를 떼어 낸다. 뗀 적이 있으면 행위 후보다. */
function stripEnding(word: string): { stem: string; verb: boolean } {
  for (const e of ENDINGS) {
    if (word.length > e.length && word.endsWith(e)) {
      return { stem: word.slice(0, -e.length), verb: true };
    }
  }
  return { stem: word, verb: false };
}

export function parseKo(text: string, lex: Lexicon): Constituent[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: Constituent[] = [];

  for (const word of words) {
    // 1) 조사 → 역할
    const { stem: afterParticle, role: particleRole } = stripParticle(word);
    // 2) 조사가 없으면 용언 어미를 본다
    const { stem: strippedStem, verb } = particleRole === null
      ? stripEnding(afterParticle)
      : { stem: afterParticle, verb: false };

    // 3) 조사 뒤에 남은 대명사 이형태를 기본형으로 되돌린다 (내→나, 네→너, 제→저)
    const stem = PRONOUN_VARIANTS[strippedStem] ?? strippedStem;

    let entry = lookup(lex, stem);
    let lemma = stem;
    if (!entry) {
      // 4) 직접 조회가 실패하면 축약형을 되돌려 다시 찾는다 (보았다→봄, 기다려→기다림).
      //    실패하면 entry 는 계속 undefined 고, 아래에서 음소 폴백으로 내려간다.
      const resolved = resolveContractedStem(stem, lex);
      if (resolved) {
        entry = resolved.entry;
        lemma = resolved.lemma;
      }
    }

    let role: Role;
    if (particleRole === '에') {
      // `에` 의 시간/장소 중의성은 어휘의 시간성 자질로 가른다 (스펙 7.3).
      // 미등재어에는 자질이 없으므로 장소로 기본 처리한다 — 대부분 고유명사이고,
      // 고유명사에 붙는 `에` 는 장소일 가능성이 높다.
      role = entry && entry.features.temporality >= 0.6 ? '시간' : '장소';
    } else if (particleRole !== null) {
      role = particleRole;
    } else if (verb) {
      role = '행위';
    } else if (entry) {
      role = entry.defaultRole;
    } else {
      role = '대상';
    }

    // 파서는 양상 역할을 만들지 않는다 (스펙 6.2). 사전의 기본 역할이 양상이면
    // 대상으로 내린다 — 6시 슬롯은 오직 mood 에서만 채워진다.
    if (role === '양상') role = '대상';

    if (entry) {
      out.push({ kind: 'concept', lemma, role });
      continue;
    }
    const syllables = syllabify(stem);
    if (syllables.length > 0) {
      out.push({ kind: 'phonetic', syllables, role });
    } else if ([...stem].some(isHangul)) {
      // 한글이 섞였는데 음절이 없는 경우는 없다. 방어적으로 건너뛴다.
      continue;
    }
  }

  return out;
}
