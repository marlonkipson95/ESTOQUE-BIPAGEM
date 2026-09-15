import { ScannedLabelInfo } from '../types';

/**
 * Intelligent Barcode & Factory Label Parser
 * Automatically identifies EAN Barcodes, Manufacturer Part Numbers,
 * and brand signatures (such as MWM factory labels).
 */
export function parseScannedLabel(input: string): ScannedLabelInfo {
  const cleanInput = (input || '').trim();
  if (!cleanInput) {
    return { raw: '' };
  }

  const result: ScannedLabelInfo = {
    raw: cleanInput,
  };

  // 1. Check for Compound / Multi-field Barcodes (GS1 DataMatrix, Space, Tab, or Semicolon separated)
  // GS1 format: e.g. (01)07895825126942(240)922688540114 or 0107895825126942240922688540114
  const gs1Regex = /(?:\(01\)|01)(\d{14}|\d{13})(?:\(240\)|240|\(10\)|10)?([A-Za-z0-9._-]+)?/;
  const gs1Match = cleanInput.match(gs1Regex);
  if (gs1Match) {
    let ean = gs1Match[1];
    // Strip leading 0 if 14 digits GTIN-14
    if (ean.length === 14 && ean.startsWith('0')) {
      ean = ean.substring(1);
    }
    result.codigo_barras = ean;
    if (gs1Match[2]) {
      result.codigo_fabrica = gs1Match[2];
    }
  }

  // Check for space, semicolon, pipe, slash, or newline separated values
  if (!result.codigo_barras || !result.codigo_fabrica) {
    const parts = cleanInput.split(/[\s;|\t\n]+/).filter(Boolean);
    if (parts.length >= 2) {
      for (const part of parts) {
        if (/^\d{8,14}$/.test(part) && !result.codigo_barras) {
          result.codigo_barras = part;
        } else if (!result.codigo_fabrica && part !== result.codigo_barras) {
          result.codigo_fabrica = part;
        }
      }
    }
  }

  // 2. Single Code Classification (if not already parsed as compound)
  if (!result.codigo_barras && !result.codigo_fabrica) {
    const isPureDigits = /^\d+$/.test(cleanInput);

    // EAN-13 (13 digits), EAN-8 (8 digits) or GTIN-12 (12 digits)
    if (isPureDigits && (cleanInput.length === 13 || cleanInput.length === 12 || cleanInput.length === 8)) {
      result.codigo_barras = cleanInput;
    } else if (cleanInput.includes('.') || cleanInput.includes('-') || cleanInput.includes('/') || /[A-Za-z]/.test(cleanInput)) {
      // Has letters, dots, dashes, slashes -> Factory / Part Number
      result.codigo_fabrica = cleanInput;
    } else if (isPureDigits && cleanInput.length >= 10 && cleanInput.length <= 16) {
      // 10-16 digits without standard EAN prefix can be factory part number (e.g. MWM 922688540114)
      if (cleanInput.startsWith('789')) {
        result.codigo_barras = cleanInput;
      } else {
        result.codigo_fabrica = cleanInput;
      }
    } else {
      result.codigo_barras = cleanInput;
    }
  }

  // 3. Manufacturer Signature Recognition (e.g. MWM Navistar / Tupy)
  // MWM Brazil EAN barcode prefix: 7895825...
  // MWM Part numbers often start with 922688... or 9...
  const eanVal = result.codigo_barras || '';
  const facVal = result.codigo_fabrica || '';

  if (eanVal.startsWith('7895825') || facVal.startsWith('922688') || cleanInput.toUpperCase().includes('MWM')) {
    result.fabricante = 'MWM';
    result.descricao_sugerida = 'PEÇA / MERCADORIA MWM';

    // If scanned was MWM EAN 7895825126942, part number is 922688540114
    if (eanVal === '7895825126942' && !result.codigo_fabrica) {
      result.codigo_fabrica = '922688540114';
      result.descricao_sugerida = 'JUNTA, CABEÇOTE MOTOR (MWM)';
    } else if (facVal === '922688540114' && !result.codigo_barras) {
      result.codigo_barras = '7895825126942';
      result.descricao_sugerida = 'JUNTA, CABEÇOTE MOTOR (MWM)';
    }
  }

  return result;
}
