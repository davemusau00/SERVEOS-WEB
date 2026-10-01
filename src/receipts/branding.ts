import appEmblemAsset from '../../APP-LOGO.png';
import receiptLogoAsset from '../../reciept-logo.png';

export const DEFAULT_APP_EMBLEM = appEmblemAsset;
export const DEFAULT_RECEIPT_LOGO = receiptLogoAsset;
export const MAX_BRANDING_DATA_URL_LENGTH = 240_000;
export const MAX_THERMAL_LOGO_WIDTH = 576;
export const MAX_THERMAL_LOGO_HEIGHT = 220;

export interface ThermalLogo {
  width: number;
  height: number;
  base64: string;
}

export interface PreparedBrandingImage {
  dataUrl: string;
  thermalLogo: ThermalLogo;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

/** Decode once, composite transparency to white, and create bounded browser/thermal variants. */
export async function prepareBrandingImage(blob: Blob): Promise<PreparedBrandingImage> {
  if (!blob.size || blob.size > 8 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(blob.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP logo smaller than 8 MB.');
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch { throw new Error('This image could not be decoded. Choose a valid PNG, JPEG, or WebP file.'); }
  try {
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > 4096 || bitmap.height > 4096) {
      throw new Error('Logo dimensions must be between 1 and 4096 pixels.');
    }
    const scale = Math.min(1, 720 / bitmap.width, 360 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Logo preview is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    if (dataUrl.length > MAX_BRANDING_DATA_URL_LENGTH) throw new Error('The normalized logo is too large to save safely. Choose a simpler or smaller image.');

    const thermalScale = Math.min(1, MAX_THERMAL_LOGO_WIDTH / canvas.width, MAX_THERMAL_LOGO_HEIGHT / canvas.height);
    const width = Math.max(1, Math.round(canvas.width * thermalScale));
    const height = Math.max(1, Math.round(canvas.height * thermalScale));
    const thermalCanvas = document.createElement('canvas');
    thermalCanvas.width = width;
    thermalCanvas.height = height;
    const thermalContext = thermalCanvas.getContext('2d', { willReadFrequently: true });
    if (!thermalContext) throw new Error('Thermal logo conversion is unavailable in this browser.');
    thermalContext.fillStyle = '#fff';
    thermalContext.fillRect(0, 0, width, height);
    thermalContext.drawImage(canvas, 0, 0, width, height);
    const pixels = thermalContext.getImageData(0, 0, width, height).data;
    const rowBytes = Math.ceil(width / 8);
    const packed = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const luminance = Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114);
        if (luminance < 168) packed[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { dataUrl, thermalLogo: { width, height, base64: encodeBase64(packed) } };
  } finally {
    bitmap.close();
  }
}

export async function loadDefaultBrandingImage(url: string): Promise<PreparedBrandingImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The supplied default logo could not be loaded.');
  return prepareBrandingImage(await response.blob());
}
