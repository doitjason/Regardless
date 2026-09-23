import type { Mood } from './ir';
import { lookup, type Lexicon } from './lexicon';
import { CODA, endsInPredicateCoda, lastCoda, verbEntry, withLastCoda } from './parse-ko';

export interface MoodResult {
  mood: Mood;
  /** 태도 표지어를 덜어낸 문장. 성분 파싱은 이 문자열을 쓴다. */
  rest: string;
}

/**
 * 문장 수준 태도 (설계 문서 6.2).
 *
 * 표지어는 **문장에서 덜어낸다.** 남겨 두면 "그럼에도 불구하고" 가 6시 표지로도
 * 그려지고 단어 덩어리로도 그려져, 같은 뜻이 두 번 나타난다.
 *
 * 우선순위는 바깥쪽 태도부터다: 양보 > 의문 > 부정 > 의지. 양보는 문장 전체를
 * 감싸는 태도이므로 안쪽의 부정·의문보다 먼저 판정한다. 태도는 첫 번째로
 * 걸린 것 하나지만, 표지는 모든 단계에서 지운다 — 뒤 단계의 표지를 남기면
 * 그것이 성분으로 그려진다.
 *
 * ## 어미형 표지는 어간을 남긴다 (계획 III 최종 리뷰 C4·C5)
 *
 * 한국어 의문·의지·부정의 상당수는 어미다 (`사랑하니`, `만나자`, `기다릴게`,
 * `잊지 않아`). 어미를 통째로 지우면 동사가 사라지고(`만나자` → ``), 어미의
 * 모양만 보고 지우면 명사를 자른다(`어머니` → `어머`). 그래서
 *
 * - 어미는 **용언 어간 뒤에서만** 인정한다. 어간이 용언인지는 사전으로
 *   검증하거나(`verbEntry`), 명사에 나타나지 않는 모양(`…하`, 과거 받침 ㅆ)으로
 *   안다. 어절 전체가 사전의 낱말이면(`나`, `혼자`) 어미로 보지 않는다.
 * - 지운 어미 자리에는 평서형 `다` 를 붙여 **기본형으로 남긴다**
 *   (`만나자` → `만나다`, `기다릴게` → `기다리다`). 성분 파서는 기본형을
 *   가장 확실하게 읽는다.
 *
 * 그래서 한국어 판정은 사전을 받는다.
 */

// ─── 한국어 ────────────────────────────────────────────────────────────────

const KO_CONCESSIVE: RegExp[] = [
  /그럼에도\s*불구하고\s*/g, /그럼에도\s*/g, /그래도\s*/g, /불구하고\s*/g,
];

/**
 * 어간이 용언인가. 명사가 이 모양을 갖는 일은 드물다:
 * - 과거·존재·부정 받침(했/있/없/않)으로 끝난다
 * - 두 음절 이상이고 `하` 로 끝난다 (`사랑하`, `약속하` — 홀로 선 `하나` 는 아니다)
 * - 기본형이 사전의 용언이다 (`가`, `먹`, `기다리`)
 */
function isPredicateStem(stem: string, lex: Lexicon): boolean {
  if (stem.length === 0) return false;
  if (endsInPredicateCoda(stem)) return true;
  if (stem.length >= 2 && stem.endsWith('하')) return true;
  return verbEntry(stem, lex) !== undefined;
}

/** 후보 어간 가운데 용언인 첫 것. ㄹ 어간은 받침을 되살린 후보도 본다 (사니 → 살). */
function firstPredicate(cands: (string | null)[], lex: Lexicon): string | null {
  for (const c of cands) if (c && isPredicateStem(c, lex)) return c;
  return null;
}

const isWholeWord = (w: string, lex: Lexicon) => lookup(lex, w) !== undefined;

/**
 * 의문 어미를 떼고 기본형을 돌려준다. 의문 어미가 아니면 null.
 *
 * `-니/-나/-냐/-나요/-는가/-ㄹ까` 는 용언 어간 뒤에서만 인정한다 — `너와 나`,
 * `우리 어머니`, `나의 누나`, `우리는 하나` 는 의문문이 아니다.
 * `-ㅂ니까/-습니까/-입니까` 는 어미째 뗀다 (`사랑입니까` 의 `입` 을 남기지 않는다).
 */
