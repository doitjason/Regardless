/** 파일 이름 — 문장을 그대로 쓰되 파일 시스템이 싫어하는 글자만 지운다. */
export function fileNameFor(text: string, ext: 'svg' | 'png'): string {
  const base = text.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40);
  return `${base === '' ? '로고그램' : base}.${ext}`;
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, name: string): void {
  saveBlob(new Blob([svg], { type: 'image/svg+xml' }), name);
}

/**
 * PNG 는 SVG 를 캔버스에 그려 만든다.
 *
 * 배경을 먼저 칠한다 — 투명 PNG 를 흰 종이에 올리면 획이 보이지만 검은
 * 화면에 올리면 사라진다. 화면에서 보던 그대로 나가는 편이 덜 놀랍다.
 */
export async function downloadPng(svg: string, name: string, size: number): Promise<void> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('PNG 로 바꾸지 못했다'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 쓸 수 없다');
    ctx.fillStyle = '#f7f5f1';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (png) saveBlob(png, name);
  } finally {
    URL.revokeObjectURL(url);
  }
}
