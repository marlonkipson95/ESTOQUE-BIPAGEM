import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';

dotenv.config();

const itensDir = path.resolve('itens');

interface DBProduct {
  id: string;
  codigo_atual: string | null;
  codigo_fabrica: string | null;
  codigo_barras_atual: string | null;
  descricao: string;
  custo_unitario: number;
  preco_tabela: number;
  preco_sugerido: number;
  preco_minimo: number;
  quantidade: number;
  estoque_minimo: number;
  corredor: string | null;
  baia: string | null;
  nivel: string | null;
  locacao: string | null;
  ncm?: string | null;
  ultima_venda?: string | null;
  ultima_compra?: string | null;
  estoque_fisico?: number | null; 
}

interface SourceProduct {
  cod_original: string;
  cod_produto?: string;
  descricao?: string;
  codigo_barras?: string[];
  estoque_contabil?: number;
  estoque_fisico?: number;
  corredor?: string;
  baia?: string;
  nivel?: string;
  locacao?: string;
  preco_tabela?: number;
  preco_sugerido?: number;
  preco_minimo?: number;
  ultima_venda?: string;
  ultima_compra?: string;
  custo_unitario?: number;
  ncm?: string;
}

const sourceData = new Map<string, SourceProduct>();

function getOrCreateSource(codOriginal: string): SourceProduct {
  let prod = sourceData.get(codOriginal);
  if (!prod) {
    prod = { cod_original: codOriginal, codigo_barras: [] };
    sourceData.set(codOriginal, prod);
  }
  return prod;
}

function parseNumber(str: string): number | undefined {
  if (!str || str.trim() === '') return undefined;
  str = str.replace(/,/g, ''); 
  const n = parseFloat(str);
  return isNaN(n) ? undefined : n;
}

function parseDate(str: string): string | undefined {
  if (!str || str.trim() === '' || str.trim() === '-') return undefined;
  return str.trim();
}

console.log('Lendo descricao.txt...');
const descLines = fs.readFileSync(path.join(itensDir, 'descricao.txt'), 'latin1').split(/\r?\n/);
let inDescData = false;
for (const line of descLines) {
  if (line.startsWith('---------------')) {
    inDescData = true;
    continue;
  }
  if (inDescData && line.trim() !== '') {
    const codProduto = line.substring(0, 15).trim();
    const codOriginal = line.substring(16, 36).trim();
    if (!codOriginal) continue;
    const codBarras = line.substring(37, 62).trim();
    const estoqueStr = line.substring(63, 71).trim();
    const estoqueAtStr = line.substring(72, 82).trim();
    const descricao = line.substring(83).trim();

    const p = getOrCreateSource(codOriginal);
    if (codProduto) p.cod_produto = codProduto;
    if (codBarras && !p.codigo_barras!.includes(codBarras)) p.codigo_barras!.push(codBarras);
    if (estoqueStr) p.estoque_contabil = parseInt(estoqueStr, 10);
    if (estoqueAtStr) p.estoque_fisico = parseInt(estoqueAtStr, 10);
    if (descricao) p.descricao = descricao;
  }
}

console.log('Lendo estoquetodos.txt...');
const estLines = fs.readFileSync(path.join(itensDir, 'estoquetodos.txt'), 'latin1').split(/\r?\n/);
let inEstData = false;
for (const line of estLines) {
  if (line.startsWith('--------')) {
    inEstData = true;
    continue;
  }
  if (inEstData && line.trim() !== '') {
    const codOriginal = line.substring(10, 30).trim();
    if (!codOriginal) continue;
    const p = getOrCreateSource(codOriginal);
    const corre = line.substring(32, 37).trim();
    const baia = line.substring(39, 44).trim();
    const nivel = line.substring(46, 51).trim();
    if (corre) p.corredor = corre;
    if (baia) p.baia = baia;
    if (nivel) p.nivel = nivel;
    p.locacao = `${p.corredor||''}-${p.baia||''}-${p.nivel||''}`.replace(/^-|-$/g, '');

    const tab = parseNumber(line.substring(53, 68));
    const sug = parseNumber(line.substring(70, 85));
    const min = parseNumber(line.substring(87, 102));
    if (tab !== undefined) p.preco_tabela = tab;
    if (sug !== undefined) p.preco_sugerido = sug;
    if (min !== undefined) p.preco_minimo = min;

    const uVenda = parseDate(line.substring(104, 114));
    const uCompra = parseDate(line.substring(116, 126));
    if (uVenda) p.ultima_venda = uVenda;
    if (uCompra) p.ultima_compra = uCompra;

    const custo = parseNumber(line.substring(128, 143));
    if (custo !== undefined) p.custo_unitario = custo;

    const ncm = line.substring(145).trim();
    if (ncm) p.ncm = ncm.replace(/\D/g, ''); 
  }
}

