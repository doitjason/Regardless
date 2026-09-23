import type { Constituent, Role } from './ir';
import type { Lexicon } from './lexicon';
import { syllabify } from './phonology';

/**
 * 영어 → 성분 (설계 문서 7.4).
 *
 * 어순(SVO)과 전치사로 역할을 추정한다. 사전 항목의 `gloss_en` 이 영어 낱말을
 * 한국어 표제어로 잇는 다리다 — 같은 뜻이면 같은 IR 이어야 하기 때문이다
 * (스펙 6.1).
 *
 * `mood` 는 여기서 보지 않는다 — `detectMoodEn` 이 먼저 표지어를 덜어낸다.
 */

/** 버리는 낱말 — 뜻을 나르지 않는다. */
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'that', 'this', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'it']);

/** 영어 대명사 → 한국어 표제어. `gloss_en` 이 잇지 못하는 이형태만 적는다. */
const PRONOUNS: Record<string, string> = {
  i: '나', me: '나', my: '나', mine: '나',
  you: '너', your: '너', yours: '너',
  we: '우리', us: '우리', our: '우리',
};

/** 장소를 이끄는 전치사. */
const PLACE_PREP = new Set(['in', 'at', 'on', 'under', 'over', 'inside']);
/** 방향을 이끄는 전치사. */
const DIR_PREP = new Set(['into', 'toward', 'towards', 'through']);

/**
 * 불규칙 과거형 → 기본형. 규칙 어미(-ed/-s/-ing)를 떼는 것으로는 닿지 못한다.
 * 사전에 있는 동사만 적는다 — 없는 낱말을 적어 봐야 조회가 실패할 뿐이다.
 */
const IRREGULAR: Record<string, string> = {
  met: 'meet', saw: 'see', seen: 'see', went: 'go', gone: 'go', came: 'come',
  ate: 'eat', gave: 'give', given: 'give', took: 'take', heard: 'hear',
  said: 'say', lost: 'lose', found: 'find', thought: 'think', knew: 'know',
  known: 'know', forgot: 'forget', forgotten: 'forget', began: 'begin',
  ran: 'run', wrote: 'write', slept: 'sleep', felt: 'feel', held: 'hold',
  left: 'leave', kept: 'keep', died: 'die', born: 'born', was: 'be', were: 'be',
};

/** 영어 낱말을 한국어 표제어로. 못 찾으면 null. */
function toLemma(word: string, lex: Lexicon, glossIndex: Map<string, string>): string | null {
  const w0 = word.toLowerCase();
  const w = IRREGULAR[w0] ?? w0;
  if (PRONOUNS[w]) return PRONOUNS[w];
  const direct = glossIndex.get(w);
  if (direct) return direct;
  // 단순 굴절: loves → love, waiting → wait, loved → love
  for (const [suffix, cut] of [['ing', 3], ['es', 2], ['ed', 2], ['s', 1]] as const) {
    if (w.length > cut + 2 && w.endsWith(suffix)) {
      const base = w.slice(0, -cut);
      const hit = glossIndex.get(base) ?? glossIndex.get(`${base}e`);
      if (hit) return hit;
    }
  }
  return null;
}

export function parseEn(text: string, lex: Lexicon): Constituent[] {
  // gloss_en/glossAliases → lemma 색인. 사전은 불변이므로 매 호출 만들어도
  // 결과가 같다. `glossAliases` 를 같이 넣어야 한 개념의 다른 영어 형태
  // (기본형·불규칙 과거형 등)가 모두 같은 lemma 에 닿는다 — 그래야 별칭
  // 형태가 IR 에서 개념을 다시 갈라놓지 않는다 (설계 문서 6.1).
  const glossIndex = new Map<string, string>();
  for (const entry of Object.values(lex)) {
    glossIndex.set(entry.gloss_en.toLowerCase(), entry.lemma);
    for (const alias of entry.glossAliases ?? []) glossIndex.set(alias.toLowerCase(), entry.lemma);
  }

  const words = text.trim().split(/[\s,.;:!?]+/).filter(Boolean);
  const out: Constituent[] = [];

  // 동사 위치를 먼저 찾는다 — 그 앞이 주체, 뒤가 대상이다.
  let verbAt = -1;
  for (let i = 0; i < words.length; i++) {
    const lemma = toLemma(words[i]!, lex, glossIndex);
    if (lemma && lex[lemma]?.defaultRole === '행위') { verbAt = i; break; }
  }

  let pendingPrep: 'place' | 'dir' | null = null;
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]!;
    const w = raw.toLowerCase();
    if (PLACE_PREP.has(w)) { pendingPrep = 'place'; continue; }
    if (DIR_PREP.has(w)) { pendingPrep = 'dir'; continue; }
    if (STOP.has(w)) continue;

    const lemma = toLemma(raw, lex, glossIndex);
    const entry = lemma ? lex[lemma] : undefined;

    let role: Role;
    if (pendingPrep === 'place') role = '장소';
    else if (pendingPrep === 'dir') role = '방향';
    else if (i === verbAt) role = '행위';
    else if (entry && entry.defaultRole === '시간') role = '시간';
    else if (entry && entry.defaultRole === '시간수식') role = '시간수식';
    else if (entry && entry.defaultRole === '행위수식') role = '행위수식';
    else if (verbAt >= 0 && i < verbAt) role = '주체';
    else if (verbAt >= 0 && i > verbAt) role = '대상';
    else role = entry ? entry.defaultRole : '대상';
    pendingPrep = null;

    // 파서는 양상 역할을 만들지 않는다 (스펙 6.2).
    if (role === '양상') role = '대상';

    if (lemma && entry) { out.push({ kind: 'concept', lemma, role }); continue; }

    // 사전에 없는 영어 낱말은 그대로 버린다 (계획 III 과제 3, Step 4의 선택 (a)).
    // 로마자 → 한글 음절 변환 없이 음소 폴백을 만들면 `Louise` 와 `루이즈` 가
    // 같은 그림이 되어야 한다는 요구를 반쪽짜리 변환으로 흉내 내게 된다 —
    // 그런 변환은 "같은 뜻이면 같은 그림" 이라는 약속(스펙 6.1)을 조용히 깬다.
    // 한글이 섞여 있는 낱말만(영어 문장에 한글 표제어가 직접 등장하는 경우)
    // 음소 폴백을 만든다.
    const syllables = syllabify(raw);
    if (syllables.length > 0) out.push({ kind: 'phonetic', syllables, role });
  }

  return out;
}
