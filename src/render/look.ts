import raw from '../../design/look-v3.json' with { type: 'json' };
import necklaceRaw from '../../design/look-necklace.json' with { type: 'json' };

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
  'cPassSpan', 'cPassOut',
  // 먹물 덩어리
  'cZones', 'cBloomSpan', 'cBloomThick', 'cBloomOut', 'cLayers', 'cBudget',
  // 가시 · 반점
  'cFringe', 'cFringeLen', 'cFringeFine', 'cFringeTip', 'cFringeBend',
  'cFringeSpan', 'cWhisker', 'cWhiskerLen', 'cSpeck', 'cSpeckR', 'cJitter',
  // 문장 종류 표지
  'cMoodLen', 'cMoodThick',
  'cFringeRoot',
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
export function loadLook(source: Record<string, unknown> = raw as unknown as Record<string, unknown>): LookParams {
  const src = source;
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
  // 문서용 키는 **값의 타입**으로 가려낸다. 이름으로 가려내면 숫자 파라미터가
  // 실수로 '_' 로 시작할 때 조용히 무시된다 — 이 모듈이 막으려는 바로 그 상황이다.
  const extra = Object.keys(src).filter(
    (k) => typeof src[k] === 'number' && !(LOOK_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) {
    throw new Error(`look-v3.json 에 선언되지 않은 파라미터가 있다: ${extra.join(', ')}`);
  }
  return out;
}

/**
 * 목걸이 전용 조형 (설계 문서 12.3).
 *
 * 화면 룩을 하한까지 굵혀 내보내면 가시가 사각 막대가 되고 링 틈은 메워진다.
 * 투각은 제약이 다르므로 수치를 따로 갖는다. 키 계약은 화면 룩과 같다.
 */
export function loadNecklaceLook(): LookParams {
  return loadLook(necklaceRaw as Record<string, unknown>);
}
