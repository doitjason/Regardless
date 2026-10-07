/**
 * 장면 실험실 셰이더 v2 — 화면 전체가 우주선 안이다.
 *
 * v1 은 안개가 잘게 얼룩졌고 먹이 매끈한 띠였다. v2 의 방향:
 * - 안개: 아주 큰 덩어리가 천천히 흐르는 부드러운 그라데이션. 무늬가 거의 없다.
 * - 먹: 획 방향으로 늘어난 섬유 결, 울퉁불퉁한 굵기, 찢긴 가장자리,
 *   획에서 흘러나가는 연기 줄기(흐름장을 거슬러 올라가 먹을 찾는 방식),
 *   반투명한 연기 막, 먹 방울.
 * - 사람: 화면 아래에 걸친 상반신 뒷모습. 그림자: 아주 흐린 덩어리와 줄기.
 *
 * 노이즈는 시작할 때 한 번 텍스처로 구워 두고 읽기만 한다 (`NOISE_FS`).
 * 영화의 이미지·크리처 디자인을 베끼지 않는다 — 모든 형태는 코드로 새로 그린다.
 */

/** 실험실 파라미터: [키, 라벨, 최소, 최대, 간격, 기본값]. 키는 곧 uniform 이름이다. */
export type LabParam = readonly [string, string, number, number, number, number];
export type LabGroup = readonly [string, readonly LabParam[]];

