import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { getDbPool } from './db.js';

export const chatRouter = Router();

// ==========================================
// TIPOS E ESTADOS EM MEMÓRIA
// ==========================================

// 1. Orçamentos Pendentes
interface PendingBudgetItem {
  produto_id: string;
  codigo: string;
  codigo_fabrica?: string;
  descricao: string;
  locacao?: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  preco_minimo?: number;
}

interface PendingBudget {
  sessionId: string;
  vendedor: string;
  nome_cliente: string;
  itens: PendingBudgetItem[];
  total_orcamento: number;
  criado_em: string;
}

const pendingBudgets = new Map<string, PendingBudget>();

// 2. Alterações de Produto Pendentes (Edição)
interface PendingProductUpdate {
  sessionId: string;
  produto_id: string;
  codigo_atual: string;
  descricao_original: string;
  campo: string; // 'descricao' | 'preco_sugerido' | 'preco_minimo' | 'preco_tabela' | 'locacao'
  campoLabel: string;
  valor_antigo: string;
  valor_novo: string;
  corredor?: string;
  baia?: string;
  nivel?: string;
}

const pendingProductUpdates = new Map<string, PendingProductUpdate>();

// 3. Cadastros de Novo Produto Pendentes
interface PendingProductCreation {
  sessionId: string;
  codigo_atual: string;
  descricao: string;
  locacao: string;
  corredor: string;
  baia: string;
  nivel: string;
  quantidade: number;
  preco_sugerido?: number;
  preco_minimo?: number;
  preco_tabela?: number;
}

const pendingProductCreations = new Map<string, PendingProductCreation>();

// 4. Listas Rápidas Ativas por Sessão
interface QuickListItemChat {
  id: string;
  codigo: string;
  locacao: string;
  comentario: string;
  cadastrado: boolean;
}

interface ActiveQuickList {
  id?: number;
  nome: string;
  responsavel: string;
  itens: QuickListItemChat[];
  criado_em: string;
}

const activeQuickLists = new Map<string, ActiveQuickList>();

// 5. Estados de Conversação (ex: aguardando nome da lista)
const sessionFlowStates = new Map<string, { state: 'waiting_list_name'; data?: any }>();

// ==========================================
// FUNÇÕES AUXILIARES DE FORMATAÇÃO
// ==========================================

function formatMoney(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d: Date = new Date()): string {
  return d.toLocaleDateString('pt-BR');
}

/**
 * Renderiza a tabela prévia em Markdown da Lista Rápida Ativa
 */
function renderQuickListTable(list: ActiveQuickList): string {
  let table = `📋 **Lista Rápida:** "${list.nome}" ${list.id ? `\`(#${list.id})\`` : '*(Rascunho não salvo)*'}\n`;
  table += `👤 Responsável: **${list.responsavel}** | Total de itens: **${list.itens.length}**\n\n`;

  if (list.itens.length === 0) {
    table += `*A lista está vazia no momento.*\n\n`;
  } else {
    table += `| # | Código | Locação | Comentário | Status no Banco |\n`;
    table += `| :-: | :--- | :---: | :--- | :---: |\n`;
    list.itens.forEach((item, idx) => {
      const status = item.cadastrado ? '✅ Cadastrado' : '⚠️ Não cadastrado';
      const loc = item.locacao ? `\`${item.locacao}\`` : '—';
      const com = item.comentario || '—';
      table += `| ${idx + 1} | **${item.codigo}** | ${loc} | ${com} | ${status} |\n`;
    });
    table += `\n`;
  }

  table += `💡 **O que você pode fazer agora:**\n`;
  table += `• Adicionar item: \`código, locação, comentário\` ou \`item Y, tem apenas 2 no estoque\`\n`;
  table += `• Adicionar múltiplos: \`cadastre os itens X, Y, Z\`\n`;
  table += `• Alterar item: \`altere o comentario do item 1 para "caixa danificada"\`\n`;
  table += `• Salvar no banco: \`salvar lista\`\n`;
  table += `• Descartar rascunho: \`descartar lista\``;

  return table;
}

/**
 * Busca produtos no banco de dados real (PostgreSQL Neon)
 */
