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
  // Consonant clusters (codas) — features of the first consonant
  'gs': { place: 3, manner: 'stop',      tense: 0 },
  'nj': { place: 1, manner: 'nasal',     tense: 0 },
  'nh': { place: 1, manner: 'nasal',     tense: 0 },
  'lg': { place: 1, manner: 'liquid',    tense: 0 },
  'lm': { place: 1, manner: 'liquid',    tense: 0 },
  'lb': { place: 1, manner: 'liquid',    tense: 0 },
  'ls': { place: 1, manner: 'liquid',    tense: 0 },
  'lt': { place: 1, manner: 'liquid',    tense: 0 },
  'lp': { place: 1, manner: 'liquid',    tense: 0 },
  'lh': { place: 1, manner: 'liquid',    tense: 0 },
  'bs': { place: 0, manner: 'stop',      tense: 0 },
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
