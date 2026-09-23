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
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'and', 'that', 'this', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'it']);

/** 관사 — 시간 명사 앞에 붙으면 부사가 아니라 문장 성분이라는 신호다 (I1). */
const ARTICLES = new Set(['the', 'a', 'an']);

/**
 * 계사 — 인식되는 `행위` 표제어가 문장에 없을 때 주체/대상을 가르는 자리
 * 대신으로 쓴다 (I1, `the morning is bright`). 계사 자체는 STOP 으로
 * 버려지므로 개념을 만들지 않지만, 자리(순서)는 남겨 둔다.
 */
const COPULA = new Set(['is', 'am', 'are', 'was', 'were']);

/**
 * 영어 대명사 → 한국어 표제어. `gloss_en` 이 잇지 못하는 이형태만 적는다.
 *
 * 3인칭(she/he/they 등)은 사전에 표제어가 없다 (`그녀`·`그` 항목 없음). 성별·수를
 * 지어내는 임의 매핑(예: `she`→`그녀` 를 새로 만드는 것) 대신, 이미 사전에 있는
 * 가장 가까운 개념 `사람`(사람, defaultRole 대상)으로 잇는다 — "그 사람이 나를
 * 사랑해" 가 "she loves me" 의 자연스러운 한국어 대응이기 때문이다(I4). 낱말을
 * 통째로 버리면(선택지 b) `She loves me` 와 `Love me` 가 같은 목걸이가 되어
 * 문장에 주체가 있다는 사실 자체가 사라진다 — 그쪽이 더 큰 손실이라 (a)를 골랐다.
 * `it` 은 사람이 아니므로 여기 넣지 않고 STOP 으로 버린다(기존 동작 유지).
 */
const PRONOUNS: Record<string, string> = {
  i: '나', me: '나', my: '나', mine: '나',
  you: '너', your: '너', yours: '너',
  we: '우리', us: '우리', our: '우리',
  she: '사람', he: '사람', they: '사람',
  him: '사람', her: '사람', his: '사람', their: '사람', theirs: '사람', them: '사람',
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
  // 축약형('m/'re/'ll/'ve/'d/'s)은 대명사 표에서 먼저 풀어 본다 — I'm → I,
  // you're → you. 대명사가 아니면 이 잘린 형태는 버리고 원래 낱말로 계속한다
  // (Louise's 같은 소유격까지 잘못 잘라 엉뚱한 표제어를 찾지 않도록).
  const clit = w0.replace(/'(m|re|ll|ve|d|s)$/, '');
  if (PRONOUNS[w0]) return PRONOUNS[w0];
  if (clit !== w0 && PRONOUNS[clit]) return PRONOUNS[clit];

  // 불규칙 표보다 표면형을 먼저 사전에서 찾는다. `thought` 는 그 자체가
  // `생각` 의 gloss 다 — 불규칙 표가 먼저 `think` 로 바꿔 버리면(사전에 없는
  // 기본형) 존재하는 gloss 를 가로채 아무 데도 닿지 못하게 만든다 (I3).
  const direct0 = glossIndex.get(w0);
  if (direct0) return direct0;

  const base = IRREGULAR[w0];
  if (base) {
    const directBase = glossIndex.get(base);
    if (directBase) return directBase;
  }

  // 단순 굴절: loves → love, waiting → wait, loved → love
  for (const [suffix, cut] of [['ing', 3], ['es', 2], ['ed', 2], ['s', 1]] as const) {
    if (w0.length > cut + 2 && w0.endsWith(suffix)) {
      const stem = w0.slice(0, -cut);
      const hit = glossIndex.get(stem) ?? glossIndex.get(`${stem}e`);
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

  // 사전에 있는 `행위` 표제어가 문장에 없으면(`the morning is bright` 처럼
  // 서술어가 미등재어인 경우) 계사의 자리를 대신 쓴다. 계사는 뜻을 나르지
  // 않아 STOP 으로 버려지지만, 주체/대상을 가르는 자리 정보는 남는다 (I1).
  let copulaAt = -1;
  if (verbAt < 0) {
    for (let i = 0; i < words.length; i++) {
      if (COPULA.has(words[i]!.toLowerCase())) { copulaAt = i; break; }
    }
  }
  const pivotAt = verbAt >= 0 ? verbAt : copulaAt;

  let pendingPrep: 'place' | 'dir' | 'compare' | null = null;
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]!;
    const w = raw.toLowerCase();
    // 동사 뒤의 `like` 는 동사(좋아함)가 아니라 비교 전치사다 — 한국어 `처럼` 과 같은
    // 대상수식 자리 (`I love you like a star` = `너를 별처럼 사랑해`).
    if (w === 'like' && verbAt >= 0 && i > verbAt) { pendingPrep = 'compare'; continue; }
    if (PLACE_PREP.has(w)) { pendingPrep = 'place'; continue; }
    if (DIR_PREP.has(w)) { pendingPrep = 'dir'; continue; }
    if (STOP.has(w)) continue;

    const lemma = toLemma(raw, lex, glossIndex);
    const entry = lemma ? lex[lemma] : undefined;
    const prevWord = (words[i - 1] ?? '').toLowerCase();

    let role: Role;
    // `in`/`at` 같은 장소 전치사 뒤라도 시간 낱말은 장소가 아니라 시간이다
    // (I2) — 한국어 '에' 가 조형이 아니라 temporality 로 갈리는 것과 같다.
    if (pendingPrep === 'place') role = entry && entry.defaultRole === '시간' ? '시간' : '장소';
    else if (pendingPrep === 'dir') role = '방향';
    else if (pendingPrep === 'compare') role = '대상수식';
    else if (i === verbAt) role = '행위';
    // 관사 + 시간 명사는 부사가 아니라 문장 성분이다 (I1: `I love the night`
    // → 대상, `the morning is bright` → 주체). 관사가 없는 시간 낱말(`I wait
    // today`, `we met yesterday`)은 그대로 부사적 `시간` 으로 남긴다 — 한국어
    // 쪽에서 조사 없이 쓰이는 시간 부사와 같은 자리다.
    else if (entry && entry.defaultRole === '시간' && pivotAt >= 0 && i !== pivotAt && ARTICLES.has(prevWord)) {
      role = i < pivotAt ? '주체' : '대상';
    }
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
