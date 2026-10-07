import type { IR, Constituent, Mood } from '../src/core/ir';
import { lookup, type Lexicon } from '../src/core/lexicon';
import { composeHangul } from '../src/core/phonology';
import { detectLanguage } from '../src/core/parse';
import type { Arrival } from '../src/render/arrival';

/** 해독의 한 걸음 — 이 묶음의 획이 빛나고 이 낱말이 떠오른다. */
export interface DecodeStep {
  /** `Arrival.parts` 의 색인 */
  part: number;
  label: string;
}

/** 문장 종류 표지의 이름. 평서문은 표지가 없고, 양보문은 링이 닫히지 않는 것으로 드러난다. */
const MOOD_LABEL: Record<'ko' | 'en', Partial<Record<Mood, string>>> = {
  ko: { interrogative: '물음', negative: '아님', volitional: '다짐' },
  en: { interrogative: 'question', negative: 'not', volitional: 'will' },
};

/** 획의 묶음 키와 같은 규칙 — 역할|라벨 (`src/render/parts.ts`, `compose.ts` 의 라벨). */
export function partKeyOfConstituent(c: Constituent): string {
  if (c.kind === 'concept') return `${c.role}|${c.lemma}`;
  return `${c.role}|${c.syllables.map((s) => `${s.onset}${s.nucleus}${s.coda}`).join('')}`;
}

/** 낱말 라벨 — 소리로 적은 말은 한글, 한국어는 표제어, 영어는 영어 뜻. */
export function wordLabel(c: Constituent, lang: 'ko' | 'en', lex: Lexicon): string {
  if (c.kind === 'phonetic') return c.syllables.map(composeHangul).join('');
  return lang === 'ko' ? c.lemma : (lookup(lex, c.lemma)?.gloss_en ?? c.lemma);
}

/**
 * 해독 순서와 낱말 (화면 경험 설계 3.3).
 *
 * 순서는 먹이 처음 닿은 차례다 — 시계 방향 같은 고정 순서를 쓰면 없앤 '읽는
 * 방향' 이 되살아난다. 낱말은 원래 문장의 언어로 띄운다.
 */
export function decodeSteps(ir: IR, arr: Arrival, lex: Lexicon, text: string): DecodeStep[] {
  const lang = detectLanguage(text);
  const labels = new Map<string, string>();
  for (const c of ir.constituents) {
    labels.set(partKeyOfConstituent(c), wordLabel(c, lang, lex));
  }
  const mood = MOOD_LABEL[lang][ir.mood];
  if (mood) labels.set(`양상|${ir.mood}`, mood);

  const steps: DecodeStep[] = [];
  arr.parts.forEach((key, i) => {
    if (i === 0) return;                       // 링은 해독 대상이 아니다
    const label = labels.get(key);
    if (label !== undefined) steps.push({ part: i, label });
  });
  return steps;
}
