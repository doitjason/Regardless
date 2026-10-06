import type { LookKey } from '../../src/render/look';

/** 셰이더가 `uniform float` 으로 읽는 룩 키. 값은 `design/look-v3.json`. */
export const SMOKE_LOOK_KEYS = [
  'pSharp', 'pSoft', 'pDScale', 'pErode', 'pContrast', 'pFloor', 'pCore',
  'pGrainAmp', 'pGrainA', 'pGrainX', 'pInkWarp', 'pInkWarpF', 'pInkWarpS',
  'pFray', 'pFrayFall', 'pWisp', 'pWispFall', 'pPlume', 'pPlumeFall', 'pGate',
  'pDissolve', 'pTopFade', 'pInk', 'pInkCore', 'pBgTop', 'pBgMid', 'pBgBot',
  'pFog', 'pGrain', 'pVig', 'pLeadTurb', 'pFrontSoft',
] as const satisfies readonly LookKey[];

/** 1단계: 골격 삼각형을 마스크 텍스처(R=덮임, G=도착 시각, B=묶음/255)에 그린다. */
export const MASK_VS = `#version 300 es
in vec4 aV;
uniform float uHalf;
out vec2 vTP;
void main(){ vTP = aV.zw; gl_Position = vec4(aV.xy / uHalf, 0.0, 1.0); }`;

export const MASK_FS = `#version 300 es
precision highp float;
in vec2 vTP;
out vec4 o;
void main(){ o = vec4(1.0, vTP.x, vTP.y / 255.0, 1.0); }`;

/** 2단계: 화면 전체 삼각형 하나. */
export const SMOKE_VS = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export const SMOKE_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform float uT, uHalf, uProg, uHighlight;

uniform float pSoft, pErode, pContrast, pFloor, pCore, pGrainAmp, pGrainA, pGrainX, pDScale;
uniform float pInkWarp, pInkWarpF, pInkWarpS, pSharp;
uniform float pFray, pFrayFall, pWisp, pWispFall, pPlume, pPlumeFall, pGate, pDissolve, pTopFade;
uniform float pInk, pInkCore, pBgTop, pBgMid, pBgBot, pFog, pGrain, pVig;
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

