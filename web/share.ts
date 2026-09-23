import { ENGINE_VERSION } from '../src/version';

/**
 * 공유 링크 (스펙 3 단서 조항).
 *
 * 그림을 저장하지 않는다. 같은 문장은 같은 그림을 낳으므로(원칙 1) 문장만
 * 담으면 된다. 엔진 버전을 함께 담는 이유는 그 원칙의 단서 때문이다 —
 * 조형 규칙이 바뀌면 옛 링크가 다른 그림을 내는데, 버전이 있으면 적어도
 * 무엇으로 만든 링크인지 말할 수 있다.
 */
export function encodeShare(text: string): string {
  return `#t=${encodeURIComponent(text)}&v=${encodeURIComponent(ENGINE_VERSION)}`;
}

export function decodeShare(hash: string): { text: string; version: string | null } | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return null;
  const params = new URLSearchParams(raw);
  const text = params.get('t');
  if (text === null || text.trim() === '') return null;
  return { text, version: params.get('v') };
}