console.log('Lendo codigo_barras.xlsx...');
const cbWb = xlsx.read(fs.readFileSync(path.join(itensDir, 'codigo_barras.xlsx')), { type: 'buffer' });
const cbData = xlsx.utils.sheet_to_json<any>(cbWb.Sheets[cbWb.SheetNames[0]]);
for (const row of cbData) {
  const codOrig = row['codigo original produto']?.toString().trim();
  const ean = row['codigo de barras']?.toString().trim();
  if (codOrig && ean) {
    const p = getOrCreateSource(codOrig);
    if (!p.codigo_barras!.includes(ean)) p.codigo_barras!.push(ean);
  }
}

console.log('Lendo preco.xlsx...');
const prWb = xlsx.read(fs.readFileSync(path.join(itensDir, 'preco.xlsx')), { type: 'buffer' });
const prData = xlsx.utils.sheet_to_json<any>(prWb.Sheets[prWb.SheetNames[0]]);
for (const row of prData) {
  const codOrig = row['codigo original do produto']?.toString().trim();
  if (codOrig) {
    const p = getOrCreateSource(codOrig);
    const tab = row['TABELA'];
    const sug = row['SUGERIDO'];
    const min = row['MINIMO'];
    if (typeof tab === 'number') p.preco_tabela = tab;
    if (typeof sug === 'number') p.preco_sugerido = sug;
    if (typeof min === 'number') p.preco_minimo = min;
  }
}

