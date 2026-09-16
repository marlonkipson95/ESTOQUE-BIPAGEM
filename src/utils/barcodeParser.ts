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

  // 3. Manufacturer Signature Recognition & Intelligent Part Identification
  const eanVal = result.codigo_barras || '';
  const facVal = result.codigo_fabrica || '';

  // 3a. Kolbenschmidt (KS / MS Motorservice / Rheinmetall)
  // Prefix: 7890537...
  if (eanVal.startsWith('7890537') || cleanInput.toUpperCase().includes('KOLBENSCHMIDT') || cleanInput.toUpperCase().includes('MS MOTORSERVICE')) {
    result.fabricante = 'Kolbenschmidt (KS / Motorservice)';
    result.tipo_peca = 'Pistão / Anéis / Casquilho / Bronzina';

    // Digits 7 to 12 in EAN-13 contain the part number sequence (e.g. 7890537 13228 1 -> 13228)
    if (eanVal.length === 13) {
      const core = eanVal.substring(7, 12);
      result.codigo_extraido = core;
      if (!result.codigo_fabrica) {
        result.codigo_fabrica = core;
      }
    }

    if (eanVal === '7890537132281' || result.codigo_extraido === '13228' || facVal.includes('13228')) {
      result.descricao_sugerida = 'PISTÃO / ANÉIS / CASQUILHO (KS 13228)';
    } else {
      result.descricao_sugerida = 'PISTÃO / ANÉIS / CASQUILHO (KOLBENSCHMIDT KS)';
    }
  }

  // 3b. Mahle Metal Leve / Cofap
  // Prefixes: 7894766, 7892415, 7890006, 7890001
  else if (
    eanVal.startsWith('7894766') || 
    eanVal.startsWith('7892415') || 
    eanVal.startsWith('7890006') || 
    eanVal.startsWith('7890001') ||
    cleanInput.toUpperCase().includes('MAHLE') || 
    cleanInput.toUpperCase().includes('METAL LEVE')
  ) {
    result.fabricante = 'Mahle Metal Leve';
    result.tipo_peca = 'Pistão / Bronzina / Anéis / Válvulas / Filtro';
    if (eanVal.length === 13) {
      result.codigo_extraido = eanVal.substring(7, 12);
      if (!result.codigo_fabrica) {
        result.codigo_fabrica = result.codigo_extraido;
      }
    }
    result.descricao_sugerida = 'PEÇA MAHLE METAL LEVE';
  }

  // 3c. MWM (Navistar / Tupy)
  // Prefix: 7895825...
  else if (eanVal.startsWith('7895825') || facVal.startsWith('922688') || cleanInput.toUpperCase().includes('MWM')) {
    result.fabricante = 'MWM Motores';
    result.tipo_peca = 'Motor Diesel / Juntas / Cabeçote / Bielas';
    result.descricao_sugerida = 'PEÇA / MERCADORIA MWM';

    if (eanVal === '7895825126942' && !result.codigo_fabrica) {
      result.codigo_fabrica = '922688540114';
      result.codigo_extraido = '922688540114';
      result.descricao_sugerida = 'JUNTA, CABEÇOTE MOTOR (MWM)';
    } else if (facVal === '922688540114' && !result.codigo_barras) {
      result.codigo_barras = '7895825126942';
      result.codigo_extraido = '922688540114';
      result.descricao_sugerida = 'JUNTA, CABEÇOTE MOTOR (MWM)';
    } else if (eanVal.length === 13) {
      result.codigo_extraido = eanVal.substring(7, 12);
    }
  }

  // 3d. Bosch
  // Prefixes: 7891234, 7892250, 0445, F00...
  else if (
    eanVal.startsWith('7891234') || 
    eanVal.startsWith('7892250') || 
    cleanInput.startsWith('0445') || 
    cleanInput.startsWith('F00') ||
    cleanInput.toUpperCase().includes('BOSCH')
  ) {
    result.fabricante = 'Bosch';
    result.tipo_peca = 'Injeção Diesel / Bico Injetor / Bomba Alta Pressão / Sensor';
    result.descricao_sugerida = 'SISTEMA DE INJEÇÃO BOSCH';
    if (eanVal.length === 13) {
      result.codigo_extraido = eanVal.substring(7, 12);
    }
  }

  // 3e. Delphi
  // Prefix: 7896431, EJBR...
  else if (eanVal.startsWith('7896431') || cleanInput.toUpperCase().startsWith('EJBR') || cleanInput.toUpperCase().includes('DELPHI')) {
    result.fabricante = 'Delphi';
    result.tipo_peca = 'Injeção Diesel Common Rail';
    result.descricao_sugerida = 'PEÇA INJEÇÃO DELPHI';
    if (eanVal.length === 13) {
      result.codigo_extraido = eanVal.substring(7, 12);
    }
  }

  // 3f. Sabó
  // Prefix: 7891252...
  else if (eanVal.startsWith('7891252') || cleanInput.toUpperCase().includes('SABO') || cleanInput.toUpperCase().includes('SABÓ')) {
    result.fabricante = 'Sabó';
    result.tipo_peca = 'Retentor / Junta / Vedação';
    result.descricao_sugerida = 'RETENTOR / JUNTA SABÓ';
    if (eanVal.length === 13) {
      result.codigo_extraido = eanVal.substring(7, 12);
    }
  }

  // Generic fallback extraction for any EAN-13
  if (!result.codigo_extraido && eanVal.length === 13) {
    result.codigo_extraido = eanVal.substring(7, 12);
  }

  return result;
}
