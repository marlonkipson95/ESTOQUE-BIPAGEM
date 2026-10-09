import { Router, Request, Response } from 'express';
import { getDbPool } from '../db.js';
import { fetchCosmosProduct } from '../cosmos.js';

export const produtosRouter = Router();

// Fallback in-memory store if DATABASE_URL is not set yet
interface MemoryProduct {
  id: string;
  codigo_atual: string;
  codigo_fabrica: string;
  codigo_barras_atual: string;
  descricao: string;
  custo_unitario: number;
  preco_tabela?: number;
  preco_sugerido?: number;
  preco_minimo?: number;
  quantidade: number;
  estoque_minimo: number;
  corredor: string;
  baia: string;
  nivel: string;
  locacao: string;
  codigos_alternativos?: string[];
  produtos_relacionados?: any[];
  total_genericos?: number;
  codigos_genericos?: string[];
  criado_em: string;
  atualizado_em: string;
}

interface MemoryCodeHistory {
  id: number;
  produto_id: string;
  tipo: 'codigo_barras' | 'codigo_produto' | 'codigo_fabrica' | 'codigo_alternativo';
  codigo: string;
  ativo: boolean;
  criado_em: string;
  desativado_em?: string;
  motivo: string;
}

interface MemoryRelatedProduct {
  id: number;
  produto_id: string;
  relacionado_id: string;
  motivo: string;
  criado_em: string;
}

// In-memory contingency store (inicia vazio sem produtos fictícios)
let memoryProducts: MemoryProduct[] = [];
let memoryCodeHistory: MemoryCodeHistory[] = [];
let memoryImportBatches: any[] = [];
let memoryMovements: any[] = [];
let memoryRelatedProducts: MemoryRelatedProduct[] = [];