export const LAB_PARAMS: readonly LabGroup[] = [
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
export const JS_ONLY_KEYS = new Set(['sResScale']);

/** 노이즈 텍스처 한 변 */
export const NOISE_SIZE = 512;

/**
 * 반복되는(타일링되는) 노이즈 텍스처를 굽는다. 채널마다 다른 크기의 fbm:
 * R=아주 큰 덩어리(안개), G=중간, B=잔결, A=가는 실(능선형).
 * 회전 행렬 없이 주파수를 두 배씩 올리고 격자를 주기로 감아 경계가 이어진다.
 */
export const NOISE_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform float uSize;
vec2 hash2(vec2 i, float per, float seed){
  i = mod(i, per);
  vec2 p = vec2(dot(i, vec2(127.1, 311.7)) + seed, dot(i, vec2(269.5, 183.3)) + seed * 1.7);
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec2 p, float per, float seed){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(hash2(i, per, seed), f), dot(hash2(i + vec2(1,0), per, seed), f - vec2(1,0)), u.x),
             mix(dot(hash2(i + vec2(0,1), per, seed), f - vec2(0,1)), dot(hash2(i + vec2(1,1), per, seed), f - vec2(1,1)), u.x), u.y);
}
float fbm(vec2 uv, float per, int oct, float seed){
  float a = 0.5, s = 0.0;
  vec2 p = uv * per;
  for (int k = 0; k < 8; k++){ if (k >= oct) break; s += a * gnoise(p, per, seed); p *= 2.0; per *= 2.0; a *= 0.5; }
  return s;
}
float n01(float v){ return clamp(v * 1.7 + 0.5, 0.0, 1.0); }
void main(){
  vec2 uv = gl_FragCoord.xy / uSize;
  float r = fbm(uv, 3.0, 4, 0.0);
  float g = fbm(uv, 6.0, 5, 11.0);
  float b = fbm(uv, 16.0, 4, 23.0);
  float a = 1.0 - abs(fbm(uv, 10.0, 5, 37.0)) * 2.6;
  o = vec4(n01(r), n01(g), n01(b), clamp(a, 0.0, 1.0));
}`;

export const SCENE_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uMask, uNoise;
uniform vec2 uRes;
uniform float uT, uHalf, uProg, uHighlight, uRingR;

uniform float sBright, sTint, sFogDens, sFogScale, sFogSpeed, sLight, sLightY, sBottom, sSide, sGrain, sLetterbox;
uniform float sShadow, sShadowSize, sShadowSpread, sShadowRange, sShadowDepth, sShadowSpeed, sShadowBlur;
uniform float sLogoX, sLogoY, sLogoSize;
uniform float kRag, kLump, kFiber, kFiberAmt, kSoft, pInk, kSmokeTone;
uniform float kSmoke, kSmokeLen, kSmokeFlow, kSheet, kHaze, kDrops, kVeil;
uniform float kShade, kSheen, kTilt, kDepth, kTwist, kSpin;
uniform float pLeadTurb, pFrontSoft;

vec4 nz(vec2 p){ return textureLod(uNoise, p, 0.0); }
float mask(vec2 uv, float lod){ return textureLod(uMask, uv, lod).r; }
// 경계가 뒤집힌 smoothstep 은 명세상 정의되지 않으므로 이렇게 쓴다
float fall(float hi, float lo, float x){ return 1.0 - smoothstep(lo, hi, x); }

float sdCapsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// 굵기가 한쪽 끝에서 다른 끝으로 변하는 캡슐
float sdTaper(vec2 p, vec2 a, vec2 b, float ra, float rb){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

// 헵타포드 한 마리의 부호 있는 거리 (음수 = 안쪽).
// 위로 이어져 사라지는 몸통, 넓은 손바닥, 관절이 하나씩 있는 긴 다리 다섯.
// gait 는 지금까지 걸어온 거리에 비례하는 걸음 위상이다 — 다리가 차례로 들렸다 놓인다.
float heptapod(vec2 q, vec2 c, float sz, float gait, float side, float t){
  float sp = sShadowSpread;
  float breathe = sin(t * 0.11 + side) * 0.006;
  float d = sdTaper(q, c + vec2(0.0, 0.04) * sz, c + vec2(side * 0.06, 0.80) * sz, (0.13 + breathe) * sz, 0.24 * sz);
  vec2 pc = (q - c) / (vec2(0.19, 0.095) * sz);
  d = smin(d, (length(pc) - 1.0) * 0.095 * sz, 0.06 * sz);
  for (int j = 0; j < 5; j++){
    float fj = float(j) - 2.0;
    float ph = gait + float(j) * 1.26;                 // 다리마다 어긋난 걸음
    float lift = max(0.0, sin(ph));                    // 들린 다리
    float swing = cos(ph);                             // 앞뒤로 옮겨 딛는 다리
    vec2 root = c + vec2(fj * 0.062 * sp, -0.05) * sz;
    vec2 knee = root + vec2(fj * 0.050 * sp + swing * 0.025, -0.26 + lift * 0.035) * sz;
    vec2 tip  = knee + vec2(fj * 0.075 * sp + swing * 0.050, -0.40 - abs(fj) * 0.02 + lift * 0.06) * sz;
    float r0 = (0.030 - abs(fj) * 0.003) * sz;
    float leg = sdTaper(q, root, knee, r0, r0 * 0.78);
    leg = smin(leg, sdTaper(q, knee, tip, r0 * 0.80, 0.005 * sz), 0.02 * sz);
    d = smin(d, leg, 0.035 * sz);
  }
  return d;
}

// 헵타포드 한 마리가 지금 어디에 있는가: (가로 위치, 깊이 0=가까움..1=멂, 걸음 위상).
// 서로 다른 느린 주기를 겹쳐서 좌우로 걸어 다니고, 앞으로 다가왔다 뒤로 물러난다.
// 시간의 순수 함수라 같은 시각이면 늘 같은 자리다.
vec3 roam(float id, float t, float halfW){
  float s = id * 7.31 + 1.7;
  float tt = t * sShadowSpeed;
  float x = (sin(tt * 0.031 + s) * 0.62 + sin(tt * 0.019 + s * 1.9) * 0.38) * halfW * sShadowRange
          + (id < 0.5 ? -0.30 : 0.30) * halfW;
  float z = clamp(0.5 + 0.5 * (sin(tt * 0.023 + s * 2.3) * 0.7 + sin(tt * 0.041 + s * 0.6) * 0.3), 0.0, 1.0) * sShadowDepth;
  return vec3(x, z, x * 9.0 + z * 5.0);
}

void main(){
  float aspect = uRes.x / uRes.y;
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uT;

  // ── 안개: 아주 큰 덩어리 몇 겹이 천천히 흐른다. 무늬가 아니라 밝기의 흐름이다 ──
  float l1 = nz(q * 0.32 * sFogScale + vec2(t * 0.0035, t * 0.0012) * sFogSpeed).r;
  float l2 = nz(q * 0.55 * sFogScale + vec2(-t * 0.0050, t * 0.0018) * sFogSpeed + vec2(0.37, 0.11)).r;
  float l3 = nz(q * 0.95 * sFogScale + vec2(t * 0.0080, -t * 0.0025) * sFogSpeed + vec2(0.71, 0.53)).g;
  float billow = (l1 * 0.50 + l2 * 0.33 + l3 * 0.17) - 0.5;

  vec2 lc = vec2(sLogoX, sLightY);
  float light = exp(-pow((q.x - lc.x) / 0.95, 2.0) - pow((q.y - lc.y) / 0.55, 2.0));
  float halfW = max(aspect * 0.5, 0.3);
  float lum = 0.58
    + light * sLight * 0.34
    - smoothstep(0.0, 0.55, -q.y) * sBottom * 0.30
    - smoothstep(0.35, 1.0, abs(q.x) / halfW) * sSide * 0.22
    + billow * sFogDens * 0.22;

  vec3 lightC = mix(vec3(0.86), vec3(0.80, 0.87, 0.88), sTint) * sBright;
  vec3 deepC  = mix(vec3(0.20), vec3(0.15, 0.20, 0.22), sTint);
  vec3 col = mix(deepC, lightC, clamp(lum, 0.0, 1.0));

  // ── 헵타포드 — 안개 깊은 곳을 걸어 다니는 두 형체 ──
  // 가까이 오면 크고 짙고 또렷하고, 멀어지면 작고 옅고 흐려지며 조금 위로 물러난다.
  // 먼 것부터 그려서 가까운 것이 앞을 가린다. 앞을 지나는 안개 자락이 윤곽을
  // 흐트러뜨리고, 다리 끝은 바닥 안개에, 몸통 위쪽은 빛 속에 녹는다.
  vec3 hA = roam(0.0, t, halfW), hB = roam(1.0, t, halfW);
  for (int k = 0; k < 2; k++){
    bool aFar = hA.y >= hB.y;
    vec3 h = (k == 0) == aFar ? hA : hB;
    float side = ((k == 0) == aFar) ? -1.0 : 1.0;
    float z = h.y;
    float sz = sShadowSize * mix(1.20, 0.62, z);
    vec2 c = vec2(h.x, 0.18 + z * 0.12);
    float wisp = (nz(q * 1.1 + vec2(t * 0.006, side * 0.3)).g - 0.5) * 0.05
               + (nz(q * 2.6 + vec2(-t * 0.010, side * 0.7)).b - 0.5) * 0.015;
    float d = heptapod(q, c, sz, h.z, side, t) + wisp;
    float blur = sShadowBlur * mix(1.0, 2.6, z);
    float a = fall(blur, -blur, d);
    a *= mix(0.55, 1.0, fall(0.0, -0.10, d));
    a *= smoothstep(-0.62, -0.28, q.y) * (1.0 - smoothstep(0.25, 0.55, q.y) * 0.4);
    a *= sShadow * mix(1.0, 0.42, z) * (0.88 + 0.3 * (l2 - 0.5));
    vec3 shC = mix(deepC, lightC, 0.08 + z * 0.24);
    col = mix(col, shC, clamp(a, 0.0, 1.0));
  }

  // ── 로고그램 — 공간 속에 떠 있는 판 ──
  // 로고그램을 3D 공간의 판으로 놓고 아주 천천히 기울인다. 화면 픽셀에서 판으로
  // 광선을 쏘아 맞는 자리를 읽으므로 원근이 그대로 생긴다 — 링이 비스듬히 돈 타원이
  // 되고, 판의 깊이(z)로 어느 쪽이 먼지 정확히 안다.
  // 세로 화면(폰)에서는 높이가 아니라 폭에 맞춘다 — 그러지 않으면 링이 좌우로 잘린다
  float logoSize = sLogoSize * min(1.0, aspect * 1.05);
  vec2 s0 = (q - vec2(sLogoX, sLogoY)) * (2.0 * uHalf / logoSize);
  float yaw = (sin(t * 0.050 * kSpin) * 0.75 + sin(t * 0.021 * kSpin + 2.0) * 0.25) * 0.42 * kTilt;
  float pitch = (sin(t * 0.037 * kSpin + 1.3) * 0.7 + sin(t * 0.017 * kSpin + 0.4) * 0.3) * 0.26 * kTilt;
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), spt = sin(pitch);
  vec3 E1 = vec3(cy, 0.0, -sy);
  vec3 E2 = vec3(spt * sy, cp, spt * cy);
  vec3 N = vec3(cp * sy, -spt, cp * cy);
  const float CAM = 3.2;
  vec3 dirR = vec3(s0, -CAM);
  vec3 X = vec3(0.0, 0.0, CAM) + dirR * (-(N.z * CAM) / dot(N, dirR));
  vec2 p = vec2(dot(X, E1), dot(X, E2));
  float planeZ = X.z;                                  // + 가까움, - 멂
  vec2 uv = p / (2.0 * uHalf) + 0.5;
  float r = length(p);
  float inkA = 0.0;
  vec3 inkCol = vec3(0.0);

  bool inside = all(greaterThan(uv, vec2(-0.1))) && all(lessThan(uv, vec2(1.1)));
  if (inside && (textureLod(uMask, uv, 6.5).r > 0.001 || r < uRingR)) {
    // 번짐 — 도착 시각은 마스크 G 에서
    vec4 b = textureLod(uMask, uv, 2.0);
    vec4 bw = textureLod(uMask, uv, 5.0);
    float arrive = b.r > 0.02 ? b.g / b.r : (bw.r > 0.001 ? bw.g / bw.r : 1.0);
    float front = uProg * (1.0 + pFrontSoft);
    float reveal = fall(front, front - pFrontSoft, arrive);
    float z = (arrive - front + pFrontSoft * 0.5) / max(pFrontSoft * 0.55, 0.02);
    float lead = exp(-z * z) * step(0.001, uProg) * step(uProg, 0.999);
    float turb = 1.0 + lead * pLeadTurb;

    // 찢긴 가장자리 — 마스크를 읽는 자리를 두 크기의 노이즈로 흔든다
    vec2 n1 = nz(p * 0.85 + vec2(0.13, 0.71) + t * 0.0025).gb - 0.5;
    vec2 n2 = nz(p * 2.4 + vec2(0.57, 0.29) - t * 0.004).ba - 0.5;
    vec2 uvR = uv + (n1 * 0.020 + n2 * 0.008) * kRag * turb;

    float m1 = mask(uvR, 0.6);
    float m2 = mask(uvR, 2.2);
    float m4 = mask(uvR, 4.0);

    // ── 입체감 1: 깊이 — 판의 먼 쪽은 가늘고 조금 흐리고 안개에 묻힌다 ──
    float ang = atan(p.y, p.x);
    float far = clamp(0.5 - planeZ * 2.4, 0.0, 1.0) * kDepth;

    // 울퉁불퉁한 굵기 — 덩어리 진 곳은 두껍게, 먼 쪽은 가늘게
    float lump = nz(p * 1.25 + vec2(0.31, 0.83)).g - 0.5;
    float thr = 0.5 - lump * 0.42 * kLump + far * 0.07;
    float soft = 0.015 + kSoft * 0.15 + far * 0.06;
    float body = smoothstep(thr - soft, thr + 0.02 + far * 0.03, m1);

    // 섬유 결 — 획 방향으로 길게 늘어난 노이즈
    vec2 tx = 1.0 / vec2(textureSize(uMask, 0));
    vec2 g = vec2(mask(uvR + vec2(tx.x * 4.0, 0.0), 2.2) - mask(uvR - vec2(tx.x * 4.0, 0.0), 2.2),
                  mask(uvR + vec2(0.0, tx.y * 4.0), 2.2) - mask(uvR - vec2(0.0, tx.y * 4.0), 2.2));
    vec2 nrm = length(g) > 1e-5 ? normalize(g) : vec2(0.0, 1.0);   // 획 안쪽을 향한다
    vec2 tang = vec2(-nrm.y, nrm.x);
    float fib = nz(vec2(dot(p, tang) * 0.6, dot(p, nrm) * 7.0) * kFiber + vec2(0.17, 0.43)).a;
    body *= mix(1.0 - kFiberAmt, 1.0, smoothstep(0.15, 0.75, fib));

    // ── 입체감 2: 밧줄처럼 꼬인 결 — 획을 비스듬히 감아 도는 줄무늬 ──
    // 가로지르는 위치(가장자리 0 → 가운데 1)와 둘레를 따라 잰 길이로 나선을 만든다.
    float across = clamp((m1 - thr) * 3.0, 0.0, 1.0);
    float along = ang * max(r, 0.05);
    float twist = sin(along * 38.0 * kFiber + across * 4.0 + (nz(p * 1.1 + vec2(0.9, 0.1)).g - 0.5) * 12.0);
    body *= 1.0 - kTwist * 0.32 * (0.5 + 0.5 * twist) * smoothstep(0.1, 0.6, across);

    // 흘러나가는 연기 — 흐름장을 거슬러 올라가며 먹을 찾는다.
    // 거슬러 간 자리에 먹이 있으면 이 픽셀은 그 먹이 흘려보낸 연기 줄기 위에 있다.
    vec2 pp = p;
    float acc = 0.0, wsum = 0.0;
    vec2 outward = -nrm;
    for (int i = 1; i <= 8; i++){
      vec2 f = nz(pp * 0.7 + vec2(0.0, t * 0.006 * kSmokeFlow)).gr - 0.5;
      vec2 v = normalize(f * 2.0 + outward * 0.8 + vec2(0.0, 0.25));
      pp -= v * kSmokeLen * 0.125 * (2.0 * uHalf);
      float w = 1.0 - float(i) / 9.0;
      acc += mask(pp / (2.0 * uHalf) + 0.5, 1.6) * w;
      wsum += w;
    }
    float trail = acc / wsum;
    // 연기는 띠가 아니라 가는 실이어야 한다 — 실 모양 노이즈로 강하게 자른다
    float wispy = nz(p * 1.6 + vec2(t * 0.002 * kSmokeFlow, 0.0)).a;
    float strands = smoothstep(0.55, 0.97, wispy);
    float smoke = trail * strands * kSmoke * turb * (1.0 - body);

    // 반투명한 연기 막 — 몇 군데에서만 넓게 퍼진다
    float sheetGate = smoothstep(0.52, 0.80, nz(p * 0.35 + vec2(0.61, t * 0.0015)).r);
    // 거친 밉맵을 그대로 문턱 처리하면 네모난 자국이 남는다 — 흐름을 따라 번진 trail 로 만든다
    float sheet = smoothstep(0.0, 0.35, trail + m4 * 0.3) * sheetGate * nz(p * 0.9 + vec2(0.2, t * 0.003)).g * kSheet;

    // 링 안쪽에 고인 옅은 연기
    float haze = fall(uRingR * 0.95, uRingR * 0.30, r)
               * smoothstep(0.45, 0.85, nz(p * 0.6 + vec2(t * 0.002, 0.33)).g) * kHaze;

    // 먹 방울 — 덩어리 근처에 흩뿌려진 작은 점
    float dropN = nz(p * 4.5 + vec2(0.77, 0.19)).b;
    float drops = smoothstep(0.80, 0.86, dropN) * smoothstep(0.08, 0.35, m2) * (1.0 - body) * kDrops;

    float a = 1.0 - (1.0 - body) * (1.0 - drops)
                  * (1.0 - clamp(smoke, 0.0, 1.0) * 0.65)
                  * (1.0 - clamp(sheet, 0.0, 1.0) * 0.45)
                  * (1.0 - haze * smoothstep(0.4, 1.0, uProg) * 0.40);
    // 먹 색: 단단한 먹(획·방울)의 비중만큼 짙고, 나머지는 옅은 연기 색
    vec3 coreC = vec3(pInk, pInk + 0.010, pInk + 0.016);

    // ── 입체감 3: 굴곡 음영과 젖은 광택 — 흐린 마스크를 높이로 보고 빛을 비춘다 ──
    // 빛은 로고그램 뒤 위쪽의 밝은 안개에서 온다. 한쪽 가장자리는 밝고 반대쪽은
    // 그늘이 져서 획이 납작한 띠가 아니라 둥근 줄기로 읽힌다.
    vec3 nrm3 = normalize(vec3(-g * 18.0 * kShade, 1.0));
    vec3 L = normalize(vec3(-0.30, 0.80, 0.55));
    float diff = clamp(dot(nrm3, L), 0.0, 1.0);
    float sheen = pow(clamp(dot(reflect(-L, nrm3), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 9.0);
    sheen *= 0.6 + 0.4 * (0.5 + 0.5 * twist);
    vec3 litCore = coreC + lightC * (0.09 * (diff - 0.6) * kShade + 0.14 * sheen * kSheen);
    litCore = max(litCore, vec3(0.0));

    vec3 smokeC = mix(coreC, lightC, kSmokeTone * 0.5);
    float solid = clamp(body + drops, 0.0, 1.0);
    inkCol = mix(smokeC, litCore, clamp(solid / max(a, 1e-3), 0.0, 1.0));
    // 먼 쪽은 안개 색으로 물러난다
    inkCol = mix(inkCol, mix(deepC, lightC, 0.50), far * 0.28);
    a *= reveal;

    ivec2 ts = textureSize(uMask, 0);
    ivec2 ti = clamp(ivec2(uv * vec2(ts)), ivec2(0), ts - 1);
    float part = floor(texelFetch(uMask, ti, 0).b * 255.0 + 0.5) - 1.0;
    float hl = (uHighlight >= 0.0 && abs(part - uHighlight) < 0.5) ? 1.0 : 0.0;
    inkCol = mix(inkCol, vec3(0.75, 0.34, 0.25), hl * 0.85);
    inkA = clamp(a, 0.0, 1.0);
  }
  col = mix(col, inkCol, inkA * (1.0 - kVeil * 0.5 * (0.5 + billow)));

  // ── 앞 안개 — 아주 옅게 모든 것 앞을 지나간다 ──
  float ff = nz(q * 0.45 + vec2(t * 0.009, t * 0.001) * sFogSpeed + vec2(0.5, 0.2)).r;
  col = mix(col, lightC * 0.92, smoothstep(0.45, 0.85, ff) * 0.12 * sFogDens);

  // ── 필름 마감 ──
  col *= 1.0 - 0.18 * smoothstep(0.55, 1.25, length(q * vec2(0.7 / max(aspect, 0.6), 1.0)));
  col += (fract(sin(dot(gl_FragCoord.xy + fract(t * 7.0) * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * sGrain;
  // 영화 화면비 띠 — 넓은 화면에서만
  // 세로·정사각 화면에서 띠를 두면 그림이 좁아질 뿐이다 — 가로로 넓을 때만 둔다
  float barH = sLetterbox * smoothstep(1.2, 1.5, aspect) * clamp((1.0 - aspect / 2.39) * 0.5, 0.0, 0.13);
  if (abs(q.y) > 0.5 - barH) col = vec3(0.0);
  outColor = vec4(col, 1.0);
}`;
