import type { Role } from './ir';
import seed from '../../data/lexicon.seed.json' with { type: 'json' };

/** 의미 자질 8차원. 각 0..1 (설계 문서 7.1). */
export interface SemanticFeatures {
  /** 생물성 */ animacy: number;
  /** 행위성 — 능동적 주체가 될 수 있는 정도 */ agency: number;
  /** 구상성 */ concreteness: number;
  /** 정서가 (부정 0 ↔ 긍정 1) */ valence: number;
  /** 강도 */ intensity: number;
  /** 시간 관련성 */ temporality: number;
  /** 한정성 — 셀 수 있는가 / 지속적인가 */ boundedness: number;
  /** 관계성 — 둘 이상의 참여자를 전제하는 정도 */ sociality: number;
}

export const FEATURE_KEYS = [
  'animacy', 'agency', 'concreteness', 'valence',
  'intensity', 'temporality', 'boundedness', 'sociality',
] as const satisfies readonly (keyof SemanticFeatures)[];

export interface LexiconEntry {
  /**
   * 표제어 — 이 개념이 IR 에 실제로 새겨지는 유일한 이름.
   *
   * `canonicalize`(`ir.ts`)가 이 문자열을 그대로 직렬화하고, 그 직렬화 결과가
   * 렌더러 의사난수의 시드가 된다(`seedOf`, 설계 문서 6.1). 즉 lemma 문자열
   * 자체가 그림을 결정한다 — 같은 개념을 가리키는 두 문자열은 두 개의 다른
   * 목걸이를 낳는다. 그래서 조회(`lookup`)는 `aliases`/`glossAliases` 도
   * 보지만, 무엇으로 찾았든 돌아오는 lemma 는 언제나 이 필드 하나뿐이어야
   * 한다 — 개념 하나에는 IR 로 들어갈 이름이 하나뿐이다.
   */
  lemma: string;
  gloss_en: string;
  features: SemanticFeatures;
  defaultRole: Role;
  /** 씨앗 글리프 id. 계획 6에서 채운다. */
  seedGlyph: string | null;
  status: 'confirmed' | 'provisional';
  source: 'seed' | 'llm';
  addedAt: string;
  /** 같은 개념의 다른 한국어 형태 (예: 선택 의 '선택하다'). 조회는 이것도 본다. */
  aliases?: string[];
  /** 같은 개념의 다른 영어 형태 (예: 기다림 의 'wait', 'waited'). */
  glossAliases?: string[];
}

export type Lexicon = Record<string, LexiconEntry>;

/**
 * 사전 성장은 별도 레이어의 일이고, 조회용 객체는 불변이어야 한다.
 *
 * 임포트한 원본 객체를 그대로 돌려주면 `loadSeedLexicon() === loadSeedLexicon()`
 * 이 `true` 가 되어, 호출자가 반환값에 항목을 더하는 순간(계획 V 의 런타임
 * 메모이제이션, 스펙 10.3) 프로세스 전역 상태가 된다. `loadLook()` 은 매 호출마다
 * 새 객체를 주고 테스트가 그것을 잠그는데, 여기는 정확히 반대였다. 얼린
 * 복사본을 준다.
 */
export function loadSeedLexicon(): Lexicon {
  const src = seed as unknown as Lexicon;
  const out: Lexicon = {};
  for (const [lemma, entry] of Object.entries(src)) out[lemma] = Object.freeze({ ...entry });
  return Object.freeze(out);
}

/**
 * 별칭 → 표제항 색인의 사전별 캐시.
 *
 * `Lexicon` 타입은 그대로 `Record<string, LexiconEntry>` 로 남겨 둔다 —
 * 기존 소비자(렌더 테스트, `parse-en.ts` 의 `Object.values(lex)` 순회 등)가
 * 래퍼 타입에 맞춰 바뀔 필요가 없다. 대신 `lookup` 이 처음 쓰일 때 그
 * 사전 객체 하나에 대해서만 별칭 색인을 한 번 만들고, `WeakMap` 에 사전
 * 객체 자체를 키로 걸어 둔다. 사전은 얼린 객체이고 `loadSeedLexicon` 은
 * 호출마다 새 객체를 주므로(`lexicon.test.ts` 의 '호출마다 다른 객체를
 * 준다'), 객체 동일성이 그대로 캐시 키가 된다 — 같은 사전 인스턴스로 여러
 * 번 `lookup` 을 불러도 색인은 한 번만 짓고, 사전을 다시 불러오면 새
 * 색인이 새로 지어진다. `Map` 을 쓰므로(배열 인덱스 객체가 아니므로)
 * `'__proto__'` 같은 키도 안전하다.
 */
const aliasIndexCache = new WeakMap<Lexicon, Map<string, LexiconEntry>>();

function buildAliasIndex(lex: Lexicon): Map<string, LexiconEntry> {
  const idx = new Map<string, LexiconEntry>();
  for (const entry of Object.values(lex)) {
    for (const alias of entry.aliases ?? []) {
      if (!idx.has(alias)) idx.set(alias, entry);
    }
  }
  return idx;
}

/**
 * 표제어 조회. `hasOwnProperty` 로 걸러야 `'__proto__'` 나 `'toString'` 같은
 * 문자열에 프로토타입 체인의 값이 잡히지 않는다. 사용자 입력이 그대로
 * 표제어가 되므로 실제로 도달 가능한 경로다.
 *
 * 직접 표제어로 찾지 못하면 별칭 색인을 본다. 별칭으로 찾아도 반환하는
 * 항목은 그 항목의 `lemma` 필드를 그대로 갖고 있으므로(별칭 문자열이
 * 아니라), 호출자는 항상 대표 표제어를 받는다.
 */
export function lookup(lex: Lexicon, lemma: string): LexiconEntry | undefined {
  if (Object.prototype.hasOwnProperty.call(lex, lemma)) return lex[lemma];
  let idx = aliasIndexCache.get(lex);
  if (!idx) {
    idx = buildAliasIndex(lex);
    aliasIndexCache.set(lex, idx);
  }
  return idx.get(lemma);
}

/** 성분들의 자질 평균. 링 전체의 조형을 정할 때 쓴다. */
export function averageFeatures(fs: SemanticFeatures[]): SemanticFeatures {
  if (fs.length === 0) throw new Error('averageFeatures: 빈 입력');
  const acc = Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0])) as unknown as SemanticFeatures;
  for (const f of fs) for (const k of FEATURE_KEYS) acc[k] += f[k];
  for (const k of FEATURE_KEYS) acc[k] /= fs.length;
  return acc;
}

/**
 * 음소 폴백 성분에 쓰는 중립 자질. 이름은 의미 자질을 갖지 않는다.
 * 씨앗 사전의 어떤 항목과도 같지 않아야 한다 — 같으면 미등재어가
 * 어떤 등재어와 같은 그림이 된다.
 */
export const NEUTRAL_FEATURES: SemanticFeatures = {
  animacy: 0.80, agency: 0.70, concreteness: 0.85, valence: 0.55,
  intensity: 0.45, temporality: 0.15, boundedness: 0.95, sociality: 0.40,
};
