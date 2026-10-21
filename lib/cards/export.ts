/**
 * 导出：桌面端直接下载，手机端优先调系统分享（可以存进相册或发给微信）。
 * 体积大的库（jszip / jspdf）都用动态 import，不进首屏 bundle。
 */

export interface PageImage {
  blob: Blob;
  name: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type DeliverResult = 'shared' | 'downloaded' | 'cancelled';

/** 触摸设备，用来决定走系统分享还是直接下载 */
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

function toFiles(pages: PageImage[]): File[] {
  return pages.map((p) => new File([p.blob], p.name, { type: 'image/png' }));
}

/** 手机上能不能一次分享这些图片 */
export function canSharePages(pages: PageImage[]): boolean {
  if (!pages.length || !isTouchDevice()) return false;
  try {
    return navigator.canShare?.({ files: toFiles(pages) }) ?? false;
  } catch {
    return false;
  }
}

/** 手机上用系统分享，桌面上直接下载 */
export async function deliver(blob: Blob, filename: string, type: string): Promise<DeliverResult> {
  const file = new File([blob], filename, { type });
  if (isTouchDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export async function savePage(page: PageImage): Promise<DeliverResult> {
  return deliver(page.blob, page.name, 'image/png');
}

/**
 * 保存全部图片。
 *
 * 手机上直接把多张 PNG 交给系统分享——这样「存储 N 张图像」才会进相册；
 * 打包成 zip 的话系统只会给「存储到文件」，到不了相册。
 * 桌面端以及分享不可用时，回落到 zip 下载。
 */
export async function saveAllImages(
  pages: PageImage[],
  zipName: string,
): Promise<DeliverResult> {
  if (canSharePages(pages)) {
    try {
      // 图片早就生成好了，这里不做耗时操作，免得丢掉用户手势
      await navigator.share({ files: toFiles(pages) });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // 分享失败就走 zip
    }
  }
  return saveZip(pages, zipName);
}

export async function saveZip(pages: PageImage[], filename: string): Promise<DeliverResult> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const p of pages) zip.file(p.name, p.blob);
  const blob = await zip.generateAsync({ type: 'blob' });
  return deliver(blob, filename, 'application/zip');
}

export async function savePdf(
  pages: PageImage[],
  size: { width: number; height: number },
  filename: string,
): Promise<DeliverResult> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    unit: 'px',
    format: [size.width, size.height],
    orientation: 'portrait',
    compress: true,
  });
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage([size.width, size.height], 'portrait');
    const dataUrl = await blobToDataUrl(pages[i].blob);
    pdf.addImage(dataUrl, 'PNG', 0, 0, size.width, size.height, undefined, 'FAST');
  }
  return deliver(pdf.output('blob'), filename, 'application/pdf');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