console.log(`Total de registros consolidados das fontes: ${sourceData.size}`);

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('Conectado ao banco de dados.');

  try {
    const res = await client.query('SELECT * FROM produtos');
    const dbProducts = res.rows as DBProduct[];
    console.log(`Produtos no banco: ${dbProducts.length}`);

    const resHist = await client.query("SELECT * FROM codigos_produto WHERE tipo = 'codigo_barras' AND ativo = true");
    const dbHistoryEan = resHist.rows;

    // Report Counters
    let totalConfirmado = 0;
    let totalSemAlteracao = 0;
    let totalComAlteracao = 0;
    let totalComplementado = 0;
    let totalNovo = 0;
    let totalConflito = 0;
    let totalPendente = 0;

    const stats = {
      descricao: { alteradas: 0, mantidas: 0, complementadas: 0 },
      ean: { adicionados: 0, mantidos: 0, conflitos: 0 },
      ncm: { adicionados: 0, alterados: 0, mantidos: 0 },
      precos: { alterados: 0 },
      estoque: { alterados: 0 },
      localizacao: { alteradas: 0 },
      custo: { alterados: 0 },
      ultima_venda: { atualizadas: 0 },
      ultima_compra: { atualizadas: 0 }
    };

    const changes: any[] = [];
    const conflicts: any[] = [];
    const novos: any[] = [];
    const unchanged: any[] = [];

    for (const [codOrig, source] of sourceData.entries()) {
      // Find matches
      let matchedDbProducts = dbProducts.filter(p => p.codigo_fabrica === codOrig);
      
      if (matchedDbProducts.length === 0 && source.cod_produto) {
        matchedDbProducts = dbProducts.filter(p => p.codigo_atual === source.cod_produto);
      }
      
      if (matchedDbProducts.length === 0 && source.codigo_barras && source.codigo_barras.length > 0) {
        matchedDbProducts = dbProducts.filter(p => source.codigo_barras!.includes(p.codigo_barras_atual || ''));
      }

      if (matchedDbProducts.length > 1) {
        conflicts.push({
          codOriginal: codOrig,
          produto: matchedDbProducts.map(p => p.id).join(', '),
          campo: 'Identidade',
          valorBanco: 'Vários produtos',
          valorFonte: 'Um registro',
          arquivo: 'Múltiplos',
          tipoConflito: 'Conflito de Identidade (Múltiplos no banco)',
          decisao: 'REVISÃO MANUAL'
        });
        totalConflito++;
        continue;
      }

      if (matchedDbProducts.length === 1) {
        // MATCH CONFIRMADO
        totalConfirmado++;
        const dbP = matchedDbProducts[0];
        let hasChanges = false;
        let isComplement = false;

        // Compare Descricao
        if (source.descricao) {
          if (!dbP.descricao) {
            stats.descricao.complementadas++;
            hasChanges = true;
            isComplement = true;
            changes.push({ codOrig, idInterno: dbP.id, campo: 'descricao', antes: '', depois: source.descricao, fonte: 'descricao.txt', motivo: 'Complementado' });
          } else if (source.descricao !== dbP.descricao) {
            stats.descricao.alteradas++;
            hasChanges = true;
            changes.push({ codOrig, idInterno: dbP.id, campo: 'descricao', antes: dbP.descricao, depois: source.descricao, fonte: 'descricao.txt', motivo: 'Atualizado' });
          } else {
            stats.descricao.mantidas++;
          }
        }

        // Compare EAN
        if (source.codigo_barras && source.codigo_barras.length > 0) {
          const mainEan = source.codigo_barras[0];
          if (!dbP.codigo_barras_atual) {
            stats.ean.adicionados++;
            hasChanges = true;
            isComplement = true;
            changes.push({ codOrig, idInterno: dbP.id, campo: 'codigo_barras_atual', antes: '', depois: mainEan, fonte: 'codigo_barras.xlsx', motivo: 'Complementado' });
          } else if (mainEan !== dbP.codigo_barras_atual) {
            // Se diferente, vai virar multiplo EAN e arquivar o antigo, o novo entra como principal
            stats.ean.adicionados++;
            hasChanges = true;
            changes.push({ codOrig, idInterno: dbP.id, campo: 'codigo_barras_atual', antes: dbP.codigo_barras_atual, depois: mainEan, fonte: 'codigo_barras.xlsx', motivo: 'Alteração completa (vai arquivar antigo)' });
          } else {
            stats.ean.mantidos++;
          }
        }

        // Compare Precos
        if (source.preco_tabela !== undefined && Number(source.preco_tabela) !== Number(dbP.preco_tabela)) {
          stats.precos.alterados++; hasChanges = true;
          changes.push({ codOrig, idInterno: dbP.id, campo: 'preco_tabela', antes: dbP.preco_tabela, depois: source.preco_tabela, fonte: 'preco.xlsx', motivo: 'Atualizado' });
        }
        if (source.preco_sugerido !== undefined && Number(source.preco_sugerido) !== Number(dbP.preco_sugerido)) {
          hasChanges = true;
          changes.push({ codOrig, idInterno: dbP.id, campo: 'preco_sugerido', antes: dbP.preco_sugerido, depois: source.preco_sugerido, fonte: 'preco.xlsx', motivo: 'Atualizado' });
        }
        if (source.preco_minimo !== undefined && Number(source.preco_minimo) !== Number(dbP.preco_minimo)) {
          hasChanges = true;
          changes.push({ codOrig, idInterno: dbP.id, campo: 'preco_minimo', antes: dbP.preco_minimo, depois: source.preco_minimo, fonte: 'preco.xlsx', motivo: 'Atualizado' });
        }

        // Compare Estoque Contábil
        if (source.estoque_contabil !== undefined && Number(source.estoque_contabil) !== Number(dbP.quantidade)) {
          stats.estoque.alterados++; hasChanges = true;
          changes.push({ codOrig, idInterno: dbP.id, campo: 'quantidade', antes: dbP.quantidade, depois: source.estoque_contabil, fonte: 'descricao.txt', motivo: 'Atualizado' });
        }

        // Compare Estoque Físico
        if (source.estoque_fisico !== undefined && Number(source.estoque_fisico) !== Number(dbP.estoque_fisico || 0)) {
          hasChanges = true;
          changes.push({ codOrig, idInterno: dbP.id, campo: 'estoque_fisico', antes: dbP.estoque_fisico || 0, depois: source.estoque_fisico, fonte: 'descricao.txt', motivo: 'Atualizado' });
        }

        // NCM
        if (source.ncm && source.ncm !== dbP.ncm) {
          if (!dbP.ncm) {
            stats.ncm.adicionados++; isComplement = true; hasChanges = true;
            changes.push({ codOrig, idInterno: dbP.id, campo: 'ncm', antes: '', depois: source.ncm, fonte: 'estoquetodos.txt', motivo: 'Complementado' });
          } else {
            stats.ncm.alterados++; hasChanges = true;
            changes.push({ codOrig, idInterno: dbP.id, campo: 'ncm', antes: dbP.ncm, depois: source.ncm, fonte: 'estoquetodos.txt', motivo: 'Atualizado' });
          }
        }

        // Ultima Venda/Compra
        if (source.ultima_venda && source.ultima_venda !== dbP.ultima_venda) {
          stats.ultima_venda.atualizadas++; hasChanges = true;
          changes.push({ codOrig, idInterno: dbP.id, campo: 'ultima_data_venda', antes: dbP.ultima_venda || '', depois: source.ultima_venda, fonte: 'estoquetodos.txt', motivo: 'Atualizado' });
        }
        if (source.ultima_compra && source.ultima_compra !== dbP.ultima_compra) {
          stats.ultima_compra.atualizadas++; hasChanges = true;
          changes.push({ codOrig, idInterno: dbP.id, campo: 'ultima_data_compra', antes: dbP.ultima_compra || '', depois: source.ultima_compra, fonte: 'estoquetodos.txt', motivo: 'Atualizado' });
        }

        // Custo
        const validCusto = source.custo_unitario !== undefined && source.custo_unitario > 0.01;
        if (validCusto && Number(source.custo_unitario) !== Number(dbP.custo_unitario)) {
          stats.custo.alterados++; hasChanges = true;
          changes.push({ codOrig, idInterno: dbP.id, campo: 'custo_unitario', antes: dbP.custo_unitario, depois: source.custo_unitario, fonte: 'estoquetodos.txt', motivo: 'Atualizado' });
        }

        // Localização
        if (source.locacao) {
          if (!dbP.locacao) {
            stats.localizacao.alteradas++; hasChanges = true; isComplement = true;
            changes.push({ codOrig, idInterno: dbP.id, campo: 'locacao', antes: '', depois: source.locacao, fonte: 'estoquetodos.txt', motivo: 'Complementado' });
          } else if (source.locacao !== dbP.locacao) {
            stats.localizacao.alteradas++; hasChanges = true;
            changes.push({ codOrig, idInterno: dbP.id, campo: 'locacao', antes: dbP.locacao, depois: source.locacao, fonte: 'estoquetodos.txt', motivo: 'Atualizado' });
          }
        }

        if (hasChanges) {
          if (isComplement) totalComplementado++;
          else totalComAlteracao++;
        } else {
          totalSemAlteracao++;
          unchanged.push({ codOrig, idInterno: dbP.id, motivo: 'SEM ALTERAÇÃO' });
        }
      } else {
        // NÃO EXISTE NO BANCO -> NOVO
        if (source.descricao) {
          totalNovo++;
          novos.push(source);
        } else {
          totalPendente++;
        }
      }
    }

    const report = {
      TOTAL_ANALISADOS: sourceData.size,
      TOTAL_CONFIRMADO: totalConfirmado,
      TOTAL_SEM_ALTERACAO: totalSemAlteracao,
      TOTAL_COM_ALTERACAO: totalComAlteracao,
      TOTAL_COMPLEMENTADO: totalComplementado,
      TOTAL_NOVO: totalNovo,
      TOTAL_CONFLITO: totalConflito,
      TOTAL_PENDENTE: totalPendente,
      ESTATISTICAS: stats,
    };

    fs.writeFileSync(path.resolve('RELATORIO_PRE_IMPORTACAO.json'), JSON.stringify({ report, changes, conflicts, novos, unchanged }, null, 2));
    console.log('Dry-run concluído e RELATORIO_PRE_IMPORTACAO.json gerado.');

  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
