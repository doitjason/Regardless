import type { RenderResult } from '../src/render/compose';

export interface Part {
  /** 라벨과 역할을 합친 키 — DOM 속성으로 쓴다 */
  key: string;
  label: string;
  role: string;
  count: number;
}

const ROLE_NAMES: Record<string, string> = {
  ring: '링', 행위: '행위', 행위수식: '행위수식', 주체: '주체', 주체수식: '주체수식',
  시간: '시간', 시간수식: '시간수식', 양상: '문장 종류', 정도: '정도',
  대상: '대상', 대상수식: '대상수식', 장소: '장소', 방향: '방향',
};

/**
 * 획을 낱말별로 묶는다 (스펙 3 — 분해 보기는 원칙 2 의 검증 장치다).
 *
 * 같은 낱말이라도 역할이 다르면 다른 자리에 그려지므로 따로 센다 —
 * "너는 너를" 의 두 '너' 는 서로 다른 획 묶음이다.
 */
export function partsOf(result: RenderResult): Part[] {
  const byKey = new Map<string, Part>();
  for (const s of result.strokes) {
    const role = String(s.role);
    const key = `${role}|${s.label}`;
    const found = byKey.get(key);
    if (found) found.count += 1;
    else byKey.set(key, { key, label: s.label, role, count: 1 });
  }
  return [...byKey.values()];
}

/** 사람이 읽을 한 줄. */
export function describe(part: Part): string {
  const roleName = ROLE_NAMES[part.role] ?? part.role;
  if (part.role === 'ring') return `링 — 획 ${part.count}개`;
  return `${part.label} · ${roleName} — 획 ${part.count}개`;
}
