/**
 * FNV-1a 32비트 해시. 결정성의 토대이므로 구현을 절대 바꾸지 않는다.
 * 바꾸면 모든 기존 로고그램의 형태가 변한다.
 */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 의사난수 생성기. 시드가 같으면 수열이 같다.
 * 이것 역시 구현을 바꾸면 기존 로고그램이 변하므로 고정한다.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
