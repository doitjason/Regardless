import raw from '../../design/scene.json';

/**
 * 장면 파라미터 — [키, 라벨, 최소, 최대, 간격, 예비값]. 키는 곧 셰이더의 uniform 이름이다.
 * 실제 값은 `design/scene.json` (사용자가 장면 실험실에서 고른 기준값).
 * 예비값은 실험실 슬라이더의 처음 위치로만 쓰고, 사이트는 scene.json 을 읽는다.
 */
export type SceneParam = readonly [key: string, label: string, min: number, max: number, step: number, fallback: number];
export type SceneGroup = readonly [name: string, rows: readonly SceneParam[]];

export const SCENE_PARAMS: readonly SceneGroup[] = [
  ['장면 — 안개와 빛', [
    ['sBright',    '안개 밝기',        0.40, 1.20, 0.01, 0.86],
    ['sTint',      '청록 기운',        0.00, 1.00, 0.01, 0.65],
    ['sFogDens',   '안개 덩어리 세기', 0.00, 2.00, 0.01, 1.00],
    ['sFogScale',  '안개 덩어리 크기', 0.30, 3.00, 0.05, 1.00],
    ['sFogSpeed',  '안개 흐름 속도',   0.00, 4.00, 0.05, 1.00],
    ['sLight',     '위쪽 빛',          0.00, 1.00, 0.01, 0.55],
    ['sLightY',    '빛 높이',         -0.30, 0.60, 0.01, 0.22],
    ['sBottom',    '아래쪽 어둠',      0.00, 1.00, 0.01, 0.55],
    ['sSide',      '양옆 어둠',        0.00, 1.00, 0.01, 0.45],
    ['sGrain',     '필름 그레인',      0.00, 0.08, 0.002, 0.022],
    ['sLetterbox', '영화 화면비 띠',   0.00, 1.00, 1.00, 1.00],
  ]],
  ['장면 — 헵타포드', [
    ['sShadow',       '진하기',             0.00, 1.00, 0.01, 0.82],
    ['sShadowSize',   '크기',               0.50, 1.80, 0.01, 1.00],
    ['sShadowSpread', '다리 벌어짐',        0.40, 2.00, 0.01, 1.00],
    ['sShadowRange',  '좌우로 다니는 범위', 0.00, 1.20, 0.01, 0.80],
    ['sShadowDepth',  '앞뒤로 오가는 폭',   0.00, 1.00, 0.01, 0.80],
    ['sShadowSpeed',  '움직임 속도',        0.00, 3.00, 0.01, 1.00],
    ['sShadowBlur',   '흐림',               0.004, 0.10, 0.001, 0.030],
  ]],
  ['로고그램 배치', [
    ['sLogoX',    '가로 위치',            -0.50, 0.50, 0.01, 0.00],
    ['sLogoY',    '세로 위치',            -0.40, 0.40, 0.01, 0.07],
    ['sLogoSize', '크기 (화면 높이 대비)', 0.30, 1.40, 0.01, 0.74],
  ]],
  ['먹 — 획', [
    ['kRag',      '가장자리 찢김',     0.00, 2.00, 0.01, 0.45],
    ['kLump',     '굵기 울퉁불퉁',     0.00, 2.00, 0.01, 0.90],
    ['kFiber',    '섬유 결 촘촘함',    0.30, 3.00, 0.05, 1.00],
    ['kFiberAmt', '섬유 결 세기',      0.00, 1.00, 0.01, 0.45],
    ['kSoft',     '획 가장자리 부드러움', 0.00, 1.00, 0.01, 0.10],
    ['pInk',      '먹 밝기',           0.000, 0.200, 0.002, 0.030],
    ['kSmokeTone','연기 밝기',         0.05, 0.50, 0.01, 0.12],
  ]],
  ['먹 — 연기', [
    ['kSmoke',     '흘러나가는 연기',   0.00, 2.00, 0.01, 1.00],
    ['kSmokeLen',  '연기 줄기 길이',    0.00, 0.20, 0.002, 0.075],
    ['kSmokeFlow', '연기 흐름 속도',    0.00, 3.00, 0.01, 0.70],
    ['kSheet',     '반투명 연기 막',    0.00, 1.50, 0.01, 0.20],
    ['kHaze',      '링 안쪽 연기',      0.00, 1.00, 0.01, 0.25],
    ['kDrops',     '먹 방울',           0.00, 1.00, 0.01, 0.50],
    ['kVeil',      '안개가 먹을 덮음',  0.00, 1.00, 0.01, 0.08],
  ]],
  ['먹 — 입체감', [
    ['kShade',  '굴곡 음영',           0.00, 1.50, 0.01, 0.70],
    ['kSheen',  '젖은 먹 광택',        0.00, 1.50, 0.01, 0.45],
    ['kTilt',   '공간에서 기울기',     0.00, 1.00, 0.01, 0.55],
    ['kDepth',  '먼 쪽이 안개에 묻힘',  0.00, 1.00, 0.01, 0.50],
    ['kTwist',  '밧줄처럼 꼬인 결',    0.00, 1.00, 0.01, 0.30],
    ['kSpin',   '기울기가 바뀌는 속도', 0.00, 2.00, 0.01, 0.50],
  ]],
  ['번짐', [
    ['pLeadTurb',  '선두 난류',             0.0, 6.0, 0.05, 2.5],
    ['pFrontSoft', '선두 폭',               0.04, 0.60, 0.01, 0.20],
    ['sResScale',  '해상도 (가벼움↔선명)', 0.30, 1.00, 0.05, 0.80],
  ]],
];

/** uniform 으로 넘기지 않는 키 (자바스크립트가 쓰는 값). */
export const JS_ONLY_KEYS: ReadonlySet<string> = new Set(['sResScale']);

export const SCENE_KEYS: readonly string[] = SCENE_PARAMS.flatMap(([, rows]) => rows.map((r) => r[0]));

/**
 * 장면 기준값을 읽는다. `loadLook` 과 같은 계약 — 빠진 키도, 선언되지 않은
 * 숫자 키도 던진다. 문서용 키는 값의 타입(문자열)으로 가려낸다.
 */
export function loadScene(source: Record<string, unknown> = raw as Record<string, unknown>): Record<string, number> {
  const missing = SCENE_KEYS.filter((k) => typeof source[k] !== 'number' || !Number.isFinite(source[k]));
  if (missing.length > 0) throw new Error(`scene.json 에 없거나 숫자가 아닌 값: ${missing.join(', ')}`);
  const extra = Object.keys(source).filter((k) => typeof source[k] === 'number' && !SCENE_KEYS.includes(k));
  if (extra.length > 0) throw new Error(`scene.json 에 선언되지 않은 값: ${extra.join(', ')}`);
  const out: Record<string, number> = {};
  for (const k of SCENE_KEYS) out[k] = source[k] as number;
  return out;
}