async function loadProductExtras(client: any, product: any) {
  if (!product) return product;
  try {
    const rels = await client.query(`
      SELECT DISTINCT pr.id as rel_id, pr.motivo, p.id, p.codigo_atual, p.descricao, p.codigo_barras_atual, p.codigo_fabrica, p.quantidade, p.locacao, p.corredor, p.baia, p.nivel, p.preco_tabela, p.preco_sugerido, p.preco_minimo
      FROM produtos_relacionados pr
      JOIN produtos p ON (p.id = CASE WHEN pr.produto_id = $1 THEN pr.relacionado_id ELSE pr.produto_id END)
      WHERE (pr.produto_id = $1 OR pr.relacionado_id = $1) AND p.id <> $1
    `, [product.id]);
    product.produtos_relacionados = rels.rows.map((r: any) => ({
      ...r,
      quantidade: Number(r.quantidade) || 0,
      preco_tabela: Number(r.preco_tabela) || 0,
      preco_sugerido: Number(r.preco_sugerido) || 0,
      preco_minimo: Number(r.preco_minimo) || 0,
    }));
    product.total_genericos = product.produtos_relacionados.length;
    product.codigos_genericos = product.produtos_relacionados.map((r: any) => r.codigo_fabrica || r.codigo_atual).filter(Boolean);
  } catch (e) {
    product.produtos_relacionados = [];
    product.total_genericos = 0;
    product.codigos_genericos = [];
  }

  if (typeof product.codigos_alternativos === 'string') {
    product.codigos_alternativos = product.codigos_alternativos
      .replace(/[\[\]"']/g, '')
      .split(/[,;\n]/)
      .map((s: string) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(product.codigos_alternativos)) {
    product.codigos_alternativos = product.codigos_alternativos
      .map((s: any) => String(s).replace(/[\[\]"']/g, '').trim())
      .filter(Boolean);
  } else {
    product.codigos_alternativos = [];
  }
  product.custo_unitario = Number(product.custo_unitario) || 0;
  product.preco_tabela = Number(product.preco_tabela) || 0;
  product.preco_sugerido = Number(product.preco_sugerido) || 0;
  product.preco_minimo = Number(product.preco_minimo) || 0;
  return product;
}

function loadMemoryProductExtras(product: any) {
  if (!product) return product;
  const relLinks = memoryRelatedProducts.filter(r => r.produto_id === product.id || r.relacionado_id === product.id);
  product.produtos_relacionados = relLinks.map(r => {
    const targetId = r.produto_id === product.id ? r.relacionado_id : r.produto_id;
    const target = memoryProducts.find(p => p.id === targetId);
    return target ? {
      rel_id: r.id,
      motivo: r.motivo,
      id: target.id,
      codigo_atual: target.codigo_atual,
      descricao: target.descricao,
      codigo_barras_atual: target.codigo_barras_atual,
      codigo_fabrica: target.codigo_fabrica,
      quantidade: target.quantidade,
      locacao: target.locacao,
      corredor: target.corredor,
      baia: target.baia,
      nivel: target.nivel,
      preco_tabela: Number(target.preco_tabela) || 0,
      preco_sugerido: Number(target.preco_sugerido) || 0,
      preco_minimo: Number(target.preco_minimo) || 0,
    } : null;
  }).filter(Boolean);
  product.total_genericos = product.produtos_relacionados.length;
  product.codigos_genericos = product.produtos_relacionados.map((r: any) => r.codigo_fabrica || r.codigo_atual).filter(Boolean);

  if (typeof product.codigos_alternativos === 'string') {
    product.codigos_alternativos = product.codigos_alternativos
      .replace(/[\[\]"']/g, '')
      .split(/[,;\n]/)
      .map((s: string) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(product.codigos_alternativos)) {
    product.codigos_alternativos = product.codigos_alternativos
      .map((s: any) => String(s).replace(/[\[\]"']/g, '').trim())
      .filter(Boolean);
  } else {
    product.codigos_alternativos = [];
  }
  return product;
}

// ==========================================
// 1. GET /api/health
// ==========================================
// 1. GET /api/health
// Função inteligente para identificar fabricante automotivo e código de miolo
function identifyBarcodeInfo(code: string) {
  const clean = (code || '').trim();
  const ean = clean.replace(/[\s\.-]/g, '');
  let fabricante = '';
  let tipo_peca = '';
  let codigo_extraido = '';
  let descricao_sugerida = '';

  if (ean.startsWith('7890537') || clean.toUpperCase().includes('KOLBENSCHMIDT') || clean.toUpperCase().includes('MS MOTORSERVICE')) {
    fabricante = 'Kolbenschmidt (KS / Motorservice)';
    tipo_peca = 'Pistão / Anéis / Casquilho / Bronzina';
    if (ean.length === 13) {
      codigo_extraido = ean.substring(7, 12);
    }
    descricao_sugerida = codigo_extraido ? `PISTÃO / ANÉIS / CASQUILHO (KS ${codigo_extraido})` : 'PISTÃO / ANÉIS / CASQUILHO (KS)';
  } else if (
    ean.startsWith('7894766') || 
    ean.startsWith('7892415') || 
    ean.startsWith('7890006') || 
    ean.startsWith('7890001') || 
    clean.toUpperCase().includes('MAHLE') || 
    clean.toUpperCase().includes('METAL LEVE')
  ) {
    fabricante = 'Mahle Metal Leve';
    tipo_peca = 'Pistão / Bronzina / Anéis / Válvulas / Filtro';
    if (ean.length === 13) {
      codigo_extraido = ean.substring(7, 12);
    }
    descricao_sugerida = 'PEÇA MAHLE METAL LEVE';
  } else if (ean.startsWith('7895825') || clean.toUpperCase().includes('MWM')) {
    fabricante = 'MWM Motores';
    tipo_peca = 'Motor Diesel / Juntas / Cabeçote / Bielas';
    if (ean === '7895825126942') {
      codigo_extraido = '922688540114';
      descricao_sugerida = 'JUNTA, CABEÇOTE MOTOR (MWM)';
    } else {
      if (ean.length === 13) codigo_extraido = ean.substring(7, 12);
      descricao_sugerida = 'PEÇA / MERCADORIA MWM';
    }
  } else if (ean.startsWith('7891234') || ean.startsWith('7892250') || clean.startsWith('0445') || clean.startsWith('F00')) {
    fabricante = 'Bosch';
    tipo_peca = 'Injeção Diesel / Bico Injetor / Bomba Alta Pressão / Sensor';
    if (ean.length === 13) codigo_extraido = ean.substring(7, 12);
    descricao_sugerida = 'SISTEMA DE INJEÇÃO BOSCH';
  } else if (ean.startsWith('7896431') || clean.toUpperCase().startsWith('EJBR')) {
    fabricante = 'Delphi';
    tipo_peca = 'Injeção Diesel Common Rail';
    if (ean.length === 13) codigo_extraido = ean.substring(7, 12);
    descricao_sugerida = 'PEÇA INJEÇÃO DELPHI';
  } else if (ean.startsWith('7891252') || clean.toUpperCase().includes('SABO') || clean.toUpperCase().includes('SABÓ')) {
    fabricante = 'Sabó';
    tipo_peca = 'Retentor / Junta / Vedação';
    if (ean.length === 13) codigo_extraido = ean.substring(7, 12);
    descricao_sugerida = 'RETENTOR / JUNTA SABÓ';
  } else if (ean.length === 13) {
    codigo_extraido = ean.substring(7, 12);
  }

  return {
    raw: clean,
    codigo_barras: ean,
    codigo_fabrica: codigo_extraido || undefined,
    codigo_extraido: codigo_extraido || undefined,
    fabricante: fabricante || undefined,
    tipo_peca: tipo_peca || undefined,
    descricao_sugerida: descricao_sugerida || undefined,
  };
}

// ==========================================
// 3. POST /api/produtos/scan (Motor de Bipagem)
// ==========================================
produtosRouter.post('/produtos/scan', async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Código de bipagem é obrigatório.' });
  }

  const cleanCode = code.trim();
  const normalizedCode = cleanCode.replace(/[\s\.-]/g, '');
  const pool = getDbPool();

  if (pool) {
    try {
      const client = await pool.connect();
      try {
        // ETAPA 1: Código atual (código de barras, código interno, código de fábrica, códigos alternativos ou códigos vinculados ativos)
        const etapa1 = await client.query(`
          SELECT * FROM produtos 
          WHERE UPPER(codigo_barras_atual) = UPPER($1) OR UPPER(codigo_barras_atual) = UPPER($1) || 'E' OR UPPER(codigo_barras_atual) || 'E' = UPPER($1)
             OR UPPER(codigo_atual) = UPPER($1) OR UPPER(codigo_atual) = UPPER($1) || 'E' OR UPPER(codigo_atual) || 'E' = UPPER($1)
             OR UPPER(codigo_fabrica) = UPPER($1) OR UPPER(codigo_fabrica) = UPPER($1) || 'E' OR UPPER(codigo_fabrica) || 'E' = UPPER($1)
             OR codigos_alternativos ILIKE '%' || $1 || '%'
             OR codigos_alternativos ILIKE '%' || $1 || 'E%'
             OR codigos_alternativos ILIKE '%' || REGEXP_REPLACE(UPPER($1), 'E$', '') || '%'
             OR (LENGTH($2) >= 4 AND (
                  REPLACE(REPLACE(REPLACE(codigo_barras_atual, ' ', ''), '-', ''), '.', '') = $2 OR REPLACE(REPLACE(REPLACE(codigo_barras_atual, ' ', ''), '-', ''), '.', '') = $2 || 'E' OR REPLACE(REPLACE(REPLACE(codigo_barras_atual, ' ', ''), '-', ''), '.', '') || 'E' = $2
               OR REPLACE(REPLACE(REPLACE(codigo_atual, ' ', ''), '-', ''), '.', '') = $2 OR REPLACE(REPLACE(REPLACE(codigo_atual, ' ', ''), '-', ''), '.', '') = $2 || 'E' OR REPLACE(REPLACE(REPLACE(codigo_atual, ' ', ''), '-', ''), '.', '') || 'E' = $2
               OR REPLACE(REPLACE(REPLACE(codigo_fabrica, ' ', ''), '-', ''), '.', '') = $2 OR REPLACE(REPLACE(REPLACE(codigo_fabrica, ' ', ''), '-', ''), '.', '') = $2 || 'E' OR REPLACE(REPLACE(REPLACE(codigo_fabrica, ' ', ''), '-', ''), '.', '') || 'E' = $2
               OR REPLACE(REPLACE(REPLACE(codigos_alternativos, ' ', ''), '-', ''), '.', '') LIKE '%' || $2 || '%'
             ))
             OR id IN (
               SELECT produto_id FROM codigos_produto 
               WHERE ativo = true AND (
                 UPPER(codigo) = UPPER($1) OR UPPER(codigo) = UPPER($1) || 'E' OR UPPER(codigo) || 'E' = UPPER($1) OR
                 (LENGTH($2) >= 4 AND (REPLACE(REPLACE(REPLACE(codigo, ' ', ''), '-', ''), '.', '') = $2 OR REPLACE(REPLACE(REPLACE(codigo, ' ', ''), '-', ''), '.', '') = $2 || 'E' OR REPLACE(REPLACE(REPLACE(codigo, ' ', ''), '-', ''), '.', '') || 'E' = $2))
               )
             )
          LIMIT 1
        `, [cleanCode, normalizedCode]);

        if (etapa1.rows.length > 0) {
          const product = await loadProductExtras(client, etapa1.rows[0]);
          const isBarcode = product.codigo_barras_atual?.replace(/[\s\.-]/g, '').toUpperCase() === normalizedCode.toUpperCase() ||
                            (Array.isArray(product.codigos_alternativos) && product.codigos_alternativos.some((alt: string) => alt?.replace(/[\s\.-]/g, '').toUpperCase() === normalizedCode.toUpperCase()));
          const isFactory = product.codigo_fabrica?.replace(/[\s\.-]/g, '').toUpperCase() === normalizedCode.toUpperCase();
          const activeCodeType = isBarcode ? 'codigo_barras' : (isFactory ? 'codigo_fabrica' : 'codigo_produto');

          return res.json({
            status: 'found_current',
            product,
            activeCodeType,
            message: isFactory 
              ? 'Produto identificado com sucesso pelo Código de Fábrica / Part Number.' 
              : 'Produto identificado pelo código atual ativo.',
          });
        }

        // ETAPA 2: Código histórico desativado
        const etapa2 = await client.query(`
          SELECT c.*, p.* 
          FROM codigos_produto c
          JOIN produtos p ON p.id = c.produto_id
          WHERE (UPPER(c.codigo) = UPPER($1) OR UPPER(c.codigo) = UPPER($1) || 'E' OR UPPER(c.codigo) || 'E' = UPPER($1) OR (LENGTH($2) >= 4 AND (REPLACE(REPLACE(REPLACE(c.codigo, ' ', ''), '-', ''), '.', '') = $2 OR REPLACE(REPLACE(REPLACE(c.codigo, ' ', ''), '-', ''), '.', '') = $2 || 'E' OR REPLACE(REPLACE(REPLACE(c.codigo, ' ', ''), '-', ''), '.', '') || 'E' = $2)))
            AND c.ativo = false
          ORDER BY c.desativado_em DESC
          LIMIT 1
        `, [cleanCode, normalizedCode]);

        if (etapa2.rows.length > 0) {
          const row = etapa2.rows[0];
          const fullP = await client.query('SELECT * FROM produtos WHERE id = $1', [row.produto_id]);
          const product = fullP.rows.length > 0 ? await loadProductExtras(client, fullP.rows[0]) : row;

          return res.json({
            status: 'found_historical',
            product,
            scannedCode: cleanCode,
            currentCode: product.codigo_atual,
            currentBarcode: product.codigo_barras_atual,
            historicalRecord: {
              id: row.id,
              produto_id: row.produto_id,
              tipo: row.tipo,
              codigo: row.codigo,
              ativo: row.ativo,
              desativado_em: row.desativado_em,
              motivo: row.motivo,
            },
            message: 'Código antigo identificado no histórico! Exibindo localização atual da mercadoria.',
          });
        }

        // ETAPA 3: Código de fábrica ou correspondência correlata
        const etapa3 = await client.query(`
          SELECT * FROM produtos 
          WHERE UPPER(codigo_fabrica) = UPPER($1) OR UPPER(codigo_fabrica) = UPPER($1) || 'E' OR UPPER(codigo_fabrica) || 'E' = UPPER($1)
          LIMIT 1
        `, [cleanCode]);

        if (etapa3.rows.length > 0) {
          const product = await loadProductExtras(client, etapa3.rows[0]);
          return res.json({
            status: 'found_associated',
            product,
            newBarcode: cleanCode,
            matchType: 'codigo_fabrica',
            message: 'Mercadoria localizada através do Código de Fábrica.',
          });
        }

        // ETAPA 4: Não cadastrado diretamente -> Busca Inteligente e Consulta Cosmos
        const identifiedInfo: any = identifyBarcodeInfo(cleanCode);

        // Consulta Externa via Bluesoft Cosmos API
        let cosmosData: any = null;
        let cosmosStatus: number | null = null;
        let cosmosMessage: string | null = null;

        if (/^\d{7,14}$/.test(normalizedCode)) {
          try {
            const cosmosRes = await fetchCosmosProduct(normalizedCode);
            cosmosStatus = cosmosRes.status;
            cosmosMessage = cosmosRes.message || null;
            if (cosmosRes.success && cosmosRes.data) {
              cosmosData = cosmosRes.data;
              if (cosmosRes.data.description) {
                identifiedInfo.descricao_sugerida = cosmosRes.data.description;
              }
              if (cosmosRes.data.brand) {
                identifiedInfo.fabricante = cosmosRes.data.brand;
              }
              if (cosmosRes.data.ncm) {
                identifiedInfo.ncm = cosmosRes.data.ncm;
              }
              if (cosmosRes.data.thumbnail) {
                identifiedInfo.thumbnail = cosmosRes.data.thumbnail;
              }
              identifiedInfo.origem = 'Bluesoft Cosmos';
            }
          } catch (err: any) {
            console.error('[API] Falha ao consultar Cosmos no scan PostgreSQL:', err.message);
          }
        }

        const searchTerms = [
          identifiedInfo.codigo_extraido,
          cleanCode.length === 13 ? cleanCode.substring(7, 12) : null,
          cleanCode.length >= 6 ? cleanCode.slice(-6) : null,
        ].filter(Boolean) as string[];

        let candidates: any[] = [];
        for (const term of searchTerms) {
          if (!term || term.length < 3) continue;
          const candRes = await client.query(`
            SELECT * FROM produtos
            WHERE codigo_atual ILIKE '%' || $1 || '%'
               OR codigo_fabrica ILIKE '%' || $1 || '%'
               OR codigo_barras_atual ILIKE '%' || $1 || '%'
               OR codigos_alternativos ILIKE '%' || $1 || '%'
               OR descricao ILIKE '%' || $1 || '%'
            ORDER BY 
              CASE 
                WHEN codigo_fabrica ILIKE '%' || $1 || '%' THEN 1
                WHEN codigo_barras_atual ILIKE '%' || $1 || '%' THEN 2
                WHEN codigo_atual ILIKE '%' || $1 || '%' THEN 3
                ELSE 4
              END
            LIMIT 6
          `, [term]);

          if (candRes.rows.length > 0) {
            candidates = await Promise.all(candRes.rows.map(r => loadProductExtras(client, r)));
            break;
          }
        }

        const brandMsg = cosmosData?.description
          ? `Identificado no Bluesoft Cosmos: "${cosmosData.description}"!`
          : (identifiedInfo.fabricante 
              ? `Código de barras ${identifiedInfo.fabricante} (${cleanCode}) reconhecido! Selecione uma peça existente para vincular ou atualizar.`
              : `Código de barras ${cleanCode} não localizado diretamente na base de dados.`);

        return res.json({
          status: 'not_found',
          scannedCode: cleanCode,
          identifiedInfo,
          candidates,
          message: brandMsg,
          cosmosData,
          cosmosStatus,
          cosmosMessage,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro no scan PostgreSQL:', err.message);
    }
  }

  // Fallback memory
  // Etapa 1
  const p1 = memoryProducts.find(
    p => p.codigo_barras_atual?.toUpperCase() === cleanCode.toUpperCase() ||
         p.codigo_atual?.toUpperCase() === cleanCode.toUpperCase() ||
         p.codigo_fabrica?.toUpperCase() === cleanCode.toUpperCase() ||
         (Array.isArray(p.codigos_alternativos) && p.codigos_alternativos.some(alt => alt?.toUpperCase() === cleanCode.toUpperCase())) ||
         memoryCodeHistory.some(h => h.produto_id === p.id && h.ativo && h.codigo?.toUpperCase() === cleanCode.toUpperCase())
  );
  if (p1) {
    const isBarcode = p1.codigo_barras_atual?.toUpperCase() === cleanCode.toUpperCase() ||
                      (Array.isArray(p1.codigos_alternativos) && p1.codigos_alternativos.some(alt => alt?.toUpperCase() === cleanCode.toUpperCase()));
    const isFactory = p1.codigo_fabrica?.toUpperCase() === cleanCode.toUpperCase();
    return res.json({
      status: 'found_current',
      product: loadMemoryProductExtras(p1),
      activeCodeType: isBarcode ? 'codigo_barras' : (isFactory ? 'codigo_fabrica' : 'codigo_produto'),
      message: isFactory
        ? 'Mercadoria já cadastrada identificada pelo Código de Fábrica. Dados mantidos.'
        : 'Mercadoria já cadastrada identificada no estoque. Dados mantidos.',
    });
  }

  // Etapa 2
  const h = memoryCodeHistory.find(
    c => c.codigo.toUpperCase() === cleanCode.toUpperCase() && !c.ativo
  );
  if (h) {
    const pHist = memoryProducts.find(p => p.id === h.produto_id);
    if (pHist) {
      return res.json({
        status: 'found_historical',
        product: pHist,
        scannedCode: cleanCode,
        currentCode: pHist.codigo_atual,
        currentBarcode: pHist.codigo_barras_atual,
        historicalRecord: h,
      });
    }
  }

  // Etapa 3
  const pFab = memoryProducts.find(p => p.codigo_fabrica?.toUpperCase() === cleanCode.toUpperCase());
  if (pFab) {
    return res.json({
      status: 'found_associated',
      product: pFab,
      newBarcode: cleanCode,
      matchType: 'codigo_fabrica',
    });
  }

  // Etapa 4 Memory Fallback
  const identifiedInfo: any = identifyBarcodeInfo(cleanCode);

  let cosmosData: any = null;
  let cosmosStatus: number | null = null;
  let cosmosMessage: string | null = null;

  if (/^\d{7,14}$/.test(cleanCode.replace(/[\s\.-]/g, ''))) {
    try {
      const cosmosRes = await fetchCosmosProduct(cleanCode);
      cosmosStatus = cosmosRes.status;
      cosmosMessage = cosmosRes.message || null;
      if (cosmosRes.success && cosmosRes.data) {
        cosmosData = cosmosRes.data;
        if (cosmosRes.data.description) {
          identifiedInfo.descricao_sugerida = cosmosRes.data.description;
        }
        if (cosmosRes.data.brand) {
          identifiedInfo.fabricante = cosmosRes.data.brand;
        }
        if (cosmosRes.data.ncm) {
          identifiedInfo.ncm = cosmosRes.data.ncm;
        }
        if (cosmosRes.data.thumbnail) {
          identifiedInfo.thumbnail = cosmosRes.data.thumbnail;
        }
        identifiedInfo.origem = 'Bluesoft Cosmos';
      }
    } catch (err: any) {
      console.error('[API] Falha ao consultar Cosmos no memory scan:', err.message);
    }
  }

  const searchTerms = [
    identifiedInfo.codigo_extraido,
    cleanCode.length === 13 ? cleanCode.substring(7, 12) : null,
    cleanCode.length >= 6 ? cleanCode.slice(-6) : null,
  ].filter(Boolean) as string[];

  let memCandidates: any[] = [];
  for (const term of searchTerms) {
    if (!term || term.length < 3) continue;
    const termUpper = term.toUpperCase();
    const found = memoryProducts.filter(p =>
      p.codigo_atual?.toUpperCase().includes(termUpper) ||
      p.codigo_fabrica?.toUpperCase().includes(termUpper) ||
      p.codigo_barras_atual?.toUpperCase().includes(termUpper) ||
      (Array.isArray(p.codigos_alternativos) && p.codigos_alternativos.some(c => c.toUpperCase().includes(termUpper))) ||
      p.descricao?.toUpperCase().includes(termUpper)
    ).slice(0, 6);
    if (found.length > 0) {
      memCandidates = found.map(loadMemoryProductExtras);
      break;
    }
  }

  const brandMsg = cosmosData?.description
    ? `Identificado no Bluesoft Cosmos: "${cosmosData.description}"!`
    : (identifiedInfo.fabricante 
        ? `Código de barras ${identifiedInfo.fabricante} (${cleanCode}) reconhecido! Selecione uma peça existente para vincular ou atualizar.`
        : `Código de barras ${cleanCode} não localizado diretamente na base de dados.`);

  return res.json({
    status: 'not_found',
    scannedCode: cleanCode,
    identifiedInfo,
    candidates: memCandidates,
    message: brandMsg,
    cosmosData,
    cosmosStatus,
    cosmosMessage,
  });
});

// ==========================================
// 4. GET /api/produtos (Listagem e Consulta Livre)
// ==========================================
produtosRouter.get('/produtos', async (req: Request, res: Response) => {
  const {
    search,
    corredor,
    baia,
    nivel,
    locacao,
    estoque,
    cadastro,
    tipoCodigo,
    page = '1',
    limit = '100',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const requestedLimit = parseInt(limit as string, 10);
  const limitNum = (limit === 'all' || requestedLimit >= 50000)
    ? 50000
    : Math.min(50000, Math.max(1, requestedLimit || 100));
  const offset = (pageNum - 1) * limitNum;

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        if (search && typeof search === 'string' && search.trim()) {
          const s = `%${search.trim()}%`;
          params.push(s);
          conditions.push(`(
            p.descricao ILIKE $${paramIdx} OR
            p.codigo_atual ILIKE $${paramIdx} OR
            p.codigo_fabrica ILIKE $${paramIdx} OR
            p.codigo_barras_atual ILIKE $${paramIdx} OR
            p.locacao ILIKE $${paramIdx} OR
            EXISTS (
              SELECT 1 FROM codigos_produto cp 
              WHERE cp.produto_id = p.id AND cp.codigo ILIKE $${paramIdx}
            )
          )`);
          paramIdx++;
        }

        if (corredor && typeof corredor === 'string' && corredor.trim()) {
          params.push(corredor.trim());
          conditions.push(`p.corredor = $${paramIdx}`);
          paramIdx++;
        }

        if (baia && typeof baia === 'string' && baia.trim()) {
          params.push(baia.trim());
          conditions.push(`p.baia = $${paramIdx}`);
          paramIdx++;
        }

        if (nivel && typeof nivel === 'string' && nivel.trim()) {
          params.push(nivel.trim());
          conditions.push(`p.nivel = $${paramIdx}`);
          paramIdx++;
        }

        if (locacao && typeof locacao === 'string' && locacao.trim()) {
          params.push(`%${locacao.trim()}%`);
          conditions.push(`p.locacao ILIKE $${paramIdx}`);
          paramIdx++;
        }

        if (estoque === 'com_estoque') {
          conditions.push('p.quantidade > 0');
        } else if (estoque === 'sem_estoque') {
          conditions.push('p.quantidade = 0');
        } else if (estoque === 'baixo_estoque') {
          conditions.push('p.quantidade <= p.estoque_minimo');
        }

        if (cadastro === 'sem_localizacao') {
          conditions.push("(p.corredor = '' OR p.corredor IS NULL) AND (p.locacao = '' OR p.locacao IS NULL)");
        } else if (cadastro === 'com_localizacao') {
          conditions.push("(p.corredor != '' AND p.corredor IS NOT NULL) OR (p.locacao != '' AND p.locacao IS NOT NULL)");
        } else if (cadastro === 'sem_codigo_barras') {
          conditions.push("(p.codigo_barras_atual = '' OR p.codigo_barras_atual IS NULL)");
        } else if (cadastro === 'com_codigo_barras') {
          conditions.push("(p.codigo_barras_atual != '' AND p.codigo_barras_atual IS NOT NULL)");
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count query
        const countQuery = `SELECT COUNT(*) as total FROM produtos p ${whereClause}`;
        const countRes = await client.query(countQuery, params);
        const total = parseInt(countRes.rows[0].total, 10);

        // Data query
        const dataQuery = `
          SELECT p.*,
            (SELECT COUNT(*) FROM produtos_relacionados pr WHERE pr.produto_id = p.id OR pr.relacionado_id = p.id)::int as total_genericos
          FROM produtos p
          ${whereClause}
          ORDER BY p.atualizado_em DESC
          LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;
        const dataRes = await client.query(dataQuery, [...params, limitNum, offset]);

        const formattedProducts = dataRes.rows.map(p => ({
          ...p,
          quantidade: Number(p.quantidade) || 0,
          estoque_minimo: Number(p.estoque_minimo) || 0,
          custo_unitario: Number(p.custo_unitario) || 0,
          preco_tabela: Number(p.preco_tabela) || 0,
          preco_sugerido: Number(p.preco_sugerido) || 0,
          preco_minimo: Number(p.preco_minimo) || 0,
          total_genericos: Number(p.total_genericos) || 0,
        }));

        return res.json({
          products: formattedProducts,
          total,
          page: pageNum,
          limit: limitNum,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao listar produtos no PostgreSQL:', err.message);
    }
  }

  // Fallback memory filtering
  let filtered = [...memoryProducts];

  if (search && typeof search === 'string' && search.trim()) {
    const term = search.trim().toLowerCase();
    filtered = filtered.filter(p =>
      p.descricao.toLowerCase().includes(term) ||
      p.codigo_atual.toLowerCase().includes(term) ||
      p.codigo_fabrica.toLowerCase().includes(term) ||
      p.codigo_barras_atual.toLowerCase().includes(term) ||
      p.locacao.toLowerCase().includes(term) ||
      memoryCodeHistory.some(c => c.produto_id === p.id && c.codigo.toLowerCase().includes(term))
    );
  }

  if (corredor && typeof corredor === 'string' && corredor.trim()) {
    filtered = filtered.filter(p => p.corredor.toLowerCase() === corredor.trim().toLowerCase());
  }

  if (baia && typeof baia === 'string' && baia.trim()) {
    filtered = filtered.filter(p => p.baia.toLowerCase() === baia.trim().toLowerCase());
  }

  if (nivel && typeof nivel === 'string' && nivel.trim()) {
    filtered = filtered.filter(p => p.nivel.toLowerCase() === nivel.trim().toLowerCase());
  }

  if (estoque === 'com_estoque') {
    filtered = filtered.filter(p => p.quantidade > 0);
  } else if (estoque === 'sem_estoque') {
    filtered = filtered.filter(p => p.quantidade === 0);
  } else if (estoque === 'baixo_estoque') {
    filtered = filtered.filter(p => p.quantidade <= p.estoque_minimo);
  }

  if (cadastro === 'sem_localizacao') {
    filtered = filtered.filter(p => !p.corredor && !p.locacao);
  } else if (cadastro === 'com_localizacao') {
    filtered = filtered.filter(p => !!p.corredor || !!p.locacao);
  } else if (cadastro === 'sem_codigo_barras') {
    filtered = filtered.filter(p => !p.codigo_barras_atual);
  }

  const paginated = filtered.slice(offset, offset + limitNum).map(p => ({
    ...p,
    total_genericos: memoryRelatedProducts.filter(r => r.produto_id === p.id || r.relacionado_id === p.id).length,
  }));

  res.json({
    products: paginated,
    total: filtered.length,
    page: pageNum,
    limit: limitNum,
  });
});

// ==========================================
// 5. GET /api/produtos/:id (Detalhes e Histórico)
// ==========================================
produtosRouter.get('/produtos/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getDbPool();

  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const prodRes = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
        if (prodRes.rows.length === 0) {
          return res.status(404).json({ error: 'Produto não encontrado' });
        }

        const product = await loadProductExtras(client, prodRes.rows[0]);

        const histRes = await client.query(`
          SELECT * FROM codigos_produto 
          WHERE produto_id = $1 
          ORDER BY criado_em DESC
        `, [id]);

        return res.json({
          product,
          history: histRes.rows,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao buscar produto no PostgreSQL:', err.message);
    }
  }

  // Fallback memory
  const p = memoryProducts.find(prod => prod.id === id);
  if (!p) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }

  const hist = memoryCodeHistory.filter(c => c.produto_id === id);
  res.json({ product: p, history: hist });
});

// ==========================================
// 6. POST /api/produtos (Novo Cadastro com Validação Prévia)
// ==========================================
produtosRouter.post('/produtos', async (req: Request, res: Response) => {
  const {
    descricao,
    codigo_atual,
    codigo_fabrica,
    codigo_barras_atual,
    custo_unitario = 0,
    quantidade = 0,
    estoque_minimo = 0,
    estoque_fisico = 0,
    ncm = '',
    preco_tabela = 0,
    preco_sugerido = 0,
    preco_minimo = 0,
    ultima_data_venda = '',
    ultima_data_compra = '',
    corredor = '',
    baia = '',
    nivel = '',
    locacao = '',
  } = req.body;

  if (!descricao || !descricao.trim()) {
    return res.status(400).json({ error: 'A descrição do produto é obrigatória.' });
  }

  const cleanBarcode = codigo_barras_atual?.trim() || '';
  const cleanCode = codigo_atual?.trim() || '';
  const cleanFactory = codigo_fabrica?.trim() || '';

  if (!cleanCode && !cleanFactory) {
    return res.status(400).json({ error: 'O código do produto ou código de fábrica é obrigatório.' });
  }

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Validação prévia contra duplicidade em códigos ativos
      if (cleanBarcode) {
        const dupBarcode = await client.query(`
          SELECT id, descricao, codigo_barras_atual FROM produtos 
          WHERE UPPER(codigo_barras_atual) = UPPER($1)
          LIMIT 1
        `, [cleanBarcode]);

        if (dupBarcode.rows.length > 0) {
          const fullProd = await client.query('SELECT * FROM produtos WHERE id = $1', [dupBarcode.rows[0].id]);
          await client.query('COMMIT');
          const existingProduct = await loadProductExtras(client, fullProd.rows[0]);
          return res.json({
            success: true,
            isExisting: true,
            product: existingProduct,
            message: 'Mercadoria já cadastrada identificada com sucesso pelo código EAN. Dados mantidos.',
          });
        }
      }

      if (cleanCode) {
        const dupCode = await client.query(`
          SELECT id, descricao, codigo_atual FROM produtos 
          WHERE UPPER(codigo_atual) = UPPER($1)
          LIMIT 1
        `, [cleanCode]);

        if (dupCode.rows.length > 0) {
          const fullProd = await client.query('SELECT * FROM produtos WHERE id = $1', [dupCode.rows[0].id]);
          await client.query('COMMIT');
          const existingProduct = await loadProductExtras(client, fullProd.rows[0]);
          return res.json({
            success: true,
            isExisting: true,
            product: existingProduct,
            message: 'Mercadoria já cadastrada identificada com sucesso pelo código interno. Dados mantidos.',
          });
        }
      }

      // Gerar ID permanente estável
      const countRes = await client.query('SELECT COUNT(*) as count FROM produtos');
      const nextNum = parseInt(countRes.rows[0].count, 10) + 1;
      const newId = `PRD-${String(nextNum).padStart(4, '0')}`;

      const finalCode = cleanCode || newId;
      const finalLoc = locacao?.trim() || (corredor || baia || nivel ? `${corredor}-${baia}-${nivel}`.replace(/^-|-$/g, '') : '');

      // Inserir produto
      const insertRes = await client.query(`
        INSERT INTO produtos (
          id, codigo_atual, codigo_fabrica, codigo_barras_atual, 
          descricao, custo_unitario, preco_tabela, preco_sugerido, preco_minimo,
          quantidade, estoque_minimo, estoque_fisico, ncm,
          ultima_data_venda, ultima_data_compra,
          corredor, baia, nivel, locacao, criado_em, atualizado_em
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
        RETURNING *
      `, [
        newId,
        finalCode,
        cleanFactory,
        cleanBarcode,
        descricao.trim(),
        Number(custo_unitario) || 0,
        Number(preco_tabela) || 0,
        Number(preco_sugerido) || 0,
        Number(preco_minimo) || 0,
        parseInt(quantidade, 10) || 0,
        parseInt(estoque_minimo, 10) || 0,
        parseInt(estoque_fisico, 10) || 0,
        ncm?.trim() || '',
        ultima_data_venda?.trim() || '',
        ultima_data_compra?.trim() || '',
        corredor.trim(),
        baia.trim(),
        nivel.trim(),
        finalLoc,
      ]);

      const createdProduct = insertRes.rows[0];

      // Inserir histórico inicial de códigos
      if (cleanBarcode) {
        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_barras', $2, true, 'Cadastro inicial')
        `, [newId, cleanBarcode]);
      }

      if (finalCode) {
        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_produto', $2, true, 'Cadastro inicial')
        `, [newId, finalCode]);
      }

      if (cleanFactory) {
        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_fabrica', $2, true, 'Código de fábrica')
        `, [newId, cleanFactory]);
      }

      // Auditoria
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_novo, motivo)
        VALUES ($1, 'criacao', $2, 'Criação inicial do produto')
      `, [newId, JSON.stringify(createdProduct)]);

      await client.query('COMMIT');
      return res.status(201).json({ product: createdProduct });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao cadastrar produto:', err.message);
      return res.status(500).json({ error: 'Erro ao cadastrar produto: ' + err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  const nextNum = memoryProducts.length + 1;
  const newId = `PRD-${String(nextNum).padStart(4, '0')}`;
  const finalCode = cleanCode || newId;

  // Validação duplicidade
  if (cleanBarcode) {
    const existingP = memoryProducts.find(p => p.codigo_barras_atual?.toUpperCase() === cleanBarcode.toUpperCase());
    if (existingP) {
      return res.json({
        success: true,
        isExisting: true,
        product: loadMemoryProductExtras(existingP),
        message: 'Mercadoria já cadastrada identificada com sucesso pelo código EAN. Dados mantidos.',
      });
    }
  }
  if (cleanCode) {
    const existingP = memoryProducts.find(p => p.codigo_atual?.toUpperCase() === cleanCode.toUpperCase());
    if (existingP) {
      return res.json({
        success: true,
        isExisting: true,
        product: loadMemoryProductExtras(existingP),
        message: 'Mercadoria já cadastrada identificada com sucesso pelo código interno. Dados mantidos.',
      });
    }
  }

  const newP: MemoryProduct = {
    id: newId,
    codigo_atual: finalCode,
    codigo_fabrica: cleanFactory,
    codigo_barras_atual: cleanBarcode,
    descricao: descricao.trim(),
    custo_unitario: Number(custo_unitario) || 0,
    quantidade: parseInt(quantidade, 10) || 0,
    estoque_minimo: parseInt(estoque_minimo, 10) || 0,
    corredor: corredor.trim(),
    baia: baia.trim(),
    nivel: nivel.trim(),
    locacao: locacao.trim() || `${corredor}-${baia}-${nivel}`,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  memoryProducts.unshift(newP);
  if (cleanBarcode) {
    memoryCodeHistory.unshift({
      id: memoryCodeHistory.length + 1,
      produto_id: newId,
      tipo: 'codigo_barras',
      codigo: cleanBarcode,
      ativo: true,
      criado_em: new Date().toISOString(),
      motivo: 'Cadastro inicial',
    });
  }

  res.status(201).json({ product: newP });
});

// ==========================================
// 7. PATCH /api/produtos/:id/localizacao (Alterar Localização)
// ==========================================
produtosRouter.patch('/produtos/:id/localizacao', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { corredor = '', baia = '', nivel = '', locacao = '', motivo = 'Alteração operacional de endereço' } = req.body;

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      const prev = existing.rows[0];
      const finalLoc = locacao?.trim() || (corredor || baia || nivel ? `${corredor}-${baia}-${nivel}`.replace(/^-|-$/g, '') : '');

      const updateRes = await client.query(`
        UPDATE produtos 
        SET corredor = $1, baia = $2, nivel = $3, locacao = $4, atualizado_em = NOW()
        WHERE id = $5
        RETURNING *
      `, [corredor.trim(), baia.trim(), nivel.trim(), finalLoc, id]);

      // Auditoria
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo)
        VALUES ($1, 'localizacao', $2, $3, $4)
      `, [
        id,
        JSON.stringify({ corredor: prev.corredor, baia: prev.baia, nivel: prev.nivel, locacao: prev.locacao }),
        JSON.stringify({ corredor: corredor.trim(), baia: baia.trim(), nivel: nivel.trim(), locacao: finalLoc }),
        motivo,
      ]);

      await client.query('COMMIT');
      return res.json({ product: updateRes.rows[0], message: 'Localização atualizada com sucesso!' });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao atualizar localização:', err.message);
      return res.status(500).json({ error: 'Erro ao atualizar localização: ' + err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  const idx = memoryProducts.findIndex(p => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }

  const finalLoc = locacao?.trim() || `${corredor}-${baia}-${nivel}`;
  memoryProducts[idx] = {
    ...memoryProducts[idx],
    corredor: corredor.trim(),
    baia: baia.trim(),
    nivel: nivel.trim(),
    locacao: finalLoc,
    atualizado_em: new Date().toISOString(),
  };

  res.json({ product: memoryProducts[idx], message: 'Localização atualizada com sucesso!' });
});

// ==========================================
// 8. POST /api/produtos/:id/codigo (Alterar Código com Preservação Histórica)
// ==========================================
produtosRouter.post('/produtos/:id/codigo', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { tipo, novo_codigo, motivo = 'Substituição operacional de etiqueta' } = req.body;

  if (!tipo || !novo_codigo || !novo_codigo.trim()) {
    return res.status(400).json({ error: 'Tipo de código e novo código são obrigatórios.' });
  }

  const cleanNewCode = novo_codigo.trim();
  const pool = getDbPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const prodRes = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
      if (prodRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      const prod = prodRes.rows[0];

      // Verificar se outro produto ativo já possui esse código
      const conflict = await client.query(`
        SELECT p.id, p.descricao FROM codigos_produto c
        JOIN produtos p ON p.id = c.produto_id
        WHERE c.codigo = $1 AND c.tipo = $2 AND c.ativo = true AND c.produto_id != $3
        LIMIT 1
      `, [cleanNewCode, tipo, id]);

      if (conflict.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Este código já está ativo no produto ${conflict.rows[0].id} (${conflict.rows[0].descricao})`,
        });
      }

      // 1. Desativar código anterior
      await client.query(`
        UPDATE codigos_produto 
        SET ativo = false, desativado_em = NOW(), motivo = $1
        WHERE produto_id = $2 AND tipo = $3 AND ativo = true
      `, [motivo, id, tipo]);

      // 2. Inserir novo código ativo
      await client.query(`
        INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
        VALUES ($1, $2, $3, true, $4)
      `, [id, tipo, cleanNewCode, motivo]);

      // 3. Atualizar tabela de produtos
      let updateSql = 'UPDATE produtos SET atualizado_em = NOW()';
      if (tipo === 'codigo_barras') {
        updateSql = 'UPDATE produtos SET codigo_barras_atual = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *';
      } else if (tipo === 'codigo_produto') {
        updateSql = 'UPDATE produtos SET codigo_atual = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *';
      } else if (tipo === 'codigo_fabrica') {
        updateSql = 'UPDATE produtos SET codigo_fabrica = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *';
      }

      const updated = await client.query(updateSql, [cleanNewCode, id]);

      await client.query('COMMIT');
      return res.json({
        product: updated.rows[0],
        message: 'Código atualizado e anterior preservado no histórico!',
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao atualizar código:', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  const prodIdx = memoryProducts.findIndex(p => p.id === id);
  if (prodIdx === -1) return res.status(404).json({ error: 'Produto não encontrado' });

  // Desativar anterior
  memoryCodeHistory.forEach(c => {
    if (c.produto_id === id && c.tipo === tipo && c.ativo) {
      c.ativo = false;
      c.desativado_em = new Date().toISOString();
      c.motivo = motivo;
    }
  });

  // Inserir novo
  memoryCodeHistory.unshift({
    id: memoryCodeHistory.length + 1,
    produto_id: id,
    tipo,
    codigo: cleanNewCode,
    ativo: true,
    criado_em: new Date().toISOString(),
    motivo,
  });

  if (tipo === 'codigo_barras') memoryProducts[prodIdx].codigo_barras_atual = cleanNewCode;
  else if (tipo === 'codigo_produto') memoryProducts[prodIdx].codigo_atual = cleanNewCode;
  else if (tipo === 'codigo_fabrica') memoryProducts[prodIdx].codigo_fabrica = cleanNewCode;

  memoryProducts[prodIdx].atualizado_em = new Date().toISOString();

  res.json({
    product: memoryProducts[prodIdx],
    message: 'Código atualizado com sucesso no histórico.',
  });
});

// ==========================================
// 8b. POST /api/produtos/:id/vincular-codigo (Vincular Código de Barras Adicional sem Apagar Anteriores)
// ==========================================
produtosRouter.post('/produtos/:id/vincular-codigo', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { codigo, tipo = 'codigo_barras', motivo = 'Vínculo de código de barras adicional' } = req.body;

  if (!codigo || !codigo.trim()) {
    return res.status(400).json({ error: 'O código a vincular é obrigatório.' });
  }

  const cleanCode = codigo.trim();
  const pool = getDbPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const prodRes = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
      if (prodRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      const prod = prodRes.rows[0];

      // Verificar se já possui esse código como atual
      const isAlreadyMain = prod.codigo_barras_atual?.trim().toUpperCase() === cleanCode.toUpperCase() ||
                            prod.codigo_atual?.trim().toUpperCase() === cleanCode.toUpperCase() ||
                            prod.codigo_fabrica?.trim().toUpperCase() === cleanCode.toUpperCase();

      let currentAlts: string[] = [];
      if (typeof prod.codigos_alternativos === 'string' && prod.codigos_alternativos.trim()) {
        currentAlts = prod.codigos_alternativos.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean);
      } else if (Array.isArray(prod.codigos_alternativos)) {
        currentAlts = prod.codigos_alternativos;
      }

      const isAlreadyInAlts = currentAlts.some(c => c.toUpperCase() === cleanCode.toUpperCase());

      if (isAlreadyMain || isAlreadyInAlts) {
        await client.query('COMMIT');
        const fullProd = await loadProductExtras(client, prod);
        return res.json({
          success: true,
          product: fullProd,
          message: 'Este código já está vinculado a esta peça.',
        });
      }

      // Se o produto não tinha código de barras principal, define como principal
      let updateSql = '';
      let updateParams: any[] = [];
      if (!prod.codigo_barras_atual || !prod.codigo_barras_atual.trim()) {
        updateSql = 'UPDATE produtos SET codigo_barras_atual = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *';
        updateParams = [cleanCode, id];
      } else {
        // Se já tinha código de barras, adiciona na lista de codigos_alternativos sem sobrescrever o anterior
        const newAlts = [...currentAlts, cleanCode];
        updateSql = 'UPDATE produtos SET codigos_alternativos = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *';
        updateParams = [newAlts.join(', '), id];
      }

      const updated = await client.query(updateSql, updateParams);

      // Inserir em codigos_produto como ativo (mantendo os anteriores ativos também!)
      await client.query(`
        INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
        VALUES ($1, $2, $3, true, $4)
      `, [id, tipo, cleanCode, motivo]);

      // Registrar auditoria
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo)
        VALUES ($1, 'codigos_alternativos', $2, $3, $4)
      `, [id, prod.codigo_barras_atual || '', cleanCode, motivo]);

      await client.query('COMMIT');

      const finalProduct = await loadProductExtras(client, updated.rows[0]);
      return res.json({
        success: true,
        product: finalProduct,
        message: 'Código de barras vinculado com sucesso à mercadoria!',
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao vincular código:', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  const prodIdx = memoryProducts.findIndex(p => p.id === id);
  if (prodIdx === -1) return res.status(404).json({ error: 'Produto não encontrado' });

  const pMem = memoryProducts[prodIdx];
  if (!pMem.codigo_barras_atual) {
    pMem.codigo_barras_atual = cleanCode;
  } else {
    if (!Array.isArray(pMem.codigos_alternativos)) pMem.codigos_alternativos = [];
    if (!pMem.codigos_alternativos.includes(cleanCode)) {
      pMem.codigos_alternativos.push(cleanCode);
    }
  }
  pMem.atualizado_em = new Date().toISOString();

  memoryCodeHistory.unshift({
    id: memoryCodeHistory.length + 1,
    produto_id: id,
    tipo: tipo as any,
    codigo: cleanCode,
    ativo: true,
    criado_em: new Date().toISOString(),
    motivo,
  });

  return res.json({
    success: true,
    product: loadMemoryProductExtras(pMem),
    message: 'Código de barras vinculado com sucesso à mercadoria!',
  });
});

// ==========================================
// 9. PUT /api/produtos/:id (Edição Completa do Cadastro)
// ==========================================
produtosRouter.put('/produtos/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    descricao,
    codigo_atual,
    codigo_fabrica,
    codigo_barras_atual,
    custo_unitario,
    preco_tabela,
    preco_sugerido,
    preco_minimo,
    quantidade,
    estoque_minimo,
    estoque_fisico,
    ncm,
    ultima_data_venda,
    ultima_data_compra,
    corredor,
    baia,
    nivel,
    locacao,
  } = req.body;

  const cleanCode = codigo_atual?.trim() || '';
  const cleanFactory = codigo_fabrica?.trim() || '';
  
  if (!cleanCode && !cleanFactory) {
    return res.status(400).json({ error: 'O código do produto ou código de fábrica é obrigatório.' });
  }

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      const prev = existing.rows[0];

      // Se código de barras mudou ou foi desvinculado, atualizar/arquivar
      let finalBarcode = prev.codigo_barras_atual;
      if (codigo_barras_atual !== undefined) {
        if (codigo_barras_atual === null || String(codigo_barras_atual).trim() === '') {
          finalBarcode = null;
          if (prev.codigo_barras_atual) {
            await client.query(`
              UPDATE codigos_produto 
              SET ativo = false, desativado_em = NOW(), motivo = 'Código de barras desvinculado'
              WHERE produto_id = $1 AND tipo = 'codigo_barras' AND ativo = true
            `, [id]);
          }
        } else if (String(codigo_barras_atual).trim() !== prev.codigo_barras_atual) {
          finalBarcode = String(codigo_barras_atual).trim();
          await client.query(`
            UPDATE codigos_produto 
            SET ativo = false, desativado_em = NOW(), motivo = 'Alteração completa de cadastro'
            WHERE produto_id = $1 AND tipo = 'codigo_barras' AND ativo = true
          `, [id]);

          await client.query(`
            INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
            VALUES ($1, 'codigo_barras', $2, true, 'Alteração completa de cadastro')
          `, [id, finalBarcode]);
        }
      }

      // Se código interno mudou, arquivar anterior
      if (codigo_atual && codigo_atual.trim() !== prev.codigo_atual) {
        await client.query(`
          UPDATE codigos_produto 
          SET ativo = false, desativado_em = NOW(), motivo = 'Alteração completa de cadastro'
          WHERE produto_id = $1 AND tipo = 'codigo_produto' AND ativo = true
        `, [id]);

        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_produto', $2, true, 'Alteração completa de cadastro')
        `, [id, codigo_atual.trim()]);
      }

      const finalLoc = locacao?.trim() || (corredor || baia || nivel ? `${corredor}-${baia}-${nivel}`.replace(/^-|-$/g, '') : prev.locacao);

      const updateRes = await client.query(`
        UPDATE produtos SET
          descricao = $1,
          codigo_atual = $2,
          codigo_fabrica = $3,
          codigo_barras_atual = $4,
          custo_unitario = $5,
          preco_tabela = $6,
          preco_sugerido = $7,
          preco_minimo = $8,
          quantidade = $9,
          estoque_minimo = $10,
          estoque_fisico = $11,
          ncm = $12,
          ultima_data_venda = $13,
          ultima_data_compra = $14,
          corredor = $15,
          baia = $16,
          nivel = $17,
          locacao = $18,
          atualizado_em = NOW()
        WHERE id = $19
        RETURNING *
      `, [
        descricao?.trim() || prev.descricao,
        codigo_atual?.trim() || prev.codigo_atual,
        codigo_fabrica?.trim() || prev.codigo_fabrica,
        finalBarcode,
        custo_unitario !== undefined ? Number(custo_unitario) : prev.custo_unitario,
        preco_tabela !== undefined ? Number(preco_tabela) : prev.preco_tabela,
        preco_sugerido !== undefined ? Number(preco_sugerido) : prev.preco_sugerido,
        preco_minimo !== undefined ? Number(preco_minimo) : prev.preco_minimo,
        quantidade !== undefined ? parseInt(quantidade, 10) : prev.quantidade,
        estoque_minimo !== undefined ? parseInt(estoque_minimo, 10) : prev.estoque_minimo,
        estoque_fisico !== undefined ? parseInt(estoque_fisico, 10) : prev.estoque_fisico,
        ncm !== undefined ? String(ncm).trim() : prev.ncm,
        ultima_data_venda !== undefined ? String(ultima_data_venda).trim() : prev.ultima_data_venda,
        ultima_data_compra !== undefined ? String(ultima_data_compra).trim() : prev.ultima_data_compra,
        corredor?.trim() ?? prev.corredor,
        baia?.trim() ?? prev.baia,
        nivel?.trim() ?? prev.nivel,
        finalLoc,
        id,
      ]);

      // Registrar em historico_alteracoes para auditoria e rastreabilidade com reversão
      const auditoriaCampos: { campo: string; anterior: any; novo: any }[] = [];
      if (descricao && descricao.trim() !== prev.descricao) {
        auditoriaCampos.push({ campo: 'descricao', anterior: prev.descricao, novo: descricao.trim() });
      }
      if (codigo_atual && codigo_atual.trim() !== prev.codigo_atual) {
        auditoriaCampos.push({ campo: 'codigo_atual', anterior: prev.codigo_atual, novo: codigo_atual.trim() });
      }
      if (codigo_fabrica !== undefined && codigo_fabrica.trim() !== (prev.codigo_fabrica || '')) {
        auditoriaCampos.push({ campo: 'codigo_fabrica', anterior: prev.codigo_fabrica || '', novo: codigo_fabrica.trim() });
      }
      if (codigo_barras_atual !== undefined && codigo_barras_atual.trim() !== (prev.codigo_barras_atual || '')) {
        auditoriaCampos.push({ campo: 'codigo_barras_atual', anterior: prev.codigo_barras_atual || '', novo: codigo_barras_atual.trim() });
      }
      if (preco_tabela !== undefined && Number(preco_tabela) !== Number(prev.preco_tabela || 0)) {
        auditoriaCampos.push({ campo: 'preco_tabela', anterior: String(prev.preco_tabela || 0), novo: String(preco_tabela) });
      }
      if (preco_sugerido !== undefined && Number(preco_sugerido) !== Number(prev.preco_sugerido || 0)) {
        auditoriaCampos.push({ campo: 'preco_sugerido', anterior: String(prev.preco_sugerido || 0), novo: String(preco_sugerido) });
      }
      if (preco_minimo !== undefined && Number(preco_minimo) !== Number(prev.preco_minimo || 0)) {
        auditoriaCampos.push({ campo: 'preco_minimo', anterior: String(prev.preco_minimo || 0), novo: String(preco_minimo) });
      }
      if (quantidade !== undefined && Number(quantidade) !== Number(prev.quantidade || 0)) {
        auditoriaCampos.push({ campo: 'quantidade', anterior: String(prev.quantidade || 0), novo: String(quantidade) });
      }
      if (finalLoc && finalLoc !== (prev.locacao || '')) {
        auditoriaCampos.push({ campo: 'locacao', anterior: prev.locacao || '', novo: finalLoc });
      }

      for (const aud of auditoriaCampos) {
        await client.query(`
          INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, aud.campo, aud.anterior, aud.novo, 'Edição cadastral', req.body.usuario || 'Operador Almoxarifado']);
      }

      await client.query('COMMIT');
      return res.json({ product: updateRes.rows[0], message: 'Produto atualizado com sucesso!' });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao editar produto:', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  const idx = memoryProducts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });

  memoryProducts[idx] = {
    ...memoryProducts[idx],
    ...req.body,
    atualizado_em: new Date().toISOString(),
  };

  res.json({ product: memoryProducts[idx], message: 'Produto atualizado com sucesso!' });
});

// ==========================================
// 9b. PATCH /api/produtos/:id/estoque (Ajuste rápido / Bipagem de entrada de estoque)
// ==========================================
produtosRouter.patch('/produtos/:id/estoque', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantidade, incremento, motivo = 'Entrada por bipagem', usuario = 'Operador Almoxarifado' } = req.body;

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prodRes = await client.query('SELECT * FROM produtos WHERE id = $1 FOR UPDATE', [id]);
      if (prodRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      const prod = prodRes.rows[0];
      const qtdAnterior = parseInt(prod.quantidade, 10) || 0;
      let novaQtd = qtdAnterior;

      if (quantidade !== undefined && quantidade !== null) {
        novaQtd = Math.max(0, parseInt(quantidade, 10) || 0);
      } else if (incremento !== undefined && incremento !== null) {
        novaQtd = Math.max(0, qtdAnterior + (parseInt(incremento, 10) || 0));
      }

      const diff = novaQtd - qtdAnterior;
      const tipoMov = diff >= 0 ? 'recebimento' : 'ajuste';

      const updateRes = await client.query(`
        UPDATE produtos 
        SET quantidade = $1, atualizado_em = NOW() 
        WHERE id = $2 
        RETURNING *
      `, [novaQtd, id]);

      await client.query(`
        INSERT INTO movimentacoes (produto_id, tipo, quantidade, quantidade_anterior, quantidade_nova, detalhes, usuario, criado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [id, tipoMov, Math.abs(diff), qtdAnterior, novaQtd, motivo, usuario]);

      await client.query('COMMIT');
      const updatedProduct = await loadProductExtras(client, updateRes.rows[0]);
      return res.json({
        product: updatedProduct,
        quantidade_anterior: qtdAnterior,
        quantidade_nova: novaQtd,
        message: `Estoque atualizado: ${qtdAnterior} → ${novaQtd}`,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao atualizar estoque:', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  const idx = memoryProducts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });

  const qtdAnterior = memoryProducts[idx].quantidade || 0;
  let novaQtd = qtdAnterior;
  if (quantidade !== undefined && quantidade !== null) {
    novaQtd = Math.max(0, parseInt(quantidade, 10) || 0);
  } else if (incremento !== undefined && incremento !== null) {
    novaQtd = Math.max(0, qtdAnterior + (parseInt(incremento, 10) || 0));
  }

  memoryProducts[idx].quantidade = novaQtd;
  memoryProducts[idx].atualizado_em = new Date().toISOString();

  memoryMovements.unshift({
    id: `MOV-${Date.now()}`,
    produto_id: id,
    tipo: novaQtd >= qtdAnterior ? 'recebimento' : 'ajuste',
    quantidade: Math.abs(novaQtd - qtdAnterior),
    quantidade_anterior: qtdAnterior,
    quantidade_nova: novaQtd,
    detalhes: motivo,
    usuario,
    criado_em: new Date().toISOString(),
  });

  const updatedProd = loadMemoryProductExtras(memoryProducts[idx]);
  return res.json({
    product: updatedProd,
    quantidade_anterior: qtdAnterior,
    quantidade_nova: novaQtd,
    message: `Estoque atualizado: ${qtdAnterior} → ${novaQtd}`,
  });
});

// ==========================================
// 9b-1. GET /api/produtos/:id/historico
// ==========================================
produtosRouter.get('/produtos/:id/historico', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getDbPool();
  
  if (!pool) return res.json([]);
  
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT * FROM historico_alteracoes 
        WHERE produto_id = $1 
        ORDER BY criado_em DESC
      `, [id]);
      return res.json(rows);
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Erro ao buscar historico:', err.message);
    return res.status(500).json({ error: 'Falha ao buscar historico' });
  }
});

// ==========================================
// 9b-2. POST /api/produtos/:id/rollback/:historicoId
// ==========================================
produtosRouter.post('/produtos/:id/rollback/:historicoId', async (req: Request, res: Response) => {
  const { id, historicoId } = req.params;
  const { usuario } = req.body;
  const pool = getDbPool();
  
  if (!pool) return res.status(500).json({ error: 'DB não configurado' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Pega o registro do histórico
      const hist = await client.query('SELECT * FROM historico_alteracoes WHERE id = $1 AND produto_id = $2', [historicoId, id]);
      
      if (hist.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Registro de histórico não encontrado' });
      }

      const rec = hist.rows[0];
      const validFields = ['descricao', 'codigo_atual', 'codigo_fabrica', 'codigo_barras_atual', 'custo_unitario', 'preco_tabela', 'preco_sugerido', 'preco_minimo', 'quantidade', 'estoque_minimo', 'estoque_fisico', 'ncm', 'locacao'];
      
      if (!validFields.includes(rec.campo)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Campo não permitido para rollback automático' });
      }

      // Reverter o valor
      let finalValue: any = rec.valor_anterior;
      
      // Ajustes de tipo baseado no campo
      if (['custo_unitario', 'preco_tabela', 'preco_sugerido', 'preco_minimo'].includes(rec.campo)) {
        finalValue = finalValue ? Number(finalValue) : null;
      } else if (['quantidade', 'estoque_minimo', 'estoque_fisico'].includes(rec.campo)) {
        finalValue = finalValue ? parseInt(finalValue, 10) : 0;
      }

      await client.query(`UPDATE produtos SET ${rec.campo} = $1, atualizado_em = NOW() WHERE id = $2`, [finalValue, id]);

      // Gera novo registro de histórico
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, rec.campo, rec.valor_novo, rec.valor_anterior, 'Rollback / Desfazer Ação', usuario || 'Operador Almoxarifado']);

      await client.query('COMMIT');
      return res.json({ success: true, message: 'Alteração desfeita com sucesso!' });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Erro no rollback:', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9c. DELETE /api/produtos/:id (Exclusão Real com Integridade Referencial)
// ==========================================
produtosRouter.delete('/produtos/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getDbPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const check = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
      if (check.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produto não encontrado para exclusão.' });
      }
      const prod = check.rows[0];

      // 1. Preservar auditoria de movimentações históricas, desvinculando o produto (set NULL)
      await client.query(`
        UPDATE movimentacoes 
        SET produto_id = NULL, 
            detalhes = COALESCE(detalhes, '') || ' [Registro do produto ' || $1 || ' (' || $2 || ') excluído]'
        WHERE produto_id = $1
      `, [id, prod.descricao]);

      // 2. Remover relações com produtos genéricos/relacionados
      await client.query(`
        DELETE FROM produtos_relacionados 
        WHERE produto_id = $1 OR relacionado_id = $1
      `, [id]);

      // 3. Remover códigos associados na tabela codigos_produto
      await client.query('DELETE FROM codigos_produto WHERE produto_id = $1', [id]);

      // 4. Remover histórico de alterações do produto
      await client.query('DELETE FROM historico_alteracoes WHERE produto_id = $1', [id]);

      // 5. Excluir o produto do cadastro principal
      await client.query('DELETE FROM produtos WHERE id = $1', [id]);

      await client.query('COMMIT');
      return res.json({
        success: true,
        message: `Produto ${prod.id} (${prod.descricao}) foi excluído com sucesso do banco de dados.`,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao excluir produto do PostgreSQL:', err.message);
      return res.status(500).json({ error: 'Falha ao excluir produto: ' + err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  const idx = memoryProducts.findIndex(p => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Produto não encontrado para exclusão.' });
  }

  const deleted = memoryProducts.splice(idx, 1)[0];
  memoryCodeHistory = memoryCodeHistory.filter(c => c.produto_id !== id);
  memoryRelatedProducts = memoryRelatedProducts.filter(r => r.produto_id !== id && r.relacionado_id !== id);

  return res.json({
    success: true,
    message: `Produto ${deleted.id} (${deleted.descricao}) foi excluído com sucesso.`,
  });
});

// ==========================================
// 9d. Endpoints de Produtos Relacionados
// ==========================================
produtosRouter.get('/produtos/:id/relacionados', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      const rels = await client.query(`
        SELECT DISTINCT pr.id as rel_id, pr.motivo, p.id, p.codigo_atual, p.descricao, p.codigo_barras_atual, p.codigo_fabrica, p.quantidade, p.locacao, p.corredor, p.baia, p.nivel, p.preco_tabela, p.preco_sugerido, p.preco_minimo
        FROM produtos_relacionados pr
        JOIN produtos p ON (p.id = CASE WHEN pr.produto_id = $1 THEN pr.relacionado_id ELSE pr.produto_id END)
        WHERE (pr.produto_id = $1 OR pr.relacionado_id = $1) AND p.id <> $1
      `, [id]);
      const formatted = rels.rows.map((r: any) => ({
        ...r,
        quantidade: Number(r.quantidade) || 0,
        preco_tabela: Number(r.preco_tabela) || 0,
        preco_sugerido: Number(r.preco_sugerido) || 0,
        preco_minimo: Number(r.preco_minimo) || 0,
      }));
      return res.json({ relacionados: formatted });
    } finally {
      client.release();
    }
  }

  const relLinks = memoryRelatedProducts.filter(r => r.produto_id === id || r.relacionado_id === id);
  const relacionados = relLinks.map(r => {
    const targetId = r.produto_id === id ? r.relacionado_id : r.produto_id;
    const target = memoryProducts.find(p => p.id === targetId);
    return target ? {
      rel_id: r.id,
      motivo: r.motivo,
      id: target.id,
      codigo_atual: target.codigo_atual,
      descricao: target.descricao,
      codigo_barras_atual: target.codigo_barras_atual,
      codigo_fabrica: target.codigo_fabrica,
      quantidade: target.quantidade,
      locacao: target.locacao,
      corredor: target.corredor,
      baia: target.baia,
      nivel: target.nivel,
      preco_tabela: Number(target.preco_tabela) || 0,
      preco_sugerido: Number(target.preco_sugerido) || 0,
      preco_minimo: Number(target.preco_minimo) || 0,
    } : null;
  }).filter(Boolean);

  return res.json({ relacionados });
});

produtosRouter.post('/produtos/:id/relacionados', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { relacionado_id, codigo, codigo_generico, motivo = 'Peça genérica / compatível' } = req.body;

  let targetId = relacionado_id;
  const codeToFind = (codigo || codigo_generico || '').trim();

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      if (!targetId && codeToFind) {
        // Localizar produto pelo código de fábrica, código interno ou código de barras
        const searchRes = await client.query(`
          SELECT id, descricao, codigo_fabrica, codigo_atual FROM produtos
          WHERE UPPER(codigo_fabrica) = UPPER($1)
             OR UPPER(codigo_atual) = UPPER($1)
             OR UPPER(codigo_barras_atual) = UPPER($1)
             OR (LENGTH($1) >= 4 AND REPLACE(REPLACE(codigo_fabrica, ' ', ''), '-', '') = REPLACE(REPLACE($1, ' ', ''), '-', ''))
          LIMIT 1
        `, [codeToFind]);

        if (searchRes.rows.length === 0) {
          return res.status(404).json({ error: `Nenhum produto cadastrado encontrado com o código "${codeToFind}".` });
        }
        targetId = searchRes.rows[0].id;
      }

      if (!targetId || targetId === id) {
        return res.status(400).json({ error: 'ID ou código do produto relacionado é inválido ou igual ao próprio produto.' });
      }

      // 1. Inserir relação direta
      await client.query(`
        INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
        VALUES ($1, $2, $3)
        ON CONFLICT (produto_id, relacionado_id) DO NOTHING
      `, [id, targetId, motivo]);

      // 2. Unificar o grupo de genéricos: buscar todos os itens já ligados a A ou B e interconectar
      const existingPeers = await client.query(`
        SELECT DISTINCT CASE WHEN produto_id = $1 OR produto_id = $2 THEN relacionado_id ELSE produto_id END as peer_id
        FROM produtos_relacionados
        WHERE produto_id IN ($1, $2) OR relacionado_id IN ($1, $2)
      `, [id, targetId]);

      const allGroupIds = Array.from(new Set([id, targetId, ...existingPeers.rows.map(r => r.peer_id)]));
      for (const pA of allGroupIds) {
        for (const pB of allGroupIds) {
          if (pA !== pB) {
            await client.query(`
              INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
              VALUES ($1, $2, $3)
              ON CONFLICT (produto_id, relacionado_id) DO NOTHING
            `, [pA, pB, motivo]);
          }
        }
      }

      return res.status(201).json({ success: true, message: 'Produto genérico vinculado com sucesso.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // Fallback em memória
  if (!targetId && codeToFind) {
    const found = memoryProducts.find(p =>
      p.codigo_fabrica?.toUpperCase() === codeToFind.toUpperCase() ||
      p.codigo_atual?.toUpperCase() === codeToFind.toUpperCase() ||
      p.codigo_barras_atual?.toUpperCase() === codeToFind.toUpperCase()
    );
    if (!found) {
      return res.status(404).json({ error: `Nenhum produto cadastrado encontrado com o código "${codeToFind}".` });
    }
    targetId = found.id;
  }

  if (!targetId || targetId === id) {
    return res.status(400).json({ error: 'Produto relacionado inválido.' });
  }

  const exists = memoryRelatedProducts.some(
    r => (r.produto_id === id && r.relacionado_id === targetId) ||
         (r.produto_id === targetId && r.relacionado_id === id)
  );
  if (!exists) {
    memoryRelatedProducts.push({
      id: Date.now(),
      produto_id: id,
      relacionado_id: targetId,
      motivo,
      criado_em: new Date().toISOString(),
    });
  }
  return res.status(201).json({ success: true, message: 'Produto genérico vinculado com sucesso.' });
});

// Endpoint dedicado para desvincular código de barras
produtosRouter.post('/produtos/:id/desvincular-codigo-barras', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { motivo = 'Código de barras desvinculado manualmente', usuario = 'Operador Almoxarifado' } = req.body;
  const pool = getDbPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prodRes = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
      if (prodRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      const prev = prodRes.rows[0];
      const prevBarcode = prev.codigo_barras_atual;

      await client.query('UPDATE produtos SET codigo_barras_atual = NULL, atualizado_em = NOW() WHERE id = $1', [id]);

      if (prevBarcode) {
        await client.query(`
          UPDATE codigos_produto 
          SET ativo = false, desativado_em = NOW(), motivo = $2
          WHERE produto_id = $1 AND tipo = 'codigo_barras' AND ativo = true
        `, [id, motivo]);

        await client.query(`
          INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
          VALUES ($1, 'codigo_barras_atual', $2, NULL, $3, $4)
        `, [id, prevBarcode, motivo, usuario]);
      }

      await client.query('COMMIT');
      const updated = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
      const product = await loadProductExtras(client, updated.rows[0]);
      return res.json({ success: true, product, message: 'Código de barras desvinculado com sucesso!' });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro ao desvincular código de barras:', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  const idx = memoryProducts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
  memoryProducts[idx].codigo_barras_atual = undefined as any;
  memoryProducts[idx].atualizado_em = new Date().toISOString();
  memoryCodeHistory.forEach(c => {
    if (c.produto_id === id && c.tipo === 'codigo_barras' && c.ativo) {
      c.ativo = false;
      c.desativado_em = new Date().toISOString();
      c.motivo = motivo;
    }
  });
  const updatedProd = loadMemoryProductExtras(memoryProducts[idx]);
  return res.json({ success: true, product: updatedProd, message: 'Código de barras desvinculado com sucesso!' });
});

produtosRouter.delete('/produtos/:id/relacionados/:relacionadoId', async (req: Request, res: Response) => {
  const { id, relacionadoId } = req.params;
  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query(`
        DELETE FROM produtos_relacionados 
        WHERE (produto_id = $1 AND relacionado_id = $2)
           OR (produto_id = $2 AND relacionado_id = $1)
           OR (id::text = $2 AND (produto_id = $1 OR relacionado_id = $1))
      `, [id, relacionadoId]);
      return res.json({ success: true, message: 'Vínculo de produto relacionado removido.' });
    } finally {
      client.release();
    }
  }

  memoryRelatedProducts = memoryRelatedProducts.filter(
    r => !((r.produto_id === id && r.relacionado_id === relacionadoId) ||
           (r.produto_id === relacionadoId && r.relacionado_id === id) ||
           (String(r.id) === String(relacionadoId) && (r.produto_id === id || r.relacionado_id === id)))
  );
  return res.json({ success: true, message: 'Vínculo de produto relacionado removido.' });
});
