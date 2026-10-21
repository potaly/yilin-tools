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

/** 手机上用系统分享，桌面上直接下载 */
export async function deliver(blob: Blob, filename: string, type: string): Promise<DeliverResult> {
  const file = new File([blob], filename, { type });
  const touch =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
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
