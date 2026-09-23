import type { IR } from './ir';
import type { Lexicon } from './lexicon';
import { ENGINE_VERSION } from '../version';
import { detectMoodKo, detectMoodEn } from './mood';
import { parseKo } from './parse-ko';
import { parseEn } from './parse-en';

export type Language = 'ko' | 'en';

/**
 * 한글이 하나라도 섞여 있으면 한국어로 본다.
 *
 * 섞어 쓴 문장("I love 너")은 한국어 파서가 더 잘 다룬다 — 영어 파서는
 * 어순에 기대는데, 섞어 쓴 문장은 어순이 한국어를 따르기 때문이다.
 */
export function detectLanguage(text: string): Language {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0xac00 && c <= 0xd7a3) return 'ko';
    if (c >= 0x1100 && c <= 0x11ff) return 'ko';
  }
  return 'en';
}

/**
 * 문장 → IR (설계 문서 6, 7).
 *
 * 태도를 먼저 걷어내고 남은 문장에서 성분을 읽는다. 표지어가 성분으로도
 * 남으면 같은 뜻이 두 번 그려진다.
 *
 * 어순·조사·어미·언어는 여기서 전부 사라진다. 남는 것은 성분과 태도뿐이며,
 * 그래서 "나는 너를 사랑해" 와 "I love you" 가 같은 로고그램이 된다.
 */
export function parse(text: string, lex: Lexicon): IR {
  const lang = detectLanguage(text);
  const { mood, rest } = lang === 'ko' ? detectMoodKo(text, lex) : detectMoodEn(text);
  const constituents = lang === 'ko' ? parseKo(rest, lex) : parseEn(rest, lex);
  if (constituents.length === 0) {
    throw new Error(`parse: 성분이 하나도 없다 — 그릴 것이 없다: "${text}"`);
  }
  return { constituents, mood, engineVersion: ENGINE_VERSION };
}
