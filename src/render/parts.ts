/**
 * 획 하나가 어느 묶음에 속하는지 (분해 보기·번짐·해독이 같은 규칙을 쓴다).
 *
 * 링의 획들(본체·겹선·양보의 지나침)은 라벨이 달라도 한 묶음이다. 보는
 * 사람에게는 모두 "링" 이고, 두 줄로 나오면 링이 둘인 것처럼 읽힌다.
 * 같은 낱말이라도 역할이 다르면 다른 자리에 그려지므로 다른 묶음이다.
 */
export function partKeyOf(s: { role: unknown; label: string }): string {
  const role = String(s.role);
  return role === 'ring' ? 'ring|링' : `${role}|${s.label}`;
}
