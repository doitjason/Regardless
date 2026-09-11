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
  /**
   * 겹종성의 두 번째 자음. 단자음이면 null.
   *
   * 겹종성을 첫 자음만으로 뭉개면 갈/갉/갊/갋/갌/갍/갎/갏 이 모두 같은
   * 그림이 된다. 이름을 구별해 그리는 것이 이 시스템의 목적이므로 그럴 수 없다.
   * 또한 겹종성은 모음 앞에서 두 자음이 다 실현되므로(값이 → [갑씨]) 첫
   * 자음만 남기는 것은 소리에도 충실하지 않다.
   *
   * 어느 자음이 실현되는지는 어휘마다 불규칙하다 — 닭은 ㄱ, 여덟은 ㄹ,
   * 밟다는 ㅂ. 자모 단위 표로는 판정할 수 없으므로 판정하지 않고
   * 둘 다 기록한다. 기하 쪽에서 주 표시와 수반 표시로 나눠 그린다.
   */
  secondPlace: 0 | 1 | 2 | 3 | 4 | null;
  secondManner: Manner | null;
  secondTense: 0 | 1 | 2 | null;
}

const CONSONANTS: Record<string, ConsonantFeatures> = {
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
  // Consonant clusters (codas) — primary is the first consonant (spelling order);
  // secondary carries the second jamo's own place/manner/tense.
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

const NEUTRAL_CONSONANT: ConsonantFeatures = {
  place: 2, manner: 'stop', tense: 0, secondPlace: null, secondManner: null, secondTense: null,
};

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
