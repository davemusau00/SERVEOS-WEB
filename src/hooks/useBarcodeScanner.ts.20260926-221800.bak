import { useEffect, useRef } from 'react';

export interface BarcodeScannerOptions {
  enabled?: boolean;
  minLength?: number;
  maxInterKeyDelayMs?: number;
  maxLength?: number;
  allowTabTerminator?: boolean;
  onScan: (barcode: string) => void;
}

export const normalizeBarcode = (value: string) => value.trim();

export const barcodeEquals = (candidate: unknown, scanned: string) =>
  typeof candidate === 'string' &&
  normalizeBarcode(candidate).toLowerCase() === normalizeBarcode(scanned).toLowerCase();

const editableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-barcode-capture="true"]')) return false;
  return target.isContentEditable || Boolean(target.closest('input, textarea, select'));
};

/**
 * Captures USB HID keyboard-wedge scans. Barcode input fields can opt in with
 * data-barcode-capture="true"; other editable controls are left untouched.
 */
export const useBarcodeScanner = ({
  enabled = true,
  minLength = 4,
  maxInterKeyDelayMs = 90,
  maxLength = 128,
  allowTabTerminator = false,
  onScan,
}: BarcodeScannerOptions) => {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let firstKeyAt = 0;
    let lastKeyAt = 0;

    const reset = () => {
      buffer = '';
      firstKeyAt = 0;
      lastKeyAt = 0;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return;
      }

      if (editableTarget(event.target)) {
        reset();
        return;
      }

      const now = performance.now();
      if (event.key === 'Enter' || (allowTabTerminator && event.key === 'Tab')) {
        const code = normalizeBarcode(buffer);
        const elapsed = firstKeyAt ? now - firstKeyAt : Number.POSITIVE_INFINITY;
        const scannerLike = code.length >= minLength &&
          code.length <= maxLength &&
          elapsed <= Math.max(500, code.length * maxInterKeyDelayMs);
        reset();
        if (scannerLike) {
          event.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      if (event.key.length !== 1) {
        if (event.key === 'Escape') reset();
        return;
      }

      if (!lastKeyAt || now - lastKeyAt > maxInterKeyDelayMs) {
        buffer = event.key;
        firstKeyAt = now;
      } else {
        buffer += event.key;
      }
      lastKeyAt = now;
      if (buffer.length > maxLength) reset();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', reset);
    };
  }, [enabled, minLength, maxInterKeyDelayMs, maxLength, allowTabTerminator]);
};
