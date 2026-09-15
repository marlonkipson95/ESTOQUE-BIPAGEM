import { Router, Request, Response } from 'express';
import { getDbPool, checkDatabaseConnection } from './db.js';

export const apiRouter = Router();

// Fallback in-memory store if DATABASE_URL is not set yet
interface MemoryProduct {
  id: string;
  codigo_atual: string;
  codigo_fabrica: string;
  codigo_barras_atual: string;
  descricao: string;
  custo_unitario: number;
  quantidade: number;
  estoque_minimo: number;
  corredor: string;
  baia: string;
  nivel: string;
  locacao: string;
  codigos_alternativos?: string[];
  produtos_relacionados?: any[];
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
      SELECT pr.id as rel_id, pr.motivo, p.id, p.codigo_atual, p.descricao, p.codigo_barras_atual, p.codigo_fabrica, p.quantidade, p.locacao, p.corredor, p.baia, p.nivel
      FROM produtos_relacionados pr
      JOIN produtos p ON (p.id = CASE WHEN pr.produto_id = $1 THEN pr.relacionado_id ELSE pr.produto_id END)
      WHERE pr.produto_id = $1 OR pr.relacionado_id = $1
    `, [product.id]);
    product.produtos_relacionados = rels.rows;
  } catch (e) {
    product.produtos_relacionados = [];
  }

  if (typeof product.codigos_alternativos === 'string') {
    product.codigos_alternativos = product.codigos_alternativos
      .split(/[,;\n]/)
      .map((s: string) => s.trim())
      .filter(Boolean);
  } else if (!Array.isArray(product.codigos_alternativos)) {
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
    } : null;
  }).filter(Boolean);

  if (typeof product.codigos_alternativos === 'string') {
    product.codigos_alternativos = product.codigos_alternativos
      .split(/[,;\n]/)
      .map((s: string) => s.trim())
      .filter(Boolean);
  } else if (!Array.isArray(product.codigos_alternativos)) {
    product.codigos_alternativos = [];
  }
  return product;
}

// ==========================================
// 1. GET /api/health
// ==========================================
apiRouter.get('/health', async (req: Request, res: Response) => {
  const check = await checkDatabaseConnection();
  res.json({
    status: 'ok',
    database: check.connected ? 'connected' : 'disconnected',
    provider: check.connected ? 'neon-postgresql' : 'memory-fallback',
    error: check.error || null,
  });
});

// ==========================================
// 2. GET /api/dashboard/stats
// ==========================================
apiRouter.get('/dashboard/stats', async (req: Request, res: Response) => {
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const totalRes = await client.query('SELECT COUNT(*) as count FROM produtos');
        const comEstoqueRes = await client.query('SELECT COUNT(*) as count FROM produtos WHERE quantidade > 0');
        const semEstoqueRes = await client.query('SELECT COUNT(*) as count FROM produtos WHERE quantidade = 0');
        const semLocacaoRes = await client.query("SELECT COUNT(*) as count FROM produtos WHERE (corredor = '' OR corredor IS NULL) AND (locacao = '' OR locacao IS NULL)");
        const semBarcodeRes = await client.query("SELECT COUNT(*) as count FROM produtos WHERE (codigo_barras_atual = '' OR codigo_barras_atual IS NULL)");
        const codigosAltRes = await client.query('SELECT COUNT(*) as count FROM codigos_produto WHERE desativado_em IS NOT NULL');
        const lotesRes = await client.query('SELECT * FROM lotes_importacao ORDER BY criado_em DESC LIMIT 5');

        return res.json({
          total_produtos: parseInt(totalRes.rows[0].count, 10),
          com_estoque: parseInt(comEstoqueRes.rows[0].count, 10),
          sem_estoque: parseInt(semEstoqueRes.rows[0].count, 10),
          sem_localizacao: parseInt(semLocacaoRes.rows[0].count, 10),
          sem_codigo_barras: parseInt(semBarcodeRes.rows[0].count, 10),
          codigos_alterados_recentes: parseInt(codigosAltRes.rows[0].count, 10),
          ultimas_importacoes: lotesRes.rows,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao obter stats do PostgreSQL:', err.message);
    }
  }

  // Fallback memory
  const total = memoryProducts.length;
  const comEstoque = memoryProducts.filter(p => p.quantidade > 0).length;
  const semEstoque = memoryProducts.filter(p => p.quantidade === 0).length;
  const semLocacao = memoryProducts.filter(p => !p.corredor && !p.locacao).length;
  const semBarcode = memoryProducts.filter(p => !p.codigo_barras_atual).length;
  const codigosAlt = memoryCodeHistory.filter(c => !c.ativo).length;

  res.json({
    total_produtos: total,
    com_estoque: comEstoque,
    sem_estoque: semEstoque,
    sem_localizacao: semLocacao,
    sem_codigo_barras: semBarcode,
    codigos_alterados_recentes: codigosAlt,
    ultimas_importacoes: memoryImportBatches,
  });
});

// ==========================================
// 3. POST /api/produtos/scan (Motor de Bipagem)
// ==========================================
apiRouter.post('/produtos/scan', async (req: Request, res: Response) => {
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
        // ETAPA 1: Código atual (código de barras, código interno ou código de fábrica direto)
        const etapa1 = await client.query(`
          SELECT * FROM produtos 
          WHERE UPPER(codigo_barras_atual) = UPPER($1) 
             OR UPPER(codigo_atual) = UPPER($1)
             OR UPPER(codigo_fabrica) = UPPER($1)
             OR (LENGTH($2) >= 4 AND (
                  REPLACE(REPLACE(REPLACE(codigo_barras_atual, ' ', ''), '-', ''), '.', '') = $2
               OR REPLACE(REPLACE(REPLACE(codigo_atual, ' ', ''), '-', ''), '.', '') = $2
               OR REPLACE(REPLACE(REPLACE(codigo_fabrica, ' ', ''), '-', ''), '.', '') = $2
             ))
          LIMIT 1
        `, [cleanCode, normalizedCode]);

        if (etapa1.rows.length > 0) {
          const product = await loadProductExtras(client, etapa1.rows[0]);
          const isBarcode = product.codigo_barras_atual?.replace(/[\s\.-]/g, '').toUpperCase() === normalizedCode.toUpperCase();
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
          WHERE (UPPER(c.codigo) = UPPER($1) OR (LENGTH($2) >= 4 AND REPLACE(REPLACE(REPLACE(c.codigo, ' ', ''), '-', ''), '.', '') = $2))
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
          WHERE UPPER(codigo_fabrica) = UPPER($1)
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

        // ETAPA 4: Não cadastrado
        return res.json({
          status: 'not_found',
          scannedCode: cleanCode,
          message: 'Código não localizado na base de dados.',
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
         p.codigo_atual?.toUpperCase() === cleanCode.toUpperCase()
  );
  if (p1) {
    return res.json({
      status: 'found_current',
      product: p1,
      activeCodeType: p1.codigo_barras_atual?.toUpperCase() === cleanCode.toUpperCase() ? 'codigo_barras' : 'codigo_produto',
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

  // Etapa 4
  return res.json({
    status: 'not_found',
    scannedCode: cleanCode,
  });
});

// ==========================================
// 4. GET /api/produtos (Listagem e Consulta Livre)
// ==========================================
apiRouter.get('/produtos', async (req: Request, res: Response) => {
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
          SELECT p.* FROM produtos p
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

  const paginated = filtered.slice(offset, offset + limitNum);

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
apiRouter.get('/produtos/:id', async (req: Request, res: Response) => {
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
apiRouter.post('/produtos', async (req: Request, res: Response) => {
  const {
    descricao,
    codigo_atual,
    codigo_fabrica,
    codigo_barras_atual,
    custo_unitario = 0,
    quantidade = 0,
    estoque_minimo = 0,
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
          descricao, custo_unitario, quantidade, estoque_minimo, 
          corredor, baia, nivel, locacao, criado_em, atualizado_em
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING *
      `, [
        newId,
        finalCode,
        cleanFactory,
        cleanBarcode,
        descricao.trim(),
        Number(custo_unitario) || 0,
        parseInt(quantidade, 10) || 0,
        parseInt(estoque_minimo, 10) || 0,
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
apiRouter.patch('/produtos/:id/localizacao', async (req: Request, res: Response) => {
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
apiRouter.post('/produtos/:id/codigo', async (req: Request, res: Response) => {
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
// 9. PUT /api/produtos/:id (Edição Completa do Cadastro)
// ==========================================
apiRouter.put('/produtos/:id', async (req: Request, res: Response) => {
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
    corredor,
    baia,
    nivel,
    locacao,
  } = req.body;

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

      // Se código de barras mudou, arquivar o anterior
      if (codigo_barras_atual && codigo_barras_atual.trim() !== prev.codigo_barras_atual) {
        await client.query(`
          UPDATE codigos_produto 
          SET ativo = false, desativado_em = NOW(), motivo = 'Alteração completa de cadastro'
          WHERE produto_id = $1 AND tipo = 'codigo_barras' AND ativo = true
        `, [id]);

        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_barras', $2, true, 'Alteração completa de cadastro')
        `, [id, codigo_barras_atual.trim()]);
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
          corredor = $11,
          baia = $12,
          nivel = $13,
          locacao = $14,
          atualizado_em = NOW()
        WHERE id = $15
        RETURNING *
      `, [
        descricao?.trim() || prev.descricao,
        codigo_atual?.trim() || prev.codigo_atual,
        codigo_fabrica?.trim() || prev.codigo_fabrica,
        codigo_barras_atual?.trim() || prev.codigo_barras_atual,
        custo_unitario !== undefined ? Number(custo_unitario) : prev.custo_unitario,
        preco_tabela !== undefined ? Number(preco_tabela) : prev.preco_tabela,
        preco_sugerido !== undefined ? Number(preco_sugerido) : prev.preco_sugerido,
        preco_minimo !== undefined ? Number(preco_minimo) : prev.preco_minimo,
        quantidade !== undefined ? parseInt(quantidade, 10) : prev.quantidade,
        estoque_minimo !== undefined ? parseInt(estoque_minimo, 10) : prev.estoque_minimo,
        corredor?.trim() ?? prev.corredor,
        baia?.trim() ?? prev.baia,
        nivel?.trim() ?? prev.nivel,
        finalLoc,
        id,
      ]);

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
apiRouter.patch('/produtos/:id/estoque', async (req: Request, res: Response) => {
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
// 9c. DELETE /api/produtos/:id (Exclusão Real com Integridade Referencial)
// ==========================================
apiRouter.delete('/produtos/:id', async (req: Request, res: Response) => {
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
apiRouter.get('/produtos/:id/relacionados', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      const rels = await client.query(`
        SELECT pr.id as rel_id, pr.motivo, p.id, p.codigo_atual, p.descricao, p.codigo_barras_atual, p.codigo_fabrica, p.quantidade, p.locacao, p.corredor, p.baia, p.nivel
        FROM produtos_relacionados pr
        JOIN produtos p ON (p.id = CASE WHEN pr.produto_id = $1 THEN pr.relacionado_id ELSE pr.produto_id END)
        WHERE pr.produto_id = $1 OR pr.relacionado_id = $1
      `, [id]);
      return res.json({ relacionados: rels.rows });
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
    } : null;
  }).filter(Boolean);

  return res.json({ relacionados });
});

apiRouter.post('/produtos/:id/relacionados', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { relacionado_id, motivo = 'Similar / Genérico' } = req.body;

  if (!relacionado_id || relacionado_id === id) {
    return res.status(400).json({ error: 'ID do produto relacionado é inválido.' });
  }

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
        VALUES ($1, $2, $3)
        ON CONFLICT (produto_id, relacionado_id) DO NOTHING
      `, [id, relacionado_id, motivo]);
      return res.status(201).json({ success: true, message: 'Produto relacionado vinculado com sucesso.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  const exists = memoryRelatedProducts.some(
    r => (r.produto_id === id && r.relacionado_id === relacionado_id) ||
         (r.produto_id === relacionado_id && r.relacionado_id === id)
  );
  if (!exists) {
    memoryRelatedProducts.push({
      id: Date.now(),
      produto_id: id,
      relacionado_id,
      motivo,
      criado_em: new Date().toISOString(),
    });
  }
  return res.status(201).json({ success: true, message: 'Produto relacionado vinculado com sucesso.' });
});

apiRouter.delete('/produtos/:id/relacionados/:relacionadoId', async (req: Request, res: Response) => {
  const { id, relacionadoId } = req.params;
  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query(`
        DELETE FROM produtos_relacionados 
        WHERE (produto_id = $1 AND relacionado_id = $2)
           OR (produto_id = $2 AND relacionado_id = $1)
      `, [id, relacionadoId]);
      return res.json({ success: true, message: 'Vínculo de produto relacionado removido.' });
    } finally {
      client.release();
    }
  }

  memoryRelatedProducts = memoryRelatedProducts.filter(
    r => !((r.produto_id === id && r.relacionado_id === relacionadoId) ||
           (r.produto_id === relacionadoId && r.relacionado_id === id))
  );
  return res.json({ success: true, message: 'Vínculo de produto relacionado removido.' });
});

// ==========================================
// 9e. POST /api/importar/comparar (Classificação Inteligente: Novo, Sem Alteração, Com Alteração)
// ==========================================
apiRouter.post('/importar/comparar', async (req: Request, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nenhum item enviado para comparação.' });
  }

  const pool = getDbPool();
  const comparisonItems: any[] = [];
  let novosCount = 0;
  let semAlteracaoCount = 0;
  let comAlteracaoCount = 0;

  if (pool) {
    const client = await pool.connect();
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const desc = item.descricao?.trim() || '';
        if (!desc) continue;

        const codAtual = item.codigo_atual?.trim() || '';
        const barcode = item.codigo_barras_atual?.trim() || '';
        const codFabrica = item.codigo_fabrica?.trim() || '';

        // Prioridade mandatória de reconhecimento: 1. Código interno -> 2. EAN -> 3. Código do Fabricante
        let existingProd: any = null;
        let matchedBy: string | undefined;

        if (codAtual) {
          const resC = await client.query('SELECT * FROM produtos WHERE UPPER(codigo_atual) = UPPER($1) LIMIT 1', [codAtual]);
          if (resC.rows.length > 0) {
            existingProd = resC.rows[0];
            matchedBy = 'codigo_interno';
          }
        }

        if (!existingProd && barcode) {
          const resB = await client.query('SELECT * FROM produtos WHERE UPPER(codigo_barras_atual) = UPPER($1) LIMIT 1', [barcode]);
          if (resB.rows.length > 0) {
            existingProd = resB.rows[0];
            matchedBy = 'codigo_barras';
          }
        }

        if (!existingProd && codFabrica) {
          const resF = await client.query('SELECT * FROM produtos WHERE UPPER(codigo_fabrica) = UPPER($1) LIMIT 1', [codFabrica]);
          if (resF.rows.length > 0) {
            existingProd = resF.rows[0];
            matchedBy = 'codigo_fabrica';
          }
        }

        if (existingProd) {
          const changes: { field: string; label: string; currentValue: string; newValue: string }[] = [];

          const newLoc = item.locacao?.trim() || (item.corredor || item.baia || item.nivel ? `${item.corredor}-${item.baia}-${item.nivel}`.replace(/^-|-$/g, '') : '');
          const currLoc = existingProd.locacao || (existingProd.corredor || existingProd.baia || existingProd.nivel ? `${existingProd.corredor}-${existingProd.baia}-${existingProd.nivel}`.replace(/^-|-$/g, '') : '');
          if (newLoc && newLoc !== currLoc) {
            changes.push({ field: 'locacao', label: 'Localização', currentValue: currLoc || 'Sem localização', newValue: newLoc });
          }

          if (barcode && barcode !== existingProd.codigo_barras_atual) {
            changes.push({ field: 'codigo_barras', label: 'Código de Barras (EAN)', currentValue: existingProd.codigo_barras_atual || 'Não cadastrado', newValue: barcode });
          }

          if (codFabrica && codFabrica !== existingProd.codigo_fabrica) {
            changes.push({ field: 'codigo_fabrica', label: 'Código Fabricante', currentValue: existingProd.codigo_fabrica || 'Não cadastrado', newValue: codFabrica });
          }

          if (desc && desc.toUpperCase() !== existingProd.descricao?.toUpperCase()) {
            changes.push({ field: 'descricao', label: 'Descrição', currentValue: existingProd.descricao, newValue: desc });
          }

          const newQtd = parseInt(item.quantidade, 10);
          if (!isNaN(newQtd) && newQtd > 0 && newQtd !== existingProd.quantidade) {
            changes.push({ field: 'quantidade', label: 'Estoque', currentValue: String(existingProd.quantidade), newValue: String(newQtd) });
          }

          const newCusto = Number(item.custo_unitario);
          if (!isNaN(newCusto) && newCusto > 0 && Math.abs(newCusto - Number(existingProd.custo_unitario)) > 0.001) {
            changes.push({ field: 'custo_unitario', label: 'Custo Unitário', currentValue: `R$ ${Number(existingProd.custo_unitario).toFixed(2)}`, newValue: `R$ ${newCusto.toFixed(2)}` });
          }

          if (changes.length > 0) {
            comAlteracaoCount++;
            comparisonItems.push({
              id: `comp-${i}`,
              status: 'com_alteracao',
              matchedBy,
              existingProduct: existingProd,
              importData: item,
              changes,
              selected: true,
            });
          } else {
            semAlteracaoCount++;
            comparisonItems.push({
              id: `comp-${i}`,
              status: 'sem_alteracao',
              matchedBy,
              existingProduct: existingProd,
              importData: item,
              changes: [],
              selected: false,
            });
          }
        } else {
          novosCount++;
          comparisonItems.push({
            id: `comp-${i}`,
            status: 'novo',
            importData: item,
            changes: [],
            selected: true,
          });
        }
      }

      return res.json({
        items: comparisonItems,
        summary: {
          total: comparisonItems.length,
          novos: novosCount,
          semAlteracao: semAlteracaoCount,
          comAlteracao: comAlteracaoCount,
        },
      });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  items.forEach((item, i) => {
    const desc = item.descricao?.trim() || '';
    if (!desc) return;
    const codAtual = item.codigo_atual?.trim() || '';
    const barcode = item.codigo_barras_atual?.trim() || '';
    const codFabrica = item.codigo_fabrica?.trim() || '';

    let existing = (codAtual ? memoryProducts.find(p => p.codigo_atual?.toUpperCase() === codAtual.toUpperCase()) : null) ||
                   (barcode ? memoryProducts.find(p => p.codigo_barras_atual?.toUpperCase() === barcode.toUpperCase()) : null) ||
                   (codFabrica ? memoryProducts.find(p => p.codigo_fabrica?.toUpperCase() === codFabrica.toUpperCase()) : null);

    if (existing) {
      const changes: any[] = [];
      if (barcode && barcode !== existing.codigo_barras_atual) {
        changes.push({ field: 'codigo_barras', label: 'Código de Barras (EAN)', currentValue: existing.codigo_barras_atual || 'Não cadastrado', newValue: barcode });
      }
      if (changes.length > 0) {
        comAlteracaoCount++;
        comparisonItems.push({ id: `comp-${i}`, status: 'com_alteracao', existingProduct: existing, importData: item, changes, selected: true });
      } else {
        semAlteracaoCount++;
        comparisonItems.push({ id: `comp-${i}`, status: 'sem_alteracao', existingProduct: existing, importData: item, changes: [], selected: false });
      }
    } else {
      novosCount++;
      comparisonItems.push({ id: `comp-${i}`, status: 'novo', importData: item, changes: [], selected: true });
    }
  });

  return res.json({
    items: comparisonItems,
    summary: { total: comparisonItems.length, novos: novosCount, semAlteracao: semAlteracaoCount, comAlteracao: comAlteracaoCount },
  });
});

// ==========================================
// 10. POST /api/importar (Carga de Dados em Lote com Regras de Proteção)
// ==========================================
apiRouter.post('/importar', async (req: Request, res: Response) => {
  const {
    items,
    fileName = 'arquivo_importado.csv',
    preserveExistingLocation = true,
    archiveOldBarcodesInHistory = true,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Lista de itens para importação está vazia.' });
  }

  let novos = 0;
  let atualizados = 0;
  let erros = 0;

  const pool = getDbPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of items) {
        if (!item.descricao || !item.descricao.trim()) {
          erros++;
          continue;
        }

        const barcode = item.codigo_barras_atual?.trim() || '';
        const codFabrica = item.codigo_fabrica?.trim() || '';
        const codAtual = item.codigo_atual?.trim() || '';

        // Procurar se produto existe respeitando a prioridade mandatória:
        // 1. Código Interno -> 2. Código de Barras (EAN) -> 3. Código do Fabricante
        let existingId: string | null = null;

        if (codAtual) {
          const findC = await client.query('SELECT id FROM produtos WHERE UPPER(codigo_atual) = UPPER($1) LIMIT 1', [codAtual]);
          if (findC.rows.length > 0) existingId = findC.rows[0].id;
        }

        if (!existingId && barcode) {
          const findB = await client.query('SELECT id FROM produtos WHERE UPPER(codigo_barras_atual) = UPPER($1) LIMIT 1', [barcode]);
          if (findB.rows.length > 0) existingId = findB.rows[0].id;
        }

        if (!existingId && codFabrica) {
          const findF = await client.query('SELECT id FROM produtos WHERE UPPER(codigo_fabrica) = UPPER($1) LIMIT 1', [codFabrica]);
          if (findF.rows.length > 0) existingId = findF.rows[0].id;
        }

        if (existingId) {
          // PRODUTO EXISTENTE: Atualizar sem perder localização física existente (Regra mandante)
          const curr = await client.query('SELECT * FROM produtos WHERE id = $1', [existingId]);
          const currProd = curr.rows[0];

          const finalCorredor = preserveExistingLocation ? (currProd.corredor || item.corredor || '') : (item.corredor || currProd.corredor || '');
          const finalBaia = preserveExistingLocation ? (currProd.baia || item.baia || '') : (item.baia || currProd.baia || '');
          const finalNivel = preserveExistingLocation ? (currProd.nivel || item.nivel || '') : (item.nivel || currProd.nivel || '');
          const finalLoc = preserveExistingLocation ? (currProd.locacao || item.locacao || '') : (item.locacao || currProd.locacao || '');

          // Se código de barras mudou e opção de arquivar está ligada
          if (barcode && barcode !== currProd.codigo_barras_atual && archiveOldBarcodesInHistory) {
            await client.query(`
              UPDATE codigos_produto 
              SET ativo = false, desativado_em = NOW(), motivo = $1
              WHERE produto_id = $2 AND tipo = 'codigo_barras' AND ativo = true
            `, [`Importação da planilha ${fileName}`, existingId]);

            await client.query(`
              INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
              VALUES ($1, 'codigo_barras', $2, true, $3)
            `, [existingId, barcode, `Importado de ${fileName}`]);
          }

          await client.query(`
            UPDATE produtos SET
              descricao = $1,
              codigo_fabrica = COALESCE(NULLIF($2, ''), codigo_fabrica),
              codigo_barras_atual = COALESCE(NULLIF($3, ''), codigo_barras_atual),
              quantidade = CASE WHEN $4 > 0 THEN $4 ELSE quantidade END,
              custo_unitario = CASE WHEN $5 > 0 THEN $5 ELSE custo_unitario END,
              corredor = $6,
              baia = $7,
              nivel = $8,
              locacao = $9,
              atualizado_em = NOW()
            WHERE id = $10
          `, [
            item.descricao.trim(),
            codFabrica,
            barcode,
            parseInt(item.quantidade, 10) || 0,
            Number(item.custo_unitario) || 0,
            finalCorredor,
            finalBaia,
            finalNivel,
            finalLoc,
            existingId,
          ]);

          atualizados++;
        } else {
          // NOVO PRODUTO
          const countRes = await client.query('SELECT COUNT(*) as count FROM produtos');
          const nextNum = parseInt(countRes.rows[0].count, 10) + 1;
          const newId = `PRD-${String(nextNum).padStart(4, '0')}`;
          const finalCode = codAtual || newId;
          const finalLoc = item.locacao || (item.corredor || item.baia || item.nivel ? `${item.corredor}-${item.baia}-${item.nivel}`.replace(/^-|-$/g, '') : '');

          await client.query(`
            INSERT INTO produtos (
              id, codigo_atual, codigo_fabrica, codigo_barras_atual,
              descricao, custo_unitario, quantidade, estoque_minimo,
              corredor, baia, nivel, locacao, criado_em, atualizado_em
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
          `, [
            newId,
            finalCode,
            codFabrica,
            barcode,
            item.descricao.trim(),
            Number(item.custo_unitario) || 0,
            parseInt(item.quantidade, 10) || 0,
            parseInt(item.estoque_minimo, 10) || 0,
            item.corredor || '',
            item.baia || '',
            item.nivel || '',
            finalLoc,
          ]);

          if (barcode) {
            await client.query(`
              INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
              VALUES ($1, 'codigo_barras', $2, true, 'Importação inicial')
            `, [newId, barcode]);
          }

          if (finalCode) {
            await client.query(`
              INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
              VALUES ($1, 'codigo_produto', $2, true, 'Importação inicial')
            `, [newId, finalCode]);
          }

          novos++;
        }
      }

      // Registrar lote
      await client.query(`
        INSERT INTO lotes_importacao (arquivo, total, novos, atualizados, erros, usuario)
        VALUES ($1, $2, $3, $4, $5, 'Operador Almoxarifado')
      `, [fileName, items.length, novos, atualizados, erros]);

      await client.query('COMMIT');
      return res.json({
        total: items.length,
        novos,
        atualizados,
        erros,
        message: 'Lote importado com sucesso no PostgreSQL Neon.',
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[API] Erro no lote de importação:', err.message);
      return res.status(500).json({ error: 'Falha na transação de importação: ' + err.message });
    } finally {
      client.release();
    }
  }

  // Fallback memory
  items.forEach(item => {
    if (!item.descricao) {
      erros++;
      return;
    }
    const codAtual = item.codigo_atual?.trim();
    const barcode = item.codigo_barras_atual?.trim();
    const codFabrica = item.codigo_fabrica?.trim();
    const existing = (codAtual ? memoryProducts.find(p => p.codigo_atual?.toUpperCase() === codAtual.toUpperCase()) : null) ||
                     (barcode ? memoryProducts.find(p => p.codigo_barras_atual?.toUpperCase() === barcode.toUpperCase()) : null) ||
                     (codFabrica ? memoryProducts.find(p => p.codigo_fabrica?.toUpperCase() === codFabrica.toUpperCase()) : null);
    if (existing) {
      atualizados++;
      existing.descricao = item.descricao;
      if (item.quantidade) existing.quantidade = parseInt(item.quantidade, 10) || existing.quantidade;
    } else {
      novos++;
      const nextId = `PRD-${String(memoryProducts.length + 1).padStart(4, '0')}`;
      memoryProducts.unshift({
        id: nextId,
        codigo_atual: item.codigo_atual || nextId,
        codigo_fabrica: item.codigo_fabrica || '',
        codigo_barras_atual: barcode || '',
        descricao: item.descricao,
        custo_unitario: Number(item.custo_unitario) || 0,
        quantidade: parseInt(item.quantidade, 10) || 0,
        estoque_minimo: 0,
        corredor: item.corredor || '',
        baia: item.baia || '',
        nivel: item.nivel || '',
        locacao: item.locacao || '',
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      });
    }
  });

  res.json({ total: items.length, novos, atualizados, erros });
});

// ==========================================
// 12. AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS
// Credenciais padrão: estoque / controle12
// ==========================================

interface MemoryUser {
  id: number | string;
  username: string;
  password?: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  criado_em: string;
  ultimo_login?: string;
}

const memoryUsers: MemoryUser[] = [
  {
    id: 1,
    username: 'estoque',
    password: 'controle12',
    nome: 'Operador Almoxarifado',
    cargo: 'Administrador',
    ativo: true,
    criado_em: new Date().toISOString(),
  },
];

// POST /api/auth/login
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM usuarios WHERE LOWER(username) = LOWER($1) AND ativo = true',
          [cleanUser]
        );

        if (result.rows.length > 0) {
          const user = result.rows[0];
          if (user.password === cleanPass) {
            await client.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [user.id]);
            const token = `token_${user.id}_${Date.now()}`;
            return res.json({
              success: true,
              token,
              user: {
                id: user.id,
                username: user.username,
                nome: user.nome,
                cargo: user.cargo,
                ativo: user.ativo,
                criado_em: user.criado_em,
                ultimo_login: new Date().toISOString(),
              },
            });
          }
        }
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao autenticar no PostgreSQL:', err.message);
    }
  }

  // Fallback memory check
  const memUser = memoryUsers.find(
    u => u.username.toLowerCase() === cleanUser && u.password === cleanPass && u.ativo
  );

  if (memUser) {
    memUser.ultimo_login = new Date().toISOString();
    const token = `token_${memUser.id}_${Date.now()}`;
    return res.json({
      success: true,
      token,
      user: {
        id: memUser.id,
        username: memUser.username,
        nome: memUser.nome,
        cargo: memUser.cargo,
        ativo: memUser.ativo,
        criado_em: memUser.criado_em,
        ultimo_login: memUser.ultimo_login,
      },
    });
  }

  return res.status(401).json({
    error: 'Credenciais inválidas. Verifique o usuário e senha informados.',
  });
});

// GET /api/usuarios (Listar usuários)
apiRouter.get('/usuarios', async (req: Request, res: Response) => {
  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT id, username, nome, cargo, ativo, criado_em, ultimo_login FROM usuarios ORDER BY id ASC'
        );
        return res.json({ users: result.rows });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao listar usuários no PostgreSQL:', err.message);
    }
  }

  // Fallback memory
  const sanitized = memoryUsers.map(({ password, ...rest }) => rest);
  return res.json({ users: sanitized });
});

// POST /api/usuarios (Cadastrar novo usuário)
apiRouter.post('/usuarios', async (req: Request, res: Response) => {
  const { username, password, nome, cargo = 'Operador Almoxarifado' } = req.body;

  if (!username || !password || !nome) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();
  const cleanNome = String(nome).trim();
  const cleanCargo = String(cargo).trim();

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const check = await client.query('SELECT id FROM usuarios WHERE LOWER(username) = LOWER($1)', [cleanUser]);
        if (check.rows.length > 0) {
          return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
        }

        const insert = await client.query(
          `INSERT INTO usuarios (username, password, nome, cargo, ativo, criado_em)
           VALUES ($1, $2, $3, $4, true, NOW())
           RETURNING id, username, nome, cargo, ativo, criado_em`,
          [cleanUser, cleanPass, cleanNome, cleanCargo]
        );

        return res.status(201).json({ user: insert.rows[0] });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao criar usuário no PostgreSQL:', err.message);
      return res.status(500).json({ error: 'Erro ao criar usuário: ' + err.message });
    }
  }

  // Fallback memory
  const exists = memoryUsers.some(u => u.username.toLowerCase() === cleanUser);
  if (exists) {
    return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
  }

  const newUser: MemoryUser = {
    id: Date.now(),
    username: cleanUser,
    password: cleanPass,
    nome: cleanNome,
    cargo: cleanCargo,
    ativo: true,
    criado_em: new Date().toISOString(),
  };
  memoryUsers.push(newUser);

  const { password: _, ...safeUser } = newUser;
  return res.status(201).json({ user: safeUser });
});

// PUT /api/usuarios/:id (Atualizar usuário/senha)
apiRouter.put('/usuarios/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { nome, password, cargo, ativo } = req.body;

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const sets: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (nome !== undefined) {
          sets.push(`nome = $${idx++}`);
          values.push(String(nome).trim());
        }
        if (cargo !== undefined) {
          sets.push(`cargo = $${idx++}`);
          values.push(String(cargo).trim());
        }
        if (password !== undefined && String(password).trim()) {
          sets.push(`password = $${idx++}`);
          values.push(String(password).trim());
        }
        if (ativo !== undefined) {
          sets.push(`ativo = $${idx++}`);
          values.push(Boolean(ativo));
        }

        if (sets.length === 0) {
          return res.status(400).json({ error: 'Nenhum dado informado para atualização.' });
        }

        values.push(id);
        const query = `
          UPDATE usuarios 
          SET ${sets.join(', ')} 
          WHERE id = $${idx}
          RETURNING id, username, nome, cargo, ativo, criado_em, ultimo_login
        `;

        const result = await client.query(query, values);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        return res.json({ user: result.rows[0] });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao atualizar usuário:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback memory
  const idx = memoryUsers.findIndex(u => String(u.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (nome !== undefined) memoryUsers[idx].nome = String(nome).trim();
  if (cargo !== undefined) memoryUsers[idx].cargo = String(cargo).trim();
  if (password !== undefined && String(password).trim()) memoryUsers[idx].password = String(password).trim();
  if (ativo !== undefined) memoryUsers[idx].ativo = Boolean(ativo);

  const { password: _, ...safeUser } = memoryUsers[idx];
  return res.json({ user: safeUser });
});

// DELETE /api/usuarios/:id (Excluir usuário - não permite excluir 'estoque')
apiRouter.delete('/usuarios/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const pool = getDbPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const userRes = await client.query('SELECT username FROM usuarios WHERE id = $1', [id]);
        if (userRes.rows.length === 0) {
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        if (userRes.rows[0].username.toLowerCase() === 'estoque') {
          return res.status(403).json({ error: 'O usuário mestre "estoque" não pode ser excluído.' });
        }

        await client.query('DELETE FROM usuarios WHERE id = $1', [id]);
        return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[API] Erro ao excluir usuário:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback memory
  const user = memoryUsers.find(u => String(u.id) === String(id));
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  if (user.username.toLowerCase() === 'estoque') {
    return res.status(403).json({ error: 'O usuário mestre "estoque" não pode ser excluído.' });
  }

  const idx = memoryUsers.findIndex(u => String(u.id) === String(id));
  memoryUsers.splice(idx, 1);
  return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
});

