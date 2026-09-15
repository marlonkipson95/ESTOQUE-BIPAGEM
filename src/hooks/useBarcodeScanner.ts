import { useEffect, useRef } from 'react';

interface UseBarcodeScannerProps {
  onScan: (code: string) => void;
  enabled?: boolean;
  minChars?: number;
  maxIntervalMs?: number;
}

/**
 * Hook to capture USB hardware barcode scanner inputs
 * Hardware barcode scanners emit rapid keyboard events followed by Enter (keyCode 13)
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minChars = 3,
  maxIntervalMs = 60,
}: UseBarcodeScannerProps) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is typing in a textarea or modal input specifically marked as non-scanner, let them type
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      const isScanInput = target?.getAttribute('data-scanner-input') === 'true';

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Reset buffer if too much time elapsed between keys (manual human typing)
      if (timeDiff > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        if (code.length >= minChars) {
          e.preventDefault();
          e.stopPropagation();
          onScan(code);
          bufferRef.current = '';
        } else if (isScanInput && (target as HTMLInputElement).value) {
          // If in explicit scanner input and Enter was pressed
          e.preventDefault();
          e.stopPropagation();
          onScan((target as HTMLInputElement).value.trim());
          (target as HTMLInputElement).value = '';
        }
        return;
      }

      // Collect single printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // If typing in another normal input (not the scanner input):
        if (isInput && !isScanInput) {
          // If interval is larger than maxIntervalMs, user is manually typing with keyboard
          if (timeDiff > maxIntervalMs) {
            bufferRef.current = '';
            return;
          } else {
            // Rapid keystroke stream indicates USB hardware barcode scanner!
            // Intercept and prevent dumping the barcode characters into form fields (e.g. Corredor/Baia)
            e.preventDefault();
          }
        }

        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, minChars, maxIntervalMs, onScan]);
}
