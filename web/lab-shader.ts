/**
 * 장면 실험실 셰이더 — 화면 전체가 우주선 안이다.
 *
 * 화면 경험 2단계의 원형. 안개·빛·헵타포드의 흐릿한 그림자·우주인 실루엣·
 * 연기 먹 로고그램을 한 패스에서 그린다. 마스크(R=덮임, G=도착 시각,
 * B=(묶음+1)/255)는 `web/smoke/` 와 같은 것을 쓴다.
 *
 * 영화의 이미지·크리처 디자인을 베끼지 않는다. 그림자는 형체를 알 수 없는
 * 덩어리이고, 우주인은 단순한 뒷모습 실루엣이다.
 */

/** 실험실 파라미터: [키, 라벨, 최소, 최대, 간격, 기본값]. 키는 곧 uniform 이름이다. */
export type LabParam = readonly [string, string, number, number, number, number];
export type LabGroup = readonly [string, readonly LabParam[]];

export const LAB_PARAMS: readonly LabGroup[] = [
  ['장면 — 안개와 빛', [
    ['sBright',   '안개 밝기',          0.30, 1.20, 0.01, 0.78],
    ['sDark',     '어둠 깊이',          0.00, 0.40, 0.005, 0.09],
    ['sTint',     '청록 기운',          0.00, 1.00, 0.01, 0.55],
    ['sFogDens',  '안개 농도',          0.00, 1.50, 0.01, 0.85],
    ['sFogScale', '안개 크기',          0.40, 4.00, 0.05, 1.30],
    ['sFogSpeed', '안개 흐름 속도',     0.00, 4.00, 0.05, 1.00],
    ['sLight',    '로고그램 뒤 빛',     0.00, 1.00, 0.01, 0.42],
    ['sLightY',   '빛 높이',           -0.40, 0.50, 0.01, 0.10],
    ['sFront',    '앞 안개',            0.00, 1.00, 0.01, 0.40],
    ['sVig',      '가장자리 어둠',      0.00, 1.00, 0.01, 0.62],
    ['sGrain',    '필름 그레인',        0.00, 0.10, 0.002, 0.035],
  ]],
  ['장면 — 그림자와 우주인', [
    ['sShadow',     '거대한 그림자',     0.00, 1.00, 0.01, 0.55],
    ['sShadowX',    '그림자 간격',       0.20, 1.20, 0.01, 0.72],
    ['sShadowSway', '그림자 흔들림',     0.00, 1.00, 0.01, 0.35],
    ['sAstro',      '우주인',            0.00, 1.00, 0.01, 1.00],
    ['sAstroSize',  '우주인 크기',       0.10, 0.90, 0.01, 0.26],
    ['sAstroY',     '우주인 위치',      -0.80, 0.00, 0.01, -0.44],
  ]],
  ['로고그램 배치', [
    ['sLogoX',    '가로 위치',         -0.50, 0.50, 0.01, 0.00],
    ['sLogoY',    '세로 위치',         -0.40, 0.40, 0.01, 0.06],
    ['sLogoSize', '크기 (화면 높이 대비)', 0.30, 1.40, 0.01, 0.78],
  ]],
  ['먹 — 연기 질감', [
    ['kSmoke',      '획에서 피어나는 연기', 0.00, 1.50, 0.01, 0.90],
    ['kSmokeReach', '연기 퍼짐 거리',      0.00, 0.10, 0.001, 0.035],
    ['kSmokeFlow',  '연기 흐름 속도',      0.00, 2.00, 0.01, 0.60],
    ['kHaze',       '링 안쪽 연기',        0.00, 1.00, 0.01, 0.40],
    ['kVeil',       '안개가 먹을 덮는 정도', 0.00, 1.00, 0.01, 0.30],
    ['pFray',       '보풀',               0.00, 1.00, 0.01, 0.45],
    ['pFrayFall',   '보풀 감쇠',           6.0, 90.0, 0.5, 14],
    ['pWisp',       '실오라기',            0.00, 1.00, 0.01, 0.50],
    ['pWispFall',   '실오라기 감쇠',       3.0, 40.0, 0.5, 7],
    ['pPlume',      '연기 기둥',           0.00, 1.00, 0.01, 0.60],
    ['pPlumeFall',  '기둥 감쇠',           0.5, 10.0, 0.1, 3.2],
    ['pGate',       '기둥 방향 게이트',    0.10, 0.85, 0.01, 0.38],
    ['pDissolve',   '먹 흩어짐',           0.00, 0.70, 0.01, 0.22],
  ]],
  ['먹 — 획 자체', [
    ['pSharp',    '얇은 세부 살리기',  0.00, 1.00, 0.02, 1.00],
    ['pSoft',     '내부 전이대',       0.005, 0.120, 0.001, 0.060],
    ['pDScale',   '거리장 배율',       0.10, 1.60, 0.02, 0.52],
    ['pErode',    '가장자리 침식',     0.00, 3.50, 0.01, 2.00],
    ['pContrast', '농담 대비',         0.25, 2.20, 0.01, 0.80],
    ['pFloor',    '몸통 바닥',         0.00, 1.00, 0.01, 0.55],
    ['pCore',     '짙은 심',           0.00, 1.00, 0.01, 0.86],
    ['pGrainAmp', '결 세기',           0.00, 3.00, 0.01, 1.35],
    ['pGrainA',   '결 주파수(획 방향)', 0.5, 14.0, 0.1, 3.2],
    ['pGrainX',   '결 주파수(가로)',   4.0, 70.0, 0.5, 26],
    ['pInkWarp',  '먹물 일렁임 세기',  0.0000, 0.0180, 0.0002, 0.0040],
    ['pInkWarpF', '먹물 일렁임 결',    0.60, 5.00, 0.05, 1.7],
    ['pInkWarpS', '먹물 일렁임 속도',  0.00, 0.30, 0.005, 0.045],
    ['pInk',      '먹 밝기',           0.000, 0.220, 0.002, 0.03],
    ['pInkCore',  '심 밝기',           0.000, 0.150, 0.002, 0.01],
  ]],
  ['번짐', [
    ['pLeadTurb',  '선두 난류',   0.0, 6.0, 0.05, 4.55],
    ['pFrontSoft', '선두 폭',     0.04, 0.60, 0.01, 0.20],
    ['sResScale',  '해상도 (가벼움↔선명)', 0.30, 1.00, 0.05, 0.60],
  ]],
];

