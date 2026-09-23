# Regardless

한국어나 영어 문장을 영화 《컨택트》(*Arrival*) 의 헵타포드 B 양식 로고그램으로 바꾼다.
같은 뜻이면 언어가 달라도 같은 그림이 나온다 — "그럼에도 불구하고 나는 너를 사랑해" 와
"Regardless, I love you" 는 한 그림이다.

비상업 팬 창작물이다. Paramount Pictures 및 영화 제작진과 무관하다.
원작 로고그램 디자인 Martine Bertrand. 분석 자료 출처
[Wolfram Research](https://github.com/WolframResearch/Arrival-Movie-Live-Coding) (CC BY-NC 4.0).
이 저장소는 원본 이미지를 담지 않는다 — 모든 획은 규칙에서 만들어진다.

## 웹앱

```bash
npm install
npm run dev      # 개발 서버
npm run build    # dist/ 에 정적 파일 생성
```

### 배포 (Vercel)

1. Vercel 에서 이 저장소를 가져온다
2. Framework Preset 은 **Other**, Build Command `npm run build`, Output Directory `dist`
   (`vercel.json` 에 이미 적혀 있다)
3. 환경변수는 필요 없다 — 사전은 번들에 들어가고 서버 호출이 없다

사전에 없는 말을 LLM 으로 해석하는 기능(계획 VI)이 붙으면 그때 서버리스 함수와
`OPENAI_API_KEY` 가 필요하다. 지금은 없다.

## 명령줄

```bash
npx tsx src/cli.ts --text "그럼에도 불구하고 나는 너를 사랑해" --out out.svg
npx tsx src/cli.ts --text "Regardless, I love you" --necklace --cut --out cut.svg
```

`--cut` 은 목걸이 절단용 파일이다 (기본 지름 20mm, 최소 획·틈 0.5mm — `--size`,
`--min-stroke-mm`, `--min-gap-mm` 로 바꾼다). 제작 검사를 통과하지 못하면 파일을 쓰지 않는다.

## 개발

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
```

설계 문서: `docs/superpowers/specs/2026-09-11-heptapod-b-design.md`
