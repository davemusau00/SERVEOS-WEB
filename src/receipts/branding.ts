import appEmblemAsset from '../../APP-LOGO.png';
import receiptLogoAsset from '../../reciept-logo.png';

export const DEFAULT_APP_EMBLEM = appEmblemAsset;
export const DEFAULT_RECEIPT_LOGO = receiptLogoAsset;
export const MAX_BRANDING_DATA_URL_LENGTH = 240_000;
export const MAX_THERMAL_LOGO_WIDTH = 576;
export const MAX_THERMAL_LOGO_HEIGHT = 220;
/** Printed Till QR target is roughly 30-36mm square at the validated 74mm content width. */
export const MAX_TILL_QR_DOTS = 320;
export const TILL_QR_TARGET_DOTS = 288;
export const MAX_TILL_QR_SOURCE_PX = 1024;
export const TILL_QR_MIN_QUIET_MODULES = 4;
export const TILL_QR_SCREEN_PX = 480;

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

/**
 * Convert a sampled dark/white grid into a packed 1-bit-per-dot ESC/POS raster.
 * Quiet-zone rows/columns are emitted as blank, so every row is a whole number of modules wide.
 */
function packQrRaster(dark: Uint8Array, modules: number, quiet: number, modulePixels: number): ThermalLogo {
  const total = modules + quiet * 2;
  const width = Math.max(1, total * modulePixels);
  const rowBytes = Math.ceil(width / 8);
  const packed = new Uint8Array(rowBytes * width);
  for (let y = 0; y < width; y++) {
    const my = Math.floor(y / modulePixels) - quiet;
    const row = y * rowBytes;
    if (my < 0 || my >= modules) continue;
    for (let x = 0; x < width; x++) {
      const mx = Math.floor(x / modulePixels) - quiet;
      if (mx >= 0 && mx < modules && dark[my * modules + mx]) packed[row + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height: width, base64: encodeBase64(packed) };
}

/** Greatest common divisor of positive run lengths, used to recover the QR module pitch. */
function runPitch(values: Uint8Array): number {
  const runs: number[] = [];
  let current = values.length ? values[0] : 0;
  for (let i = 1; i <= values.length; i++) {
    if (i < values.length && values[i] === current) continue;
    if (current > 0) runs.push(current);
    current = i < values.length ? values[i] : 0;
  }
  if (!runs.length) return 0;
  let pitch = runs[0];
  for (const run of runs) { let a = pitch; let b = run; while (b) { const t = a % b; a = b; b = t; } pitch = a; }
  return pitch;
}

export interface PreparedTillQr {
  enabled: boolean;
  dataUrl: string;
  label?: string;
  tillNumber?: string;
  thermalRaster: ThermalLogo;
}

/** Extract the QR module grid from a decoded square source image, or throw a plain-language error. */
function readQrGrid(size: number, pixels: Uint8ClampedArray): { content: Uint8Array; modules: number; quiet: number } {
  // Hard binarize: crisp module edges, never photographic dithering or smoothing.
  const grid = new Uint8Array(size * size);
  let darkCount = 0;
  for (let i = 0; i < grid.length; i++) {
    const at = i * 4;
    const luminance = pixels[at] * 0.299 + pixels[at + 1] * 0.587 + pixels[at + 2] * 0.114;
    if (luminance < 128) { grid[i] = 1; darkCount++; }
  }
  if (darkCount === 0) throw new Error('That image is blank and contains no Till QR.');
  if (darkCount / grid.length > 0.92) throw new Error('That image is almost entirely solid. Upload a clear Till QR code on a white background.');
  // Locate the printed code so the quiet zone can be measured and never cropped away.
  let top = size; let bottom = -1; let left = size; let right = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!grid[y * size + x]) continue;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
  }
  const boxWidth = right - left + 1;
  const boxHeight = bottom - top + 1;
  if (boxWidth < 20 || Math.abs(boxWidth - boxHeight) > 2) throw new Error('That image does not contain a square QR code. Upload the Till QR image itself.');
  const content = new Uint8Array(boxWidth * boxHeight);
  for (let y = 0; y < boxHeight; y++) for (let x = 0; x < boxWidth; x++) content[y * boxWidth + x] = grid[(top + y) * size + left + x];
  const pitch = runPitch(content.slice(0, boxWidth));
  if (pitch < 1 || boxWidth % pitch !== 0 || boxHeight % pitch !== 0) {
    throw new Error('That image could not be read as a QR code. Upload a crisp square Till QR, not a photo.');
  }
  const modules = boxWidth / pitch;
  if (modules < 21 || modules % 4 !== 1 || boxHeight / pitch !== modules) {
    throw new Error('That image is not a valid QR code. Upload the Till QR image itself.');
  }
  const marginModules = Math.max(0, Math.min(left, top, size - 1 - right, size - 1 - bottom) / pitch);
  // Always emit at least the required quiet zone, keeping any larger margin the operator supplied.
  return { content, modules, quiet: Math.max(TILL_QR_MIN_QUIET_MODULES, Math.min(8, Math.floor(marginModules))) };
}

