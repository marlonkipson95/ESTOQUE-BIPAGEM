import pg from 'pg';
const { Pool } = pg;

// Environment variable strictly on server-side
const connectionString = process.env.DATABASE_URL;

let pool: pg.Pool | null = null;
let isConnected = false;

// Initialize PostgreSQL connection pool with SSL configured for Neon
export function getDbPool(): pg.Pool | null {
  if (!connectionString) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
    });
  }

  return pool;
}

export async function checkDatabaseConnection(): Promise<{ connected: boolean; error?: string }> {
  const p = getDbPool();
  if (!p) {
    return { connected: false, error: 'DATABASE_URL não configurada no servidor' };
  }

  try {
    const client = await p.connect();
    try {
      const res = await client.query('SELECT NOW() as now');
      isConnected = true;
      return { connected: true };
    } finally {
      client.release();
    }
  } catch (err: any) {
    isConnected = false;
    return { connected: false, error: err?.message || 'Falha ao conectar no PostgreSQL' };
  }
}

// Ensure database tables, indexes and constraints exist
export async function initDatabaseSchema(): Promise<void> {
  const p = getDbPool();
  if (!p) {
    console.log('[PostgreSQL] DATABASE_URL não definida. Modo de contingência em memória ativo.');
    return;
  }

  const client = await p.connect();
  try {
    await client.query('BEGIN');

    // 1. Tabela produtos (Identidade permanente estável)
    await client.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id VARCHAR(40) PRIMARY KEY,
        codigo_atual VARCHAR(60),
        codigo_fabrica VARCHAR(60),
        codigo_barras_atual VARCHAR(60),
        descricao TEXT NOT NULL,
        custo_unitario NUMERIC(12, 2) DEFAULT 0.00,
        quantidade INTEGER NOT NULL DEFAULT 0,
        estoque_minimo INTEGER DEFAULT 0,
        corredor VARCHAR(30) DEFAULT '',
        baia VARCHAR(30) DEFAULT '',
        nivel VARCHAR(30) DEFAULT '',
        locacao VARCHAR(60) DEFAULT '',
        codigos_alternativos TEXT DEFAULT '',
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Migração de coluna se a tabela produtos já existir
    await client.query(`
      ALTER TABLE produtos ADD COLUMN IF NOT EXISTS codigos_alternativos TEXT DEFAULT '';
    `);

    // 2. Tabela codigos_produto (Histórico de códigos: antigos continuam pesquisáveis, exclusão em cascata)
    await client.query(`
      CREATE TABLE IF NOT EXISTS codigos_produto (
        id SERIAL PRIMARY KEY,
        produto_id VARCHAR(40) NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        tipo VARCHAR(30) NOT NULL,
        codigo VARCHAR(100) NOT NULL,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        desativado_em TIMESTAMPTZ,
        motivo TEXT DEFAULT 'Cadastro inicial'
      );
    `);

    // Ajustar constraint de FK para cascade se tabela já existia com restrict
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE codigos_produto DROP CONSTRAINT IF EXISTS codigos_produto_produto_id_fkey;
        ALTER TABLE codigos_produto ADD CONSTRAINT codigos_produto_produto_id_fkey 
          FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // 2b. Tabela produtos_relacionados (Produtos genéricos / similares / intercambiáveis)
    await client.query(`
      CREATE TABLE IF NOT EXISTS produtos_relacionados (
        id SERIAL PRIMARY KEY,
        produto_id VARCHAR(40) NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        relacionado_id VARCHAR(40) NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        motivo VARCHAR(100) DEFAULT 'Similar / Genérico',
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_relacionamento UNIQUE(produto_id, relacionado_id)
      );
    `);

    // 3. Tabela historico_alteracoes (Auditoria de mudanças cadastrais e de localização)
    await client.query(`
      CREATE TABLE IF NOT EXISTS historico_alteracoes (
        id SERIAL PRIMARY KEY,
        produto_id VARCHAR(40) NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        campo VARCHAR(50) NOT NULL,
        valor_anterior TEXT,
        valor_novo TEXT,
        motivo TEXT,
        usuario VARCHAR(80) DEFAULT 'Operador Almoxarifado',
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 4. Tabela movimentacoes (Entradas, saídas e ajustes de estoque - desassocia produto na exclusão para preservar auditoria)
    await client.query(`
      CREATE TABLE IF NOT EXISTS movimentacoes (
        id SERIAL PRIMARY KEY,
        produto_id VARCHAR(40) REFERENCES produtos(id) ON DELETE SET NULL,
        tipo VARCHAR(40) NOT NULL,
        quantidade INTEGER NOT NULL,
        quantidade_anterior INTEGER NOT NULL,
        quantidade_nova INTEGER NOT NULL,
        detalhes TEXT,
        usuario VARCHAR(80) DEFAULT 'Operador Almoxarifado',
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE movimentacoes ALTER COLUMN produto_id DROP NOT NULL;
        ALTER TABLE movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_produto_id_fkey;
        ALTER TABLE movimentacoes ADD CONSTRAINT movimentacoes_produto_id_fkey 
          FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // 5. Tabela lotes_importacao (Auditoria de cargas de arquivos)
    await client.query(`
      CREATE TABLE IF NOT EXISTS lotes_importacao (
        id SERIAL PRIMARY KEY,
        arquivo VARCHAR(255) NOT NULL,
        total INTEGER NOT NULL,
        novos INTEGER NOT NULL,
        atualizados INTEGER NOT NULL,
        erros INTEGER NOT NULL DEFAULT 0,
        usuario VARCHAR(80) DEFAULT 'Operador Almoxarifado',
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 6. Tabela usuarios (Controle de Acesso e Gerenciamento de Operadores)
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username VARCHAR(60) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        nome VARCHAR(100) NOT NULL,
        cargo VARCHAR(60) DEFAULT 'Operador Almoxarifado',
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        ultimo_login TIMESTAMPTZ
      );
    `);

    // Inserir usuário padrão solicitado (estoque / controle12) se não existir
    await client.query(`
      INSERT INTO usuarios (username, password, nome, cargo, ativo)
      VALUES ('estoque', 'controle12', 'Operador de Estoque', 'Administrador', true)
      ON CONFLICT (username) DO NOTHING;
    `);

    // 7. Índices para alta performance e unicidade
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_produtos_codigo_atual ON produtos(codigo_atual);
      CREATE INDEX IF NOT EXISTS idx_produtos_codigo_fabrica ON produtos(codigo_fabrica);
      CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos(codigo_barras_atual);
      CREATE INDEX IF NOT EXISTS idx_produtos_locacao ON produtos(corredor, baia, nivel);
      CREATE INDEX IF NOT EXISTS idx_produtos_rel_prod ON produtos_relacionados(produto_id);
      CREATE INDEX IF NOT EXISTS idx_produtos_rel_rel ON produtos_relacionados(relacionado_id);
      CREATE INDEX IF NOT EXISTS idx_codigos_produto_busca ON codigos_produto(codigo);
      CREATE INDEX IF NOT EXISTS idx_codigos_produto_produto_id ON codigos_produto(produto_id);
    `);

    // Unicidade de código interno ativo (não permite dois produtos com mesmo código interno)
    await client.query(`
      DO $$ BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_codigo_atual_unique 
        ON produtos (LOWER(TRIM(codigo_atual))) 
        WHERE codigo_atual IS NOT NULL AND codigo_atual != '';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Unicidade de código de barras (EAN)
    await client.query(`
      DO $$ BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_codigo_barras_unique 
        ON produtos (LOWER(TRIM(codigo_barras_atual))) 
        WHERE codigo_barras_atual IS NOT NULL AND codigo_barras_atual != '';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Constraint de unicidade para códigos ativos (protege contra duplicidade no banco)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_codigos_barras_ativos 
      ON codigos_produto (codigo) 
      WHERE ativo = true AND tipo = 'codigo_barras';
    `);

    await client.query('COMMIT');
    console.log('[PostgreSQL] Schema verificado e inicializado com sucesso no Neon (base limpa pronta para operação real).');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[PostgreSQL] Erro ao inicializar schema:', err.message);
  } finally {
    client.release();
  }
}
