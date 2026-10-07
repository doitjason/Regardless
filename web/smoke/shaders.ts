/**
 * 1단계: 골격 삼각형을 마스크 텍스처(R=덮임, G=도착 시각, B=(묶음+1)/255)에 그린다.
 * 묶음에 1 을 더하는 것은 0번(링)이 지워진 배경(B=0)과 겹치지 않게 하려는 것이다.
 */
export const MASK_VS = `#version 300 es
in vec4 aV;
uniform float uHalf;
out vec2 vTP;
void main(){ vTP = aV.zw; gl_Position = vec4(aV.xy / uHalf, 0.0, 1.0); }`;

export const MASK_FS = `#version 300 es
precision highp float;
in vec2 vTP;
out vec4 o;
void main(){ o = vec4(1.0, vTP.x, (vTP.y + 1.0) / 255.0, 1.0); }`;

/** 2단계: 화면 전체 삼각형 하나. */
export const SMOKE_VS = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