/** uniform 으로 넘기지 않는 키 (자바스크립트가 쓰는 값). */
export const JS_ONLY_KEYS = new Set(['sResScale']);

export const SCENE_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform float uT, uHalf, uProg, uHighlight, uRingR;

uniform float sBright, sDark, sTint, sFogDens, sFogScale, sFogSpeed, sLight, sLightY, sFront, sVig, sGrain;
uniform float sShadow, sShadowX, sShadowSway, sAstro, sAstroSize, sAstroY;
uniform float sLogoX, sLogoY, sLogoSize;
uniform float kSmoke, kSmokeReach, kSmokeFlow, kHaze, kVeil;
uniform float pFray, pFrayFall, pWisp, pWispFall, pPlume, pPlumeFall, pGate, pDissolve;
uniform float pSharp, pSoft, pDScale, pErode, pContrast, pFloor, pCore, pGrainAmp, pGrainA, pGrainX;
uniform float pInkWarp, pInkWarpF, pInkWarpS, pInk, pInkCore;
uniform float pLeadTurb, pFrontSoft;

vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i+vec2(0,0)), f-vec2(0,0)), dot(hash2(i+vec2(1,0)), f-vec2(1,0)), u.x),
             mix(dot(hash2(i+vec2(0,1)), f-vec2(0,1)), dot(hash2(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p, int oct){
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a*gnoise(p); p = m*p; a *= 0.5; }
  return s;
}
float n01(float v){ return clamp(v * 1.9 + 0.5, 0.0, 1.0); }
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

// 우주인 — 뒷모습 실루엣. 국소 좌표: 허리 y=0, 머리 꼭대기 y≈0.95.
float astronaut(vec2 a){
  // 머리와 뒤로 묶은 머리카락
  float d = length((a - vec2(0.0, 0.855)) * vec2(1.0, 0.9)) - 0.072;
  d = smin(d, length(a - vec2(0.0, 0.79)) - 0.045, 0.03);
  d = smin(d, sdCapsule(a, vec2(0.0, 0.69), vec2(0.0, 0.77), 0.036), 0.03);   // 목
  // 몸통 — 처진 어깨에서 허리로 좁아진다. 옷이라 윤곽이 부드럽다
  float hw = mix(0.120, 0.180, smoothstep(0.08, 0.52, a.y));
  float torso = max(abs(a.x) - hw, max(a.y - 0.60, -a.y - 0.05));
  torso = smin(torso, length(a - vec2(-0.135, 0.585)) - 0.075, 0.09);
  torso = smin(torso, length(a - vec2( 0.135, 0.585)) - 0.075, 0.09);
  d = smin(d, torso, 0.06);
  // 팔 — 몸에 붙여 늘어뜨린다. 몸통과 녹아 붙게 섞는다
  d = smin(d, sdCapsule(a, vec2(-0.19, 0.55), vec2(-0.205, 0.07), 0.044), 0.05);
  d = smin(d, sdCapsule(a, vec2( 0.19, 0.55), vec2( 0.205, 0.07), 0.044), 0.05);
  // 다리 — 화면 아래로 잘린다
  d = smin(d, sdCapsule(a, vec2(-0.075, 0.0), vec2(-0.085, -0.95), 0.07), 0.03);
  d = smin(d, sdCapsule(a, vec2( 0.075, 0.0), vec2( 0.085, -0.95), 0.07), 0.03);
  return d;
}

void main(){
  float aspect = uRes.x / uRes.y;
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;       // 화면 높이 = 1, 가운데 원점
  float t = uT;

  // ── 안개 ──
  vec2 fq = q * sFogScale;
  float f1 = fbm(fq * 1.0 + vec2( t*0.010, -t*0.004) * sFogSpeed, 4);
  float f2 = fbm(fq * 2.3 + vec2(-t*0.017,  t*0.006) * sFogSpeed + f1 * 0.9, 4);
  float f3 = fbm(fq * 0.55 + vec2( t*0.005,  t*0.002) * sFogSpeed, 4);
  float fog = n01(f1 * 0.8 + f2 * 0.55 + f3 * 0.6);

  vec2 lc = vec2(sLogoX, sLightY);
  float glow = exp(-dot(q - lc, q - lc) / 0.10) * sLight;
  float lum = mix(0.30, 0.66, smoothstep(-0.55, 0.40, q.y)) + glow + (fog - 0.5) * sFogDens * 0.7;

  vec3 lightC = mix(vec3(0.74), vec3(0.66, 0.76, 0.78), sTint) * sBright;
  vec3 darkC  = mix(vec3(1.0), vec3(0.75, 0.95, 1.0), sTint) * sDark;
  vec3 col = mix(darkC, lightC, clamp(lum, 0.0, 1.0));

  // ── 거대한 그림자 — 안개 뒤의 형체를 알 수 없는 덩어리 ──
  float shadow = 0.0;
  for (int k = 0; k < 2; k++){
    float side = k == 0 ? -1.0 : 1.0;
    float sway = sin(t * 0.07 + side * 1.7) * 0.03 * sShadowSway;
    // 세로 화면에서도 그림자가 화면 밖으로 밀려나지 않게 최소 간격을 둔다
    vec2 c = vec2(side * max(aspect * 0.5 * sShadowX, 0.30) + sway, 0.18);
    vec2 d = (q - c) / vec2(0.17, 0.46);
    float body = exp(-dot(d, d) * 1.4);
    // 아래로 늘어진 몇 갈래의 흐릿한 줄기 — 손가락을 그리지 않는다
    float stem = fall(0.05, -0.75, q.y - c.y) * exp(-pow((q.x - c.x) / 0.22, 2.0));
    float streak = smoothstep(0.35, 0.85, n01(fbm(vec2((q.x - c.x) * 7.0 + side * 3.0, q.y * 0.9 + t * 0.012), 3)));
    shadow += max(body, stem * streak * 0.8);
  }
  shadow *= sShadow * (0.55 + 0.45 * fog);
  col = mix(col, darkC * 1.15, clamp(shadow, 0.0, 0.92));

  // ── 로고그램 ──
  vec2 p = (q - vec2(sLogoX, sLogoY)) * (2.0 * uHalf / sLogoSize);
  vec2 uv = p / (2.0 * uHalf) + 0.5;
  float r = length(p);

  // 먹 계산은 무겁다 — 가장 흐린 마스크에도 먹이 없고 링 밖이면 건너뛴다
  float dens = 0.0, hazeD = 0.0;
  vec3 ink = vec3(0.0);
  bool inside = all(greaterThan(uv, vec2(-0.05))) && all(lessThan(uv, vec2(1.05)));
  if (inside && (textureLod(uMask, uv, 6.5).r > 0.0015 || r < uRingR)) {

  vec2 wq = vec2(fbm(p*pInkWarpF + vec2(5.0, 9.0) + t*pInkWarpS, 3),
                 fbm(p*pInkWarpF + vec2(23.0, 3.0) - t*pInkWarpS*0.85, 3));
  vec2 uvW = uv + wq * pInkWarp;

  float m0 = mask(uvW, 0.0);
  float m1 = mask(uvW, 1.7);
  float m3 = mask(uvW, 3.6);
  float m5 = mask(uvW, 5.8);
  float d = (0.5 - m1) * pDScale;
  float od = max(0.0, d);

  // 번짐 — 도착 시각은 마스크 G 에서
  vec4 b = textureLod(uMask, uvW, 2.0);
  vec4 bw = textureLod(uMask, uvW, 5.0);
  float arrive = b.r > 0.02 ? b.g / b.r : (bw.r > 0.001 ? bw.g / bw.r : 1.0);
  float front = uProg * (1.0 + pFrontSoft);
  float reveal = fall(front, front - pFrontSoft, arrive);
  float z = (arrive - front + pFrontSoft*0.5) / max(pFrontSoft*0.55, 0.02);
  float lead = exp(-z*z) * step(0.001, uProg) * step(uProg, 0.999);
  float turb = 1.0 + lead * pLeadTurb;

  vec2 tx = 1.0 / vec2(textureSize(uMask, 0));
  vec2 g = vec2(mask(uvW + vec2(tx.x*3.0, 0.0), 1.7) - mask(uvW - vec2(tx.x*3.0, 0.0), 1.7),
                mask(uvW + vec2(0.0, tx.y*3.0), 1.7) - mask(uvW - vec2(0.0, tx.y*3.0), 1.7));
  vec2 tang = length(g) > 1e-5 ? normalize(vec2(-g.y, g.x)) : vec2(1.0, 0.0);
  vec2 nr = vec2(-tang.y, tang.x);
  vec2 pa = vec2(dot(p, tang) * pGrainA, dot(p, nr) * pGrainX);

  vec2 w1 = vec2(fbm(p*2.2 + vec2(11.3, 4.1) + t*0.030, 4), fbm(p*2.2 + vec2(27.7, 19.2) - t*0.024, 4));
  vec2 w2 = vec2(fbm(p*5.0 + w1*1.1 + vec2(3.1, 51.7) + t*0.055, 4), fbm(p*5.0 + w1*1.1 + vec2(41.9, 7.3) - t*0.045, 4));
  float nLow = fbm(p*2.4 + w1*0.9, 4);
  float nMid = fbm(p*8.5 + w2*2.2, 5);
  float nHi  = fbm(p*21.0 + w2*3.4, 4);
  float nFil = fbm(p*15.0 + w2*5.0 + nLow*2.2, 5);
  float nGr  = fbm(pa + w2*2.0, 5);

  float interior = fall(0.010, -pSoft, d + (nMid*0.022 + nHi*0.014) * pErode * turb);
  float substance = pow(n01(nGr * pGrainAmp + nLow * 0.55), pContrast);
  float body = interior * (pFloor + (1.0 - pFloor) * substance);
  float coreInk = fall(-0.004, -0.030, d) * smoothstep(0.34, 0.86, substance);
  float sharp = smoothstep(0.30, 0.72, m0) * pSharp;

  float fray = pow(smoothstep(0.26, 0.92, n01(nHi)), 1.4) * exp(-od * pFrayFall);
  float wisp = pow(smoothstep(0.38, 0.96, n01(nFil)), 1.45) * exp(-od * pWispFall / turb);
  vec2 dir = normalize(p + vec2(1e-5));
  float gate = n01(fbm(dir*2.3 + vec2(17.0, 5.0), 3));
  float plume = pow(smoothstep(0.44, 1.00, n01(nFil)), 1.2)
              * pow(clamp(m5 * 2.4, 0.0, 1.0), pPlumeFall * 0.22)
              * smoothstep(pGate, pGate + 0.42, gate) * turb;

  // 획에서 피어나는 연기 — 흐름장으로 밀린 자리의 흐린 마스크를 읽는다.
  // 먹이 물속에서 풀려나가듯 획 둘레로 가는 연기 줄기가 생기고 천천히 흐른다.
  vec2 flow = vec2(fbm(p*3.0 + vec2(1.7, 9.2) + t*0.05*kSmokeFlow, 4),
                   fbm(p*3.0 + vec2(8.3, 2.8) - t*0.05*kSmokeFlow, 4));
  float smokeSrc = mask(uvW + flow * kSmokeReach, 3.2);
  float filament = pow(n01(fbm(p*10.0 + flow*4.0 + vec2(0.0, t*0.08*kSmokeFlow), 5)), 1.6);
  float smoke = clamp(smokeSrc * 1.8, 0.0, 1.0) * filament * kSmoke * turb;

  // 링 안쪽에 고인 옅은 연기
  float haze = fall(uRingR * 0.95, uRingR * 0.35, r)
             * pow(n01(fbm(p*3.6 + flow*1.6 + vec2(t*0.02, -t*0.015), 5)), 2.2) * kHaze;

  dens = 1.0
    - (1.0 - body)
    * (1.0 - sharp)
    * (1.0 - coreInk * pCore)
    * (1.0 - fray  * pFray)
    * (1.0 - wisp  * pWisp * turb)
    * (1.0 - clamp(plume, 0.0, 1.0) * pPlume)
    * (1.0 - clamp(smoke, 0.0, 1.0))
    * (1.0 - clamp(m3 * 0.55, 0.0, 1.0) * 0.30);
  dens *= (1.0 - pDissolve) + pDissolve * n01(fbm(p*1.45 + vec2(41.0, 13.0) + t*0.018, 3));
  dens *= reveal;
  hazeD = haze * smoothstep(0.35, 1.0, uProg);

  vec3 inkC = vec3(pInk, pInk+0.012, pInk+0.016);
  vec3 coreC = vec3(pInkCore, pInkCore+0.008, pInkCore+0.011);
  ink = mix(inkC, coreC, clamp(coreInk, 0.0, 1.0));

  ivec2 ts = textureSize(uMask, 0);
  ivec2 ti = clamp(ivec2(uvW * vec2(ts)), ivec2(0), ts - 1);
  float part = floor(texelFetch(uMask, ti, 0).b * 255.0 + 0.5) - 1.0;
  float hl = (uHighlight >= 0.0 && abs(part - uHighlight) < 0.5) ? 1.0 : 0.0;
  ink = mix(ink, vec3(0.75, 0.34, 0.25), hl * 0.85);
  }

  // 안개가 먹을 살짝 덮는다 — 먹이 같은 공기 속에 있게
  float veil = kVeil * fog * 0.6;
  col = mix(col, darkC * 0.9, clamp(hazeD, 0.0, 1.0) * 0.55);
  col = mix(col, ink, clamp(dens, 0.0, 1.0) * (1.0 - veil));

  // ── 앞 안개 — 모든 것 앞을 천천히 지나간다 ──
  float ff = n01(fbm(q * 1.4 + vec2(t*0.022, t*0.003) * sFogSpeed + f3, 4));
  col = mix(col, lightC * 0.88, ff * sFront * 0.45);

  // ── 우주인 — 가장 앞, 화면 아래 ──
  vec2 a = (q - vec2(sLogoX * 0.3, sAstroY)) / sAstroSize;
  float ad = astronaut(a) * sAstroSize;
  float aA = fall(0.005, -0.006, ad);
  float rim = smoothstep(-0.012, 0.0, ad) * aA * smoothstep(0.2, 0.9, a.y) * 0.35;
  vec3 astroC = vec3(0.045, 0.05, 0.055) + lightC * rim * 0.4;
  float lowFog = fall(-0.15, -0.5, q.y) * 0.6 * sFront;
  col = mix(col, astroC, aA * sAstro * (1.0 - lowFog));

  // ── 필름 마감 ──
  col *= 1.0 - sVig * smoothstep(0.30, 0.95, length(q * vec2(0.75, 1.0)));
  col = mix(col, col * vec3(0.94, 1.0, 1.02), sTint * 0.4);
  col += (fract(sin(dot(gl_FragCoord.xy + fract(t)*31.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * sGrain;
  outColor = vec4(col, 1.0);
}`;