void main(){
  vec2 suv = gl_FragCoord.xy / uRes;
  // p 공간: 화면의 짧은 변이 ±uHalf 에 맞는다. 마스크도 같은 정사각형이다.
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) * (2.0 * uHalf);
  vec2 uv = p / (2.0 * uHalf) + 0.5;

  // 먹물 자체의 일렁임 — 마스크를 읽는 좌표를 아주 약하게 워프한다 (9.5.1a)
  vec2 wq = vec2(fbm(p*pInkWarpF + vec2(5.0, 9.0) + uT*pInkWarpS, 3),
                 fbm(p*pInkWarpF + vec2(23.0, 3.0) - uT*pInkWarpS*0.85, 3));
  vec2 uvW = uv + wq * pInkWarp;

  float m0 = mask(uvW, 0.0);
  float m1 = mask(uvW, 1.7);
  float m3 = mask(uvW, 3.6);
  float m5 = mask(uvW, 5.8);

  float d = (0.5 - m1) * pDScale;
  float od = max(0.0, d);

  // 번짐: 도착 시각은 마스크 G 에 있다. 흐린 단계에서 G/R 을 읽으면
  // 획 바깥 가장자리도 가까운 먹의 평균 도착 시각을 얻는다.
  vec4 b = textureLod(uMask, uvW, 2.0);
  float arrive = b.r > 0.02 ? b.g / b.r : 1.0;
  float front = uProg * (1.0 + pFrontSoft);
  float reveal = smoothstep(front, front - pFrontSoft, arrive);
  float lead = exp(-pow((arrive - front + pFrontSoft*0.5) / max(pFrontSoft*0.55, 0.02), 2.0))
             * step(0.001, uProg) * step(uProg, 0.999);

  // 획의 결 방향 — 흐린 마스크의 기울기에서 접선을 얻는다
  vec2 tx = 1.0 / vec2(textureSize(uMask, 0));
  vec2 g = vec2(mask(uvW + vec2(tx.x*3.0, 0.0), 1.7) - mask(uvW - vec2(tx.x*3.0, 0.0), 1.7),
                mask(uvW + vec2(0.0, tx.y*3.0), 1.7) - mask(uvW - vec2(0.0, tx.y*3.0), 1.7));
  vec2 tang = length(g) > 1e-5 ? normalize(vec2(-g.y, g.x)) : vec2(1.0, 0.0);
  vec2 nr = vec2(-tang.y, tang.x);
  vec2 pa = vec2(dot(p, tang) * pGrainA, dot(p, nr) * pGrainX);

  vec2 w1 = vec2(fbm(p*2.2 + vec2(11.3, 4.1) + uT*0.030, 4),
                 fbm(p*2.2 + vec2(27.7, 19.2) - uT*0.024, 4));
  vec2 w2 = vec2(fbm(p*5.0 + w1*1.1 + vec2(3.1, 51.7) + uT*0.055, 4),
                 fbm(p*5.0 + w1*1.1 + vec2(41.9, 7.3) - uT*0.045, 4));
  float nLow   = fbm(p*2.4 + w1*0.9, 4);
  float nMid   = fbm(p*8.5 + w2*2.2, 5);
  float nHi    = fbm(p*21.0 + w2*3.4, 4);
  float nFil   = fbm(p*15.0 + w2*5.0 + nLow*2.2, 5);
  float nGrain = fbm(pa + w2*2.0, 5);

  float turb = 1.0 + lead * pLeadTurb;

  float interior = smoothstep(0.010, -pSoft, d + (nMid*0.022 + nHi*0.014) * pErode * turb);
  float substance = pow(n01(nGrain * pGrainAmp + nLow * 0.55), pContrast);
  float body = interior * (pFloor + (1.0 - pFloor) * substance);
  float coreInk = smoothstep(-0.004, -0.030, d) * smoothstep(0.34, 0.86, substance);
  // 얇은 세부 — LOD 0 을 직접 섞어야 가시가 살아남는다 (9.5.1c)
  float sharp = smoothstep(0.30, 0.72, m0) * pSharp;

  float fray = pow(smoothstep(0.26, 0.92, n01(nHi)), 1.4) * exp(-od * pFrayFall);
  float wisp = pow(smoothstep(0.38, 0.96, n01(nFil)), 1.45) * exp(-od * pWispFall / turb);
  vec2 dir = normalize(p + vec2(1e-5));
  float gate = n01(fbm(dir*2.3 + vec2(17.0, 5.0), 3));
  float plume = pow(smoothstep(0.44, 1.00, n01(nFil)), 1.2)
              * pow(clamp(m5 * 2.4, 0.0, 1.0), pPlumeFall * 0.22)
              * smoothstep(pGate, pGate + 0.42, gate) * turb;

  float dens = 1.0
    - (1.0 - body)
    * (1.0 - sharp)
    * (1.0 - coreInk * pCore)
    * (1.0 - fray  * pFray)
    * (1.0 - wisp  * pWisp * turb)
    * (1.0 - clamp(plume, 0.0, 1.0) * pPlume)
    * (1.0 - clamp(m3 * 0.55, 0.0, 1.0) * 0.34);
  dens *= 1.0 - smoothstep(0.34, 1.05, p.y) * pTopFade;
  dens *= (1.0 - pDissolve) + pDissolve * n01(fbm(p*1.45 + vec2(41.0, 13.0) + uT*0.018, 3));
  dens *= reveal;

  // 배경 — 1단계는 룩랩의 안개를 그대로 쓴다. 어두운 방·유리벽은 2단계.
  vec3 bg = mix(vec3(pBgTop, pBgTop+0.049, pBgTop+0.055),
                vec3(pBgMid, pBgMid+0.043, pBgMid+0.040), smoothstep(0.04, 0.66, suv.y));
  bg = mix(bg, vec3(pBgBot, pBgBot+0.042, pBgBot+0.044), smoothstep(0.72, 0.99, suv.y));
  bg += fbm(p*1.15 + vec2(7.0, 2.0) + uT*0.02, 4) * pFog;

  vec3 inkC = vec3(pInk, pInk+0.017, pInk+0.021);
  vec3 coreC = vec3(pInkCore, pInkCore+0.010, pInkCore+0.014);
  vec3 ink = mix(inkC, coreC, clamp(coreInk, 0.0, 1.0));

  // 해독 강조 — 이 픽셀의 묶음 번호가 uHighlight 면 먹을 따뜻하게 밝힌다
  ivec2 ts = textureSize(uMask, 0);
  ivec2 ti = clamp(ivec2(uvW * vec2(ts)), ivec2(0), ts - 1);
  float part = floor(texelFetch(uMask, ti, 0).b * 255.0 + 0.5);
  float hl = (uHighlight >= 0.0 && abs(part - uHighlight) < 0.5) ? 1.0 : 0.0;
  ink = mix(ink, vec3(0.75, 0.34, 0.25), hl * 0.85);

  vec3 col = mix(bg, ink, clamp(dens, 0.0, 1.0));
  col *= 1.0 - pVig * smoothstep(0.55, 1.35, length(p * vec2(0.62, 1.0)));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453) - 0.5) * pGrain;
  outColor = vec4(col, 1.0);
}`;