async function searchProductDb(term: string): Promise<any[]> {
  const pool = getDbPool();
  if (!pool) return [];

  const clean = term.trim();
  if (!clean) return [];

  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao,
              quantidade, corredor, baia, nivel, locacao,
              preco_sugerido, preco_minimo, preco_tabela, custo_unitario
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1)
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
          OR codigo_atual ILIKE '%' || $1 || '%'
          OR codigo_fabrica ILIKE '%' || $1 || '%'
          OR codigo_barras_atual ILIKE '%' || $1 || '%'
          OR descricao ILIKE '%' || $1 || '%'
       ORDER BY 
          CASE 
            WHEN UPPER(codigo_atual) = UPPER($1) THEN 1
            WHEN UPPER(codigo_fabrica) = UPPER($1) THEN 2
            WHEN UPPER(codigo_barras_atual) = UPPER($1) THEN 3
            ELSE 4
          END
       LIMIT 6`,
      [clean]
    );
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Motor de interpretação de regras operacionais da Otto Diesel
 */
export async function processChatMessage(message: string, sessionId: string): Promise<string> {
  const cleanMsg = message.trim();
  const lower = cleanMsg.toLowerCase();

  // -------------------------------------------------------------
  // 0. TRATAMENTO DE ESTADO EM ESPERA (Ex: aguardando nome da lista)
  // -------------------------------------------------------------
  const sessionState = sessionFlowStates.get(sessionId);
  if (sessionState && sessionState.state === 'waiting_list_name') {
    sessionFlowStates.delete(sessionId);
    const listName = cleanMsg.replace(/^["']|["']$/g, '').trim();
    const newList: ActiveQuickList = {
      nome: listName || 'Lista Rápida ' + formatDate(),
      responsavel: 'Estoque',
      itens: [],
      criado_em: new Date().toISOString()
    };
    activeQuickLists.set(sessionId, newList);
    return `📝 **Lista Rápida Iniciada com Sucesso!**\n\n` + renderQuickListTable(newList);
  }

  // -------------------------------------------------------------
  // 1. COMANDO "CONFIRMAR" (case-insensitive)
  // -------------------------------------------------------------
  if (lower === 'confirmar' || lower.startsWith('confirmar ') || lower === 'sim' || lower === 'confirma') {
    const pool = getDbPool();
    if (!pool) {
      return '❌ Erro: Não foi possível conectar ao banco de dados para salvar a alteração.';
    }

    // A) Confirmação de Orçamento Pendente
    const pendingBudget = pendingBudgets.get(sessionId);
    if (pendingBudget) {
      const client = await pool.connect();
      try {
        const dbItens = pendingBudget.itens.map(item => ({
          id: item.produto_id,
          codigo_atual: item.codigo,
          codigo_fabrica: item.codigo_fabrica,
          descricao: item.descricao,
          locacao: item.locacao,
          quantidade: item.quantidade,
          valor_unitario: item.preco_unitario,
          subtotal: item.subtotal,
        }));

        const res = await client.query(
          `INSERT INTO orcamentos (nome_cliente, responsavel, itens, total_orcamento, criado_em, atualizado_em) 
           VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, criado_em`,
          [pendingBudget.nome_cliente, pendingBudget.vendedor, JSON.stringify(dbItens), pendingBudget.total_orcamento]
        );

        const savedId = res.rows[0]?.id || 'OK';
        pendingBudgets.delete(sessionId);

        return `✅ **Orçamento #${savedId} confirmado e gravado com sucesso!**\n\n` +
               `📅 **Data de geração:** ${formatDate()}\n` +
               `👤 **Vendedor:** ${pendingBudget.vendedor}\n` +
               `🏢 **Cliente:** ${pendingBudget.nome_cliente}\n` +
               `💰 **Valor Total:** ${formatMoney(pendingBudget.total_orcamento)}\n\n` +
               `Este orçamento já está salvo permanentemente no banco de dados e disponível na aba **Orçamentos** para visualização e impressão.`;
      } catch (err: any) {
        console.error('[Chat] Erro ao gravar orçamento:', err);
        return `❌ Erro ao salvar o orçamento no banco de dados: ${err.message}`;
      } finally {
        client.release();
      }
    }

    // B) Confirmação de Alteração de Produto
    const pendingUpdate = pendingProductUpdates.get(sessionId);
    if (pendingUpdate) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        if (pendingUpdate.campo === 'locacao') {
          await client.query(
            `UPDATE produtos 
             SET locacao = $1, corredor = $2, baia = $3, nivel = $4, atualizado_em = NOW() 
             WHERE id = $5`,
            [pendingUpdate.valor_novo, pendingUpdate.corredor || '', pendingUpdate.baia || '', pendingUpdate.nivel || '', pendingUpdate.produto_id]
          );
        } else if (['preco_sugerido', 'preco_minimo', 'preco_tabela'].includes(pendingUpdate.campo)) {
          const numVal = parseFloat(pendingUpdate.valor_novo.replace(',', '.'));
          await client.query(
            `UPDATE produtos 
             SET ${pendingUpdate.campo} = $1, atualizado_em = NOW() 
             WHERE id = $2`,
            [numVal, pendingUpdate.produto_id]
          );
        } else {
          await client.query(
            `UPDATE produtos 
             SET ${pendingUpdate.campo} = $1, atualizado_em = NOW() 
             WHERE id = $2`,
            [pendingUpdate.valor_novo, pendingUpdate.produto_id]
          );
        }

        // Registro de Auditoria
        await client.query(
          `INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            pendingUpdate.produto_id,
            pendingUpdate.campo,
            pendingUpdate.valor_antigo,
            pendingUpdate.valor_novo,
            'Alteração realizada via comando de voz/chat no Assistente Inteligente',
            'Assistente OttoDiesel'
          ]
        );

        await client.query('COMMIT');
        pendingProductUpdates.delete(sessionId);

        return `✅ **Alteração no Banco de Dados Concluída com Sucesso!**\n\n` +
               `📦 **Produto:** \`${pendingUpdate.codigo_atual}\` (${pendingUpdate.descricao_original})\n` +
               `✏️ **Campo Alterado:** **${pendingUpdate.campoLabel}**\n` +
               `🔴 **De:** ${pendingUpdate.valor_antigo}\n` +
               `🟢 **Para:** ${pendingUpdate.valor_novo}\n\n` +
               `O registro de auditoria foi gravado e a alteração já está ativa no sistema.`;
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[Chat] Erro ao atualizar produto:', err);
        return `❌ Erro ao atualizar produto no banco: ${err.message}`;
      } finally {
        client.release();
      }
    }

    // C) Confirmação de Cadastro de Novo Produto
    const pendingCreation = pendingProductCreations.get(sessionId);
    if (pendingCreation) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Gerar ID do produto
        const newId = 'PRD-' + Date.now().toString().slice(-6);

        await client.query(
          `INSERT INTO produtos (
             id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao,
             quantidade, corredor, baia, nivel, locacao,
             preco_sugerido, preco_minimo, preco_tabela, custo_unitario,
             criado_em, atualizado_em
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
          [
            newId,
            pendingCreation.codigo_atual,
            pendingCreation.codigo_atual,
            pendingCreation.codigo_atual,
            pendingCreation.descricao,
            pendingCreation.quantidade || 0,
            pendingCreation.corredor || '',
            pendingCreation.baia || '',
            pendingCreation.nivel || '',
            pendingCreation.locacao || 'Sem locação',
            pendingCreation.preco_sugerido || 0,
            pendingCreation.preco_minimo || 0,
            pendingCreation.preco_tabela || 0,
            0
          ]
        );

        // Registro de Auditoria
        await client.query(
          `INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            newId,
            'cadastro_inicial',
            'NÃO EXISTIA',
            `Código: ${pendingCreation.codigo_atual} | Descrição: ${pendingCreation.descricao}`,
            'Cadastro de novo produto via Assistente Inteligente',
            'Assistente OttoDiesel'
          ]
        );

        await client.query('COMMIT');
        pendingProductCreations.delete(sessionId);

        return `✅ **Novo Produto Cadastrado com Sucesso no Banco de Dados!**\n\n` +
               `* **ID:** \`${newId}\`\n` +
               `* **Código:** \`${pendingCreation.codigo_atual}\`\n` +
               `* **Descrição:** ${pendingCreation.descricao}\n` +
               `* **📍 Locação:** \`${pendingCreation.locacao || 'Sem locação'}\`\n` +
               `* **📦 Estoque Inicial:** ${pendingCreation.quantidade} unidades\n` +
               `* **💵 Preço Sugerido:** ${pendingCreation.preco_sugerido ? formatMoney(pendingCreation.preco_sugerido) : '—'}\n\n` +
               `A peça já está pronta para bipagem, busca física e orçamentos no galpão.`;
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[Chat] Erro ao cadastrar produto:', err);
        return `❌ Erro ao cadastrar produto no banco: ${err.message}`;
      } finally {
        client.release();
      }
    }

    return '⚠️ Não há nenhuma ação (orçamento, alteração ou cadastro) pendente de confirmação no momento.';
  }

  // -------------------------------------------------------------
  // 2. COMANDO "CANCELAR"
  // -------------------------------------------------------------
  if (lower === 'cancelar' || lower === 'descartar') {
    let cancelled = false;
    if (pendingBudgets.has(sessionId)) {
      pendingBudgets.delete(sessionId);
      cancelled = true;
    }
    if (pendingProductUpdates.has(sessionId)) {
      pendingProductUpdates.delete(sessionId);
      cancelled = true;
    }
    if (pendingProductCreations.has(sessionId)) {
      pendingProductCreations.delete(sessionId);
      cancelled = true;
    }
    if (sessionFlowStates.has(sessionId)) {
      sessionFlowStates.delete(sessionId);
      cancelled = true;
    }

    if (cancelled) {
      return '🗑️ Ação pendente cancelada e descartada com sucesso.';
    }

    // Se estiver em lista rápida e pedir para descartar lista
    if (lower === 'descartar lista' && activeQuickLists.has(sessionId)) {
      activeQuickLists.delete(sessionId);
      return '🗑️ Rascunho da lista rápida descartado.';
    }

    return 'Nenhuma operação pendente para cancelar.';
  }

  // -------------------------------------------------------------
  // 3. ALTERAÇÃO DE ITEM DA LISTA RÁPIDA ATIVA
  // Ex: "altere o comentario do item 1 para outra coisa"
  // Ex: "altere a locação do item 2 para B-01-2"
  // Ex: "remover item 1"
  // -------------------------------------------------------------
  const activeList = activeQuickLists.get(sessionId);
  if (activeList && (lower.includes('item ') || lower.includes('primeiro') || lower.includes('segundo') || lower.includes('terceiro'))) {
    // Remover item
    const removeMatch = lower.match(/(?:remover|excluir|deletar|apagar)\s+(?:o\s+)?item\s+(\d+)/i);
    if (removeMatch) {
      const idx = parseInt(removeMatch[1], 10) - 1;
      if (idx >= 0 && idx < activeList.itens.length) {
        const removed = activeList.itens.splice(idx, 1);
        return `🗑️ Item #${idx + 1} (\`${removed[0].codigo}\`) removido da lista.\n\n` + renderQuickListTable(activeList);
      }
      return `❌ Item #${removeMatch[1]} não existe na lista atual (a lista tem ${activeList.itens.length} itens).`;
    }

    // Alterar comentário ou locação
    const editMatch = cleanMsg.match(/altere\s+(?:o\s+)?(comentario|comentário|locacao|locação)\s+do\s+(?:item\s+(\d+)|primeiro|segundo|terceiro)\s+para\s+["']?([^"']+)["']?/i);
    if (editMatch) {
      const field = editMatch[1].toLowerCase().includes('loc') ? 'locacao' : 'comentario';
      let idx = 0;
      if (editMatch[2]) {
        idx = parseInt(editMatch[2], 10) - 1;
      } else if (lower.includes('primeiro')) {
        idx = 0;
      } else if (lower.includes('segundo')) {
        idx = 1;
      } else if (lower.includes('terceiro')) {
        idx = 2;
      }

      const newVal = editMatch[3].trim();
      if (idx >= 0 && idx < activeList.itens.length) {
        activeList.itens[idx][field] = newVal;
        return `✏️ **Item #${idx + 1} atualizado:** ${field === 'locacao' ? 'Locação' : 'Comentário'} alterado para: **"${newVal}"**\n\n` + renderQuickListTable(activeList);
      } else {
        return `❌ Item #${idx + 1} não encontrado na lista atual. A lista contém ${activeList.itens.length} itens.`;
      }
    }
  }

  // -------------------------------------------------------------
  // 4. LISTAS RÁPIDAS (GERENCIAMENTO)
  // -------------------------------------------------------------

  // A) Iniciar Lista Rápida
  const isStartListIntent = 
    lower.startsWith('inicie uma lista') || 
    lower.startsWith('iniciar lista') || 
    lower.startsWith('criar lista rapida') || 
    lower.startsWith('nova lista rapida') || 
    lower === 'lista rapida' || 
    lower === 'lista rápida';

  if (isStartListIntent) {
    // Verificar se o nome da lista foi fornecido
    const nameMatch = cleanMsg.match(/(?:de\s+nome|chamada|com\s+o\s+nome|nome)\s+[:"']?([^"'\n]+)["']?/i);
    if (nameMatch && nameMatch[1].trim()) {
      const listName = nameMatch[1].trim();
      const newList: ActiveQuickList = {
        nome: listName,
        responsavel: 'Estoque',
        itens: [],
        criado_em: new Date().toISOString()
      };
      activeQuickLists.set(sessionId, newList);
      return `📝 **Lista Rápida Iniciada!**\n\n` + renderQuickListTable(newList);
    } else {
      // Pergunta o nome e aguarda próxima mensagem
      sessionFlowStates.set(sessionId, { state: 'waiting_list_name' });
      return `📝 **Nova Lista Rápida**\n\nQual será o nome da lista rápida? *(Ex: "Contagem de estoque setembro de 2026")*`;
    }
  }

  // B) Salvar Lista Rápida no Banco de Dados
  if (lower === 'salvar lista' || lower === 'gravar lista' || lower === 'salvar lista rapida') {
    if (!activeList) {
      return '⚠️ Nenhuma lista rápida aberta para salvar no momento. Digite `inicie uma lista rapida` para começar.';
    }

    const pool = getDbPool();
    if (!pool) return '❌ Banco de dados desconectado.';

    const client = await pool.connect();
    try {
      let resDb;
      if (activeList.id) {
        resDb = await client.query(
          `UPDATE listas_rapidas 
           SET nome = $1, responsavel = $2, itens = $3, total_itens = $4, atualizado_em = NOW() 
           WHERE id = $5 RETURNING id`,
          [activeList.nome, activeList.responsavel, JSON.stringify(activeList.itens), activeList.itens.length, activeList.id]
        );
      } else {
        resDb = await client.query(
          `INSERT INTO listas_rapidas (nome, responsavel, itens, total_itens) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [activeList.nome, activeList.responsavel, JSON.stringify(activeList.itens), activeList.itens.length]
        );
      }

      const savedId = resDb.rows[0]?.id;
      activeList.id = savedId;

      return `✅ **Lista Rápida #${savedId} salva com sucesso no banco de dados!**\n\n` +
             `📋 **Nome:** ${activeList.nome}\n` +
             `📦 **Total de Itens:** ${activeList.itens.length}\n` +
             `A lista já está disponível para consulta e edição na aba **Anotações Rápidas** do sistema.`;
    } catch (err: any) {
      console.error('[Chat] Erro ao salvar lista rápida:', err);
      return `❌ Erro ao salvar lista no banco: ${err.message}`;
    } finally {
      client.release();
    }
  }

  // C) Listar Listas Rápidas Salvas
  if (lower === 'listar listas rapidas' || lower === 'minhas listas' || lower === 'listas rapidas') {
    const pool = getDbPool();
    if (!pool) return 'Banco de dados desconectado.';
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT id, nome, responsavel, total_itens, criado_em FROM listas_rapidas ORDER BY criado_em DESC LIMIT 10');
      if (res.rows.length === 0) {
        return 'Nenhuma lista rápida gravada no banco de dados até o momento.\nPara criar uma, digite: `inicie uma lista rapida de nome [Nome da Lista]`';
      }
      let reply = `📋 **Listas Rápidas Salvas no Banco de Dados:**\n\n`;
      for (const r of res.rows) {
        reply += `* **#${r.id}** - **${r.nome}** (${r.total_itens || 0} itens) - *${new Date(r.criado_em).toLocaleDateString('pt-BR')}*\n`;
      }
      reply += `\nPara abrir qualquer lista, digite: \`abrir lista rapida #ID\``;
      return reply;
    } finally {
      client.release();
    }
  }

  // D) Abrir Lista Rápida Existente
  const openListMatch = lower.match(/(?:abrir|chamar|carregar)\s+lista\s+(?:rapida\s+)?#?(\d+)/i);
  if (openListMatch) {
    const targetId = parseInt(openListMatch[1], 10);
    const pool = getDbPool();
    if (!pool) return 'Banco de dados desconectado.';
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT * FROM listas_rapidas WHERE id = $1', [targetId]);
      if (res.rows.length === 0) {
        return `❌ Lista #${targetId} não foi encontrada no banco de dados.`;
      }
      const row = res.rows[0];
      const loadedList: ActiveQuickList = {
        id: row.id,
        nome: row.nome,
        responsavel: row.responsavel,
        itens: Array.isArray(row.itens) ? row.itens : [],
        criado_em: row.criado_em
      };
      activeQuickLists.set(sessionId, loadedList);
      return `📂 **Lista #${row.id} Carregada na Sessão:**\n\n` + renderQuickListTable(loadedList);
    } finally {
      client.release();
    }
  }

  // E) Adicionar múltiplos itens à lista rápida ("cadastre os itens Y, X, Z" ou "adicione os itens Y, X, Z")
  const multiAddMatch = cleanMsg.match(/(?:cadastre|adicione|adicionar|coloque)\s+os\s+itens?\s+([A-Za-z0-9\s,;\.\-\/]+)/i);
  if (multiAddMatch && !cleanMsg.toLowerCase().includes('orçamento')) {
    let currentList = activeQuickLists.get(sessionId);
    if (!currentList) {
      currentList = {
        nome: 'Lista Rápida ' + formatDate(),
        responsavel: 'Estoque',
        itens: [],
        criado_em: new Date().toISOString()
      };
      activeQuickLists.set(sessionId, currentList);
    }

    const rawCodes = multiAddMatch[1].split(/[,;e\s]+/).map(c => c.trim().replace(/[\.]/g, '')).filter(c => c.length >= 2);
    let addedCount = 0;

    for (const rawCode of rawCodes) {
      if (['os', 'itens', 'item', 'na', 'lista', 'para'].includes(rawCode.toLowerCase())) continue;
      // Consultar no banco local para ver se existe locação
      const prods = await searchProductDb(rawCode);
      const exists = prods.length > 0;
      const loc = exists ? (prods[0].locacao || [prods[0].corredor, prods[0].baia, prods[0].nivel].filter(Boolean).join('-') || '') : '';

      currentList.itens.push({
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        codigo: exists ? prods[0].codigo_atual : rawCode,
        locacao: loc,
        comentario: '',
        cadastrado: exists
      });
      addedCount++;
    }

    return `➕ **${addedCount} item(ns) adicionado(s) à lista!**\n\n` + renderQuickListTable(currentList);
  }

  // F) Adicionar item individual à lista rápida aberta
  // Ex: "70200821, I-032-3, caixa danificada" ou "70200821, caixa danificada" ou "item 70200821, tem apenas 2 no estoque"
  if (activeList && !lower.includes('criar orçamento') && !lower.includes('altere ') && !lower.startsWith('cadastre o item com codigo')) {
    const parts = cleanMsg.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    
    // Identificar código
    let code = '';
    let loc = '';
    let comment = '';

    const itemWordMatch = cleanMsg.match(/item\s+([A-Za-z0-9\.-]{3,20})/i);
    if (itemWordMatch) {
      code = itemWordMatch[1];
      const after = cleanMsg.substring(cleanMsg.indexOf(code) + code.length).replace(/^[,;\s]+/, '').trim();
      comment = after;
    } else if (parts.length >= 1) {
      code = parts[0].replace(/^(item|peça|peca)\s*/i, '').trim();
      if (parts.length === 2) {
        // Se a segunda parte parece locação (ex: A-01-2 ou corredor...)
        if (/^[A-Z0-9]{1,3}-[A-Z0-9]{1,4}-[A-Z0-9]{1,3}$/i.test(parts[1]) || parts[1].toLowerCase().includes('corredor')) {
          loc = parts[1];
        } else {
          comment = parts[1];
        }
      } else if (parts.length >= 3) {
        loc = parts[1];
        comment = parts.slice(2).join(', ');
      }
    }

    // Se encontramos um código plausível (não é comando genérico)
    if (code && !['confirmar', 'cancelar', 'ajuda', 'salvar', 'ola', 'olá', 'sim'].includes(code.toLowerCase())) {
      // Verificar se a peça existe no banco
      const prods = await searchProductDb(code);
      const exists = prods.length > 0;
      if (exists && !loc) {
        loc = prods[0].locacao || [prods[0].corredor, prods[0].baia, prods[0].nivel].filter(Boolean).join('-') || '';
      }

      activeList.itens.push({
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        codigo: exists ? prods[0].codigo_atual : code,
        locacao: loc,
        comentario: comment,
        cadastrado: exists
      });

      return `➕ **Item adicionado com sucesso!**\n\n` + renderQuickListTable(activeList);
    }
  }

  // -------------------------------------------------------------
  // 5. ALTERAÇÃO DE PRODUTO CADASTRADO NO BANCO
  // Ex: "altere a descrição do item 70200821 para Parafuso do cabeçote novo"
  // Ex: "altere o preço sugerido do item 70200821 para 1.50"
  // Ex: "altere a locação do item 70200821 para corredor B, baia 010, nivel 2"
  // -------------------------------------------------------------
  const isAlterProductIntent = 
    lower.startsWith('altere ') || 
    lower.startsWith('atualize ') || 
    lower.startsWith('mudar ') || 
    lower.startsWith('mude ') || 
    lower.startsWith('modifique ');

  if (isAlterProductIntent && !lower.includes('do item 1') && !lower.includes('do item 2')) {
    // Extrair código do produto
    const codeMatch = cleanMsg.match(/(?:item|produto|código|codigo)\s+([A-Za-z0-9\.-]{3,20})/i);
    const targetCode = codeMatch ? codeMatch[1] : '';

    if (!targetCode) {
      return `❌ **Código não identificado para alteração.**\n\nPor favor, envie no formato:\n\`altere a descrição do item [CÓDIGO] para [NOVO TEXTO]\`\nou\n\`altere o preço sugerido do item [CÓDIGO] para [VALOR]\`\nou\n\`altere a locação do item [CÓDIGO] para [LOCAÇÃO]\``;
    }

    const prods = await searchProductDb(targetCode);
    if (prods.length === 0) {
      return `❌ **Produto Não Encontrado:**\nNenhum produto cadastrado no banco com o código **"${targetCode}"** para alteração.`;
    }

    const prod = prods[0];
    let campo = '';
    let campoLabel = '';
    let valorAntigo = '';
    let valorNovo = '';
    let corredor = '';
    let baia = '';
    let nivel = '';

    // A) Alteração de Descrição
    if (lower.includes('descri') || lower.includes('nome')) {
      const descMatch = cleanMsg.match(/para\s+["']?([^"'\n]+)["']?$/i);
      if (!descMatch) return 'Por favor, informe a nova descrição após a palavra "para".';
      campo = 'descricao';
      campoLabel = 'Descrição da Peça';
      valorAntigo = prod.descricao;
      valorNovo = descMatch[1].trim();
    }
    // B) Alteração de Preços
    else if (lower.includes('preço sugerido') || lower.includes('preco sugerido') || lower.includes('sugerido')) {
      const valMatch = cleanMsg.match(/(?:para|por)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
      if (!valMatch) return 'Informe o novo preço sugerido numérico.';
      campo = 'preco_sugerido';
      campoLabel = 'Preço Sugerido';
      valorAntigo = prod.preco_sugerido ? formatMoney(parseFloat(prod.preco_sugerido)) : 'Não informado';
      valorNovo = formatMoney(parseFloat(valMatch[1].replace(',', '.')));
    } else if (lower.includes('preço mínimo') || lower.includes('preco minimo') || lower.includes('minimo')) {
      const valMatch = cleanMsg.match(/(?:para|por)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
      if (!valMatch) return 'Informe o novo preço mínimo numérico.';
      campo = 'preco_minimo';
      campoLabel = 'Preço Mínimo';
      valorAntigo = prod.preco_minimo ? formatMoney(parseFloat(prod.preco_minimo)) : 'Não informado';
      valorNovo = formatMoney(parseFloat(valMatch[1].replace(',', '.')));
    } else if (lower.includes('preço tabela') || lower.includes('preco tabela') || lower.includes('tabela')) {
      const valMatch = cleanMsg.match(/(?:para|por)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
      if (!valMatch) return 'Informe o novo preço tabela numérico.';
      campo = 'preco_tabela';
      campoLabel = 'Preço Tabela';
      valorAntigo = prod.preco_tabela ? formatMoney(parseFloat(prod.preco_tabela)) : 'Não informado';
      valorNovo = formatMoney(parseFloat(valMatch[1].replace(',', '.')));
    }
    // C) Alteração de Locação
    else if (lower.includes('locaç') || lower.includes('locac') || lower.includes('corredor') || lower.includes('baia') || lower.includes('nivel')) {
      campo = 'locacao';
      campoLabel = 'Locação Física';
      valorAntigo = prod.locacao || [prod.corredor, prod.baia, prod.nivel].filter(Boolean).join('-') || 'Sem locação';

      // Detectar corredor, baia, nivel se especificado
      const cMatch = cleanMsg.match(/corredor\s+([A-Za-z0-9]+)/i);
      const bMatch = cleanMsg.match(/baia\s+([A-Za-z0-9]+)/i);
      const nMatch = cleanMsg.match(/n[íi]vel\s+([A-Za-z0-9]+)/i);

      if (cMatch || bMatch || nMatch) {
        corredor = cMatch ? cMatch[1].toUpperCase() : (prod.corredor || '');
        baia = bMatch ? bMatch[1].toUpperCase() : (prod.baia || '');
        nivel = nMatch ? nMatch[1].toUpperCase() : (prod.nivel || '');
        valorNovo = [corredor, baia, nivel].filter(Boolean).join('-');
      } else {
        const locMatch = cleanMsg.match(/para\s+["']?([^"'\n]+)["']?$/i);
        if (!locMatch) return 'Informe a nova locação após a palavra "para".';
        valorNovo = locMatch[1].trim();
      }
    } else {
      return `❌ Campo para alteração não reconhecido. Você pode alterar: **descrição**, **preço sugerido**, **preço mínimo**, **preço tabela** ou **locação**.`;
    }

    // Armazenar na memória aguardando CONFIRMAR
    pendingProductUpdates.set(sessionId, {
      sessionId,
      produto_id: prod.id,
      codigo_atual: prod.codigo_atual,
      descricao_original: prod.descricao,
      campo,
      campoLabel,
      valor_antigo: valorAntigo,
      valor_novo: valorNovo,
      corredor,
      baia,
      nivel
    });

    return `⚠️ **Confirmação de Alteração no Banco de Dados Necessária**\n\n` +
           `📦 **Produto:** \`${prod.codigo_atual}\` (${prod.descricao})\n` +
           `✏️ **Campo a Alterar:** **${campoLabel}**\n` +
           `🔴 **Valor Atual:** ${valorAntigo}\n` +
           `🟢 **Novo Valor:** **${valorNovo}**\n\n` +
           `---\n` +
           `Para aplicar esta alteração no banco de dados da Otto Diesel, digite **CONFIRMAR**.\n` +
           `*(Ou digite CANCELAR para descartar).*`;
  }

  // -------------------------------------------------------------
  // 6. CADASTRO DE NOVO PRODUTO NO BANCO
  // Ex: "cadastre o item com codigo 998877, descricao: Bucha tensor, locacao: corredor A, baia 05, nivel 2, preco 120, 5 unidades"
  // -------------------------------------------------------------
  const isCreateProductIntent = 
    lower.startsWith('cadastre o item com codigo') || 
    lower.startsWith('cadastre o produto com codigo') || 
    lower.startsWith('cadastrar item com codigo') || 
    lower.startsWith('novo produto com codigo');

  if (isCreateProductIntent) {
    const codeMatch = cleanMsg.match(/c[oó]digo\s*[:\s]*([A-Za-z0-9\.-]{3,20})/i);
    if (!codeMatch) {
      return '⚠️ **Código do Produto Obrigatório:** O código é indispensável para cadastrar a peça.';
    }

    const newCode = codeMatch[1].trim();

    // 1. Verificar se já existe no banco
    const existing = await searchProductDb(newCode);
    if (existing.length > 0) {
      const p = existing[0];
      const locStr = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join('-') || 'Sem locação';
      return `⚠️ **Atenção: Produto Já Cadastrado em Estoque!**\n\n` +
             `O código **"${newCode}"** já existe no banco de dados da Otto Diesel:\n` +
             `* **Descrição:** ${p.descricao}\n` +
             `* **📍 Locação Atual:** Corredor ${p.corredor || '—'}, Baia ${p.baia || '—'}, Nível ${p.nivel || '—'} (\`${locStr}\`)\n` +
             `* **📦 Estoque Físico:** **${p.quantidade}** unidades\n` +
             `* **💵 Preço Sugerido:** ${p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : '—'}\n\n` +
             `Para evitar duplicidades, o sistema não criará outro registro. Se você deseja alterar algum dado desta peça, basta digitar:\n` +
             `\`altere a [descrição/locação/preço] do item ${newCode} para...\``;
    }

    // 2. Extrair campos opcionais
    let desc = '';
    const descMatch = cleanMsg.match(/descri[cç][aã]o\s*[:\s]*([^,;]+)/i);
    if (descMatch) desc = descMatch[1].trim();
    if (!desc) desc = newCode; // Se vago, usa o próprio código como descrição provisória

    let corredor = '';
    let baia = '';
    let nivel = '';
    let locacao = '';

    const cMatch = cleanMsg.match(/corredor\s+([A-Za-z0-9]+)/i);
    const bMatch = cleanMsg.match(/baia\s+([A-Za-z0-9]+)/i);
    const nMatch = cleanMsg.match(/n[íi]vel\s+([A-Za-z0-9]+)/i);
    if (cMatch || bMatch || nMatch) {
      corredor = cMatch ? cMatch[1].toUpperCase() : '';
      baia = bMatch ? bMatch[1].toUpperCase() : '';
      nivel = nMatch ? nMatch[1].toUpperCase() : '';
      locacao = [corredor, baia, nivel].filter(Boolean).join('-');
    } else {
      const locMatch = cleanMsg.match(/loca[cç][aã]o\s*[:\s]*([^,;]+)/i);
      if (locMatch) locacao = locMatch[1].trim();
    }

    let qtd = 0;
    const qtdMatch = cleanMsg.match(/(\d+)\s*(?:unidades?|un|peças?|pecas?)/i);
    if (qtdMatch) qtd = parseInt(qtdMatch[1], 10) || 0;

    let precoSug = 0;
    const priceMatch = cleanMsg.match(/(?:preço|preco|valor)\s*(?:sugerido)?\s*[:\s]*(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (priceMatch) precoSug = parseFloat(priceMatch[1].replace(',', '.')) || 0;

    pendingProductCreations.set(sessionId, {
      sessionId,
      codigo_atual: newCode,
      descricao: desc,
      locacao: locacao || 'Sem locação',
      corredor,
      baia,
      nivel,
      quantidade: qtd,
      preco_sugerido: precoSug
    });

    return `📋 **Prévia do Cadastro de Novo Produto:**\n\n` +
           `| Campo | Valor |\n` +
           `| :--- | :--- |\n` +
           `| **Código:** | \`${newCode}\` |\n` +
           `| **Descrição:** | ${desc} |\n` +
           `| **Locação Física:** | \`${locacao || 'Sem locação'}\` |\n` +
           `| **Estoque Inicial:** | ${qtd} unidades |\n` +
           `| **Preço Sugerido:** | ${precoSug > 0 ? formatMoney(precoSug) : 'Não informado'} |\n\n` +
           `---\n` +
           `⚠️ **Aguardando sua confirmação:**\n` +
           `Para salvar e registrar este novo produto no banco de dados, digite **CONFIRMAR**.\n` +
           `*(Ou digite CANCELAR para descartar).*`;
  }

  // -------------------------------------------------------------
  // 7. CRIAÇÃO DE ORÇAMENTO
  // -------------------------------------------------------------
  const isBudgetIntent = 
    lower.includes('orçamento') || 
    lower.includes('orcamento') || 
    lower.includes('orcar') || 
    lower.includes('orçar') || 
    lower.includes('cotacao') || 
    lower.includes('cotação');

  if (isBudgetIntent) {
    const parts = cleanMsg.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    let vendedor = '';
    let candidateCode = '';
    let candidateQtd = 1;
    let explicitPrice: number | null = null;
    let targetTotal: number | null = null;

    const vendedorMatch = cleanMsg.match(/vendedor[:\s]+([a-zA-ZÀ-ÿ]+)/i);
    if (vendedorMatch) {
      vendedor = vendedorMatch[1];
    } else if (parts.length >= 2) {
      const p1Lower = parts[0].toLowerCase();
      if (p1Lower.includes('orçamento') || p1Lower.includes('orcamento') || p1Lower.includes('crir') || p1Lower.includes('criar')) {
        if (!/^\d+$/.test(parts[1])) {
          vendedor = parts[1].replace(/vendedor\s*/i, '').trim();
        }
      }
    }

    if (!vendedor) {
      const words = cleanMsg.split(/\s+/);
      const idx = words.findIndex(w => w.toLowerCase().includes('orça') || w.toLowerCase().includes('orca'));
      if (idx !== -1 && words[idx + 1] && !/^\d+$/.test(words[idx + 1])) {
        vendedor = words[idx + 1].replace(/[,;]/g, '');
      }
    }

    if (!vendedor) {
      return '⚠️ **Identificação de Vendedor Obrigatória:**\n\nPor favor, informe o nome do vendedor responsável no comando.\nExemplo:\n`criar orçamento, Marlon, 70200821, 2 unidades`';
    }

    const qtdMatch = cleanMsg.match(/(\d+)\s*(unidades?|un|peças?|pecas?|itens|pçs?)/i);
    if (qtdMatch) {
      candidateQtd = parseInt(qtdMatch[1], 10) || 1;
    }

    const priceMatch = cleanMsg.match(/(?:a|por|preço|preco|unitario|unitário)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (priceMatch) {
      const parsedVal = parseFloat(priceMatch[1].replace(',', '.'));
      if (!isNaN(parsedVal)) explicitPrice = parsedVal;
    }

    const totalMatch = cleanMsg.match(/valor\s*total\s*(?:de\s*)?(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (totalMatch) {
      const parsedTot = parseFloat(totalMatch[1].replace(',', '.'));
      if (!isNaN(parsedTot)) targetTotal = parsedTot;
    }

    if (parts.length >= 3) {
      for (const part of parts) {
        const pLow = part.toLowerCase().trim();
        if (pLow.includes('orça') || pLow.includes('orca') || pLow.includes('crir') || pLow.includes('criar') || pLow.includes('cotac') || pLow.includes('cotaç')) continue;
        if (vendedor && pLow === vendedor.toLowerCase()) continue;
        if (/^\d+\s*(unidades?|un|peças?|pecas?|itens|pçs?)?$/i.test(pLow)) continue;
        if (pLow.startsWith('valor') || pLow.startsWith('total') || pLow.startsWith('preço') || pLow.startsWith('preco')) continue;
        candidateCode = part.trim();
        break;
      }
    }

    if (!candidateCode) {
      const digitsMatch = cleanMsg.match(/\b(\d{4,14})\b/g);
      if (digitsMatch) {
        for (const d of digitsMatch) {
          if (d !== String(candidateQtd)) {
            candidateCode = d;
            break;
          }
        }
      }
    }

    if (!candidateCode) {
      for (const part of parts) {
        const cleanPart = part.replace(/(unidades?|un|peças?|pecas?|criar|crir|orçamento|orcamento|vendedor)/gi, '').trim();
        const codeCandidate = cleanPart.match(/\b([A-Za-z0-9\.-]{4,20})\b/);
        if (codeCandidate && codeCandidate[1] !== String(candidateQtd) && codeCandidate[1].toLowerCase() !== vendedor.toLowerCase()) {
          candidateCode = codeCandidate[1];
          break;
        }
      }
    }

    if (!candidateCode) {
      return `⚠️ Não consegui identificar o código do produto na mensagem.\n\nPor favor, envie no formato:\n\`criar orçamento, ${vendedor}, [CÓDIGO], [QUANTIDADE] un\``;
    }

    const productsFound = await searchProductDb(candidateCode);
    if (productsFound.length === 0) {
      return `❌ **INFORMAÇÃO NÃO ENCONTRADA**\n\nNenhum produto cadastrado no banco de dados com o código ou termo **"${candidateCode}"**.\n\nPor regra de negócio, nenhum orçamento pode ser criado com peças inexistentes.`;
    }

    const prod = productsFound[0];
    const precoMinimoDb = prod.preco_minimo ? parseFloat(prod.preco_minimo) : 0;
    const precoSugeridoDb = prod.preco_sugerido ? parseFloat(prod.preco_sugerido) : null;
    const precoTabelaDb = prod.preco_tabela ? parseFloat(prod.preco_tabela) : null;

    let unitPrice = precoSugeridoDb || precoTabelaDb || (precoMinimoDb > 0 ? precoMinimoDb : 150.0);

    if (explicitPrice !== null) {
      if (precoMinimoDb > 0 && explicitPrice < precoMinimoDb) {
        return `❌ **Regra de Preço Mínimo Violada:**\n\nO valor unitário informado (${formatMoney(explicitPrice)}) é menor que o Preço Mínimo permitido pelo banco para este item (${formatMoney(precoMinimoDb)}).\n\nO orçamento não pode ser gerado abaixo do preço mínimo.`;
      }
      unitPrice = explicitPrice;
    }

    if (targetTotal !== null && candidateQtd > 0) {
      const calculatedUnit = targetTotal / candidateQtd;
      if (precoMinimoDb > 0 && calculatedUnit < precoMinimoDb) {
        return `❌ **Regra de Preço Mínimo:**\n\nO valor total de ${formatMoney(targetTotal)} para ${candidateQtd} unidade(s) resulta em ${formatMoney(calculatedUnit)} por unidade, o que é abaixo do Preço Mínimo cadastrado (${formatMoney(precoMinimoDb)}).\n\nAjuste a quantidade ou o valor total.`;
      }
      unitPrice = calculatedUnit;
    }

    const subtotal = candidateQtd * unitPrice;
    const locacaoStr = prod.locacao || [prod.corredor, prod.baia, prod.nivel].filter(Boolean).join('-') || 'Sem locação';

    const item: PendingBudgetItem = {
      produto_id: prod.id,
      codigo: prod.codigo_atual || prod.codigo_fabrica,
      codigo_fabrica: prod.codigo_fabrica,
      descricao: prod.descricao,
      locacao: locacaoStr,
      quantidade: candidateQtd,
      preco_unitario: unitPrice,
      subtotal: subtotal,
      preco_minimo: precoMinimoDb,
    };

    const pendingBudget: PendingBudget = {
      sessionId,
      vendedor: vendedor.charAt(0).toUpperCase() + vendedor.slice(1).toLowerCase(),
      nome_cliente: 'Cliente Balcão',
      itens: [item],
      total_orcamento: subtotal,
      criado_em: new Date().toISOString(),
    };

    pendingBudgets.set(sessionId, pendingBudget);

    return `📋 **Estrutura do Orçamento Preparada**\n\n` +
           `📅 **Data de geração:** ${formatDate()}\n` +
           `👤 **Vendedor:** ${pendingBudget.vendedor}\n` +
           `🏢 **Cliente:** ${pendingBudget.nome_cliente}\n\n` +
           `| Código | Descrição | Locação | Qtd | Preço Unit. | Subtotal |\n` +
           `| :--- | :--- | :---: | :---: | :---: | :---: |\n` +
           `| **${item.codigo}** | ${item.descricao} | \`${item.locacao}\` | ${item.quantidade} un | ${formatMoney(item.preco_unitario)} | **${formatMoney(item.subtotal)}** |\n\n` +
           `💰 **VALOR TOTAL GERAL:** **${formatMoney(subtotal)}**\n` +
           `📦 **Estoque Físico Atual:** ${prod.quantidade} unidades disponíveis\n\n` +
           `---\n` +
           `⚠️ **Aguardando Validação do Vendedor:**\n` +
           `Você pode conferir os valores acima. Para efetivar e gravar este orçamento no sistema, digite **CONFIRMAR**.\n` +
           `*(Se quiser cancelar, basta digitar CANCELAR).*`;
  }

  // -------------------------------------------------------------
  // 8. CONSULTA DE LOCALIZAÇÃO OU ESTOQUE
  // -------------------------------------------------------------
  const isSearchIntent = 
    lower.includes('onde') || 
    lower.includes('localiz') || 
    lower.includes('locação') || 
    lower.includes('locacao') || 
    lower.includes('estoque') || 
    lower.includes('peça') || 
    lower.includes('peca') || 
    lower.includes('tem ');

  if (isSearchIntent) {
    const codeMatch = cleanMsg.match(/\b([A-Za-z0-9\.-]{4,20})\b/);
    const searchTerm = codeMatch ? codeMatch[1] : cleanMsg.replace(/(onde|está|esta|a|peça|peca|tem|qual|localizacao|locacao|no|estoque)/gi, '').trim();

    if (!searchTerm) {
      return 'Por favor, informe o código da peça ou o nome para consulta no estoque.';
    }

    const prods = await searchProductDb(searchTerm);
    if (prods.length === 0) {
      return `❌ **INFORMAÇÃO NÃO ENCONTRADA:**\nNenhum produto cadastrado com o código ou nome **"${searchTerm}"**.`;
    }

    const p = prods[0];
    const locStr = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join('-') || 'Sem localização cadastrada';
    const precoSug = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : 'Não informado';
    const precoMin = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : 'Não informado';

    return `🔍 **Dados do Produto Localizado no Banco:**\n\n` +
           `* **Código Interno:** \`${p.codigo_atual}\`\n` +
           `* **Código de Fábrica:** \`${p.codigo_fabrica || '—'}\`\n` +
           `* **Descrição:** ${p.descricao}\n` +
           `* **📍 Locação Física:** **Corredor ${p.corredor || '—'}, Baia ${p.baia || '—'}, Nível ${p.nivel || '—'}** (\`${locStr}\`)\n` +
           `* **📦 Estoque Físico:** **${p.quantidade}** unidades\n` +
           `* **💵 Preço Sugerido:** ${precoSug} | **Preço Mínimo:** ${precoMin}\n\n` +
           `Se desejar gerar uma prévia de orçamento para este item, basta solicitar:\n` +
           `\`criar orçamento, [Vendedor], ${p.codigo_atual}, [Qtd] unidades\``;
  }

  // -------------------------------------------------------------
  // 9. LISTAR ÚLTIMOS ORÇAMENTOS
  // -------------------------------------------------------------
  if (lower.includes('ultimos orcamentos') || lower.includes('últimos orçamentos') || lower.includes('listar orçamentos')) {
    const pool = getDbPool();
    if (!pool) return 'Banco de dados desconectado.';
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT * FROM orcamentos ORDER BY criado_em DESC LIMIT 5');
      if (res.rows.length === 0) {
        return 'Nenhum orçamento gravado no banco de dados até o momento.';
      }
      let reply = `📋 **Últimos ${res.rows.length} Orçamentos Salvos:**\n\n`;
      for (const r of res.rows) {
        reply += `* **ID #${r.id}** (${new Date(r.criado_em).toLocaleDateString('pt-BR')}): Vendedor **${r.responsavel}** | Total: **${formatMoney(parseFloat(r.total_orcamento))}**\n`;
      }
      return reply;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------
  // 10. MENSAGEM NÃO COMPREENDIDA / AJUDA
  // -------------------------------------------------------------
  return `❌ **Comando não compreendido com precisão:** "${cleanMsg}"\n\n` +
         `Como posso te ajudar agora? Escolha uma das opções abaixo:\n\n` +
         `1️⃣ **Anotações e Listas Rápidas:**\n` +
         `   • Iniciar lista: \`inicie uma lista rapida de nome contagem de estoque\`\n` +
         `   • Adicionar item: \`70200821, I-032-3, caixa danificada\`\n` +
         `   • Múltiplos itens: \`cadastre os itens 70200821, 78467, 102030\`\n` +
         `   • Salvar lista: \`salvar lista\`\n\n` +
         `2️⃣ **Alterar Dados de Peça:**\n` +
         `   • \`altere a descrição do item 70200821 para [Nova Descrição]\`\n` +
         `   • \`altere o preço sugerido do item 70200821 para 50.00\`\n` +
         `   • \`altere a locação do item 70200821 para corredor A, baia 01, nivel 3\`\n\n` +
         `3️⃣ **Cadastrar Nova Peça:**\n` +
         `   • \`cadastre o item com codigo 998877, descricao: Parafuso tensor, locacao: A-01-2, preco 45, 10 unidades\`\n\n` +
         `4️⃣ **Criar Orçamento:**\n` +
         `   • \`criar orçamento, Marlon, 70200821, 2 unidades\`\n\n` +
         `5️⃣ **Localizar no Estoque:**\n` +
         `   • \`onde está a peça 70200821?\``;
}

chatRouter.post('/', async (req: Request, res: Response) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Mensagem é obrigatória' });
  }

  const aiEnabled = process.env.AI_CHAT_ENABLED !== 'false';
  if (!aiEnabled) {
    return res.json({ response: 'O Assistente Inteligente está temporariamente desativado via configuração.' });
  }

  try {
    const responseText = await processChatMessage(message, sessionId);
    return res.json({ response: responseText });
  } catch (error: any) {
    console.error('[Chat] Erro no processamento:', error);
    return res.status(500).json({ 
      response: `Ocorreu um erro ao processar sua solicitação: ${error.message}` 
    });
  }
});
