import raw from '../../design/look-v3.json' with { type: 'json' };

/**
 * 조형 파라미터 이름. `design/look-v3.json` 의 키와 정확히 일치해야 한다.
 *
 * 수치를 코드에 박지 않는다는 것이 이 층의 존재 이유다. 조형이 바뀌면
 * JSON 만 갈아끼우고 코드는 건드리지 않는다. 랩에서 슬라이더를 추가했는데
 * 여기 선언을 빠뜨리면 그 값이 조용히 무시되므로, 로드 시점에 양쪽이
 * 정확히 일치하는지 검사한다.
 */
export const LOOK_KEYS = [
  // 링
  'pR', 'pRingBase', 'pRingAmp', 'pWobble',
  'cGaps', 'cGapSize', 'cDouble', 'cDoubleGap',
  // 먹물 덩어리
  'cZones', 'cBloomSpan', 'cBloomThick', 'cBloomOut', 'cLayers', 'cBudget',
  // 가시 · 반점
  'cFringe', 'cFringeLen', 'cFringeFine', 'cFringeTip', 'cFringeBend',
  'cFringeSpan', 'cWhisker', 'cWhiskerLen', 'cSpeck', 'cSpeckR', 'cJitter',
  // 먹물 (화면 렌더러용 — 계획 III 에서 쓴다)
  'pSharp', 'pSoft', 'pDScale', 'pErode', 'pContrast', 'pFloor', 'pCore',
  'pGrainAmp', 'pGrainA', 'pGrainX', 'pInkWarp', 'pInkWarpF', 'pInkWarpS',
  // 연기
  'pFray', 'pFrayFall', 'pWisp', 'pWispFall', 'pPlume', 'pPlumeFall',
  'pGate', 'pDissolve', 'pTopFade',
  // 색 · 분위기
  'pInk', 'pInkCore', 'pBgTop', 'pBgMid', 'pBgBot', 'pFog', 'pGrain', 'pVig', 'pPaper',
  // 분사 애니메이션
  'pSprayAng', 'pLeadTurb', 'pFrontSoft',
] as const;

export type LookKey = (typeof LOOK_KEYS)[number];
export type LookParams = Record<LookKey, number>;

/**
 * 확정 조형을 읽는다. 호출할 때마다 새 객체를 돌려주므로
 * 호출자가 값을 바꿔도 다음 호출에 영향을 주지 않는다.
 */
export function loadLook(): LookParams {
  const src = raw as unknown as Record<string, unknown>;
  const out = {} as LookParams;
  const missing: string[] = [];
  for (const k of LOOK_KEYS) {
    const v = src[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) { missing.push(k); continue; }
    out[k] = v;
  }
  if (missing.length > 0) {
    throw new Error(`look-v3.json 에 없거나 숫자가 아닌 파라미터: ${missing.join(', ')}`);
  }
  const extra = Object.keys(src).filter((k) => !k.startsWith('_') && !(LOOK_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) {
    throw new Error(`look-v3.json 에 선언되지 않은 파라미터가 있다: ${extra.join(', ')}`);
  }
  return out;
}