/**
 * Prepare an uploaded business M-Pesa Till QR for receipt output.
 *
 * This deliberately does NOT reuse the photographic logo path: QR modules need hard edges, a square
 * source, a retained quiet zone and no dithering. The QR is never cropped to satisfy printer width.
 */
export async function prepareMpesaTillQr(blob: Blob, meta: { label?: string; tillNumber?: string } = {}): Promise<PreparedTillQr> {
  if (!blob.size || blob.size > 4 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(blob.type)) {
    throw new Error('Choose a square PNG, JPEG, or WebP Till QR smaller than 4 MB.');
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch { throw new Error('This Till QR could not be decoded. Upload a valid square image file.'); }
  try {
    if (bitmap.width < 32 || bitmap.height < 32) throw new Error('That Till QR is too small to read. Upload a larger square image.');
    if (bitmap.width !== bitmap.height) throw new Error('The Till QR must be a square image. Crop or replace it before saving.');
    if (bitmap.width > MAX_TILL_QR_SOURCE_PX) throw new Error(`The Till QR must be ${MAX_TILL_QR_SOURCE_PX} × ${MAX_TILL_QR_SOURCE_PX} pixels or smaller.`);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Till QR preparation is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const { content, modules, quiet } = readQrGrid(bitmap.width, context.getImageData(0, 0, canvas.width, canvas.height).data);
    const modulePixels = Math.floor(Math.min(TILL_QR_TARGET_DOTS, MAX_TILL_QR_DOTS) / (modules + quiet * 2));
    if (modulePixels < 2) throw new Error('That Till QR has too many modules to print reliably. Use a simpler, lower-density Till QR.');
    const thermalRaster = packQrRaster(content, modules, quiet, modulePixels);
    // Raster preview: nearest-neighbour by construction, so module edges stay crisp on paper and screen.
    const output = document.createElement('canvas');
    output.width = thermalRaster.width;
    output.height = thermalRaster.height;
    const outputContext = output.getContext('2d');
    if (!outputContext) throw new Error('Till QR preview is unavailable in this browser.');
    const image = outputContext.createImageData(output.width, output.height);
    for (let y = 0; y < output.height; y++) {
      const my = Math.floor(y / modulePixels) - quiet;
      for (let x = 0; x < output.width; x++) {
        const mx = Math.floor(x / modulePixels) - quiet;
        const on = my >= 0 && my < modules && mx >= 0 && mx < modules && content[my * modules + mx] === 1;
        const at = (y * output.width + x) * 4;
        const value = on ? 0 : 255;
        image.data[at] = value; image.data[at + 1] = value; image.data[at + 2] = value; image.data[at + 3] = 255;
      }
    }
    outputContext.putImageData(image, 0, 0);
    const dataUrl = output.toDataURL('image/png');
    if (dataUrl.length > MAX_BRANDING_DATA_URL_LENGTH) throw new Error('The prepared Till QR is too large to save safely.');
    return { dataUrl, enabled: true, label: meta.label?.trim() || undefined, tillNumber: meta.tillNumber?.trim() || undefined, thermalRaster };
  } finally {
    bitmap.close();
  }
}

export async function loadDefaultBrandingImage(url: string): Promise<PreparedBrandingImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The supplied default logo could not be loaded.');
  return prepareBrandingImage(await response.blob());
}
