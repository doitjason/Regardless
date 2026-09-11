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
  lemma: string;
  gloss_en: string;
  features: SemanticFeatures;
  defaultRole: Role;
  /** 씨앗 글리프 id. 계획 6에서 채운다. */
  seedGlyph: string | null;
  status: 'confirmed' | 'provisional';
  source: 'seed' | 'llm';
  addedAt: string;
}

export type Lexicon = Record<string, LexiconEntry>;

export function loadSeedLexicon(): Lexicon {
  return seed as unknown as Lexicon;
}

/**
 * 표제어 조회. `hasOwnProperty` 로 걸러야 `'__proto__'` 나 `'toString'` 같은
 * 문자열에 프로토타입 체인의 값이 잡히지 않는다. 사용자 입력이 그대로
 * 표제어가 되므로 실제로 도달 가능한 경로다.
 */
export function lookup(lex: Lexicon, lemma: string): LexiconEntry | undefined {
  return Object.prototype.hasOwnProperty.call(lex, lemma) ? lex[lemma] : undefined;
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
