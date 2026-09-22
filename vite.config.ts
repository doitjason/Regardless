import { defineConfig } from 'vite';

// 웹앱의 뿌리는 web/ 이지만, 엔진 코드(src/)와 사전(data/)을 임포트해야 하므로
// 저장소 루트를 파일 접근 허용 범위에 둔다.
export default defineConfig({
  root: 'web',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
});