function questionBase(word: string, lex: Lexicon): string | null {
  if (isWholeWord(word, lex)) return null;
  const cut = (n: number) => word.slice(0, -n);

  if (word.length > 3 && word.endsWith('입니까')) return `${cut(3)}이다`;
  if (word.length > 3 && word.endsWith('습니까')) return `${cut(3)}다`;
  if (word.length > 2 && word.endsWith('니까')) {
    const rem = cut(2);
    if (lastCoda(rem) === CODA.B) return `${withLastCoda(rem, CODA.NONE) ?? rem}다`;
    return null; // 받침 ㅂ 없는 -니까 는 "…니까(이유)" 다
  }
  if (word.length > 2 && word.endsWith('을까')) {
    const s = firstPredicate([cut(2)], lex);
    return s ? `${s}다` : null;
  }
  if (word.length > 1 && word.endsWith('까')) {
    const rem = cut(1);
    if (lastCoda(rem) !== CODA.L) return null;
    // 받침 ㄹ + 까 는 모양만으로 의문이다 (`될까`, `떠날까`). 사전이 모르는 동사면 받침을 지운 어간을 남긴다.
    const stripped = withLastCoda(rem, CODA.NONE);
    const s = firstPredicate([stripped, rem], lex) ?? stripped;
    return s ? `${s}다` : null;
  }
  for (const e of ['는가', '나요', '니', '나', '냐']) {
    if (word.length > e.length && word.endsWith(e)) {
      const rem = cut(e.length);
      const withL = lastCoda(rem) === CODA.NONE ? withLastCoda(rem, CODA.L) : null;
      const s = firstPredicate([rem, withL], lex);
      return s ? `${s}다` : null;
    }
  }
  return null;
}

/**
 * 의지(청유·약속) 어미를 떼고 기본형을 돌려준다. 아니면 null.
 *
 * - `-ㄹ게/-을게`, `-ㄹ래/-을래` (뒤의 `요` 포함). `ㄹ` 은 받침으로 녹아 있으므로
 *   음절을 분해해서 뗀다 — 이전 판은 호환 자모 `ㄹ`(U+3139)을 정규식에 넣어
 *   받침에는 한 번도 맞지 않았다 (C5). ㄹ 어간(`살게`)은 받침을 지우지 않은
 *   후보로 찾는다. `-게` 앞이 받침 ㄹ 이 아니면 약속형이 아니다 (`너에게`).
 * - `-자` 는 용언 어간 뒤에서만. `혼자·감자·모자·의자·남자` 는 명사다.
 * - `-겠다/-겠어(요)/-겠습니다`.
 */
function volitionalBase(word: string, lex: Lexicon): string | null {
  if (isWholeWord(word, lex)) return null;
  const w = /(게|래)요$/.test(word) ? word.slice(0, -1) : word;

  const gyeet = /^(.+)겠(다|어|어요|습니다)$/.exec(w);
  if (gyeet?.[1]) return `${gyeet[1]}다`;

  if (w.length > 2 && (w.endsWith('을게') || w.endsWith('을래'))) {
    const s = firstPredicate([w.slice(0, -2)], lex);
    return s ? `${s}다` : null;
  }
  if (w.length > 1 && (w.endsWith('게') || w.endsWith('래'))) {
    const rem = w.slice(0, -1);
    if (lastCoda(rem) !== CODA.L) return null;
    const stripped = withLastCoda(rem, CODA.NONE);
    // 받침 ㄹ + 게/래 는 모양만으로 약속형이다. 사전이 모르는 동사면 받침을 지운 어간을 남긴다.
    const s = firstPredicate([stripped, rem], lex) ?? stripped;
    return s ? `${s}다` : null;
  }
  if (w.length > 1 && w.endsWith('자')) {
    const s = firstPredicate([w.slice(0, -1)], lex);
    return s ? `${s}다` : null;
  }
  return null;
}

/** `기다릴 거야` 의 `거야` — 앞 어절이 받침 ㄹ 로 끝날 때만 약속형이다. */
const KO_FUTURE_NOUN = new Set(['거야', '거예요', '거에요', '거다', '겁니다', '것이다']);

/** 안/못 뒤에서 뜻 없이 부정만 싣는 가벼운 용언 (`못 해`, `안 돼`). 함께 지운다. */
const KO_LIGHT_VERB = new Set([
  '해', '해요', '해서', '했다', '했어', '했어요', '했습니다', '한다', '하다', '하지', '합니다',
  '하겠다', '할게', '하고',
  '돼', '돼요', '됐다', '됐어', '됐어요', '된다', '되다', '되지', '됩니다', '될게', '되고',
]);

/** `-지` 뒤에 와서 부정을 만드는 보조 용언 (`잊지 않아`, `잊지 못해`, `잊지 마`). */
const KO_NEG_AUX = /^(않|못(하|해|했|한|합|할)|마(라|요)?$|말(아|자|고|아요)?$)/;

