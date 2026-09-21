import type { Mood } from './ir';

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
 * 감싸는 태도이므로 안쪽의 부정·의문보다 먼저 판정한다.
 */

/** 표지어와 그 표지가 뜻하는 태도. 앞에서부터 순서대로 검사한다. */
const KO_MARKS: { mood: Mood; patterns: RegExp[] }[] = [
  { mood: 'concessive', patterns: [
    /그럼에도\s*불구하고\s*/g, /그럼에도\s*/g, /그래도\s*/g, /불구하고\s*/g,
  ] },
  { mood: 'interrogative', patterns: [
    /\s*\?\s*$/g, /(하)?니\s*$/g, /(하)?나\s*$/g, /(합)?니까\s*$/g, /(하)?냐\s*$/g,
  ] },
  { mood: 'negative', patterns: [
    /\s*안\s+/g, /\s*못\s+/g, /지\s*않(아|다|아요|습니다)\s*$/g, /지\s*못하(다|고)\s*$/g,
  ] },
  { mood: 'volitional', patterns: [
    /(ㄹ|을)?게\s*$/g, /(?<!혼)자\s*$/g, /겠(다|어|어요)\s*$/g, /(ㄹ|을)래\s*$/g,
  ] },
];

const EN_MARKS: { mood: Mood; patterns: RegExp[] }[] = [
  { mood: 'concessive', patterns: [
    /^\s*regardless\s*,?\s*/gi, /^\s*nevertheless\s*,?\s*/gi, /^\s*even\s+so\s*,?\s*/gi,
    /^\s*despite\s+(that|it)\s*,?\s*/gi, /^\s*(and\s+)?yet\s*,?\s*/gi,
  ] },
  { mood: 'interrogative', patterns: [
    /\s*\?\s*$/g, /^\s*(do|does|did|is|are|was|were|will|can)\s+/gi,
  ] },
  { mood: 'negative', patterns: [
    /\s+(do|does|did)\s*n['']t\s+/gi, /\s+(do|does|did)\s+not\s+/gi,
    /\s+never\s+/gi, /\s+no\s+longer\s+/gi,
  ] },
  { mood: 'volitional', patterns: [
    /^\s*let['']s\s+/gi, /\s+will\s+/gi, /^\s*i\s+shall\s+/gi,
  ] },
];

function apply(text: string, table: { mood: Mood; patterns: RegExp[] }[]): MoodResult {
  let mood: Mood = 'declarative';
  let rest = text.trim();
  for (const { mood: m, patterns } of table) {
    let hit = false;
    for (const p of patterns) {
      // 표지어를 지우되, 지운 자리에 공백 하나를 남겨 어절이 붙지 않게 한다
      const next = rest.replace(new RegExp(p.source, p.flags), ' ');
      if (next !== rest) { hit = true; rest = next; }
    }
    if (hit && mood === 'declarative') mood = m;
  }
  return { mood, rest: rest.replace(/\s+/g, ' ').trim() };
}

export function detectMoodKo(text: string): MoodResult {
  return apply(text, KO_MARKS);
}

export function detectMoodEn(text: string): MoodResult {
  return apply(text, EN_MARKS);
}