/** 부정 서술어 `아니다`. */
const KO_NEG_COPULA = new Set(['아니다', '아니야', '아니에요', '아닙니다', '아니었다', '아니었어']);

/**
 * 부정 표지를 지운다. 어절 단위로 본다 — 낱말 안의 `안`·`못` (`안개`, `못이`,
 * `안아`, `안에`)은 부정이 아니다 (I6).
 *
 * - 홀로 선 `안`·`못` 뒤에 어절이 있으면 부정이다. 표지만 지우고 뒤 어절은
 *   남긴다 (`못 기다려` → `기다려`). 뒤 어절이 가벼운 용언(`해`, `돼`)이면
 *   그것도 지운다 — 남기면 `해` 가 사전의 "해(태양)" 로 그려진다.
 * - `못해`·`안돼` 처럼 붙여 쓴 것은 가벼운 용언과 합친 꼴만 인정한다.
 * - `X지 않/못/마…` 는 `X다` 로 바꾸고 보조 용언을 지운다.
 */
function stripNegationKo(tokens: string[]): { tokens: string[]; hit: boolean } {
  const out: string[] = [];
  let hit = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? '';
    const next = tokens[i + 1];

    if (t.length >= 2 && t.endsWith('지') && next !== undefined && KO_NEG_AUX.test(next)) {
      out.push(`${t.slice(0, -1)}다`);
      hit = true; i++;
      continue;
    }
    const joined = /^(.+)지(않|못하|못해|못했|못한|못합)/.exec(t);
    if (joined?.[1]) {
      out.push(`${joined[1]}다`);
      hit = true;
      continue;
    }
    if ((t === '안' || t === '못') && next !== undefined) {
      hit = true;
      if (KO_LIGHT_VERB.has(next)) i++;
      continue;
    }
    if ((t.startsWith('안') || t.startsWith('못')) && KO_LIGHT_VERB.has(t.slice(1))) {
      hit = true;
      continue;
    }
    if (i > 0 && KO_NEG_COPULA.has(t)) {
      hit = true;
      continue;
    }
    out.push(t);
  }
  return { tokens: out, hit };
}

export function detectMoodKo(text: string, lex: Lexicon): MoodResult {
  let mood: Mood = 'declarative';
  const mark = (m: Mood) => { if (mood === 'declarative') mood = m; };

  let s = text.trim();
  for (const p of KO_CONCESSIVE) {
    const next = s.replace(new RegExp(p.source, p.flags), ' ');
    if (next !== s) { mark('concessive'); s = next; }
  }

  // 문장 끝 부호. 물음표는 의문 표지다.
  const tail = /[\s.!?~…？！。]+$/.exec(s);
  const questionMark = tail !== null && /[?？]/.test(tail[0]);
  if (tail) s = s.slice(0, tail.index);
  let tokens = s.split(/\s+/).filter(Boolean);

  // 의문
  if (questionMark) mark('interrogative');
  const lastIdx = tokens.length - 1;
  const q = lastIdx >= 0 ? questionBase(tokens[lastIdx] ?? '', lex) : null;
  if (q !== null) { tokens[lastIdx] = q; mark('interrogative'); }

  // 부정
  const neg = stripNegationKo(tokens);
  tokens = neg.tokens;
  if (neg.hit) mark('negative');

  // 의지
  const li = tokens.length - 1;
  const last = tokens[li];
  const prev = tokens[li - 1];
  if (last !== undefined && prev !== undefined && KO_FUTURE_NOUN.has(last) && lastCoda(prev) === CODA.L) {
    const stripped = withLastCoda(prev, CODA.NONE);
    const stem = firstPredicate([stripped, prev], lex) ?? stripped ?? prev;
    tokens = [...tokens.slice(0, li - 1), `${stem}다`];
    mark('volitional');
  } else if (last !== undefined) {
    const v = volitionalBase(last, lex);
    if (v !== null) { tokens[li] = v; mark('volitional'); }
  }

  return { mood, rest: tokens.join(' ') };
}

// ─── 영어 ──────────────────────────────────────────────────────────────────

type Rule = [RegExp, string];

const EN_CONCESSIVE: Rule[] = [
  [/^\s*regardless\s*,?\s*/i, ''], [/^\s*nevertheless\s*,?\s*/i, ''], [/^\s*even\s+so\s*,?\s*/i, ''],
  [/^\s*despite\s+(that|it)\s*,?\s*/i, ''], [/^\s*(and\s+)?yet\s*,?\s*/i, ''],
];

const EN_INTERROGATIVE: Rule[] = [
  [/\s*\?\s*$/, ''], [/^\s*(do|does|did|is|are|was|were|will|can)\s+/i, ''],
];

const APOS = "['’]";

/**
 * 부정 (I6). 앞뒤 공백을 요구하지 않고 낱말 경계(`\b`)로 본다 — 문장 머리의
 * `Don't` 도 잡는다. `be + not` 은 `be` 를 남긴다 (`I am waiting`). 조동사의
 * 부정(`can't`, `won't`)은 조동사째 지운다. 마지막으로 남은 `not` 은 어디에
 * 있든 부정이다.
 */
const EN_NEGATIVE: Rule[] = [
  [new RegExp(`\\b(do|does|did)\\s*n${APOS}t\\b`, 'gi'), ''],
  [/\b(do|does|did)\s+not\b/gi, ''],
  [new RegExp(`\\b(is|are|was|were)n${APOS}t\\b`, 'gi'), '$1'],
  [new RegExp(`\\bain${APOS}t\\b`, 'gi'), ''],
  [new RegExp(`\\b(can${APOS}t|cannot|won${APOS}t|couldn${APOS}t|wouldn${APOS}t|shouldn${APOS}t)\\b`, 'gi'), ''],
  [/\b(can|could|would|should|will)\s+not\b/gi, ''],
  [/\bno\s+longer\b/gi, ''],
  [/\bnever\b/gi, ''],
  [/\bnot\b/gi, ''],
];

const EN_PRONOUN = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it']);
/** 명사 `will` 앞에 오는 말 (`the will`, `free will`, `my will`). */
const EN_WILL_DET = new Set([
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'this', 'that',
  'free', 'good', 'ill', 'own', 'strong', 'last', 'iron',
]);
/** 명사 `will` 뒤에 오는 말 (`will of`, `will is`, `will to live`). */
const EN_WILL_NOUN_NEXT = new Set([
  'of', 'is', 'was', 'are', 'were', 'to', 'and', 'or', 'that', 'which', 'for', 'in', 'on', 'at', 'has', 'had',
]);

/**
 * 조동사 `will` 만 의지다 (I6). `the will of the people`, `free will is a myth`
 * 의 `will` 은 명사다. 대명사 뒤면 조동사, 한정사·형용사 뒤나 `of/is/to` 앞이면
 * 명사로 본다. 조동사 `will` 은 지운다.
 */
function stripAuxWill(s: string): { rest: string; hit: boolean } {
  const tokens = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let hit = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? '';
    if (t.toLowerCase() === 'will' && i > 0) {
      const prev = (tokens[i - 1] ?? '').toLowerCase();
      const next = tokens[i + 1]?.toLowerCase();
      const aux = EN_PRONOUN.has(prev)
        || (next !== undefined && !EN_WILL_NOUN_NEXT.has(next) && !EN_WILL_DET.has(prev)
            && !new RegExp(`${APOS}s$`).test(prev));
      if (aux) { hit = true; continue; }
    }
    out.push(t);
  }
  return { rest: out.join(' '), hit };
}

const EN_VOLITIONAL: Rule[] = [
  [new RegExp(`^\\s*let${APOS}s\\b`, 'i'), ''],
  [/^\s*let\s+us\b/i, ''],
  [new RegExp(`\\b(i|you|we|they|he|she|it)${APOS}ll\\b`, 'gi'), '$1'],
  [/\b(i|we)\s+shall\b/gi, '$1'],
];

function applyRules(s: string, rules: Rule[]): { rest: string; hit: boolean } {
  let hit = false;
  for (const [re, rep] of rules) {
    // 지운 자리에 공백을 남겨 낱말이 붙지 않게 한다. 치환이 캡처를 되살리면 앞뒤를 띄운다.
    const next = s.replace(new RegExp(re.source, re.flags), rep === '' ? ' ' : ` ${rep} `);
    if (next !== s) { hit = true; s = next; }
  }
  return { rest: s, hit };
}

export function detectMoodEn(text: string): MoodResult {
  let mood: Mood = 'declarative';
  const mark = (m: Mood, hit: boolean) => { if (hit && mood === 'declarative') mood = m; };
  let s = text.trim();

  for (const [m, rules] of [
    ['concessive', EN_CONCESSIVE], ['interrogative', EN_INTERROGATIVE], ['negative', EN_NEGATIVE],
  ] as const) {
    const r = applyRules(s, rules);
    s = r.rest; mark(m, r.hit);
  }
  const v = applyRules(s, EN_VOLITIONAL);
  const w = stripAuxWill(v.rest);
  s = w.rest; mark('volitional', v.hit || w.hit);

  return { mood, rest: s.replace(/\s+/g, ' ').trim() };
}
