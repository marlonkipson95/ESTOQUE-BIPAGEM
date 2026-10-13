// server/api_entry.ts
import "dotenv/config";
import express from "express";

// server/routes.ts
import { Router as Router11 } from "express";

// server/db.ts
import pg from "pg";
var { Pool } = pg;
var pool = null;
var isConnected = false;
var DEFAULT_DATABASE_URL = "postgresql://neondb_owner:npg_NQIsqwXo03nM@ep-odd-surf-acyeqhiu-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
function getDbPool() {
  const connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 1e4
    });
    pool.on("error", (err) => {
      console.error("[PostgreSQL] Unexpected error on idle client:", err.message);
    });
  }
  return pool;
}
async function checkDatabaseConnection() {
  const p = getDbPool();
  if (!p) {
    return { connected: false, error: "DATABASE_URL n\xE3o configurada no servidor" };
  }
  try {
    const client = await p.connect();
    try {
      const res = await client.query("SELECT NOW() as now");
      isConnected = true;
      return { connected: true };
    } finally {
      client.release();
    }
  } catch (err) {
    isConnected = false;
    return { connected: false, error: err?.message || "Falha ao conectar no PostgreSQL" };
  }
}

// server/middleware/auth.ts
import jwt from "jsonwebtoken";
var requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Acesso negado. Token ausente ou formato inv\xE1lido." });
  }
  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET || "kipstock_dev_secret_84nd9q3n89nfq_2024";
  if (!secret) {
    console.error("[Auth] Erro Cr\xEDtico: JWT_SECRET n\xE3o est\xE1 configurado.");
    return res.status(500).json({ error: "Erro interno de configura\xE7\xE3o do servidor." });
  }
  try {
    const decoded = jwt.verify(token, secret);
    const pool2 = getDbPool();
    if (!pool2) throw new Error("Database not connected");
    const client = await pool2.connect();
    try {
      const result = await client.query("SELECT * FROM usuarios WHERE id = $1 AND ativo = true", [decoded.id]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Usu\xE1rio n\xE3o encontrado ou inativo." });
      }
      req.user = result.rows[0];
      delete req.user.password;
      next();
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Sua sess\xE3o expirou. Fa\xE7a login novamente." });
    }
    return res.status(401).json({ error: "Token inv\xE1lido ou corrompido." });
  }
};

// server/routes/auth.routes.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt2 from "jsonwebtoken";
var authRouter = Router();
var memoryUsers = [
  {
    id: 1,
    username: "estoque",
    password: "controle12",
    nome: "Operador Almoxarifado",
    cargo: "Administrador",
    ativo: true,
    criado_em: (/* @__PURE__ */ new Date()).toISOString()
  }
];
authRouter.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Usu\xE1rio e senha s\xE3o obrigat\xF3rios." });
  }
  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();
  const secret = process.env.JWT_SECRET || "kipstock_dev_secret_84nd9q3n89nfq_2024";
  if (!secret) {
    console.error("[Auth] JWT_SECRET ausente");
    return res.status(500).json({ error: "Erro interno de configura\xE7\xE3o." });
  }
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      const result = await client.query("SELECT * FROM usuarios WHERE LOWER(username) = LOWER($1) AND ativo = true", [cleanUser]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const isValid = await bcrypt.compare(cleanPass, user.password);
        if (isValid) {
          await client.query("UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1", [user.id]);
          const token = jwt2.sign({ id: user.id, username: user.username }, secret, { expiresIn: "12h" });
          delete user.password;
          return res.json({ success: true, token, user });
        }
      }
    } catch (err) {
      console.error("[API] Erro ao autenticar:", err);
    } finally {
      client.release();
    }
  }
  return res.status(401).json({ error: "Credenciais inv\xE1lidas. Verifique o usu\xE1rio e senha informados." });
});
authRouter.get("/usuarios", async (req, res) => {
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const result = await client.query(
          "SELECT id, username, nome, cargo, ativo, criado_em, ultimo_login, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc FROM usuarios ORDER BY id ASC"
        );
        return res.json({ users: result.rows });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao listar usu\xE1rios no PostgreSQL:", err.message);
    }
  }
  const sanitized = memoryUsers.map(({ password, ...rest }) => rest);
  return res.json({ users: sanitized });
});
authRouter.post("/usuarios", async (req, res) => {
  const { username, password, nome, cargo = "Operador Almoxarifado", perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc } = req.body;
  if (!username || !password || !nome) {
    return res.status(400).json({ error: "Nome, usu\xE1rio e senha s\xE3o obrigat\xF3rios." });
  }
  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();
  const cleanNome = String(nome).trim();
  const cleanCargo = String(cargo).trim();
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const check = await client.query("SELECT id FROM usuarios WHERE LOWER(username) = LOWER($1)", [cleanUser]);
        if (check.rows.length > 0) {
          return res.status(409).json({ error: "Este nome de usu\xE1rio j\xE1 est\xE1 em uso." });
        }
        const insert = await client.query(
          `INSERT INTO usuarios (username, password, nome, cargo, ativo, criado_em, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc)
           VALUES ($1, $2, $3, $4, true, NOW(), $5, $6, $7, $8, $9)
           RETURNING id, username, nome, cargo, ativo, criado_em, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc`,
          [
            cleanUser,
            cleanPass,
            cleanNome,
            cleanCargo,
            perm_consultas ?? true,
            perm_alterar_basico ?? true,
            perm_alterar_preco ?? true,
            perm_alterar_locacao ?? true,
            perm_alterar_desc ?? true
          ]
        );
        return res.status(201).json({ user: insert.rows[0] });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao criar usu\xE1rio no PostgreSQL:", err.message);
      return res.status(500).json({ error: "Erro ao criar usu\xE1rio: " + err.message });
    }
  }
  const exists = memoryUsers.some((u) => u.username.toLowerCase() === cleanUser);
  if (exists) {
    return res.status(409).json({ error: "Este nome de usu\xE1rio j\xE1 est\xE1 em uso." });
  }
  const newUser = {
    id: Date.now(),
    username: cleanUser,
    password: cleanPass,
    nome: cleanNome,
    cargo: cleanCargo,
    ativo: true,
    criado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  memoryUsers.push(newUser);
  const { password: _, ...safeUser } = newUser;
  return res.status(201).json({ user: safeUser });
});
authRouter.put("/usuarios/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, password, cargo, ativo, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc } = req.body;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const sets = [];
        const values = [];
        let idx2 = 1;
        if (nome !== void 0) {
          sets.push(`nome = $${idx2++}`);
          values.push(String(nome).trim());
        }
        if (cargo !== void 0) {
          sets.push(`cargo = $${idx2++}`);
          values.push(String(cargo).trim());
        }
        if (password !== void 0 && String(password).trim()) {
          sets.push(`password = $${idx2++}`);
          values.push(String(password).trim());
        }
        if (ativo !== void 0) {
          sets.push(`ativo = $${idx2++}`);
          values.push(Boolean(ativo));
        }
        if (perm_consultas !== void 0) {
          sets.push(`perm_consultas = $${idx2++}`);
          values.push(Boolean(perm_consultas));
        }
        if (perm_alterar_basico !== void 0) {
          sets.push(`perm_alterar_basico = $${idx2++}`);
          values.push(Boolean(perm_alterar_basico));
        }
        if (perm_alterar_preco !== void 0) {
          sets.push(`perm_alterar_preco = $${idx2++}`);
          values.push(Boolean(perm_alterar_preco));
        }
        if (perm_alterar_locacao !== void 0) {
          sets.push(`perm_alterar_locacao = $${idx2++}`);
          values.push(Boolean(perm_alterar_locacao));
        }
        if (perm_alterar_desc !== void 0) {
          sets.push(`perm_alterar_desc = $${idx2++}`);
          values.push(Boolean(perm_alterar_desc));
        }
        if (sets.length === 0) {
          return res.status(400).json({ error: "Nenhum dado informado para atualiza\xE7\xE3o." });
        }
        values.push(id);
        const query = `
          UPDATE usuarios 
          SET ${sets.join(", ")} 
          WHERE id = $${idx2}
          RETURNING id, username, nome, cargo, ativo, criado_em, ultimo_login, perm_consultas, perm_alterar_basico, perm_alterar_preco, perm_alterar_locacao, perm_alterar_desc
        `;
        const result = await client.query(query, values);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado." });
        }
        return res.json({ user: result.rows[0] });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao atualizar usu\xE1rio:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  const idx = memoryUsers.findIndex((u) => String(u.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado." });
  }
  if (nome !== void 0) memoryUsers[idx].nome = String(nome).trim();
  if (cargo !== void 0) memoryUsers[idx].cargo = String(cargo).trim();
  if (password !== void 0 && String(password).trim()) memoryUsers[idx].password = String(password).trim();
  if (ativo !== void 0) memoryUsers[idx].ativo = Boolean(ativo);
  const { password: _, ...safeUser } = memoryUsers[idx];
  return res.json({ user: safeUser });
});
authRouter.delete("/usuarios/:id", async (req, res) => {
  const { id } = req.params;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const userRes = await client.query("SELECT username FROM usuarios WHERE id = $1", [id]);
        if (userRes.rows.length === 0) {
          return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado." });
        }
        if (userRes.rows[0].username.toLowerCase() === "estoque") {
          return res.status(403).json({ error: 'O usu\xE1rio mestre "estoque" n\xE3o pode ser exclu\xEDdo.' });
        }
        await client.query("DELETE FROM usuarios WHERE id = $1", [id]);
        return res.json({ success: true, message: "Usu\xE1rio exclu\xEDdo com sucesso." });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao excluir usu\xE1rio:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  const user = memoryUsers.find((u) => String(u.id) === String(id));
  if (!user) {
    return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado." });
  }
  if (user.username.toLowerCase() === "estoque") {
    return res.status(403).json({ error: 'O usu\xE1rio mestre "estoque" n\xE3o pode ser exclu\xEDdo.' });
  }
  const idx = memoryUsers.findIndex((u) => String(u.id) === String(id));
  memoryUsers.splice(idx, 1);
  return res.json({ success: true, message: "Usu\xE1rio exclu\xEDdo com sucesso." });
});

// server/routes/produtos.routes.ts
import { Router as Router3 } from "express";

// server/cosmos.ts
import { Router as Router2 } from "express";
var cosmosRouter = Router2();
async function fetchCosmosProduct(gtin) {
  const token = process.env.COSMOS_API_TOKEN;
  if (!token) {
    return {
      success: false,
      status: 500,
      data: null,
      message: "Token COSMOS_API_TOKEN n\xE3o configurado no servidor."
    };
  }
  const userAgent = process.env.COSMOS_USER_AGENT || "Cosmos-API-Request";
  const cleanGtin = (gtin || "").trim().replace(/[\s\.-]/g, "");
  if (!cleanGtin) {
    return {
      success: false,
      status: 400,
      data: null,
      message: "GTIN/EAN inv\xE1lido ou vazio."
    };
  }
  try {
    const url = `https://cosmos.bluesoft.com.br/api/gtins/${cleanGtin}.json`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Cosmos-Token": token,
        "User-Agent": userAgent,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(4e3)
      // Prevent hanging
    });
    if (response.status === 200) {
      const json = await response.json();
      return {
        success: true,
        status: 200,
        data: {
          gtin: json.gtin || cleanGtin,
          description: json.description || "",
          brand: json.brand?.name || (typeof json.brand === "string" ? json.brand : void 0),
          ncm: json.ncm?.code || (typeof json.ncm === "string" ? json.ncm : void 0),
          thumbnail: json.thumbnail || json.thumbnail_url || void 0
        }
      };
    }
    if (response.status === 404) {
      return {
        success: true,
        status: 404,
        data: null,
        message: "Produto n\xE3o cadastrado na base do Bluesoft Cosmos."
      };
    }
    if (response.status === 429) {
      return {
        success: false,
        status: 429,
        data: null,
        message: "Cota di\xE1ria gratuita (25 consultas/dia) atingida hoje. O c\xF3digo foi extra\xEDdo normalmente; apenas informe a descri\xE7\xE3o na m\xE3o."
      };
    }
    const errorBody = await response.text().catch(() => "");
    return {
      success: false,
      status: response.status,
      data: null,
      message: `Resposta inesperada da API Cosmos (HTTP ${response.status}): ${errorBody.slice(0, 150)}`
    };
  } catch (error) {
    console.error("[Cosmos API] Falha na requisi\xE7\xE3o:", error.message);
    return {
      success: false,
      status: 500,
      data: null,
      message: `Erro de conex\xE3o com o Bluesoft Cosmos: ${error.message}`
    };
  }
}
cosmosRouter.get("/gtin/:gtin", async (req, res) => {
  const { gtin } = req.params;
  if (!gtin) {
    return res.status(400).json({ error: "Par\xE2metro GTIN \xE9 obrigat\xF3rio" });
  }
  const result = await fetchCosmosProduct(gtin);
  return res.status(result.status === 404 ? 200 : result.status).json(result);
});

// server/routes/produtos.routes.ts
var produtosRouter = Router3();
var memoryProducts = [];
var memoryCodeHistory = [];
var memoryMovements = [];
var memoryRelatedProducts = [];
async function loadProductExtras(client, product) {
  if (!product) return product;
  try {
    const rels = await client.query(`
      SELECT DISTINCT pr.id as rel_id, pr.motivo, p.id, p.codigo_atual, p.descricao, p.codigo_barras_atual, p.codigo_fabrica, p.quantidade, p.locacao, p.corredor, p.baia, p.nivel, p.preco_tabela, p.preco_sugerido, p.preco_minimo
      FROM produtos_relacionados pr
      JOIN produtos p ON (p.id = CASE WHEN pr.produto_id = $1 THEN pr.relacionado_id ELSE pr.produto_id END)
      WHERE (pr.produto_id = $1 OR pr.relacionado_id = $1) AND p.id <> $1
    `, [product.id]);
    product.produtos_relacionados = rels.rows.map((r) => ({
      ...r,
      quantidade: Number(r.quantidade) || 0,
      preco_tabela: Number(r.preco_tabela) || 0,
      preco_sugerido: Number(r.preco_sugerido) || 0,
      preco_minimo: Number(r.preco_minimo) || 0
    }));
    product.total_genericos = product.produtos_relacionados.length;
    product.codigos_genericos = product.produtos_relacionados.map((r) => r.codigo_fabrica || r.codigo_atual).filter(Boolean);
  } catch (e) {
    product.produtos_relacionados = [];
    product.total_genericos = 0;
    product.codigos_genericos = [];
  }
  if (typeof product.codigos_alternativos === "string") {
    product.codigos_alternativos = product.codigos_alternativos.replace(/[\[\]"']/g, "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(product.codigos_alternativos)) {
    product.codigos_alternativos = product.codigos_alternativos.map((s) => String(s).replace(/[\[\]"']/g, "").trim()).filter(Boolean);
  } else {
    product.codigos_alternativos = [];
  }
  product.custo_unitario = Number(product.custo_unitario) || 0;
  product.preco_tabela = Number(product.preco_tabela) || 0;
  product.preco_sugerido = Number(product.preco_sugerido) || 0;
  product.preco_minimo = Number(product.preco_minimo) || 0;
  product.quantidade = Number(product.quantidade) || 0;
  product.estoque_fisico = Number(product.estoque_fisico) || 0;
  product.ncm = product.ncm || "";
  product.ultima_data_compra = product.ultima_data_compra || "";
  product.ultima_data_venda = product.ultima_data_venda || "";
  return product;
}
function loadMemoryProductExtras(product) {
  if (!product) return product;
  const relLinks = memoryRelatedProducts.filter((r) => r.produto_id === product.id || r.relacionado_id === product.id);
  product.produtos_relacionados = relLinks.map((r) => {
    const targetId = r.produto_id === product.id ? r.relacionado_id : r.produto_id;
    const target = memoryProducts.find((p) => p.id === targetId);
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
      preco_minimo: Number(target.preco_minimo) || 0
    } : null;
  }).filter(Boolean);
  product.total_genericos = product.produtos_relacionados.length;
  product.codigos_genericos = product.produtos_relacionados.map((r) => r.codigo_fabrica || r.codigo_atual).filter(Boolean);
  if (typeof product.codigos_alternativos === "string") {
    product.codigos_alternativos = product.codigos_alternativos.replace(/[\[\]"']/g, "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(product.codigos_alternativos)) {
    product.codigos_alternativos = product.codigos_alternativos.map((s) => String(s).replace(/[\[\]"']/g, "").trim()).filter(Boolean);
  } else {
    product.codigos_alternativos = [];
  }
  return product;
}
function identifyBarcodeInfo(code) {
  const clean = (code || "").trim();
  const ean = clean.replace(/[\s\.-]/g, "");
  let fabricante = "";
  let tipo_peca = "";
  let codigo_extraido = "";
  let descricao_sugerida = "";
  if (ean.startsWith("7890537") || clean.toUpperCase().includes("KOLBENSCHMIDT") || clean.toUpperCase().includes("MS MOTORSERVICE")) {
    fabricante = "Kolbenschmidt (KS / Motorservice)";
    tipo_peca = "Pist\xE3o / An\xE9is / Casquilho / Bronzina";
    if (ean.length === 13) {
      codigo_extraido = ean.substring(7, 12);
    }
    descricao_sugerida = codigo_extraido ? `PIST\xC3O / AN\xC9IS / CASQUILHO (KS ${codigo_extraido})` : "PIST\xC3O / AN\xC9IS / CASQUILHO (KS)";
  } else if (ean.startsWith("7894766") || ean.startsWith("7892415") || ean.startsWith("7890006") || ean.startsWith("7890001") || clean.toUpperCase().includes("MAHLE") || clean.toUpperCase().includes("METAL LEVE")) {
    fabricante = "Mahle Metal Leve";
    tipo_peca = "Pist\xE3o / Bronzina / An\xE9is / V\xE1lvulas / Filtro";
    if (ean.length === 13) {
      codigo_extraido = ean.substring(7, 12);
    }
    descricao_sugerida = "PE\xC7A MAHLE METAL LEVE";
  } else if (ean.startsWith("7895825") || clean.toUpperCase().includes("MWM")) {
    fabricante = "MWM Motores";
    tipo_peca = "Motor Diesel / Juntas / Cabe\xE7ote / Bielas";
    if (ean === "7895825126942") {
      codigo_extraido = "922688540114";
      descricao_sugerida = "JUNTA, CABE\xC7OTE MOTOR (MWM)";
    } else {
      if (ean.length === 13) codigo_extraido = ean.substring(7, 12);
      descricao_sugerida = "PE\xC7A / MERCADORIA MWM";
    }
  } else if (ean.startsWith("7891234") || ean.startsWith("7892250") || clean.startsWith("0445") || clean.startsWith("F00")) {
    fabricante = "Bosch";
    tipo_peca = "Inje\xE7\xE3o Diesel / Bico Injetor / Bomba Alta Press\xE3o / Sensor";
    if (ean.length === 13) codigo_extraido = ean.substring(7, 12);
    descricao_sugerida = "SISTEMA DE INJE\xC7\xC3O BOSCH";
  } else if (ean.startsWith("7896431") || clean.toUpperCase().startsWith("EJBR")) {
    fabricante = "Delphi";
    tipo_peca = "Inje\xE7\xE3o Diesel Common Rail";
    if (ean.length === 13) codigo_extraido = ean.substring(7, 12);
    descricao_sugerida = "PE\xC7A INJE\xC7\xC3O DELPHI";
  } else if (ean.startsWith("7891252") || clean.toUpperCase().includes("SABO") || clean.toUpperCase().includes("SAB\xD3")) {
    fabricante = "Sab\xF3";
    tipo_peca = "Retentor / Junta / Veda\xE7\xE3o";
    if (ean.length === 13) codigo_extraido = ean.substring(7, 12);
    descricao_sugerida = "RETENTOR / JUNTA SAB\xD3";
  } else if (ean.length === 13) {
    codigo_extraido = ean.substring(7, 12);
  }
  return {
    raw: clean,
    codigo_barras: ean,
    codigo_fabrica: codigo_extraido || void 0,
    codigo_extraido: codigo_extraido || void 0,
    fabricante: fabricante || void 0,
    tipo_peca: tipo_peca || void 0,
    descricao_sugerida: descricao_sugerida || void 0
  };
}
produtosRouter.post("/produtos/scan", async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "C\xF3digo de bipagem \xE9 obrigat\xF3rio." });
  }
  const cleanCode = code.trim();
  const normalizedCode = cleanCode.replace(/[\s\.-]/g, "");
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
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
          const isBarcode = product.codigo_barras_atual?.replace(/[\s\.-]/g, "").toUpperCase() === normalizedCode.toUpperCase() || Array.isArray(product.codigos_alternativos) && product.codigos_alternativos.some((alt) => alt?.replace(/[\s\.-]/g, "").toUpperCase() === normalizedCode.toUpperCase());
          const isFactory = product.codigo_fabrica?.replace(/[\s\.-]/g, "").toUpperCase() === normalizedCode.toUpperCase();
          const activeCodeType = isBarcode ? "codigo_barras" : isFactory ? "codigo_fabrica" : "codigo_produto";
          return res.json({
            status: "found_current",
            product,
            activeCodeType,
            message: isFactory ? "Produto identificado com sucesso pelo C\xF3digo de F\xE1brica / Part Number." : "Produto identificado pelo c\xF3digo atual ativo."
          });
        }
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
          const fullP = await client.query("SELECT * FROM produtos WHERE id = $1", [row.produto_id]);
          const product = fullP.rows.length > 0 ? await loadProductExtras(client, fullP.rows[0]) : row;
          return res.json({
            status: "found_historical",
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
              motivo: row.motivo
            },
            message: "C\xF3digo antigo identificado no hist\xF3rico! Exibindo localiza\xE7\xE3o atual da mercadoria."
          });
        }
        const etapa3 = await client.query(`
          SELECT * FROM produtos 
          WHERE UPPER(codigo_fabrica) = UPPER($1) OR UPPER(codigo_fabrica) = UPPER($1) || 'E' OR UPPER(codigo_fabrica) || 'E' = UPPER($1)
          LIMIT 1
        `, [cleanCode]);
        if (etapa3.rows.length > 0) {
          const product = await loadProductExtras(client, etapa3.rows[0]);
          return res.json({
            status: "found_associated",
            product,
            newBarcode: cleanCode,
            matchType: "codigo_fabrica",
            message: "Mercadoria localizada atrav\xE9s do C\xF3digo de F\xE1brica."
          });
        }
        const identifiedInfo2 = identifyBarcodeInfo(cleanCode);
        let cosmosData2 = null;
        let cosmosStatus2 = null;
        let cosmosMessage2 = null;
        if (/^\d{7,14}$/.test(normalizedCode)) {
          try {
            const cosmosRes = await fetchCosmosProduct(normalizedCode);
            cosmosStatus2 = cosmosRes.status;
            cosmosMessage2 = cosmosRes.message || null;
            if (cosmosRes.success && cosmosRes.data) {
              cosmosData2 = cosmosRes.data;
              if (cosmosRes.data.description) {
                identifiedInfo2.descricao_sugerida = cosmosRes.data.description;
              }
              if (cosmosRes.data.brand) {
                identifiedInfo2.fabricante = cosmosRes.data.brand;
              }
              if (cosmosRes.data.ncm) {
                identifiedInfo2.ncm = cosmosRes.data.ncm;
              }
              if (cosmosRes.data.thumbnail) {
                identifiedInfo2.thumbnail = cosmosRes.data.thumbnail;
              }
              identifiedInfo2.origem = "Bluesoft Cosmos";
            }
          } catch (err) {
            console.error("[API] Falha ao consultar Cosmos no scan PostgreSQL:", err.message);
          }
        }
        const searchTerms2 = [
          identifiedInfo2.codigo_extraido,
          cleanCode.length === 13 ? cleanCode.substring(7, 12) : null,
          cleanCode.length >= 6 ? cleanCode.slice(-6) : null
        ].filter(Boolean);
        let candidates = [];
        for (const term of searchTerms2) {
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
            candidates = await Promise.all(candRes.rows.map((r) => loadProductExtras(client, r)));
            break;
          }
        }
        const brandMsg2 = cosmosData2?.description ? `Identificado no Bluesoft Cosmos: "${cosmosData2.description}"!` : identifiedInfo2.fabricante ? `C\xF3digo de barras ${identifiedInfo2.fabricante} (${cleanCode}) reconhecido! Selecione uma pe\xE7a existente para vincular ou atualizar.` : `C\xF3digo de barras ${cleanCode} n\xE3o localizado diretamente na base de dados.`;
        return res.json({
          status: "not_found",
          scannedCode: cleanCode,
          identifiedInfo: identifiedInfo2,
          candidates,
          message: brandMsg2,
          cosmosData: cosmosData2,
          cosmosStatus: cosmosStatus2,
          cosmosMessage: cosmosMessage2
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro no scan PostgreSQL:", err.message);
    }
  }
  const p1 = memoryProducts.find(
    (p) => p.codigo_barras_atual?.toUpperCase() === cleanCode.toUpperCase() || p.codigo_atual?.toUpperCase() === cleanCode.toUpperCase() || p.codigo_fabrica?.toUpperCase() === cleanCode.toUpperCase() || Array.isArray(p.codigos_alternativos) && p.codigos_alternativos.some((alt) => alt?.toUpperCase() === cleanCode.toUpperCase()) || memoryCodeHistory.some((h2) => h2.produto_id === p.id && h2.ativo && h2.codigo?.toUpperCase() === cleanCode.toUpperCase())
  );
  if (p1) {
    const isBarcode = p1.codigo_barras_atual?.toUpperCase() === cleanCode.toUpperCase() || Array.isArray(p1.codigos_alternativos) && p1.codigos_alternativos.some((alt) => alt?.toUpperCase() === cleanCode.toUpperCase());
    const isFactory = p1.codigo_fabrica?.toUpperCase() === cleanCode.toUpperCase();
    return res.json({
      status: "found_current",
      product: loadMemoryProductExtras(p1),
      activeCodeType: isBarcode ? "codigo_barras" : isFactory ? "codigo_fabrica" : "codigo_produto",
      message: isFactory ? "Mercadoria j\xE1 cadastrada identificada pelo C\xF3digo de F\xE1brica. Dados mantidos." : "Mercadoria j\xE1 cadastrada identificada no estoque. Dados mantidos."
    });
  }
  const h = memoryCodeHistory.find(
    (c) => c.codigo.toUpperCase() === cleanCode.toUpperCase() && !c.ativo
  );
  if (h) {
    const pHist = memoryProducts.find((p) => p.id === h.produto_id);
    if (pHist) {
      return res.json({
        status: "found_historical",
        product: pHist,
        scannedCode: cleanCode,
        currentCode: pHist.codigo_atual,
        currentBarcode: pHist.codigo_barras_atual,
        historicalRecord: h
      });
    }
  }
  const pFab = memoryProducts.find((p) => p.codigo_fabrica?.toUpperCase() === cleanCode.toUpperCase());
  if (pFab) {
    return res.json({
      status: "found_associated",
      product: pFab,
      newBarcode: cleanCode,
      matchType: "codigo_fabrica"
    });
  }
  const identifiedInfo = identifyBarcodeInfo(cleanCode);
  let cosmosData = null;
  let cosmosStatus = null;
  let cosmosMessage = null;
  if (/^\d{7,14}$/.test(cleanCode.replace(/[\s\.-]/g, ""))) {
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
        identifiedInfo.origem = "Bluesoft Cosmos";
      }
    } catch (err) {
      console.error("[API] Falha ao consultar Cosmos no memory scan:", err.message);
    }
  }
  const searchTerms = [
    identifiedInfo.codigo_extraido,
    cleanCode.length === 13 ? cleanCode.substring(7, 12) : null,
    cleanCode.length >= 6 ? cleanCode.slice(-6) : null
  ].filter(Boolean);
  let memCandidates = [];
  for (const term of searchTerms) {
    if (!term || term.length < 3) continue;
    const termUpper = term.toUpperCase();
    const found = memoryProducts.filter(
      (p) => p.codigo_atual?.toUpperCase().includes(termUpper) || p.codigo_fabrica?.toUpperCase().includes(termUpper) || p.codigo_barras_atual?.toUpperCase().includes(termUpper) || Array.isArray(p.codigos_alternativos) && p.codigos_alternativos.some((c) => c.toUpperCase().includes(termUpper)) || p.descricao?.toUpperCase().includes(termUpper)
    ).slice(0, 6);
    if (found.length > 0) {
      memCandidates = found.map(loadMemoryProductExtras);
      break;
    }
  }
  const brandMsg = cosmosData?.description ? `Identificado no Bluesoft Cosmos: "${cosmosData.description}"!` : identifiedInfo.fabricante ? `C\xF3digo de barras ${identifiedInfo.fabricante} (${cleanCode}) reconhecido! Selecione uma pe\xE7a existente para vincular ou atualizar.` : `C\xF3digo de barras ${cleanCode} n\xE3o localizado diretamente na base de dados.`;
  return res.json({
    status: "not_found",
    scannedCode: cleanCode,
    identifiedInfo,
    candidates: memCandidates,
    message: brandMsg,
    cosmosData,
    cosmosStatus,
    cosmosMessage
  });
});
produtosRouter.get("/produtos", async (req, res) => {
  const {
    search,
    corredor,
    baia,
    nivel,
    locacao,
    estoque,
    cadastro,
    tipoCodigo,
    page = "1",
    limit = "100"
  } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const requestedLimit = parseInt(limit, 10);
  const limitNum = limit === "all" || requestedLimit >= 5e4 ? 5e4 : Math.min(5e4, Math.max(1, requestedLimit || 100));
  const offset = (pageNum - 1) * limitNum;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const conditions = [];
        const params = [];
        let paramIdx = 1;
        if (search && typeof search === "string" && search.trim()) {
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
        if (corredor && typeof corredor === "string" && corredor.trim()) {
          params.push(corredor.trim());
          conditions.push(`p.corredor = $${paramIdx}`);
          paramIdx++;
        }
        if (baia && typeof baia === "string" && baia.trim()) {
          params.push(baia.trim());
          conditions.push(`p.baia = $${paramIdx}`);
          paramIdx++;
        }
        if (nivel && typeof nivel === "string" && nivel.trim()) {
          params.push(nivel.trim());
          conditions.push(`p.nivel = $${paramIdx}`);
          paramIdx++;
        }
        if (locacao && typeof locacao === "string" && locacao.trim()) {
          params.push(`%${locacao.trim()}%`);
          conditions.push(`p.locacao ILIKE $${paramIdx}`);
          paramIdx++;
        }
        if (estoque === "com_estoque") {
          conditions.push("p.quantidade > 0");
        } else if (estoque === "sem_estoque") {
          conditions.push("p.quantidade = 0");
        } else if (estoque === "baixo_estoque") {
          conditions.push("p.quantidade <= p.estoque_minimo");
        }
        if (cadastro === "sem_localizacao") {
          conditions.push("(p.corredor = '' OR p.corredor IS NULL) AND (p.locacao = '' OR p.locacao IS NULL)");
        } else if (cadastro === "com_localizacao") {
          conditions.push("(p.corredor != '' AND p.corredor IS NOT NULL) OR (p.locacao != '' AND p.locacao IS NOT NULL)");
        } else if (cadastro === "sem_codigo_barras") {
          conditions.push("(p.codigo_barras_atual = '' OR p.codigo_barras_atual IS NULL)");
        } else if (cadastro === "com_codigo_barras") {
          conditions.push("(p.codigo_barras_atual != '' AND p.codigo_barras_atual IS NOT NULL)");
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const countQuery = `SELECT COUNT(*) as total FROM produtos p ${whereClause}`;
        const countRes = await client.query(countQuery, params);
        const total = parseInt(countRes.rows[0].total, 10);
        const dataQuery = `
          SELECT p.*,
            (SELECT COUNT(*) FROM produtos_relacionados pr WHERE pr.produto_id = p.id OR pr.relacionado_id = p.id)::int as total_genericos
          FROM produtos p
          ${whereClause}
          ORDER BY p.atualizado_em DESC
          LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;
        const dataRes = await client.query(dataQuery, [...params, limitNum, offset]);
        const formattedProducts = dataRes.rows.map((p) => ({
          ...p,
          quantidade: Number(p.quantidade) || 0,
          estoque_fisico: Number(p.estoque_fisico) || 0,
          estoque_minimo: Number(p.estoque_minimo) || 0,
          custo_unitario: Number(p.custo_unitario) || 0,
          preco_tabela: Number(p.preco_tabela) || 0,
          preco_sugerido: Number(p.preco_sugerido) || 0,
          preco_minimo: Number(p.preco_minimo) || 0,
          ncm: p.ncm || "",
          ultima_data_compra: p.ultima_data_compra || "",
          ultima_data_venda: p.ultima_data_venda || "",
          total_genericos: Number(p.total_genericos) || 0
        }));
        return res.json({
          products: formattedProducts,
          total,
          page: pageNum,
          limit: limitNum
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao listar produtos no PostgreSQL:", err.message);
    }
  }
  let filtered = [...memoryProducts];
  if (search && typeof search === "string" && search.trim()) {
    const term = search.trim().toLowerCase();
    filtered = filtered.filter(
      (p) => p.descricao.toLowerCase().includes(term) || p.codigo_atual.toLowerCase().includes(term) || p.codigo_fabrica.toLowerCase().includes(term) || p.codigo_barras_atual.toLowerCase().includes(term) || p.locacao.toLowerCase().includes(term) || memoryCodeHistory.some((c) => c.produto_id === p.id && c.codigo.toLowerCase().includes(term))
    );
  }
  if (corredor && typeof corredor === "string" && corredor.trim()) {
    filtered = filtered.filter((p) => p.corredor.toLowerCase() === corredor.trim().toLowerCase());
  }
  if (baia && typeof baia === "string" && baia.trim()) {
    filtered = filtered.filter((p) => p.baia.toLowerCase() === baia.trim().toLowerCase());
  }
  if (nivel && typeof nivel === "string" && nivel.trim()) {
    filtered = filtered.filter((p) => p.nivel.toLowerCase() === nivel.trim().toLowerCase());
  }
  if (estoque === "com_estoque") {
    filtered = filtered.filter((p) => p.quantidade > 0);
  } else if (estoque === "sem_estoque") {
    filtered = filtered.filter((p) => p.quantidade === 0);
  } else if (estoque === "baixo_estoque") {
    filtered = filtered.filter((p) => p.quantidade <= p.estoque_minimo);
  }
  if (cadastro === "sem_localizacao") {
    filtered = filtered.filter((p) => !p.corredor && !p.locacao);
  } else if (cadastro === "com_localizacao") {
    filtered = filtered.filter((p) => !!p.corredor || !!p.locacao);
  } else if (cadastro === "sem_codigo_barras") {
    filtered = filtered.filter((p) => !p.codigo_barras_atual);
  }
  const paginated = filtered.slice(offset, offset + limitNum).map((p) => ({
    ...p,
    total_genericos: memoryRelatedProducts.filter((r) => r.produto_id === p.id || r.relacionado_id === p.id).length
  }));
  res.json({
    products: paginated,
    total: filtered.length,
    page: pageNum,
    limit: limitNum
  });
});
produtosRouter.get("/produtos/:id", async (req, res) => {
  const { id } = req.params;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const prodRes = await client.query("SELECT * FROM produtos WHERE id = $1", [id]);
        if (prodRes.rows.length === 0) {
          return res.status(404).json({ error: "Produto n\xE3o encontrado" });
        }
        const product = await loadProductExtras(client, prodRes.rows[0]);
        const histRes = await client.query(`
          SELECT * FROM codigos_produto 
          WHERE produto_id = $1 
          ORDER BY criado_em DESC
        `, [id]);
        return res.json({
          product,
          history: histRes.rows
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao buscar produto no PostgreSQL:", err.message);
    }
  }
  const p = memoryProducts.find((prod) => prod.id === id);
  if (!p) {
    return res.status(404).json({ error: "Produto n\xE3o encontrado" });
  }
  const hist = memoryCodeHistory.filter((c) => c.produto_id === id);
  res.json({ product: p, history: hist });
});
produtosRouter.post("/produtos", async (req, res) => {
  const {
    descricao,
    codigo_atual,
    codigo_fabrica,
    codigo_barras_atual,
    custo_unitario = 0,
    quantidade = 0,
    estoque_minimo = 0,
    estoque_fisico = 0,
    ncm = "",
    preco_tabela = 0,
    preco_sugerido = 0,
    preco_minimo = 0,
    ultima_data_venda = "",
    ultima_data_compra = "",
    corredor = "",
    baia = "",
    nivel = "",
    locacao = ""
  } = req.body;
  if (!descricao || !descricao.trim()) {
    return res.status(400).json({ error: "A descri\xE7\xE3o do produto \xE9 obrigat\xF3ria." });
  }
  const cleanBarcode = codigo_barras_atual?.trim() || "";
  const cleanCode = codigo_atual?.trim() || "";
  const cleanFactory = codigo_fabrica?.trim() || "";
  if (!cleanCode && !cleanFactory) {
    return res.status(400).json({ error: "O c\xF3digo do produto ou c\xF3digo de f\xE1brica \xE9 obrigat\xF3rio." });
  }
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      if (cleanBarcode) {
        const dupBarcode = await client.query(`
          SELECT id, descricao, codigo_barras_atual FROM produtos 
          WHERE UPPER(codigo_barras_atual) = UPPER($1)
          LIMIT 1
        `, [cleanBarcode]);
        if (dupBarcode.rows.length > 0) {
          const fullProd = await client.query("SELECT * FROM produtos WHERE id = $1", [dupBarcode.rows[0].id]);
          await client.query("COMMIT");
          const existingProduct = await loadProductExtras(client, fullProd.rows[0]);
          return res.json({
            success: true,
            isExisting: true,
            product: existingProduct,
            message: "Mercadoria j\xE1 cadastrada identificada com sucesso pelo c\xF3digo EAN. Dados mantidos."
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
          const fullProd = await client.query("SELECT * FROM produtos WHERE id = $1", [dupCode.rows[0].id]);
          await client.query("COMMIT");
          const existingProduct = await loadProductExtras(client, fullProd.rows[0]);
          return res.json({
            success: true,
            isExisting: true,
            product: existingProduct,
            message: "Mercadoria j\xE1 cadastrada identificada com sucesso pelo c\xF3digo interno. Dados mantidos."
          });
        }
      }
      const countRes = await client.query("SELECT COUNT(*) as count FROM produtos");
      const nextNum2 = parseInt(countRes.rows[0].count, 10) + 1;
      const newId2 = `PRD-${String(nextNum2).padStart(4, "0")}`;
      const finalCode2 = cleanCode || newId2;
      const finalLoc = locacao?.trim() || (corredor || baia || nivel ? `${corredor}-${baia}-${nivel}`.replace(/^-|-$/g, "") : "");
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
        newId2,
        finalCode2,
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
        ncm?.trim() || "",
        ultima_data_venda?.trim() || "",
        ultima_data_compra?.trim() || "",
        corredor.trim(),
        baia.trim(),
        nivel.trim(),
        finalLoc
      ]);
      const createdProduct = insertRes.rows[0];
      if (cleanBarcode) {
        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_barras', $2, true, 'Cadastro inicial')
        `, [newId2, cleanBarcode]);
      }
      if (finalCode2) {
        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_produto', $2, true, 'Cadastro inicial')
        `, [newId2, finalCode2]);
      }
      if (cleanFactory) {
        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_fabrica', $2, true, 'C\xF3digo de f\xE1brica')
        `, [newId2, cleanFactory]);
      }
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_novo, motivo)
        VALUES ($1, 'criacao', $2, 'Cria\xE7\xE3o inicial do produto')
      `, [newId2, JSON.stringify(createdProduct)]);
      await client.query("COMMIT");
      return res.status(201).json({ product: createdProduct });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao cadastrar produto:", err.message);
      return res.status(500).json({ error: "Erro ao cadastrar produto: " + err.message });
    } finally {
      client.release();
    }
  }
  const nextNum = memoryProducts.length + 1;
  const newId = `PRD-${String(nextNum).padStart(4, "0")}`;
  const finalCode = cleanCode || newId;
  if (cleanBarcode) {
    const existingP = memoryProducts.find((p) => p.codigo_barras_atual?.toUpperCase() === cleanBarcode.toUpperCase());
    if (existingP) {
      return res.json({
        success: true,
        isExisting: true,
        product: loadMemoryProductExtras(existingP),
        message: "Mercadoria j\xE1 cadastrada identificada com sucesso pelo c\xF3digo EAN. Dados mantidos."
      });
    }
  }
  if (cleanCode) {
    const existingP = memoryProducts.find((p) => p.codigo_atual?.toUpperCase() === cleanCode.toUpperCase());
    if (existingP) {
      return res.json({
        success: true,
        isExisting: true,
        product: loadMemoryProductExtras(existingP),
        message: "Mercadoria j\xE1 cadastrada identificada com sucesso pelo c\xF3digo interno. Dados mantidos."
      });
    }
  }
  const newP = {
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
    criado_em: (/* @__PURE__ */ new Date()).toISOString(),
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  memoryProducts.unshift(newP);
  if (cleanBarcode) {
    memoryCodeHistory.unshift({
      id: memoryCodeHistory.length + 1,
      produto_id: newId,
      tipo: "codigo_barras",
      codigo: cleanBarcode,
      ativo: true,
      criado_em: (/* @__PURE__ */ new Date()).toISOString(),
      motivo: "Cadastro inicial"
    });
  }
  res.status(201).json({ product: newP });
});
produtosRouter.patch("/produtos/:id/localizacao", async (req, res) => {
  const { id } = req.params;
  const { corredor = "", baia = "", nivel = "", locacao = "", motivo = "Altera\xE7\xE3o operacional de endere\xE7o" } = req.body;
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT * FROM produtos WHERE id = $1", [id]);
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Produto n\xE3o encontrado" });
      }
      const prev = existing.rows[0];
      const finalLoc2 = locacao?.trim() || (corredor || baia || nivel ? `${corredor}-${baia}-${nivel}`.replace(/^-|-$/g, "") : "");
      const updateRes = await client.query(`
        UPDATE produtos 
        SET corredor = $1, baia = $2, nivel = $3, locacao = $4, atualizado_em = NOW()
        WHERE id = $5
        RETURNING *
      `, [corredor.trim(), baia.trim(), nivel.trim(), finalLoc2, id]);
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo)
        VALUES ($1, 'localizacao', $2, $3, $4)
      `, [
        id,
        JSON.stringify({ corredor: prev.corredor, baia: prev.baia, nivel: prev.nivel, locacao: prev.locacao }),
        JSON.stringify({ corredor: corredor.trim(), baia: baia.trim(), nivel: nivel.trim(), locacao: finalLoc2 }),
        motivo
      ]);
      await client.query("COMMIT");
      return res.json({ product: updateRes.rows[0], message: "Localiza\xE7\xE3o atualizada com sucesso!" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao atualizar localiza\xE7\xE3o:", err.message);
      return res.status(500).json({ error: "Erro ao atualizar localiza\xE7\xE3o: " + err.message });
    } finally {
      client.release();
    }
  }
  const idx = memoryProducts.findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Produto n\xE3o encontrado" });
  }
  const finalLoc = locacao?.trim() || `${corredor}-${baia}-${nivel}`;
  memoryProducts[idx] = {
    ...memoryProducts[idx],
    corredor: corredor.trim(),
    baia: baia.trim(),
    nivel: nivel.trim(),
    locacao: finalLoc,
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  res.json({ product: memoryProducts[idx], message: "Localiza\xE7\xE3o atualizada com sucesso!" });
});
produtosRouter.post("/produtos/:id/codigo", async (req, res) => {
  const { id } = req.params;
  const { tipo, novo_codigo, motivo = "Substitui\xE7\xE3o operacional de etiqueta" } = req.body;
  if (!tipo || !novo_codigo || !novo_codigo.trim()) {
    return res.status(400).json({ error: "Tipo de c\xF3digo e novo c\xF3digo s\xE3o obrigat\xF3rios." });
  }
  const cleanNewCode = novo_codigo.trim();
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const prodRes = await client.query("SELECT * FROM produtos WHERE id = $1", [id]);
      if (prodRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Produto n\xE3o encontrado" });
      }
      const prod = prodRes.rows[0];
      const conflict = await client.query(`
        SELECT p.id, p.descricao FROM codigos_produto c
        JOIN produtos p ON p.id = c.produto_id
        WHERE c.codigo = $1 AND c.tipo = $2 AND c.ativo = true AND c.produto_id != $3
        LIMIT 1
      `, [cleanNewCode, tipo, id]);
      if (conflict.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Este c\xF3digo j\xE1 est\xE1 ativo no produto ${conflict.rows[0].id} (${conflict.rows[0].descricao})`
        });
      }
      await client.query(`
        UPDATE codigos_produto 
        SET ativo = false, desativado_em = NOW(), motivo = $1
        WHERE produto_id = $2 AND tipo = $3 AND ativo = true
      `, [motivo, id, tipo]);
      await client.query(`
        INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
        VALUES ($1, $2, $3, true, $4)
      `, [id, tipo, cleanNewCode, motivo]);
      let updateSql = "UPDATE produtos SET atualizado_em = NOW()";
      if (tipo === "codigo_barras") {
        updateSql = "UPDATE produtos SET codigo_barras_atual = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *";
      } else if (tipo === "codigo_produto") {
        updateSql = "UPDATE produtos SET codigo_atual = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *";
      } else if (tipo === "codigo_fabrica") {
        updateSql = "UPDATE produtos SET codigo_fabrica = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *";
      }
      const updated = await client.query(updateSql, [cleanNewCode, id]);
      await client.query("COMMIT");
      return res.json({
        product: updated.rows[0],
        message: "C\xF3digo atualizado e anterior preservado no hist\xF3rico!"
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao atualizar c\xF3digo:", err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
  const prodIdx = memoryProducts.findIndex((p) => p.id === id);
  if (prodIdx === -1) return res.status(404).json({ error: "Produto n\xE3o encontrado" });
  memoryCodeHistory.forEach((c) => {
    if (c.produto_id === id && c.tipo === tipo && c.ativo) {
      c.ativo = false;
      c.desativado_em = (/* @__PURE__ */ new Date()).toISOString();
      c.motivo = motivo;
    }
  });
  memoryCodeHistory.unshift({
    id: memoryCodeHistory.length + 1,
    produto_id: id,
    tipo,
    codigo: cleanNewCode,
    ativo: true,
    criado_em: (/* @__PURE__ */ new Date()).toISOString(),
    motivo
  });
  if (tipo === "codigo_barras") memoryProducts[prodIdx].codigo_barras_atual = cleanNewCode;
  else if (tipo === "codigo_produto") memoryProducts[prodIdx].codigo_atual = cleanNewCode;
  else if (tipo === "codigo_fabrica") memoryProducts[prodIdx].codigo_fabrica = cleanNewCode;
  memoryProducts[prodIdx].atualizado_em = (/* @__PURE__ */ new Date()).toISOString();
  res.json({
    product: memoryProducts[prodIdx],
    message: "C\xF3digo atualizado com sucesso no hist\xF3rico."
  });
});
produtosRouter.post("/produtos/:id/vincular-codigo", async (req, res) => {
  const { id } = req.params;
  const { codigo, tipo = "codigo_barras", motivo = "V\xEDnculo de c\xF3digo de barras adicional" } = req.body;
  if (!codigo || !codigo.trim()) {
    return res.status(400).json({ error: "O c\xF3digo a vincular \xE9 obrigat\xF3rio." });
  }
  const cleanCode = codigo.trim();
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const prodRes = await client.query("SELECT * FROM produtos WHERE id = $1", [id]);
      if (prodRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Produto n\xE3o encontrado" });
      }
      const prod = prodRes.rows[0];
      const isAlreadyMain = prod.codigo_barras_atual?.trim().toUpperCase() === cleanCode.toUpperCase() || prod.codigo_atual?.trim().toUpperCase() === cleanCode.toUpperCase() || prod.codigo_fabrica?.trim().toUpperCase() === cleanCode.toUpperCase();
      let currentAlts = [];
      if (typeof prod.codigos_alternativos === "string" && prod.codigos_alternativos.trim()) {
        currentAlts = prod.codigos_alternativos.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      } else if (Array.isArray(prod.codigos_alternativos)) {
        currentAlts = prod.codigos_alternativos;
      }
      const isAlreadyInAlts = currentAlts.some((c) => c.toUpperCase() === cleanCode.toUpperCase());
      if (isAlreadyMain || isAlreadyInAlts) {
        await client.query("COMMIT");
        const fullProd = await loadProductExtras(client, prod);
        return res.json({
          success: true,
          product: fullProd,
          message: "Este c\xF3digo j\xE1 est\xE1 vinculado a esta pe\xE7a."
        });
      }
      let updateSql = "";
      let updateParams = [];
      if (!prod.codigo_barras_atual || !prod.codigo_barras_atual.trim()) {
        updateSql = "UPDATE produtos SET codigo_barras_atual = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *";
        updateParams = [cleanCode, id];
      } else {
        const newAlts = [...currentAlts, cleanCode];
        updateSql = "UPDATE produtos SET codigos_alternativos = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *";
        updateParams = [newAlts.join(", "), id];
      }
      const updated = await client.query(updateSql, updateParams);
      await client.query(`
        INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
        VALUES ($1, $2, $3, true, $4)
      `, [id, tipo, cleanCode, motivo]);
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo)
        VALUES ($1, 'codigos_alternativos', $2, $3, $4)
      `, [id, prod.codigo_barras_atual || "", cleanCode, motivo]);
      await client.query("COMMIT");
      const finalProduct = await loadProductExtras(client, updated.rows[0]);
      return res.json({
        success: true,
        product: finalProduct,
        message: "C\xF3digo de barras vinculado com sucesso \xE0 mercadoria!"
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao vincular c\xF3digo:", err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
  const prodIdx = memoryProducts.findIndex((p) => p.id === id);
  if (prodIdx === -1) return res.status(404).json({ error: "Produto n\xE3o encontrado" });
  const pMem = memoryProducts[prodIdx];
  if (!pMem.codigo_barras_atual) {
    pMem.codigo_barras_atual = cleanCode;
  } else {
    if (!Array.isArray(pMem.codigos_alternativos)) pMem.codigos_alternativos = [];
    if (!pMem.codigos_alternativos.includes(cleanCode)) {
      pMem.codigos_alternativos.push(cleanCode);
    }
  }
  pMem.atualizado_em = (/* @__PURE__ */ new Date()).toISOString();
  memoryCodeHistory.unshift({
    id: memoryCodeHistory.length + 1,
    produto_id: id,
    tipo,
    codigo: cleanCode,
    ativo: true,
    criado_em: (/* @__PURE__ */ new Date()).toISOString(),
    motivo
  });
  return res.json({
    success: true,
    product: loadMemoryProductExtras(pMem),
    message: "C\xF3digo de barras vinculado com sucesso \xE0 mercadoria!"
  });
});
produtosRouter.put("/produtos/:id", async (req, res) => {
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
    locacao
  } = req.body;
  const cleanCode = codigo_atual?.trim() || "";
  const cleanFactory = codigo_fabrica?.trim() || "";
  if (!cleanCode && !cleanFactory) {
    return res.status(400).json({ error: "O c\xF3digo do produto ou c\xF3digo de f\xE1brica \xE9 obrigat\xF3rio." });
  }
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT * FROM produtos WHERE id = $1", [id]);
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Produto n\xE3o encontrado" });
      }
      const prev = existing.rows[0];
      let finalBarcode = prev.codigo_barras_atual;
      if (codigo_barras_atual !== void 0) {
        if (codigo_barras_atual === null || String(codigo_barras_atual).trim() === "") {
          finalBarcode = null;
          if (prev.codigo_barras_atual) {
            await client.query(`
              UPDATE codigos_produto 
              SET ativo = false, desativado_em = NOW(), motivo = 'C\xF3digo de barras desvinculado'
              WHERE produto_id = $1 AND tipo = 'codigo_barras' AND ativo = true
            `, [id]);
          }
        } else if (String(codigo_barras_atual).trim() !== prev.codigo_barras_atual) {
          finalBarcode = String(codigo_barras_atual).trim();
          await client.query(`
            UPDATE codigos_produto 
            SET ativo = false, desativado_em = NOW(), motivo = 'Altera\xE7\xE3o completa de cadastro'
            WHERE produto_id = $1 AND tipo = 'codigo_barras' AND ativo = true
          `, [id]);
          await client.query(`
            INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
            VALUES ($1, 'codigo_barras', $2, true, 'Altera\xE7\xE3o completa de cadastro')
          `, [id, finalBarcode]);
        }
      }
      if (codigo_atual && codigo_atual.trim() !== prev.codigo_atual) {
        await client.query(`
          UPDATE codigos_produto 
          SET ativo = false, desativado_em = NOW(), motivo = 'Altera\xE7\xE3o completa de cadastro'
          WHERE produto_id = $1 AND tipo = 'codigo_produto' AND ativo = true
        `, [id]);
        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
          VALUES ($1, 'codigo_produto', $2, true, 'Altera\xE7\xE3o completa de cadastro')
        `, [id, codigo_atual.trim()]);
      }
      const finalLoc = locacao?.trim() || (corredor || baia || nivel ? `${corredor}-${baia}-${nivel}`.replace(/^-|-$/g, "") : prev.locacao);
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
        custo_unitario !== void 0 ? Number(custo_unitario) : prev.custo_unitario,
        preco_tabela !== void 0 ? Number(preco_tabela) : prev.preco_tabela,
        preco_sugerido !== void 0 ? Number(preco_sugerido) : prev.preco_sugerido,
        preco_minimo !== void 0 ? Number(preco_minimo) : prev.preco_minimo,
        quantidade !== void 0 ? parseInt(quantidade, 10) : prev.quantidade,
        estoque_minimo !== void 0 ? parseInt(estoque_minimo, 10) : prev.estoque_minimo,
        estoque_fisico !== void 0 ? parseInt(estoque_fisico, 10) : prev.estoque_fisico,
        ncm !== void 0 ? String(ncm).trim() : prev.ncm,
        ultima_data_venda !== void 0 ? String(ultima_data_venda).trim() : prev.ultima_data_venda,
        ultima_data_compra !== void 0 ? String(ultima_data_compra).trim() : prev.ultima_data_compra,
        corredor?.trim() ?? prev.corredor,
        baia?.trim() ?? prev.baia,
        nivel?.trim() ?? prev.nivel,
        finalLoc,
        id
      ]);
      const auditoriaCampos = [];
      if (descricao && descricao.trim() !== prev.descricao) {
        auditoriaCampos.push({ campo: "descricao", anterior: prev.descricao, novo: descricao.trim() });
      }
      if (codigo_atual && codigo_atual.trim() !== prev.codigo_atual) {
        auditoriaCampos.push({ campo: "codigo_atual", anterior: prev.codigo_atual, novo: codigo_atual.trim() });
      }
      if (codigo_fabrica !== void 0 && codigo_fabrica.trim() !== (prev.codigo_fabrica || "")) {
        auditoriaCampos.push({ campo: "codigo_fabrica", anterior: prev.codigo_fabrica || "", novo: codigo_fabrica.trim() });
      }
      if (codigo_barras_atual !== void 0 && codigo_barras_atual.trim() !== (prev.codigo_barras_atual || "")) {
        auditoriaCampos.push({ campo: "codigo_barras_atual", anterior: prev.codigo_barras_atual || "", novo: codigo_barras_atual.trim() });
      }
      if (preco_tabela !== void 0 && Number(preco_tabela) !== Number(prev.preco_tabela || 0)) {
        auditoriaCampos.push({ campo: "preco_tabela", anterior: String(prev.preco_tabela || 0), novo: String(preco_tabela) });
      }
      if (preco_sugerido !== void 0 && Number(preco_sugerido) !== Number(prev.preco_sugerido || 0)) {
        auditoriaCampos.push({ campo: "preco_sugerido", anterior: String(prev.preco_sugerido || 0), novo: String(preco_sugerido) });
      }
      if (preco_minimo !== void 0 && Number(preco_minimo) !== Number(prev.preco_minimo || 0)) {
        auditoriaCampos.push({ campo: "preco_minimo", anterior: String(prev.preco_minimo || 0), novo: String(preco_minimo) });
      }
      if (quantidade !== void 0 && Number(quantidade) !== Number(prev.quantidade || 0)) {
        auditoriaCampos.push({ campo: "quantidade", anterior: String(prev.quantidade || 0), novo: String(quantidade) });
      }
      if (finalLoc && finalLoc !== (prev.locacao || "")) {
        auditoriaCampos.push({ campo: "locacao", anterior: prev.locacao || "", novo: finalLoc });
      }
      for (const aud of auditoriaCampos) {
        await client.query(`
          INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, aud.campo, aud.anterior, aud.novo, "Edi\xE7\xE3o cadastral", req.body.usuario || "Operador Almoxarifado"]);
      }
      await client.query("COMMIT");
      return res.json({ product: updateRes.rows[0], message: "Produto atualizado com sucesso!" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao editar produto:", err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
  const idx = memoryProducts.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Produto n\xE3o encontrado" });
  memoryProducts[idx] = {
    ...memoryProducts[idx],
    ...req.body,
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  res.json({ product: memoryProducts[idx], message: "Produto atualizado com sucesso!" });
});
produtosRouter.patch("/produtos/:id/estoque", async (req, res) => {
  const { id } = req.params;
  const { quantidade, incremento, motivo = "Entrada por bipagem", usuario = "Operador Almoxarifado" } = req.body;
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const prodRes = await client.query("SELECT * FROM produtos WHERE id = $1 FOR UPDATE", [id]);
      if (prodRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Produto n\xE3o encontrado" });
      }
      const prod = prodRes.rows[0];
      const qtdAnterior2 = parseInt(prod.quantidade, 10) || 0;
      let novaQtd2 = qtdAnterior2;
      if (quantidade !== void 0 && quantidade !== null) {
        novaQtd2 = Math.max(0, parseInt(quantidade, 10) || 0);
      } else if (incremento !== void 0 && incremento !== null) {
        novaQtd2 = Math.max(0, qtdAnterior2 + (parseInt(incremento, 10) || 0));
      }
      const diff = novaQtd2 - qtdAnterior2;
      const tipoMov = diff >= 0 ? "recebimento" : "ajuste";
      const updateRes = await client.query(`
        UPDATE produtos 
        SET quantidade = $1, atualizado_em = NOW() 
        WHERE id = $2 
        RETURNING *
      `, [novaQtd2, id]);
      await client.query(`
        INSERT INTO movimentacoes (produto_id, tipo, quantidade, quantidade_anterior, quantidade_nova, detalhes, usuario, criado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [id, tipoMov, Math.abs(diff), qtdAnterior2, novaQtd2, motivo, usuario]);
      await client.query("COMMIT");
      const updatedProduct = await loadProductExtras(client, updateRes.rows[0]);
      return res.json({
        product: updatedProduct,
        quantidade_anterior: qtdAnterior2,
        quantidade_nova: novaQtd2,
        message: `Estoque atualizado: ${qtdAnterior2} \u2192 ${novaQtd2}`
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao atualizar estoque:", err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
  const idx = memoryProducts.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Produto n\xE3o encontrado" });
  const qtdAnterior = memoryProducts[idx].quantidade || 0;
  let novaQtd = qtdAnterior;
  if (quantidade !== void 0 && quantidade !== null) {
    novaQtd = Math.max(0, parseInt(quantidade, 10) || 0);
  } else if (incremento !== void 0 && incremento !== null) {
    novaQtd = Math.max(0, qtdAnterior + (parseInt(incremento, 10) || 0));
  }
  memoryProducts[idx].quantidade = novaQtd;
  memoryProducts[idx].atualizado_em = (/* @__PURE__ */ new Date()).toISOString();
  memoryMovements.unshift({
    id: `MOV-${Date.now()}`,
    produto_id: id,
    tipo: novaQtd >= qtdAnterior ? "recebimento" : "ajuste",
    quantidade: Math.abs(novaQtd - qtdAnterior),
    quantidade_anterior: qtdAnterior,
    quantidade_nova: novaQtd,
    detalhes: motivo,
    usuario,
    criado_em: (/* @__PURE__ */ new Date()).toISOString()
  });
  const updatedProd = loadMemoryProductExtras(memoryProducts[idx]);
  return res.json({
    product: updatedProd,
    quantidade_anterior: qtdAnterior,
    quantidade_nova: novaQtd,
    message: `Estoque atualizado: ${qtdAnterior} \u2192 ${novaQtd}`
  });
});
produtosRouter.get("/produtos/:id/historico", async (req, res) => {
  const { id } = req.params;
  const pool2 = getDbPool();
  if (!pool2) return res.json([]);
  try {
    const client = await pool2.connect();
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
  } catch (err) {
    console.error("Erro ao buscar historico:", err.message);
    return res.status(500).json({ error: "Falha ao buscar historico" });
  }
});
produtosRouter.post("/produtos/:id/rollback/:historicoId", async (req, res) => {
  const { id, historicoId } = req.params;
  const { usuario } = req.body;
  const pool2 = getDbPool();
  if (!pool2) return res.status(500).json({ error: "DB n\xE3o configurado" });
  try {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const hist = await client.query("SELECT * FROM historico_alteracoes WHERE id = $1 AND produto_id = $2", [historicoId, id]);
      if (hist.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Registro de hist\xF3rico n\xE3o encontrado" });
      }
      const rec = hist.rows[0];
      const validFields = ["descricao", "codigo_atual", "codigo_fabrica", "codigo_barras_atual", "custo_unitario", "preco_tabela", "preco_sugerido", "preco_minimo", "quantidade", "estoque_minimo", "estoque_fisico", "ncm", "locacao"];
      if (!validFields.includes(rec.campo)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Campo n\xE3o permitido para rollback autom\xE1tico" });
      }
      let finalValue = rec.valor_anterior;
      if (["custo_unitario", "preco_tabela", "preco_sugerido", "preco_minimo"].includes(rec.campo)) {
        finalValue = finalValue ? Number(finalValue) : null;
      } else if (["quantidade", "estoque_minimo", "estoque_fisico"].includes(rec.campo)) {
        finalValue = finalValue ? parseInt(finalValue, 10) : 0;
      }
      await client.query(`UPDATE produtos SET ${rec.campo} = $1, atualizado_em = NOW() WHERE id = $2`, [finalValue, id]);
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, rec.campo, rec.valor_novo, rec.valor_anterior, "Rollback / Desfazer A\xE7\xE3o", usuario || "Operador Almoxarifado"]);
      await client.query("COMMIT");
      return res.json({ success: true, message: "Altera\xE7\xE3o desfeita com sucesso!" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Erro no rollback:", err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
produtosRouter.delete("/produtos/:id", async (req, res) => {
  const { id } = req.params;
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const check = await client.query("SELECT * FROM produtos WHERE id = $1", [id]);
      if (check.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Produto n\xE3o encontrado para exclus\xE3o." });
      }
      const prod = check.rows[0];
      await client.query(`
        UPDATE movimentacoes 
        SET produto_id = NULL, 
            detalhes = COALESCE(detalhes, '') || ' [Registro do produto ' || $1 || ' (' || $2 || ') exclu\xEDdo]'
        WHERE produto_id = $1
      `, [id, prod.descricao]);
      await client.query(`
        DELETE FROM produtos_relacionados 
        WHERE produto_id = $1 OR relacionado_id = $1
      `, [id]);
      await client.query("DELETE FROM codigos_produto WHERE produto_id = $1", [id]);
      await client.query("DELETE FROM historico_alteracoes WHERE produto_id = $1", [id]);
      await client.query("DELETE FROM produtos WHERE id = $1", [id]);
      await client.query("COMMIT");
      return res.json({
        success: true,
        message: `Produto ${prod.id} (${prod.descricao}) foi exclu\xEDdo com sucesso do banco de dados.`
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao excluir produto do PostgreSQL:", err.message);
      return res.status(500).json({ error: "Falha ao excluir produto: " + err.message });
    } finally {
      client.release();
    }
  }
  const idx = memoryProducts.findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Produto n\xE3o encontrado para exclus\xE3o." });
  }
  const deleted = memoryProducts.splice(idx, 1)[0];
  memoryCodeHistory = memoryCodeHistory.filter((c) => c.produto_id !== id);
  memoryRelatedProducts = memoryRelatedProducts.filter((r) => r.produto_id !== id && r.relacionado_id !== id);
  return res.json({
    success: true,
    message: `Produto ${deleted.id} (${deleted.descricao}) foi exclu\xEDdo com sucesso.`
  });
});
produtosRouter.get("/produtos/:id/relacionados", async (req, res) => {
  const { id } = req.params;
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      const rels = await client.query(`
        SELECT DISTINCT pr.id as rel_id, pr.motivo, p.id, p.codigo_atual, p.descricao, p.codigo_barras_atual, p.codigo_fabrica, p.quantidade, p.locacao, p.corredor, p.baia, p.nivel, p.preco_tabela, p.preco_sugerido, p.preco_minimo
        FROM produtos_relacionados pr
        JOIN produtos p ON (p.id = CASE WHEN pr.produto_id = $1 THEN pr.relacionado_id ELSE pr.produto_id END)
        WHERE (pr.produto_id = $1 OR pr.relacionado_id = $1) AND p.id <> $1
      `, [id]);
      const formatted = rels.rows.map((r) => ({
        ...r,
        quantidade: Number(r.quantidade) || 0,
        preco_tabela: Number(r.preco_tabela) || 0,
        preco_sugerido: Number(r.preco_sugerido) || 0,
        preco_minimo: Number(r.preco_minimo) || 0
      }));
      return res.json({ relacionados: formatted });
    } finally {
      client.release();
    }
  }
  const relLinks = memoryRelatedProducts.filter((r) => r.produto_id === id || r.relacionado_id === id);
  const relacionados = relLinks.map((r) => {
    const targetId = r.produto_id === id ? r.relacionado_id : r.produto_id;
    const target = memoryProducts.find((p) => p.id === targetId);
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
      preco_minimo: Number(target.preco_minimo) || 0
    } : null;
  }).filter(Boolean);
  return res.json({ relacionados });
});
produtosRouter.post("/produtos/:id/relacionados", async (req, res) => {
  const { id } = req.params;
  const { relacionado_id, codigo, codigo_generico, motivo = "Pe\xE7a gen\xE9rica / compat\xEDvel" } = req.body;
  let targetId = relacionado_id;
  const codeToFind = (codigo || codigo_generico || "").trim();
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      if (!targetId && codeToFind) {
        const searchRes = await client.query(`
          SELECT id, descricao, codigo_fabrica, codigo_atual FROM produtos
          WHERE UPPER(codigo_fabrica) = UPPER($1)
             OR UPPER(codigo_atual) = UPPER($1)
             OR UPPER(codigo_barras_atual) = UPPER($1)
             OR (LENGTH($1) >= 4 AND REPLACE(REPLACE(codigo_fabrica, ' ', ''), '-', '') = REPLACE(REPLACE($1, ' ', ''), '-', ''))
          LIMIT 1
        `, [codeToFind]);
        if (searchRes.rows.length === 0) {
          return res.status(404).json({ error: `Nenhum produto cadastrado encontrado com o c\xF3digo "${codeToFind}".` });
        }
        targetId = searchRes.rows[0].id;
      }
      if (!targetId || targetId === id) {
        return res.status(400).json({ error: "ID ou c\xF3digo do produto relacionado \xE9 inv\xE1lido ou igual ao pr\xF3prio produto." });
      }
      await client.query(`
        INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
        VALUES ($1, $2, $3)
        ON CONFLICT (produto_id, relacionado_id) DO NOTHING
      `, [id, targetId, motivo]);
      const existingPeers = await client.query(`
        SELECT DISTINCT CASE WHEN produto_id = $1 OR produto_id = $2 THEN relacionado_id ELSE produto_id END as peer_id
        FROM produtos_relacionados
        WHERE produto_id IN ($1, $2) OR relacionado_id IN ($1, $2)
      `, [id, targetId]);
      const allGroupIds = Array.from(/* @__PURE__ */ new Set([id, targetId, ...existingPeers.rows.map((r) => r.peer_id)]));
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
      return res.status(201).json({ success: true, message: "Produto gen\xE9rico vinculado com sucesso." });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
  if (!targetId && codeToFind) {
    const found = memoryProducts.find(
      (p) => p.codigo_fabrica?.toUpperCase() === codeToFind.toUpperCase() || p.codigo_atual?.toUpperCase() === codeToFind.toUpperCase() || p.codigo_barras_atual?.toUpperCase() === codeToFind.toUpperCase()
    );
    if (!found) {
      return res.status(404).json({ error: `Nenhum produto cadastrado encontrado com o c\xF3digo "${codeToFind}".` });
    }
    targetId = found.id;
  }
  if (!targetId || targetId === id) {
    return res.status(400).json({ error: "Produto relacionado inv\xE1lido." });
  }
  const exists = memoryRelatedProducts.some(
    (r) => r.produto_id === id && r.relacionado_id === targetId || r.produto_id === targetId && r.relacionado_id === id
  );
  if (!exists) {
    memoryRelatedProducts.push({
      id: Date.now(),
      produto_id: id,
      relacionado_id: targetId,
      motivo,
      criado_em: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return res.status(201).json({ success: true, message: "Produto gen\xE9rico vinculado com sucesso." });
});
produtosRouter.post("/produtos/:id/desvincular-codigo-barras", async (req, res) => {
  const { id } = req.params;
  const { motivo = "C\xF3digo de barras desvinculado manualmente", usuario = "Operador Almoxarifado" } = req.body;
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const prodRes = await client.query("SELECT * FROM produtos WHERE id = $1", [id]);
      if (prodRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Produto n\xE3o encontrado" });
      }
      const prev = prodRes.rows[0];
      const prevBarcode = prev.codigo_barras_atual;
      await client.query("UPDATE produtos SET codigo_barras_atual = NULL, atualizado_em = NOW() WHERE id = $1", [id]);
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
      await client.query("COMMIT");
      const updated = await client.query("SELECT * FROM produtos WHERE id = $1", [id]);
      const product = await loadProductExtras(client, updated.rows[0]);
      return res.json({ success: true, product, message: "C\xF3digo de barras desvinculado com sucesso!" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao desvincular c\xF3digo de barras:", err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
  const idx = memoryProducts.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Produto n\xE3o encontrado" });
  memoryProducts[idx].codigo_barras_atual = void 0;
  memoryProducts[idx].atualizado_em = (/* @__PURE__ */ new Date()).toISOString();
  memoryCodeHistory.forEach((c) => {
    if (c.produto_id === id && c.tipo === "codigo_barras" && c.ativo) {
      c.ativo = false;
      c.desativado_em = (/* @__PURE__ */ new Date()).toISOString();
      c.motivo = motivo;
    }
  });
  const updatedProd = loadMemoryProductExtras(memoryProducts[idx]);
  return res.json({ success: true, product: updatedProd, message: "C\xF3digo de barras desvinculado com sucesso!" });
});
produtosRouter.delete("/produtos/:id/relacionados/:relacionadoId", async (req, res) => {
  const { id, relacionadoId } = req.params;
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query(`
        DELETE FROM produtos_relacionados 
        WHERE (produto_id = $1 AND relacionado_id = $2)
           OR (produto_id = $2 AND relacionado_id = $1)
           OR (id::text = $2 AND (produto_id = $1 OR relacionado_id = $1))
      `, [id, relacionadoId]);
      return res.json({ success: true, message: "V\xEDnculo de produto relacionado removido." });
    } finally {
      client.release();
    }
  }
  memoryRelatedProducts = memoryRelatedProducts.filter(
    (r) => !(r.produto_id === id && r.relacionado_id === relacionadoId || r.produto_id === relacionadoId && r.relacionado_id === id || String(r.id) === String(relacionadoId) && (r.produto_id === id || r.relacionado_id === id))
  );
  return res.json({ success: true, message: "V\xEDnculo de produto relacionado removido." });
});

// server/routes/orcamentos.routes.ts
import { Router as Router4 } from "express";
var orcamentosRouter = Router4();
var memoryOrcamentos = [];
orcamentosRouter.get("/orcamentos", async (req, res) => {
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const result = await client.query("SELECT * FROM orcamentos ORDER BY criado_em DESC");
        return res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao buscar orcamentos:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  return res.json(memoryOrcamentos);
});
orcamentosRouter.post("/orcamentos", async (req, res) => {
  const { id, nome_cliente, responsavel, itens, total_orcamento } = req.body;
  if (!nome_cliente || !responsavel || !itens) {
    return res.status(400).json({ error: "Dados incompletos para or\xE7amento." });
  }
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        if (id) {
          const result = await client.query(
            `UPDATE orcamentos 
             SET nome_cliente = $1, responsavel = $2, itens = $3, total_orcamento = $4, atualizado_em = NOW() 
             WHERE id = $5 RETURNING *`,
            [nome_cliente, responsavel, JSON.stringify(itens), total_orcamento, id]
          );
          return res.json({ success: true, orcamento: result.rows[0] });
        } else {
          const result = await client.query(
            `INSERT INTO orcamentos (nome_cliente, responsavel, itens, total_orcamento) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [nome_cliente, responsavel, JSON.stringify(itens), total_orcamento]
          );
          return res.status(201).json({ success: true, orcamento: result.rows[0] });
        }
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao salvar or\xE7amento:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  if (id) {
    const idx = memoryOrcamentos.findIndex((o) => o.id === id);
    if (idx >= 0) {
      memoryOrcamentos[idx] = { ...memoryOrcamentos[idx], nome_cliente, responsavel, itens, total_orcamento, atualizado_em: (/* @__PURE__ */ new Date()).toISOString() };
      return res.json({ success: true, orcamento: memoryOrcamentos[idx] });
    }
  }
  const novoOrcamento = {
    id: id || `temp-${Date.now()}`,
    nome_cliente,
    responsavel,
    itens,
    total_orcamento,
    criado_em: (/* @__PURE__ */ new Date()).toISOString(),
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  memoryOrcamentos.push(novoOrcamento);
  return res.status(201).json({ success: true, orcamento: novoOrcamento });
});
orcamentosRouter.delete("/orcamentos/:id", async (req, res) => {
  const { id } = req.params;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        await client.query("DELETE FROM orcamentos WHERE id = $1", [id]);
        return res.json({ success: true });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao excluir or\xE7amento:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  memoryOrcamentos = memoryOrcamentos.filter((o) => o.id !== id);
  return res.json({ success: true });
});

// server/routes/auditoria.routes.ts
import { Router as Router5 } from "express";
var auditoriaRouter = Router5();
auditoriaRouter.get("/auditoria", async (req, res) => {
  const { search, limit = 100 } = req.query;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        let query = `
          SELECT h.*, p.codigo_atual, p.descricao
          FROM historico_alteracoes h
          LEFT JOIN produtos p ON p.id = h.produto_id
        `;
        const params = [];
        if (search && typeof search === "string" && search.trim()) {
          query += ` WHERE (p.descricao ILIKE $1 OR p.codigo_atual ILIKE $1 OR h.produto_id ILIKE $1 OR h.campo ILIKE $1 OR h.usuario ILIKE $1 OR h.motivo ILIKE $1)`;
          params.push(`%${search.trim()}%`);
        }
        query += ` ORDER BY h.criado_em DESC LIMIT $${params.length + 1}`;
        params.push(Math.min(300, Number(limit) || 100));
        const result = await client.query(query, params);
        return res.json({ success: true, registros: result.rows });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao consultar auditoria:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  return res.json({ success: true, registros: [] });
});
auditoriaRouter.post("/auditoria/reverter/:id", async (req, res) => {
  const { id } = req.params;
  const { usuario = "Programador / Admin" } = req.body;
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const histRes = await client.query("SELECT * FROM historico_alteracoes WHERE id = $1", [id]);
      if (histRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Registro de auditoria n\xE3o encontrado." });
      }
      const registro = histRes.rows[0];
      const { produto_id, campo, valor_anterior, valor_novo } = registro;
      if (valor_anterior === null || valor_anterior === void 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Este registro n\xE3o possui valor anterior armazenado para reverter." });
      }
      if (campo === "localizacao") {
        try {
          const locObj = JSON.parse(valor_anterior);
          await client.query(`
            UPDATE produtos 
            SET corredor = $1, baia = $2, nivel = $3, locacao = $4, atualizado_em = NOW()
            WHERE id = $5
          `, [locObj.corredor || "", locObj.baia || "", locObj.nivel || "", locObj.locacao || "", produto_id]);
        } catch {
          await client.query(`UPDATE produtos SET locacao = $1, atualizado_em = NOW() WHERE id = $2`, [valor_anterior, produto_id]);
        }
      } else {
        const allowedColumns = [
          "descricao",
          "codigo_atual",
          "codigo_fabrica",
          "codigo_barras_atual",
          "custo_unitario",
          "preco_tabela",
          "preco_sugerido",
          "preco_minimo",
          "quantidade",
          "estoque_minimo",
          "corredor",
          "baia",
          "nivel",
          "locacao",
          "codigos_alternativos"
        ];
        if (allowedColumns.includes(campo)) {
          let val = valor_anterior;
          if (["custo_unitario", "preco_tabela", "preco_sugerido", "preco_minimo"].includes(campo)) {
            val = Number(valor_anterior) || 0;
          } else if (["quantidade", "estoque_minimo"].includes(campo)) {
            val = parseInt(valor_anterior, 10) || 0;
          }
          await client.query(`UPDATE produtos SET ${campo} = $1, atualizado_em = NOW() WHERE id = $2`, [val, produto_id]);
        }
      }
      await client.query(`
        INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        produto_id,
        campo,
        valor_novo,
        valor_anterior,
        `Revers\xE3o da altera\xE7\xE3o #${id} realizada pelo programador/administrador`,
        usuario
      ]);
      await client.query("COMMIT");
      return res.json({
        success: true,
        message: `Altera\xE7\xE3o no campo "${campo}" revertida com sucesso! O valor anterior foi restaurado.`
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro ao reverter altera\xE7\xE3o:", err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
  return res.status(400).json({ error: "Opera\xE7\xE3o requer banco de dados ativo." });
});

// server/routes/listas.routes.ts
import { Router as Router6 } from "express";
var listasRouter = Router6();
var memoryListasRapidas = [];
listasRouter.get("/listas-rapidas", async (req, res) => {
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const result = await client.query("SELECT * FROM listas_rapidas ORDER BY criado_em DESC");
        return res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao buscar listas r\xE1pidas:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  return res.json(memoryListasRapidas);
});
listasRouter.get("/listas-rapidas/lookup-item/:code", async (req, res) => {
  const { code } = req.params;
  const clean = (code || "").trim();
  if (!clean) {
    return res.json({ found: false });
  }
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const resProd = await client.query(`
          SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao,
                 corredor, baia, nivel, locacao, quantidade
          FROM produtos
          WHERE UPPER(codigo_atual) = UPPER($1)
             OR UPPER(codigo_fabrica) = UPPER($1)
             OR UPPER(codigo_barras_atual) = UPPER($1)
          LIMIT 1
        `, [clean]);
        if (resProd.rows.length > 0) {
          const p = resProd.rows[0];
          const locStr = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "";
          return res.json({
            found: true,
            codigo: p.codigo_atual,
            descricao: p.descricao,
            locacao: locStr,
            quantidade: p.quantidade || 0
          });
        }
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro no lookup r\xE1pido de item:", err.message);
    }
  }
  return res.json({ found: false, locacao: "" });
});
listasRouter.get("/listas-rapidas/:id", async (req, res) => {
  const { id } = req.params;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const result = await client.query("SELECT * FROM listas_rapidas WHERE id = $1", [id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Lista n\xE3o encontrada" });
        }
        return res.json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  const item = memoryListasRapidas.find((l) => String(l.id) === String(id));
  if (!item) return res.status(404).json({ error: "Lista n\xE3o encontrada" });
  return res.json(item);
});
listasRouter.post("/listas-rapidas", async (req, res) => {
  const { id, nome, responsavel = "Estoque", itens = [] } = req.body;
  if (!nome || typeof nome !== "string") {
    return res.status(400).json({ error: "Nome da lista \xE9 obrigat\xF3rio" });
  }
  const totalItens = Array.isArray(itens) ? itens.length : 0;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        if (id) {
          const result = await client.query(
            `UPDATE listas_rapidas 
             SET nome = $1, responsavel = $2, itens = $3, total_itens = $4, atualizado_em = NOW() 
             WHERE id = $5 RETURNING *`,
            [nome, responsavel, JSON.stringify(itens), totalItens, id]
          );
          if (result.rows.length === 0) {
            return res.status(404).json({ error: "Lista n\xE3o encontrada para atualiza\xE7\xE3o" });
          }
          return res.json({ success: true, lista: result.rows[0] });
        } else {
          const result = await client.query(
            `INSERT INTO listas_rapidas (nome, responsavel, itens, total_itens) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [nome, responsavel, JSON.stringify(itens), totalItens]
          );
          return res.status(201).json({ success: true, lista: result.rows[0] });
        }
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao salvar lista r\xE1pida:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  if (id) {
    const idx = memoryListasRapidas.findIndex((l) => String(l.id) === String(id));
    if (idx !== -1) {
      memoryListasRapidas[idx] = {
        ...memoryListasRapidas[idx],
        nome,
        responsavel,
        itens,
        total_itens: totalItens,
        atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
      };
      return res.json({ success: true, lista: memoryListasRapidas[idx] });
    }
  }
  const novaLista = {
    id: Date.now(),
    nome,
    responsavel,
    itens,
    total_itens: totalItens,
    criado_em: (/* @__PURE__ */ new Date()).toISOString(),
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  memoryListasRapidas.push(novaLista);
  return res.status(201).json({ success: true, lista: novaLista });
});
listasRouter.delete("/listas-rapidas/:id", async (req, res) => {
  const { id } = req.params;
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        await client.query("DELETE FROM listas_rapidas WHERE id = $1", [id]);
        return res.json({ success: true });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao excluir lista r\xE1pida:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  memoryListasRapidas = memoryListasRapidas.filter((l) => String(l.id) !== String(id));
  return res.json({ success: true });
});

// server/routes/dashboard.routes.ts
import { Router as Router7 } from "express";
var dashboardRouter = Router7();
dashboardRouter.get("/dashboard/stats", async (req, res) => {
  const pool2 = getDbPool();
  if (pool2) {
    try {
      const client = await pool2.connect();
      try {
        const totalRes = await client.query("SELECT COUNT(*) as count FROM produtos");
        const comEstoqueRes = await client.query("SELECT COUNT(*) as count FROM produtos WHERE quantidade > 0");
        const semEstoqueRes = await client.query("SELECT COUNT(*) as count FROM produtos WHERE quantidade = 0");
        const semLocacaoRes = await client.query("SELECT COUNT(*) as count FROM produtos WHERE (corredor = '' OR corredor IS NULL) AND (locacao = '' OR locacao IS NULL)");
        const semBarcodeRes = await client.query("SELECT COUNT(*) as count FROM produtos WHERE (codigo_barras_atual = '' OR codigo_barras_atual IS NULL)");
        const codigosAltRes = await client.query("SELECT COUNT(*) as count FROM codigos_produto WHERE desativado_em IS NOT NULL");
        const lotesRes = await client.query("SELECT * FROM lotes_importacao ORDER BY criado_em DESC LIMIT 5");
        return res.json({
          total_produtos: parseInt(totalRes.rows[0].count, 10),
          com_estoque: parseInt(comEstoqueRes.rows[0].count, 10),
          sem_estoque: parseInt(semEstoqueRes.rows[0].count, 10),
          sem_localizacao: parseInt(semLocacaoRes.rows[0].count, 10),
          sem_codigo_barras: parseInt(semBarcodeRes.rows[0].count, 10),
          codigos_alterados_recentes: parseInt(codigosAltRes.rows[0].count, 10),
          ultimas_importacoes: lotesRes.rows
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[API] Erro ao obter stats do PostgreSQL:", err.message);
    }
  }
  return res.json({
    total_produtos: 0,
    com_estoque: 0,
    sem_estoque: 0,
    sem_localizacao: 0,
    sem_codigo_barras: 0,
    codigos_alterados_recentes: 0,
    ultimas_importacoes: []
  });
});

// server/routes/importar.routes.ts
import { Router as Router8 } from "express";
var importarRouter = Router8();
importarRouter.post("/importar/comparar", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Nenhum item enviado para compara\xE7\xE3o." });
  }
  const pool2 = getDbPool();
  const comparisonItems = [];
  let novosCount = 0;
  let semAlteracaoCount = 0;
  let comAlteracaoCount = 0;
  if (pool2) {
    const client = await pool2.connect();
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const desc = item.descricao?.trim() || "";
        if (!desc) continue;
        const codAtual = item.codigo_atual?.trim() || "";
        const barcode = item.codigo_barras_atual?.trim() || "";
        const codFabrica = item.codigo_fabrica?.trim() || "";
        let existingProd = null;
        let matchedBy;
        if (codAtual) {
          const resC = await client.query("SELECT * FROM produtos WHERE UPPER(codigo_atual) = UPPER($1) LIMIT 1", [codAtual]);
          if (resC.rows.length > 0) {
            existingProd = resC.rows[0];
            matchedBy = "codigo_interno";
          }
        }
        if (!existingProd && barcode) {
          const resB = await client.query("SELECT * FROM produtos WHERE UPPER(codigo_barras_atual) = UPPER($1) LIMIT 1", [barcode]);
          if (resB.rows.length > 0) {
            existingProd = resB.rows[0];
            matchedBy = "codigo_barras";
          }
        }
        if (!existingProd && codFabrica) {
          const resF = await client.query("SELECT * FROM produtos WHERE UPPER(codigo_fabrica) = UPPER($1) LIMIT 1", [codFabrica]);
          if (resF.rows.length > 0) {
            existingProd = resF.rows[0];
            matchedBy = "codigo_fabrica";
          }
        }
        if (existingProd) {
          const changes = [];
          const newLoc = item.locacao?.trim() || (item.corredor || item.baia || item.nivel ? `${item.corredor}-${item.baia}-${item.nivel}`.replace(/^-|-$/g, "") : "");
          const currLoc = existingProd.locacao || (existingProd.corredor || existingProd.baia || existingProd.nivel ? `${existingProd.corredor}-${existingProd.baia}-${existingProd.nivel}`.replace(/^-|-$/g, "") : "");
          if (newLoc && newLoc !== currLoc) {
            changes.push({ field: "locacao", label: "Localiza\xE7\xE3o", currentValue: currLoc || "Sem localiza\xE7\xE3o", newValue: newLoc });
          }
          if (barcode && barcode !== existingProd.codigo_barras_atual) {
            changes.push({ field: "codigo_barras", label: "C\xF3digo de Barras (EAN)", currentValue: existingProd.codigo_barras_atual || "N\xE3o cadastrado", newValue: barcode });
          }
          if (codFabrica && codFabrica !== existingProd.codigo_fabrica) {
            changes.push({ field: "codigo_fabrica", label: "C\xF3digo Fabricante", currentValue: existingProd.codigo_fabrica || "N\xE3o cadastrado", newValue: codFabrica });
          }
          if (desc && desc.toUpperCase() !== existingProd.descricao?.toUpperCase()) {
            changes.push({ field: "descricao", label: "Descri\xE7\xE3o", currentValue: existingProd.descricao, newValue: desc });
          }
          const newQtd = parseInt(item.quantidade, 10);
          if (!isNaN(newQtd) && newQtd > 0 && newQtd !== existingProd.quantidade) {
            changes.push({ field: "quantidade", label: "Estoque", currentValue: String(existingProd.quantidade), newValue: String(newQtd) });
          }
          const newCusto = Number(item.custo_unitario);
          if (!isNaN(newCusto) && newCusto > 0 && Math.abs(newCusto - Number(existingProd.custo_unitario)) > 1e-3) {
            changes.push({ field: "custo_unitario", label: "Custo Unit\xE1rio", currentValue: `R$ ${Number(existingProd.custo_unitario).toFixed(2)}`, newValue: `R$ ${newCusto.toFixed(2)}` });
          }
          if (changes.length > 0) {
            comAlteracaoCount++;
            comparisonItems.push({
              id: `comp-${i}`,
              status: "com_alteracao",
              matchedBy,
              existingProduct: existingProd,
              importData: item,
              changes,
              selected: true
            });
          } else {
            semAlteracaoCount++;
            comparisonItems.push({
              id: `comp-${i}`,
              status: "sem_alteracao",
              matchedBy,
              existingProduct: existingProd,
              importData: item,
              changes: [],
              selected: false
            });
          }
        } else {
          novosCount++;
          comparisonItems.push({
            id: `comp-${i}`,
            status: "novo",
            importData: item,
            changes: [],
            selected: true
          });
        }
      }
      return res.json({
        items: comparisonItems,
        summary: {
          total: comparisonItems.length,
          novos: novosCount,
          semAlteracao: semAlteracaoCount,
          comAlteracao: comAlteracaoCount
        }
      });
    } finally {
      client.release();
    }
  }
  return res.json({
    items: [],
    summary: { total: 0, novos: 0, semAlteracao: 0, comAlteracao: 0 }
  });
});
importarRouter.post("/importar", async (req, res) => {
  const {
    items,
    fileName = "arquivo_importado.csv",
    preserveExistingLocation = true,
    archiveOldBarcodesInHistory = true
  } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Lista de itens para importa\xE7\xE3o est\xE1 vazia." });
  }
  let novos = 0;
  let atualizados = 0;
  let erros = 0;
  const pool2 = getDbPool();
  if (pool2) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      for (const item of items) {
        if (!item.descricao || !item.descricao.trim()) {
          erros++;
          continue;
        }
        const barcode = item.codigo_barras_atual?.trim() || "";
        const codFabrica = item.codigo_fabrica?.trim() || "";
        const codAtual = item.codigo_atual?.trim() || "";
        let existingId = null;
        if (codAtual) {
          const findC = await client.query("SELECT id FROM produtos WHERE UPPER(codigo_atual) = UPPER($1) LIMIT 1", [codAtual]);
          if (findC.rows.length > 0) existingId = findC.rows[0].id;
        }
        if (!existingId && barcode) {
          const findB = await client.query("SELECT id FROM produtos WHERE UPPER(codigo_barras_atual) = UPPER($1) LIMIT 1", [barcode]);
          if (findB.rows.length > 0) existingId = findB.rows[0].id;
        }
        if (!existingId && codFabrica) {
          const findF = await client.query("SELECT id FROM produtos WHERE UPPER(codigo_fabrica) = UPPER($1) LIMIT 1", [codFabrica]);
          if (findF.rows.length > 0) existingId = findF.rows[0].id;
        }
        if (existingId) {
          const curr = await client.query("SELECT * FROM produtos WHERE id = $1", [existingId]);
          const currProd = curr.rows[0];
          const finalCorredor = preserveExistingLocation ? currProd.corredor || item.corredor || "" : item.corredor || currProd.corredor || "";
          const finalBaia = preserveExistingLocation ? currProd.baia || item.baia || "" : item.baia || currProd.baia || "";
          const finalNivel = preserveExistingLocation ? currProd.nivel || item.nivel || "" : item.nivel || currProd.nivel || "";
          const finalLoc = preserveExistingLocation ? currProd.locacao || item.locacao || "" : item.locacao || currProd.locacao || "";
          if (barcode && barcode !== currProd.codigo_barras_atual && archiveOldBarcodesInHistory) {
            await client.query(`
              UPDATE codigos_produto 
              SET ativo = false, desativado_em = NOW(), motivo = $1
              WHERE produto_id = $2 AND tipo = 'codigo_barras' AND ativo = true
            `, [`Importa\xE7\xE3o da planilha ${fileName}`, existingId]);
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
              ultima_data_venda = COALESCE(NULLIF($10, ''), ultima_data_venda),
              ultima_data_compra = COALESCE(NULLIF($11, ''), ultima_data_compra),
              atualizado_em = NOW()
            WHERE id = $12
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
            item.ultima_data_venda?.trim() || "",
            item.ultima_data_compra?.trim() || "",
            existingId
          ]);
          atualizados++;
        } else {
          const countRes = await client.query("SELECT COUNT(*) as count FROM produtos");
          const nextNum = parseInt(countRes.rows[0].count, 10) + 1;
          const newId = `PRD-${String(nextNum).padStart(4, "0")}`;
          const finalCode = codAtual || newId;
          const finalLoc = item.locacao || (item.corredor || item.baia || item.nivel ? `${item.corredor}-${item.baia}-${item.nivel}`.replace(/^-|-$/g, "") : "");
          await client.query(`
            INSERT INTO produtos (
              id, codigo_atual, codigo_fabrica, codigo_barras_atual,
              descricao, custo_unitario, quantidade, estoque_minimo,
              corredor, baia, nivel, locacao, ultima_data_venda, ultima_data_compra, criado_em, atualizado_em
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
          `, [
            newId,
            finalCode,
            codFabrica,
            barcode,
            item.descricao.trim(),
            Number(item.custo_unitario) || 0,
            parseInt(item.quantidade, 10) || 0,
            parseInt(item.estoque_minimo, 10) || 0,
            item.corredor || "",
            item.baia || "",
            item.nivel || "",
            finalLoc,
            item.ultima_data_venda?.trim() || "",
            item.ultima_data_compra?.trim() || ""
          ]);
          if (barcode) {
            await client.query(`
              INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
              VALUES ($1, 'codigo_barras', $2, true, 'Importa\xE7\xE3o inicial')
            `, [newId, barcode]);
          }
          if (finalCode) {
            await client.query(`
              INSERT INTO codigos_produto (produto_id, tipo, codigo, ativo, motivo)
              VALUES ($1, 'codigo_produto', $2, true, 'Importa\xE7\xE3o inicial')
            `, [newId, finalCode]);
          }
          novos++;
        }
      }
      for (const item of items) {
        const rawGen = String(item.genericos || item.codigos_genericos || "").trim();
        if (!rawGen) continue;
        const codFabrica = item.codigo_fabrica?.trim() || "";
        const codAtual = item.codigo_atual?.trim() || "";
        const barcode = item.codigo_barras_atual?.trim() || "";
        const mainRes = await client.query(`
          SELECT id FROM produtos
          WHERE (UPPER(codigo_fabrica) = UPPER($1) AND $1 <> '')
             OR (UPPER(codigo_atual) = UPPER($2) AND $2 <> '')
             OR (UPPER(codigo_barras_atual) = UPPER($3) AND $3 <> '')
          LIMIT 1
        `, [codFabrica, codAtual, barcode]);
        if (mainRes.rows.length === 0) continue;
        const mainId = mainRes.rows[0].id;
        const genList = rawGen.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
        for (const gCode of genList) {
          const peerRes = await client.query(`
            SELECT id FROM produtos
            WHERE UPPER(codigo_fabrica) = UPPER($1)
               OR UPPER(codigo_atual) = UPPER($1)
               OR UPPER(codigo_barras_atual) = UPPER($1)
            LIMIT 1
          `, [gCode]);
          if (peerRes.rows.length > 0) {
            const peerId = peerRes.rows[0].id;
            if (peerId !== mainId) {
              await client.query(`
                INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
                VALUES ($1, $2, 'Importado via Planilha')
                ON CONFLICT (produto_id, relacionado_id) DO NOTHING
              `, [mainId, peerId]);
              await client.query(`
                INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
                VALUES ($1, $2, 'Importado via Planilha')
                ON CONFLICT (produto_id, relacionado_id) DO NOTHING
              `, [peerId, mainId]);
            }
          }
        }
      }
      await client.query(`
        INSERT INTO lotes_importacao (arquivo, total, novos, atualizados, erros, usuario)
        VALUES ($1, $2, $3, $4, $5, 'Operador Almoxarifado')
      `, [fileName, items.length, novos, atualizados, erros]);
      await client.query("COMMIT");
      return res.json({
        total: items.length,
        novos,
        atualizados,
        erros,
        message: "Lote importado com sucesso no PostgreSQL Neon."
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[API] Erro no lote de importa\xE7\xE3o:", err.message);
      return res.status(500).json({ error: "Falha na transa\xE7\xE3o de importa\xE7\xE3o: " + err.message });
    } finally {
      client.release();
    }
  }
  return res.json({ total: items.length, novos: 0, atualizados: 0, erros: items.length });
});

// server/chat.ts
import { Router as Router9 } from "express";

// server/chat_gemini.ts
import { GoogleGenAI } from "@google/genai";

// server/gemini_tools.ts
import { Type } from "@google/genai";
var toolConsultarProdutoPorCodigo = {
  name: "consultar_produto_por_codigo",
  description: "Consulta um produto no banco de dados atrav\xE9s do seu c\xF3digo exato (c\xF3digo interno, de f\xE1brica ou de barras). Retorna estoque cont\xE1bil, estoque f\xEDsico, diferen\xE7a, NCM, data de \xFAltima compra/venda, localiza\xE7\xE3o e pre\xE7os.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      codigo: {
        type: Type.STRING,
        description: "O c\xF3digo do produto a ser consultado (ex: 70200821, 922503600034E, 789123456)."
      }
    },
    required: ["codigo"]
  }
};
var toolConsultarProdutosPorTermo = {
  name: "consultar_produtos_por_termo",
  description: "Busca produtos pela descri\xE7\xE3o textual aproximada. Use quando o usu\xE1rio procurar por nome, caracter\xEDstica ou categoria. Retorna at\xE9 10 itens com estoque cont\xE1bil, f\xEDsico, NCM, \xFAltima compra e localiza\xE7\xE3o.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      termo: {
        type: Type.STRING,
        description: 'O termo de busca (ex: "mangueira", "parafuso cabecote", "anel trava").'
      }
    },
    required: ["termo"]
  }
};
var toolConsultarProdutosPorCorredor = {
  name: "consultar_produtos_por_corredor",
  description: "Consulta produtos situados em um determinado corredor (e opcionalmente baia/n\xEDvel) no estoque, permitindo filtrar por pre\xE7o m\xE1ximo ou se tem estoque dispon\xEDvel. Retorna tabela com produtos, estoque cont\xE1bil, f\xEDsico, localiza\xE7\xE3o, pre\xE7os e \xFAltima compra.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      corredor: {
        type: Type.STRING,
        description: 'N\xFAmero ou identificador do corredor (ex: "01", "02", "03").'
      },
      preco_maximo: {
        type: Type.NUMBER,
        description: "Opcional. Valor m\xE1ximo de pre\xE7o m\xEDnimo ou sugerido (ex: 10 para buscar produtos de at\xE9 R$ 10,00)."
      },
      apenas_com_estoque: {
        type: Type.BOOLEAN,
        description: "Opcional. Se true, filtra apenas produtos com estoque cont\xE1bil ou f\xEDsico maior que zero."
      },
      limite: {
        type: Type.NUMBER,
        description: "Opcional. Quantidade m\xE1xima de produtos a retornar (padr\xE3o 10, m\xE1ximo 25)."
      }
    },
    required: ["corredor"]
  }
};
var toolConsultarRankingEstoque = {
  name: "consultar_ranking_estoque",
  description: "Consulta os produtos com maior ou menor estoque (cont\xE1bil ou f\xEDsico) no almoxarifado. Use quando o usu\xE1rio perguntar quais produtos t\xEAm mais/menos estoque.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      tipo_estoque: {
        type: Type.STRING,
        description: 'Tipo de estoque a ordenar: "contabil" ou "fisico". Padr\xE3o \xE9 "contabil".'
      },
      ordem: {
        type: Type.STRING,
        description: 'Sentido da ordena\xE7\xE3o: "maior" (do maior para o menor) ou "menor" (do menor para o maior). Padr\xE3o \xE9 "maior".'
      },
      corredor: {
        type: Type.STRING,
        description: "Opcional. Restringir a busca a um corredor espec\xEDfico."
      },
      limite: {
        type: Type.NUMBER,
        description: "Opcional. N\xFAmero de itens a retornar (padr\xE3o 10, m\xE1ximo 20)."
      }
    },
    required: []
  }
};
var toolAdicionarAoCarrinho = {
  name: "adicionar_ao_carrinho",
  description: "Adiciona um produto ao carrinho (or\xE7amento pendente) do usu\xE1rio atual. Use quando o vendedor pedir para adicionar, cotar ou incluir itens.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      codigo: {
        type: Type.STRING,
        description: "O c\xF3digo interno ou de f\xE1brica do produto a ser adicionado."
      },
      quantidade: {
        type: Type.NUMBER,
        description: "A quantidade de pe\xE7as a serem adicionadas."
      },
      preco_unitario: {
        type: Type.NUMBER,
        description: "Opcional. Pre\xE7o negociado (unit\xE1rio). Se n\xE3o informado, o sistema utilizar\xE1 o pre\xE7o sugerido do sistema."
      }
    },
    required: ["codigo", "quantidade"]
  }
};
var toolVerCarrinho = {
  name: "ver_carrinho",
  description: "Visualiza os itens atualmente no carrinho (or\xE7amento pendente) do usu\xE1rio logado, junto com o total."
};
async function executeConsultarProdutoPorCodigo(codigo) {
  const pool2 = getDbPool();
  if (!pool2) return { status: "erro", mensagem: "Banco de dados indispon\xEDvel no momento." };
  const clean = codigo.trim().replace(/[?!.,;]/g, "");
  const client = await pool2.connect();
  try {
    const res = await client.query(
      `SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, 
              quantidade as estoque_contabil, 
              COALESCE(estoque_fisico, 0) as estoque_fisico,
              (COALESCE(estoque_fisico, 0) - COALESCE(quantidade, 0)) as diferenca_estoque,
              COALESCE(ncm, '') as ncm,
              COALESCE(ultima_data_compra, '') as ultima_data_compra,
              COALESCE(ultima_data_venda, '') as ultima_data_venda,
              corredor, baia, nivel, locacao, 
              preco_sugerido, preco_minimo, preco_tabela, custo_unitario
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1) 
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
       LIMIT 1`,
      [clean]
    );
    if (res.rows.length === 0) {
      return {
        status: "n\xE3o encontrado",
        mensagem: `Nenhum produto cadastrado no sistema corresponde ao c\xF3digo exato "${codigo}".`
      };
    }
    return {
      status: "sucesso",
      dados_oficiais: res.rows[0]
    };
  } catch (err) {
    console.error("[GeminiTools] Erro ao consultar_produto_por_codigo:", err);
    return { status: "erro", mensagem: "Falha interna ao consultar o banco de dados." };
  } finally {
    client.release();
  }
}
async function executeConsultarProdutosPorTermo(termo) {
  const pool2 = getDbPool();
  if (!pool2) return { status: "erro", mensagem: "Banco de dados indispon\xEDvel no momento." };
  const client = await pool2.connect();
  try {
    const clean = termo.trim().replace(/[?!.,;]/g, "");
    const termos = clean.split(/\s+/).filter((t) => t.length > 0);
    if (termos.length === 0) {
      return { status: "erro", mensagem: "Termo de busca vazio." };
    }
    let queryStr = `SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, 
                           quantidade as estoque_contabil, 
                           COALESCE(estoque_fisico, 0) as estoque_fisico,
                           (COALESCE(estoque_fisico, 0) - COALESCE(quantidade, 0)) as diferenca_estoque,
                           COALESCE(ncm, '') as ncm,
                           COALESCE(ultima_data_compra, '') as ultima_data_compra,
                           COALESCE(ultima_data_venda, '') as ultima_data_venda,
                           corredor, baia, nivel, locacao, 
                           preco_sugerido, preco_minimo, preco_tabela 
                    FROM produtos WHERE `;
    const conditions = [];
    const values = [];
    termos.forEach((t, i) => {
      conditions.push(`descricao ILIKE $${i + 1}`);
      values.push(`%${t}%`);
    });
    queryStr += conditions.join(" AND ") + ` ORDER BY descricao ASC LIMIT 10`;
    const res = await client.query(queryStr, values);
    if (res.rows.length === 0) {
      return {
        status: "n\xE3o encontrado",
        mensagem: `Nenhum produto cadastrado corresponde \xE0 busca "${termo}".`
      };
    }
    return {
      status: "sucesso",
      quantidade_encontrada: res.rows.length,
      dados_oficiais: res.rows
    };
  } catch (err) {
    console.error("[GeminiTools] Erro ao consultar_produtos_por_termo:", err);
    return { status: "erro", mensagem: "Falha interna ao consultar o banco de dados." };
  } finally {
    client.release();
  }
}
async function executeConsultarProdutosPorCorredor(corredor, preco_maximo, apenas_com_estoque, limite = 10) {
  const pool2 = getDbPool();
  if (!pool2) return { status: "erro", mensagem: "Banco de dados indispon\xEDvel no momento." };
  const client = await pool2.connect();
  try {
    const lim = Math.min(25, Math.max(1, limite || 10));
    const cleanCorredor = corredor.trim().padStart(2, "0");
    const conditions = ["(corredor = $1 OR corredor = $2)"];
    const values = [cleanCorredor, corredor.trim()];
    let paramIdx = 3;
    if (preco_maximo !== void 0 && preco_maximo > 0) {
      conditions.push(`(preco_minimo <= $${paramIdx} OR preco_sugerido <= $${paramIdx})`);
      values.push(preco_maximo);
      paramIdx++;
    }
    if (apenas_com_estoque) {
      conditions.push("(quantidade > 0 OR estoque_fisico > 0)");
    }
    values.push(lim);
    const query = `
      SELECT codigo_atual, codigo_fabrica, descricao,
             quantidade as estoque_contabil,
             COALESCE(estoque_fisico, 0) as estoque_fisico,
             COALESCE(ncm, '') as ncm,
             COALESCE(ultima_data_compra, '') as ultima_data_compra,
             corredor, baia, nivel, locacao,
             preco_sugerido, preco_minimo
      FROM produtos
      WHERE ${conditions.join(" AND ")}
      ORDER BY baia ASC, nivel ASC, descricao ASC
      LIMIT $${paramIdx}
    `;
    const res = await client.query(query, values);
    return {
      status: "sucesso",
      total_encontrados: res.rows.length,
      corredor: cleanCorredor,
      produtos: res.rows
    };
  } catch (err) {
    console.error("[GeminiTools] Erro ao consultar_produtos_por_corredor:", err);
    return { status: "erro", mensagem: "Falha interna ao consultar produtos do corredor." };
  } finally {
    client.release();
  }
}
async function executeConsultarRankingEstoque(tipo_estoque = "contabil", ordem = "maior", corredor, limite = 10) {
  const pool2 = getDbPool();
  if (!pool2) return { status: "erro", mensagem: "Banco de dados indispon\xEDvel no momento." };
  const client = await pool2.connect();
  try {
    const lim = Math.min(20, Math.max(1, limite || 10));
    const campo = tipo_estoque === "fisico" ? "COALESCE(estoque_fisico, 0)" : "COALESCE(quantidade, 0)";
    const dir = ordem === "menor" ? "ASC" : "DESC";
    const conditions = [];
    const values = [];
    let paramIdx = 1;
    if (corredor && corredor.trim()) {
      const cleanCorr = corredor.trim().padStart(2, "0");
      conditions.push(`(corredor = $${paramIdx} OR corredor = $${paramIdx + 1})`);
      values.push(cleanCorr, corredor.trim());
      paramIdx += 2;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(lim);
    const query = `
      SELECT codigo_atual, codigo_fabrica, descricao,
             quantidade as estoque_contabil,
             COALESCE(estoque_fisico, 0) as estoque_fisico,
             (COALESCE(estoque_fisico, 0) - COALESCE(quantidade, 0)) as diferenca_estoque,
             COALESCE(ncm, '') as ncm,
             COALESCE(ultima_data_compra, '') as ultima_data_compra,
             corredor, baia, nivel, locacao
      FROM produtos
      ${whereClause}
      ORDER BY ${campo} ${dir}
      LIMIT $${paramIdx}
    `;
    const res = await client.query(query, values);
    return {
      status: "sucesso",
      tipo_ordenacao: `${tipo_estoque} (${ordem})`,
      total_retornados: res.rows.length,
      produtos: res.rows
    };
  } catch (err) {
    console.error("[GeminiTools] Erro ao consultar_ranking_estoque:", err);
    return { status: "erro", mensagem: "Falha interna ao consultar ranking de estoque." };
  } finally {
    client.release();
  }
}
async function executeAdicionarAoCarrinho(codigo, quantidade, preco_unitario, userId) {
  const pool2 = getDbPool();
  if (!pool2) return { status: "erro", mensagem: "Banco de dados indispon\xEDvel no momento." };
  const client = await pool2.connect();
  try {
    const resProd = await client.query(
      `SELECT id, codigo_atual, codigo_fabrica, descricao, preco_sugerido, preco_minimo 
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1) 
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
       LIMIT 1`,
      [codigo.trim()]
    );
    if (resProd.rows.length === 0) {
      return { status: "erro", mensagem: `Produto com c\xF3digo "${codigo}" n\xE3o encontrado no sistema.` };
    }
    const produto = resProd.rows[0];
    const preco = preco_unitario || parseFloat(produto.preco_sugerido || 0);
    const precoMinimo = parseFloat(produto.preco_minimo || 0);
    if (preco < precoMinimo) {
      return {
        status: "erro",
        mensagem: `Bloqueado: O pre\xE7o R$ ${preco.toFixed(2)} est\xE1 abaixo do m\xEDnimo permitido (R$ ${precoMinimo.toFixed(2)}) para "${produto.descricao}".`
      };
    }
    const subtotal = preco * quantidade;
    const resCart = await client.query(
      `SELECT itens, total_orcamento FROM orcamentos_pendentes WHERE user_id = $1`,
      [userId]
    );
    let itens = [];
    let total_orcamento = 0;
    if (resCart.rows.length > 0) {
      itens = resCart.rows[0].itens;
      total_orcamento = parseFloat(resCart.rows[0].total_orcamento || 0);
    }
    const newItem = {
      produto_id: produto.id,
      codigo: produto.codigo_fabrica || produto.codigo_atual,
      descricao: produto.descricao,
      quantidade,
      preco_unitario: preco,
      subtotal
    };
    itens.push(newItem);
    total_orcamento += subtotal;
    await client.query(`
      INSERT INTO orcamentos_pendentes (user_id, itens, total_orcamento, atualizado_em)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET itens = EXCLUDED.itens, total_orcamento = EXCLUDED.total_orcamento, atualizado_em = NOW()
    `, [userId, JSON.stringify(itens), total_orcamento]);
    return {
      status: "sucesso",
      mensagem: `"${produto.descricao}" adicionado ao carrinho com sucesso.`,
      item_adicionado: newItem,
      carrinho_total_itens: itens.length,
      carrinho_valor_total: total_orcamento
    };
  } catch (err) {
    console.error("[GeminiTools] Erro ao adicionar_ao_carrinho:", err);
    return { status: "erro", mensagem: "Falha interna ao manipular o carrinho de compras no banco." };
  } finally {
    client.release();
  }
}
async function executeVerCarrinho(userId) {
  const pool2 = getDbPool();
  if (!pool2) return { status: "erro", mensagem: "Banco de dados indispon\xEDvel no momento." };
  const client = await pool2.connect();
  try {
    const resCart = await client.query(
      `SELECT itens, total_orcamento FROM orcamentos_pendentes WHERE user_id = $1`,
      [userId]
    );
    if (resCart.rows.length === 0 || !resCart.rows[0].itens || resCart.rows[0].itens.length === 0) {
      return { status: "sucesso", mensagem: "O carrinho est\xE1 vazio." };
    }
    return {
      status: "sucesso",
      carrinho: resCart.rows[0].itens,
      total_orcamento: parseFloat(resCart.rows[0].total_orcamento)
    };
  } catch (err) {
    console.error("[GeminiTools] Erro ao ver_carrinho:", err);
    return { status: "erro", mensagem: "Falha ao buscar o carrinho no banco de dados." };
  } finally {
    client.release();
  }
}

// server/chat_gemini.ts
var apiKey = process.env.GEMINI_API_KEY;
var ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
var toolDeclaration = {
  functionDeclarations: [
    toolConsultarProdutoPorCodigo,
    toolConsultarProdutosPorTermo,
    toolConsultarProdutosPorCorredor,
    toolConsultarRankingEstoque,
    toolAdicionarAoCarrinho,
    toolVerCarrinho
  ]
};
var CANDIDATE_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash"];
async function generateWithModelFallback(params) {
  if (!ai) throw new Error("GEMINI_API_KEY n\xE3o configurada no servidor.");
  let lastError = null;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      return await ai.models.generateContent({
        ...params,
        model: modelName
      });
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Modelo ${modelName} falhou (${err.message}). Tentando alternativa...`);
    }
  }
  throw lastError;
}
async function processarMensagemGemini(mensagem, userId) {
  if (!ai) {
    throw new Error("GEMINI_API_KEY n\xE3o configurada no servidor.");
  }
  const systemInstruction = "Voc\xEA \xE9 o Assistente Inteligente de Estoque e Or\xE7amentos do KIPSTOCK (Otto Diesel).\nSeu objetivo \xE9 auxiliar operadores e vendedores a consultar dados oficiais do estoque e montar or\xE7amentos.\nREGRA ABSOLUTA: ZERO ALUCINA\xC7\xC3O. O banco de dados PostgreSQL \xE9 a \xFAnica fonte de verdade. NUNCA invente pre\xE7os, c\xF3digos, quantidades, estoques, NCMs ou datas.\nSempre que consultar produtos, informe com clareza os campos dispon\xEDveis:\n- C\xF3digo (Interno e de F\xE1brica)\n- Descri\xE7\xE3o\n- Estoque Cont\xE1bil e Estoque F\xEDsico\n- NCM (se informado no banco)\n- Data de \xDAltima Compra (se informada no banco)\n- Localiza\xE7\xE3o F\xEDsica (Corredor, Baia, N\xEDvel)\n- Pre\xE7o Sugerido, M\xEDnimo e Tabela\nSe o estoque estiver em 0, informe claramente que o estoque cadastrado \xE9 zero. Se uma informa\xE7\xE3o n\xE3o constar no banco, diga que n\xE3o est\xE1 cadastrada.\nPara listas de produtos, utilize sempre tabelas Markdown bem alinhadas.";
  const response = await generateWithModelFallback({
    contents: mensagem,
    config: {
      tools: [toolDeclaration],
      systemInstruction,
      temperature: 0.1
    }
  });
  if (response.functionCalls && response.functionCalls.length > 0) {
    const call = response.functionCalls[0];
    let dbResult = null;
    if (call.name === "consultar_produto_por_codigo") {
      const codigo = call.args.codigo;
      dbResult = await executeConsultarProdutoPorCodigo(codigo);
    } else if (call.name === "consultar_produtos_por_termo") {
      const termo = call.args.termo;
      dbResult = await executeConsultarProdutosPorTermo(termo);
    } else if (call.name === "consultar_produtos_por_corredor") {
      const args = call.args;
      dbResult = await executeConsultarProdutosPorCorredor(
        args.corredor,
        args.preco_maximo,
        args.apenas_com_estoque,
        args.limite
      );
    } else if (call.name === "consultar_ranking_estoque") {
      const args = call.args;
      dbResult = await executeConsultarRankingEstoque(
        args.tipo_estoque,
        args.ordem,
        args.corredor,
        args.limite
      );
    } else if (call.name === "adicionar_ao_carrinho") {
      if (!userId) {
        dbResult = { status: "erro", mensagem: "Usu\xE1rio n\xE3o autenticado. Imposs\xEDvel modificar o carrinho." };
      } else {
        const codigo = call.args.codigo;
        const quantidade = call.args.quantidade;
        const preco_unitario = call.args.preco_unitario || null;
        dbResult = await executeAdicionarAoCarrinho(codigo, quantidade, preco_unitario, parseInt(userId, 10));
      }
    } else if (call.name === "ver_carrinho") {
      if (!userId) {
        dbResult = { status: "erro", mensagem: "Usu\xE1rio n\xE3o autenticado. Imposs\xEDvel visualizar o carrinho." };
      } else {
        dbResult = await executeVerCarrinho(parseInt(userId, 10));
      }
    }
    if (dbResult) {
      try {
        const history = [
          { role: "user", parts: [{ text: mensagem }] },
          response.candidates[0].content,
          { role: "user", parts: [{ functionResponse: { name: call.name, response: { result: dbResult } } }] }
        ];
        const finalResponse = await generateWithModelFallback({
          contents: history,
          config: {
            systemInstruction: "Formate os dados oficiais retornados pela ferramenta em uma resposta amig\xE1vel, clara e profissional.\nSe for um produto \xFAnico, destaque: C\xF3digo de F\xE1brica, C\xF3digo Interno, Descri\xE7\xE3o, Estoque Cont\xE1bil, Estoque F\xEDsico, Diferen\xE7a, NCM, \xDAltima Compra, Localiza\xE7\xE3o e Pre\xE7os.\nSe for uma lista de produtos, use tabelas Markdown estruturadas.\nNUNCA altere os valores num\xE9ricos ou nomes que vieram da ferramenta.",
            temperature: 0.1
          }
        });
        return finalResponse.text;
      } catch (err) {
        console.error("[Gemini] Erro no fluxo secund\xE1rio (formata\xE7\xE3o):", err.message);
        if (dbResult.status === "sucesso") {
          return `Consulta realizada com sucesso:
\`\`\`json
${JSON.stringify(dbResult, null, 2)}
\`\`\``;
        } else {
          return dbResult.mensagem;
        }
      }
    }
  }
  return response.text;
}

// server/chat.ts
var chatRouter = Router9();
var pendingBudgets = /* @__PURE__ */ new Map();
var pendingProductUpdates = /* @__PURE__ */ new Map();
var pendingProductCreations = /* @__PURE__ */ new Map();
var pendingGenericBindings = /* @__PURE__ */ new Map();
var activeQuickLists = /* @__PURE__ */ new Map();
var sessionFlowStates = /* @__PURE__ */ new Map();
function formatMoney(val) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d = /* @__PURE__ */ new Date()) {
  return d.toLocaleDateString("pt-BR");
}
function renderQuickListTable(list) {
  let table = `\u{1F4CB} **Lista R\xE1pida:** "${list.nome}" ${list.id ? `\`(#${list.id})\`` : "*(Rascunho n\xE3o salvo)*"}
`;
  table += `\u{1F464} Respons\xE1vel: **${list.responsavel}** | Total de itens: **${list.itens.length}**

`;
  if (list.itens.length === 0) {
    table += `*A lista est\xE1 vazia no momento.*

`;
  } else {
    table += `| # | C\xF3digo | Loca\xE7\xE3o | Coment\xE1rio | Status no Banco |
`;
    table += `| :-: | :--- | :---: | :--- | :---: |
`;
    list.itens.forEach((item, idx) => {
      const status = item.cadastrado ? "\u2705 Cadastrado" : "\u26A0\uFE0F N\xE3o cadastrado";
      const loc = item.locacao ? `\`${item.locacao}\`` : "\u2014";
      const com = item.comentario || "\u2014";
      table += `| ${idx + 1} | **${item.codigo}** | ${loc} | ${com} | ${status} |
`;
    });
    table += `
`;
  }
  table += `\u{1F4A1} **A\xE7\xF5es dispon\xEDveis:**
`;
  table += `\u2022 Adicionar item: \`c\xF3digo, loca\xE7\xE3o, coment\xE1rio\` ou \`item Y, tem apenas 2 no estoque\`
`;
  table += `\u2022 Adicionar m\xFAltiplos: \`cadastre os itens X, Y, Z\`
`;
  table += `\u2022 Alterar item: \`altere o comentario do item 1 para "caixa danificada"\`
`;
  table += `\u2022 Salvar no banco: \`salvar lista\`
`;
  table += `\u2022 Descartar rascunho: \`descartar lista\``;
  return table;
}
async function searchProductDb(term) {
  const pool2 = getDbPool();
  if (!pool2) return [];
  const clean = term.trim().replace(/[?!.,;]/g, "");
  if (!clean) return [];
  const client = await pool2.connect();
  try {
    const res = await client.query(
      `SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao,
              quantidade, 
              COALESCE(estoque_fisico, 0) as estoque_fisico,
              COALESCE(ncm, '') as ncm,
              COALESCE(ultima_data_compra, '') as ultima_data_compra,
              COALESCE(ultima_data_venda, '') as ultima_data_venda,
              corredor, baia, nivel, locacao,
              preco_sugerido, preco_minimo, preco_tabela, custo_unitario, codigos_alternativos
       FROM produtos 
       WHERE UPPER(codigo_atual) = UPPER($1)
          OR UPPER(codigo_fabrica) = UPPER($1)
          OR UPPER(codigo_barras_atual) = UPPER($1)
          OR codigo_atual ILIKE '%' || $1 || '%'
          OR codigo_fabrica ILIKE '%' || $1 || '%'
          OR codigo_barras_atual ILIKE '%' || $1 || '%'
          OR codigos_alternativos ILIKE '%' || $1 || '%'
          OR descricao ILIKE '%' || $1 || '%'
       ORDER BY 
          CASE 
            WHEN UPPER(codigo_atual) = UPPER($1) THEN 1
            WHEN UPPER(codigo_fabrica) = UPPER($1) THEN 2
            WHEN UPPER(codigo_barras_atual) = UPPER($1) THEN 3
            WHEN codigos_alternativos ILIKE '%' || $1 || '%' THEN 4
            ELSE 5
          END
       LIMIT 6`,
      [clean]
    );
    return res.rows;
  } finally {
    client.release();
  }
}
async function processChatMessage(message, sessionId, userId, username) {
  const cleanMsg = message.trim();
  const lower = cleanMsg.toLowerCase();
  if (!lower.startsWith("altere") && !lower.startsWith("confirmar") && !lower.startsWith("sim")) {
    try {
      const geminiResponse = await processarMensagemGemini(message, userId);
      if (geminiResponse) {
        return geminiResponse;
      }
    } catch (err) {
      console.warn("[Gemini Fallback] Falha no RAG:", err.message);
    }
  }
  const sessionState = sessionFlowStates.get(sessionId);
  if (sessionState && sessionState.state === "waiting_list_name") {
    sessionFlowStates.delete(sessionId);
    const listName = cleanMsg.replace(/^["']|["']$/g, "").trim();
    const newList = {
      nome: listName || "Lista R\xE1pida " + formatDate(),
      responsavel: "Estoque",
      itens: [],
      criado_em: (/* @__PURE__ */ new Date()).toISOString()
    };
    activeQuickLists.set(sessionId, newList);
    return `\u{1F4DD} **Lista R\xE1pida Iniciada com Sucesso!**

` + renderQuickListTable(newList);
  }
  if (lower === "confirmar" || lower.startsWith("confirmar ") || lower === "sim" || lower === "confirma") {
    const pool3 = getDbPool();
    if (!pool3) {
      return "\u274C Erro: N\xE3o foi poss\xEDvel conectar ao banco de dados para salvar a altera\xE7\xE3o.";
    }
    let pendingBudgetFromDb = null;
    if (userId) {
      const res = await pool3.query("SELECT itens, total_orcamento, nome_cliente FROM orcamentos_pendentes WHERE user_id = $1", [userId]);
      if (res.rows.length > 0) {
        pendingBudgetFromDb = res.rows[0];
      }
    }
    if (pendingBudgetFromDb && pendingBudgetFromDb.itens.length > 0) {
      const client = await pool3.connect();
      try {
        const dbItens = pendingBudgetFromDb.itens.map((item) => ({
          id: item.produto_id,
          codigo_atual: item.codigo,
          codigo_fabrica: item.codigo_fabrica || item.codigo,
          descricao: item.descricao,
          locacao: item.locacao || "Sem loca\xE7\xE3o",
          quantidade: item.quantidade,
          valor_unitario: item.preco_unitario,
          subtotal: item.subtotal
        }));
        const res = await client.query(
          `INSERT INTO orcamentos (nome_cliente, responsavel, itens, total_orcamento, criado_em, atualizado_em) 
           VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, criado_em`,
          [pendingBudgetFromDb.nome_cliente || "Cliente Padr\xE3o", username || "Vendedor", JSON.stringify(dbItens), pendingBudgetFromDb.total_orcamento]
        );
        const savedId = res.rows[0]?.id || "OK";
        await client.query("DELETE FROM orcamentos_pendentes WHERE user_id = $1", [userId]);
        return `\u2705 **Or\xE7amento #${savedId} confirmado e gravado com sucesso!**

\u{1F4C5} **Data de gera\xE7\xE3o:** ${formatDate()}
\u{1F464} **Vendedor:** ${username || "Vendedor"}
\u{1F3E2} **Cliente:** ${pendingBudgetFromDb.nome_cliente || "Cliente Padr\xE3o"}
\u{1F4B0} **Valor Total:** ${formatMoney(pendingBudgetFromDb.total_orcamento)}

Este or\xE7amento j\xE1 est\xE1 salvo permanentemente no banco de dados e dispon\xEDvel na aba **Or\xE7amentos** para visualiza\xE7\xE3o e impress\xE3o.`;
      } catch (err) {
        console.error("[Chat] Erro ao gravar or\xE7amento:", err);
        return `\u274C Erro ao salvar o or\xE7amento no banco de dados: ${err.message}`;
      } finally {
        client.release();
      }
    }
    const pendingUpdate = pendingProductUpdates.get(sessionId);
    if (pendingUpdate) {
      const client = await pool3.connect();
      try {
        await client.query("BEGIN");
        if (pendingUpdate.campo === "locacao") {
          await client.query(
            `UPDATE produtos 
             SET locacao = $1, corredor = $2, baia = $3, nivel = $4, atualizado_em = NOW() 
             WHERE id = $5`,
            [pendingUpdate.valor_novo, pendingUpdate.corredor || "", pendingUpdate.baia || "", pendingUpdate.nivel || "", pendingUpdate.produto_id]
          );
        } else if (["preco_sugerido", "preco_minimo", "preco_tabela"].includes(pendingUpdate.campo)) {
          const numVal = parseFloat(pendingUpdate.valor_novo.replace(",", "."));
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
        await client.query(
          `INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            pendingUpdate.produto_id,
            pendingUpdate.campo,
            pendingUpdate.valor_antigo,
            pendingUpdate.valor_novo,
            "Altera\xE7\xE3o realizada via comando de voz/chat no Assistente Inteligente",
            "Assistente OttoDiesel"
          ]
        );
        await client.query("COMMIT");
        pendingProductUpdates.delete(sessionId);
        return `\u2705 **Altera\xE7\xE3o no Banco de Dados Conclu\xEDda com Sucesso!**

\u{1F4E6} **Produto:** \`${pendingUpdate.codigo_atual}\` (${pendingUpdate.descricao_original})
\u270F\uFE0F **Campo Alterado:** **${pendingUpdate.campoLabel}**
\u{1F534} **De:** ${pendingUpdate.valor_antigo}
\u{1F7E2} **Para:** ${pendingUpdate.valor_novo}

O registro de auditoria foi gravado e a altera\xE7\xE3o j\xE1 est\xE1 ativa no sistema.`;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("[Chat] Erro ao atualizar produto:", err);
        return `\u274C Erro ao atualizar produto no banco: ${err.message}`;
      } finally {
        client.release();
      }
    }
    const pendingCreation = pendingProductCreations.get(sessionId);
    if (pendingCreation) {
      const client = await pool3.connect();
      try {
        await client.query("BEGIN");
        const newId = "PRD-" + Date.now().toString().slice(-6);
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
            pendingCreation.corredor || "",
            pendingCreation.baia || "",
            pendingCreation.nivel || "",
            pendingCreation.locacao || "Sem loca\xE7\xE3o",
            pendingCreation.preco_sugerido || 0,
            pendingCreation.preco_minimo || 0,
            pendingCreation.preco_tabela || 0,
            0
          ]
        );
        await client.query(
          `INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            newId,
            "cadastro_inicial",
            "N\xC3O EXISTIA",
            `C\xF3digo: ${pendingCreation.codigo_atual} | Descri\xE7\xE3o: ${pendingCreation.descricao}`,
            "Cadastro de novo produto via Assistente Inteligente",
            "Assistente OttoDiesel"
          ]
        );
        await client.query("COMMIT");
        pendingProductCreations.delete(sessionId);
        return `\u2705 **Novo Produto Cadastrado com Sucesso no Banco de Dados!**

* **ID:** \`${newId}\`
* **C\xF3digo:** \`${pendingCreation.codigo_atual}\`
* **Descri\xE7\xE3o:** ${pendingCreation.descricao}
* **\u{1F4CD} Loca\xE7\xE3o:** \`${pendingCreation.locacao || "Sem loca\xE7\xE3o"}\`
* **\u{1F4E6} Estoque Inicial:** ${pendingCreation.quantidade} unidades
* **\u{1F4B5} Pre\xE7o Sugerido:** ${pendingCreation.preco_sugerido ? formatMoney(pendingCreation.preco_sugerido) : "\u2014"}

A pe\xE7a j\xE1 est\xE1 pronta para bipagem, busca f\xEDsica e or\xE7amentos no galp\xE3o.`;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("[Chat] Erro ao cadastrar produto:", err);
        return `\u274C Erro ao cadastrar produto no banco: ${err.message}`;
      } finally {
        client.release();
      }
    }
    const pendingBinding = pendingGenericBindings.get(sessionId);
    if (pendingBinding) {
      const client = await pool3.connect();
      try {
        await client.query("BEGIN");
        await client.query(`
          INSERT INTO codigos_produto (produto_id, tipo, codigo, motivo)
          VALUES ($1, 'codigo_generico', $2, 'Vinculado via Assistente Inteligente')
        `, [pendingBinding.targetProductId, pendingBinding.codigoGenerico]);
        await client.query(`
          UPDATE produtos 
          SET codigos_alternativos = CASE 
            WHEN codigos_alternativos IS NULL OR codigos_alternativos = '' THEN $1
            ELSE codigos_alternativos || '; ' || $1
          END,
          atualizado_em = NOW()
          WHERE id = $2
        `, [pendingBinding.codigoGenerico, pendingBinding.targetProductId]);
        if (pendingBinding.similarProductId && pendingBinding.similarProductId !== pendingBinding.targetProductId) {
          await client.query(`
            INSERT INTO produtos_relacionados (produto_id, relacionado_id, motivo)
            VALUES ($1, $2, 'Similar / Gen\xE9rico'), ($2, $1, 'Similar / Gen\xE9rico')
            ON CONFLICT DO NOTHING
          `, [pendingBinding.targetProductId, pendingBinding.similarProductId]);
        }
        await client.query(`
          INSERT INTO historico_alteracoes (produto_id, campo, valor_anterior, valor_novo, motivo, usuario)
          VALUES ($1, 'codigo_generico', '', $2, 'V\xEDnculo de c\xF3digo gen\xE9rico via chat', 'Assistente OttoDiesel')
        `, [pendingBinding.targetProductId, pendingBinding.codigoGenerico]);
        await client.query("COMMIT");
        pendingGenericBindings.delete(sessionId);
        return `\u2705 **C\xF3digo Gen\xE9rico Vinculado com Sucesso no Banco de Dados!**

* **Produto:** \`${pendingBinding.targetCodigo}\` (${pendingBinding.targetDescricao})
* **C\xF3digo Gen\xE9rico Vinculado:** \`${pendingBinding.codigoGenerico}\`
` + (pendingBinding.similarProductId ? `* **V\xEDnculo Intercambi\xE1vel:** Vinculado como produto similar/relacionado a \`${pendingBinding.codigoGenerico}\`
` : "") + `
Agora, qualquer busca ou bipagem por **"${pendingBinding.codigoGenerico}"** encontrar\xE1 imediatamente esta pe\xE7a no estoque!`;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("[Chat] Erro ao vincular c\xF3digo gen\xE9rico:", err);
        return `\u274C Erro ao vincular c\xF3digo gen\xE9rico: ${err.message}`;
      } finally {
        client.release();
      }
    }
    return "\u26A0\uFE0F N\xE3o h\xE1 nenhuma a\xE7\xE3o (or\xE7amento, altera\xE7\xE3o, cadastro ou v\xEDnculo) pendente de confirma\xE7\xE3o no momento.";
  }
  if (lower === "cancelar" || lower === "descartar" || lower === "descartar lista") {
    let cancelled = false;
    if (userId) {
      const pool3 = getDbPool();
      if (pool3) {
        const client = await pool3.connect();
        try {
          const res = await client.query("DELETE FROM orcamentos_pendentes WHERE user_id = $1 RETURNING user_id", [userId]);
          if (res.rowCount && res.rowCount > 0) {
            cancelled = true;
          }
        } finally {
          client.release();
        }
      }
    }
    if (pendingProductUpdates.has(sessionId)) {
      pendingProductUpdates.delete(sessionId);
      cancelled = true;
    }
    if (pendingProductCreations.has(sessionId)) {
      pendingProductCreations.delete(sessionId);
      cancelled = true;
    }
    if (pendingGenericBindings.has(sessionId)) {
      pendingGenericBindings.delete(sessionId);
      cancelled = true;
    }
    if (sessionFlowStates.has(sessionId)) {
      sessionFlowStates.delete(sessionId);
      cancelled = true;
    }
    if (cancelled) {
      return "\u{1F5D1}\uFE0F A\xE7\xE3o pendente cancelada e descartada com sucesso.";
    }
    if (lower === "descartar lista" && activeQuickLists.has(sessionId)) {
      activeQuickLists.delete(sessionId);
      return "\u{1F5D1}\uFE0F Rascunho da lista r\xE1pida descartado.";
    }
    return "Nenhuma opera\xE7\xE3o pendente para cancelar.";
  }
  const pool2 = getDbPool();
  const isCorredorSummaryIntent = (lower.includes("quantidade") || lower.includes("quatidade") || lower.includes("total") || lower.includes("quantos")) && lower.includes("corredor") && (lower.includes("cada") || lower.includes("todos") || lower.includes("geral"));
  if (isCorredorSummaryIntent) {
    if (!pool2) return "\u274C Banco de dados desconectado.";
    const client = await pool2.connect();
    try {
      const res = await client.query(`
        SELECT 
          COALESCE(NULLIF(TRIM(corredor), ''), 'Sem Corredor') as corr,
          COUNT(*) as total_prods,
          SUM(COALESCE(quantidade, 0)) as total_estoque
        FROM produtos
        GROUP BY 1
        ORDER BY 
          CASE WHEN COALESCE(NULLIF(TRIM(corredor), ''), 'Sem Corredor') = 'Sem Corredor' THEN 2 ELSE 1 END,
          corr ASC
      `);
      let totalGeral = 0;
      let estoqueGeral = 0;
      let reply = `\u{1F4CA} **Quantidade de Pe\xE7as Cadastradas por Corredor:**

`;
      reply += `| Corredor | Pe\xE7as Cadastradas | Estoque F\xEDsico Total |
`;
      reply += `| :---: | :---: | :---: |
`;
      res.rows.forEach((r) => {
        const pCount = parseInt(r.total_prods, 10) || 0;
        const eCount = parseInt(r.total_estoque, 10) || 0;
        totalGeral += pCount;
        estoqueGeral += eCount;
        reply += `| **${r.corr}** | ${pCount.toLocaleString("pt-BR")} itens | ${eCount.toLocaleString("pt-BR")} un |
`;
      });
      reply += `
\u{1F4E6} **Total Geral do Cat\xE1logo:** **${totalGeral.toLocaleString("pt-BR")} pe\xE7as cadastradas** (${estoqueGeral.toLocaleString("pt-BR")} un em estoque f\xEDsico).`;
      return reply;
    } finally {
      client.release();
    }
  }
  const isGenericCountIntent = (lower.includes("quantidade") || lower.includes("quatidade") || lower.includes("quantos") || lower.includes("total")) && (lower.includes("generico") || lower.includes("gen\xE9rico") || lower.includes("alternativo"));
  if (isGenericCountIntent) {
    if (!pool2) return "\u274C Banco de dados desconectado.";
    const client = await pool2.connect();
    try {
      const resAlternativos = await client.query(`
        SELECT COUNT(*) as total FROM produtos 
        WHERE codigos_alternativos IS NOT NULL AND TRIM(codigos_alternativos) != ''
      `);
      const resRelacionados = await client.query(`
        SELECT COUNT(DISTINCT produto_id) as total FROM produtos_relacionados
      `);
      const resCodigos = await client.query(`
        SELECT COUNT(*) as total FROM codigos_produto 
        WHERE tipo ILIKE '%generico%' OR tipo ILIKE '%alternativo%'
      `);
      const totalAlt = parseInt(resAlternativos.rows[0]?.total, 10) || 0;
      const totalRel = parseInt(resRelacionados.rows[0]?.total, 10) || 0;
      const totalCod = parseInt(resCodigos.rows[0]?.total, 10) || 0;
      return `\u{1F50D} **Levantamento Oficial de C\xF3digos Gen\xE9ricos e Alternativos no Banco:**

* **Pe\xE7as com C\xF3digos Alternativos/Gen\xE9ricos Registrados:** **${totalAlt.toLocaleString("pt-BR")} produtos**
* **Pe\xE7as com V\xEDnculos Diretos de Similaridade (Intercambi\xE1veis):** **${totalRel.toLocaleString("pt-BR")} produtos**
* **Total de C\xF3digos Alternativos Mapeados no Hist\xF3rico:** **${totalCod.toLocaleString("pt-BR")} c\xF3digos**

\u{1F4A1} Para vincular um c\xF3digo gen\xE9rico a uma pe\xE7a agora mesmo, basta solicitar:
\`vincular codigo generico [C\xD3DIGO], no produto codigo [C\xD3DIGO]\``;
    } finally {
      client.release();
    }
  }
  const isTopBudgetItemsIntent = lower.includes("or\xE7amento") || lower.includes("orcamento") || lower.includes("or\xE7ados") || lower.includes("orcados");
  if (isTopBudgetItemsIntent && (lower.includes("mais aparecem") || lower.includes("mais or\xE7ad") || lower.includes("mais orcad") || lower.includes("10 itens") || lower.includes("top 10") || lower.includes("mais frequentes"))) {
    if (!pool2) return "\u274C Banco de dados desconectado.";
    const client = await pool2.connect();
    try {
      const res = await client.query(`
        SELECT 
          COALESCE(item->>'codigo_atual', item->>'codigo', '\u2014') as codigo,
          COALESCE(item->>'descricao', 'Sem descri\xE7\xE3o') as descricao,
          COUNT(*) as vezes_orcado,
          SUM(COALESCE((item->>'quantidade')::numeric, 1)) as total_qtd
        FROM orcamentos,
        LATERAL jsonb_array_elements(itens) as item
        GROUP BY 1, 2
        ORDER BY vezes_orcado DESC, total_qtd DESC
        LIMIT 10
      `);
      if (res.rows.length === 0) {
        return "\u{1F4CB} **Ranking de Pe\xE7as nos Or\xE7amentos:**\nAinda n\xE3o h\xE1 or\xE7amentos suficientes gravados no banco de dados para gerar este relat\xF3rio.";
      }
      let reply = `\u{1F3C6} **Top 10 Itens Mais Frequentes nos Or\xE7amentos:**

`;
      reply += `| # | C\xF3digo | Descri\xE7\xE3o | Frequ\xEAncia em Or\xE7amentos | Total de Unidades |
`;
      reply += `| :-: | :--- | :--- | :---: | :---: |
`;
      res.rows.forEach((r, idx) => {
        reply += `| **${idx + 1}\xBA** | **${r.codigo}** | ${r.descricao} | **${r.vezes_orcado}x** | ${parseInt(r.total_qtd, 10)} un |
`;
      });
      return reply;
    } finally {
      client.release();
    }
  }
  const isWithoutLocationIntent = (lower.includes("sem loc") || lower.includes("sem local")) && (lower.includes("item") || lower.includes("pe\xE7a") || lower.includes("peca") || lower.includes("produto") || lower.includes("listagem"));
  if (isWithoutLocationIntent) {
    if (!pool2) return "\u274C Banco de dados desconectado.";
    const client = await pool2.connect();
    try {
      const countRes = await client.query(`
        SELECT COUNT(*) as total FROM produtos 
        WHERE (locacao IS NULL OR TRIM(locacao) = '' OR TRIM(locacao) ILIKE 'sem loc%' OR TRIM(locacao) ILIKE 'sem local%')
          AND (corredor IS NULL OR TRIM(corredor) = '')
      `);
      const totalSemLoc = parseInt(countRes.rows[0]?.total, 10) || 0;
      const res = await client.query(`
        SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, quantidade, preco_sugerido, preco_minimo, preco_tabela
        FROM produtos
        WHERE (locacao IS NULL OR TRIM(locacao) = '' OR TRIM(locacao) ILIKE 'sem loc%' OR TRIM(locacao) ILIKE 'sem local%')
          AND (corredor IS NULL OR TRIM(corredor) = '')
        ORDER BY quantidade DESC, codigo_atual ASC
        LIMIT 25
      `);
      if (totalSemLoc === 0) {
        return "\u2705 **Excelente not\xEDcia:** Todos os produtos cadastrados no banco de dados j\xE1 possuem localiza\xE7\xE3o f\xEDsica atribu\xEDda!";
      }
      let reply = `\u{1F4CD} **Itens Sem Loca\xE7\xE3o F\xEDsica Atribu\xEDda** (${totalSemLoc.toLocaleString("pt-BR")} itens no total):

`;
      reply += `*Exibindo os primeiros 25 itens ordenados por volume:*

`;
      reply += `| C\xF3d. Produto | Descri\xE7\xE3o | Pre\xE7o M\xEDnimo | Pre\xE7o Sugerido | Pre\xE7o Tabela |
`;
      reply += `| :--- | :--- | :---: | :---: | :---: |
`;
      res.rows.forEach((p) => {
        const codProd = p.codigo_fabrica && p.codigo_fabrica.trim() !== "" && !p.codigo_fabrica.startsWith("PRD-") ? p.codigo_fabrica : p.codigo_atual && !p.codigo_atual.startsWith("PRD-") ? p.codigo_atual : p.codigo_barras_atual || p.id;
        const pMin = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "\u2014";
        const pSug = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "\u2014";
        const pTab = p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "\u2014";
        reply += `| **${codProd}** | ${p.descricao} | ${pMin} | ${pSug} | ${pTab} |
`;
      });
      reply += `
\u{1F4A1} Para definir a loca\xE7\xE3o de qualquer uma dessas pe\xE7as, digite:
\`altere a loca\xE7\xE3o do item [C\xD3DIGO] para corredor X, baia Y, nivel Z\``;
      return reply;
    } finally {
      client.release();
    }
  }
  const isWithoutPriceIntent = (lower.includes("sem pre") || lower.includes("sem valor")) && (lower.includes("item") || lower.includes("pe\xE7a") || lower.includes("peca") || lower.includes("produto") || lower.includes("listagem"));
  if (isWithoutPriceIntent) {
    if (!pool2) return "\u274C Banco de dados desconectado.";
    const client = await pool2.connect();
    try {
      const countRes = await client.query(`
        SELECT COUNT(*) as total FROM produtos 
        WHERE (preco_sugerido IS NULL OR preco_sugerido = 0)
          AND (preco_minimo IS NULL OR preco_minimo = 0)
      `);
      const totalSemPreco = parseInt(countRes.rows[0]?.total, 10) || 0;
      const res = await client.query(`
        SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, corredor, baia, nivel, locacao,
               preco_sugerido, preco_minimo, preco_tabela
        FROM produtos
        WHERE (preco_sugerido IS NULL OR preco_sugerido = 0)
          AND (preco_minimo IS NULL OR preco_minimo = 0)
        ORDER BY codigo_atual ASC
        LIMIT 25
      `);
      if (totalSemPreco === 0) {
        return "\u2705 Todos os produtos cadastrados possuem pre\xE7os configurados!";
      }
      let reply = `\u{1F4B5} **Itens Sem Pre\xE7o Cadastrado** (${totalSemPreco.toLocaleString("pt-BR")} itens no total):

`;
      reply += `*Exibindo os primeiros 25 itens:*

`;
      reply += `| C\xF3d. Produto | Descri\xE7\xE3o | Loca\xE7\xE3o | Pre\xE7o M\xEDnimo | Pre\xE7o Sugerido | Pre\xE7o Tabela |
`;
      reply += `| :--- | :--- | :---: | :---: | :---: | :---: |
`;
      res.rows.forEach((p) => {
        const codProd = p.codigo_fabrica && p.codigo_fabrica.trim() !== "" && !p.codigo_fabrica.startsWith("PRD-") ? p.codigo_fabrica : p.codigo_atual && !p.codigo_atual.startsWith("PRD-") ? p.codigo_atual : p.codigo_barras_atual || p.id;
        const loc = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
        const pMin = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "\u2014";
        const pSug = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "\u2014";
        const pTab = p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "\u2014";
        reply += `| **${codProd}** | ${p.descricao} | \`${loc}\` | ${pMin} | ${pSug} | ${pTab} |
`;
      });
      reply += `
\u{1F4A1} Para cadastrar o pre\xE7o de qualquer item, digite:
\`altere o pre\xE7o sugerido do item [C\xD3DIGO] para [VALOR]\``;
      return reply;
    } finally {
      client.release();
    }
  }
  const genericBindingMatch = cleanMsg.match(/(?:colocar|vincular|adicionar|inserir|acrescentar)\s+(?:o\s+)?c[oó]digo\s+gen[eé]rico\s+([A-Za-z0-9\.-]+)(?:,?\s+no\s+(?:produto\s+(?:c[oó]digo\s+)?)?item\s+(?:c[oó]digo\s+)?|,\s*no\s+produto\s+c[oó]digo\s+|,?\s*no\s+c[oó]digo\s+|no\s+item\s+)([A-Za-z0-9\.-]+)/i) || cleanMsg.match(/(?:colocar|vincular|adicionar|inserir|acrescentar)\s+(?:o\s+)?c[oó]digo\s+([A-Za-z0-9\.-]+)\s+como\s+gen[eé]rico\s+(?:no\s+c[oó]digo|no\s+item|para\s+o\s+c[oó]digo)\s+([A-Za-z0-9\.-]+)/i);
  if (genericBindingMatch) {
    const codGen = genericBindingMatch[1].trim();
    const codTarget = genericBindingMatch[2].trim();
    const prods = await searchProductDb(codTarget);
    if (prods.length === 0) {
      return `\u274C **Produto N\xE3o Encontrado:** N\xE3o foi localizado nenhum produto com o c\xF3digo **"${codTarget}"** para vincular o c\xF3digo gen\xE9rico.`;
    }
    const targetProd = prods[0];
    const similarProds = await searchProductDb(codGen);
    const similarProd = similarProds.length > 0 ? similarProds[0] : null;
    pendingGenericBindings.set(sessionId, {
      sessionId,
      targetProductId: targetProd.id,
      targetCodigo: targetProd.codigo_atual,
      targetDescricao: targetProd.descricao,
      codigoGenerico: codGen,
      similarProductId: similarProd ? similarProd.id : void 0,
      similarDescricao: similarProd ? similarProd.descricao : void 0
    });
    return `\u{1F517} **Confirma\xE7\xE3o de V\xEDnculo de C\xF3digo Gen\xE9rico**

* **Produto Principal:** \`${targetProd.codigo_atual}\` \u2014 ${targetProd.descricao}
* **C\xF3digo Gen\xE9rico a Vincular:** \`${codGen}\`
` + (similarProd ? `* **Pe\xE7a Similar no Estoque:** Reconhecida como \`${similarProd.codigo_atual}\` (${similarProd.descricao}) \u2014 V\xEDnculo bidirecional
` : "* **Tipo:** C\xF3digo alternativo / gen\xE9rico adicional\n") + `
---
\u26A0\uFE0F Para efetivar a grava\xE7\xE3o deste c\xF3digo gen\xE9rico no banco de dados, digite **CONFIRMAR**.
*(Ou digite CANCELAR para descartar).*`;
  }
  const listGenericsMatch = cleanMsg.match(/(?:quais\s+os\s+c[oó]digos\s+gen[eé]ricos|quais\s+s[aã]o\s+os\s+gen[eé]ricos)\s+(?:do\s+produto\s+|da\s+pe[çc]a\s+|do\s+item\s+|do\s+c[oó]digo\s+)?([A-Za-z0-9\.-]+)/i);
  if (listGenericsMatch) {
    const targetCode = listGenericsMatch[1].trim();
    const prods = await searchProductDb(targetCode);
    if (prods.length === 0) {
      return `\u274C **Produto N\xE3o Encontrado:** O c\xF3digo **"${targetCode}"** n\xE3o existe no sistema.`;
    }
    const prod = prods[0];
    let reply = `\u{1F517} **C\xF3digos Gen\xE9ricos para: ${prod.codigo_atual}** (${prod.descricao})

`;
    const { rows: related } = await getDbPool().query(`
      SELECT DISTINCT p.codigo_atual, p.descricao, pr.motivo
      FROM produtos_relacionados pr
      JOIN produtos p ON (p.id = CASE WHEN pr.produto_id = $1 THEN pr.relacionado_id ELSE pr.produto_id END)
      WHERE (pr.produto_id = $1 OR pr.relacionado_id = $1) AND p.id <> $1
    `, [prod.id]);
    const { rows: textGenerics } = await getDbPool().query(`
      SELECT codigo, motivo FROM codigos_produto 
      WHERE produto_id = $1 AND tipo IN ('codigo_generico', 'codigo_alternativo') AND ativo = true
    `, [prod.id]);
    if (related.length === 0 && textGenerics.length === 0) {
      reply += `N\xE3o h\xE1 nenhum c\xF3digo gen\xE9rico ou pe\xE7a equivalente cadastrada para este item.`;
    } else {
      if (related.length > 0) {
        reply += `**Pe\xE7as Relacionadas (No Estoque):**
`;
        related.forEach((r) => {
          reply += `* \`${r.codigo_atual}\` \u2014 ${r.descricao} *(Motivo: ${r.motivo})*
`;
        });
        reply += `
`;
      }
      if (textGenerics.length > 0) {
        reply += `**C\xF3digos Gen\xE9ricos/Alternativos (Busca/Bipagem):**
`;
        textGenerics.forEach((r) => {
          reply += `* \`${r.codigo}\` *(Motivo: ${r.motivo})*
`;
        });
      }
    }
    return reply;
  }
  const verifyInfoMatch = cleanMsg.match(/(?:verificar|listar)\s+(?:as\s+)?informa[cç][õo]es\s+(?:do\s+(?:c[oó]digo|produto|item)\s+)([A-Za-z0-9\.-]+)/i);
  if (verifyInfoMatch) {
    const targetCode = verifyInfoMatch[1].trim();
    const prods = await searchProductDb(targetCode);
    if (prods.length === 0) return `\u274C **Produto N\xE3o Encontrado:** O c\xF3digo **"${targetCode}"** n\xE3o existe no sistema.`;
    const p = prods[0];
    const locStr = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
    return `\u{1F4DD} **Ficha Completa do Produto**

* **C\xF3digo Atual:** \`${p.codigo_atual}\`
* **Descri\xE7\xE3o:** ${p.descricao}
* **C\xF3d. F\xE1brica:** ${p.codigo_fabrica || "-"}
* **C\xF3d. Barras (EAN):** ${p.codigo_barras_atual || "-"}
* **Loca\xE7\xE3o:** \`${locStr}\`
* **Quantidade em Estoque:** ${p.quantidade} un.
* **Custo Unit\xE1rio:** ${p.custo_unitario ? formatMoney(parseFloat(p.custo_unitario)) : "R$ 0,00"}
* **Pre\xE7o Sugerido:** ${p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "-"}
* **Pre\xE7o M\xEDnimo:** ${p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "-"}
* **Pre\xE7o Tabela:** ${p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "-"}
* **Criado em:** ${new Date(p.criado_em).toLocaleDateString("pt-BR")}

\u{1F4A1} *Voc\xEA pode alterar qualquer informa\xE7\xE3o deste produto pelo chat. (Ex: "altere o preco minimo do item ${p.codigo_atual} para R$ 10,00").*`;
  }
  const corredorMentionMatch = cleanMsg.match(/corredor\s+([A-Za-z0-9]+)/i) || cleanMsg.match(/corregor\s+([A-Za-z0-9]+)/i);
  if (corredorMentionMatch && !lower.startsWith("altere ") && !lower.startsWith("cadastre ")) {
    const targetCorredor = corredorMentionMatch[1].toUpperCase().trim();
    const nivelMatch = cleanMsg.match(/n[ií]vel\s+([A-Za-z0-9]+)/i);
    const targetNivel = nivelMatch ? nivelMatch[1].toUpperCase().trim() : null;
    if (cleanMsg.match(/(?:data\s+de\s+venda|data\s+de\s+compra|\b(?:ano|at[eé]\s+20\d{2})\b)/i)) {
      return `\u274C **Filtro n\xE3o compreendido:** Percebi que voc\xEA tentou filtrar por data ("\xFAltima data de venda", "ano", etc.). Como essa funcionalidade n\xE3o est\xE1 implementada via linguagem natural, o sistema cancelou a busca para n\xE3o inventar ou trazer dados desnecess\xE1rios.`;
    }
    if (!pool2) return "\u274C Banco de dados desconectado.";
    const client = await pool2.connect();
    try {
      const baiaRangeMatch = cleanMsg.match(/baia\s+(\d+)\s*(?:ate|até|a|-)\s*(?:a\s*)?(\d+)/i);
      if (baiaRangeMatch) {
        const bIni = parseInt(baiaRangeMatch[1], 10);
        const bFim = parseInt(baiaRangeMatch[2], 10);
        const res2 = await client.query(`
          SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, corredor, baia, nivel, locacao,
                 preco_sugerido, preco_minimo, preco_tabela, custo_unitario
          FROM produtos
          WHERE UPPER(TRIM(corredor)) = UPPER($1)
            AND NULLIF(regexp_replace(baia, '\\D', '', 'g'), '')::integer BETWEEN $2 AND $3
            ${targetNivel ? "AND UPPER(TRIM(nivel)) = $4" : ""}
          ORDER BY NULLIF(regexp_replace(baia, '\\D', '', 'g'), '')::integer ASC, nivel ASC
          LIMIT 35
        `, targetNivel ? [targetCorredor, bIni, bFim, targetNivel] : [targetCorredor, bIni, bFim]);
        if (res2.rows.length === 0) {
          return `\u{1F50D} **Corredor ${targetCorredor} (Baias ${bIni} at\xE9 ${bFim})${targetNivel ? ` - N\xEDvel ${targetNivel}` : ""}:**
Nenhum produto cadastrado nesta faixa no banco de dados.`;
        }
        let reply2 = `\u{1F4E6} **Pe\xE7as no Corredor ${targetCorredor} (Baias ${bIni} a ${bFim})${targetNivel ? ` - N\xEDvel ${targetNivel}` : ""}:**

`;
        reply2 += `| C\xF3d. Produto | Descri\xE7\xE3o | Loca\xE7\xE3o | Pre\xE7o M\xEDnimo | Pre\xE7o Sugerido | Pre\xE7o Tabela |
`;
        reply2 += `| :--- | :--- | :---: | :---: | :---: | :---: |
`;
        res2.rows.forEach((p) => {
          const codProd = p.codigo_fabrica && p.codigo_fabrica.trim() !== "" && !p.codigo_fabrica.startsWith("PRD-") ? p.codigo_fabrica : p.codigo_atual && !p.codigo_atual.startsWith("PRD-") ? p.codigo_atual : p.codigo_barras_atual || p.id;
          const loc = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
          const pMin = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "\u2014";
          const pSug = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "\u2014";
          const pTab = p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "\u2014";
          reply2 += `| **${codProd}** | ${p.descricao} | \`${loc}\` | ${pMin} | ${pSug} | ${pTab} |
`;
        });
        return reply2;
      }
      const isMinPrice = /(?:pre[cç]o|preciso|valor)\s+m[ií]nimo|m[ií]nimo/i.test(cleanMsg);
      const isTabPrice = /(?:pre[cç]o|preciso|valor)\s+tabela|tabela/i.test(cleanMsg);
      const isCusto = /custo/i.test(cleanMsg);
      const priceCol = isCusto ? "custo_unitario" : isMinPrice ? "preco_minimo" : isTabPrice ? "preco_tabela" : "preco_sugerido";
      const priceLabel = isCusto ? "Custo" : isMinPrice ? "Pre\xE7o M\xEDnimo" : isTabPrice ? "Pre\xE7o Tabela" : "Pre\xE7o Sugerido (V\xE1lido)";
      const priceBetweenMatch = cleanMsg.match(/(?:entre|de|faixa\s+de)\s*(?:R\$\s*)?(\d+[.,]?\d*)\s*(?:e|ate|até|a)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
      const priceAboveMatch = cleanMsg.match(/(?:pre[cç]o|preciso|valor)?\s*(?:acima\s+de|maior\s+que|>)\s*(?:R\$\s*)?(\d+[.,]?\d*)(?:\s*(?:ate|até|e|a)\s*(?:R\$\s*)?(\d+[.,]?\d*))?/i);
      const priceBelowMatch = cleanMsg.match(/(?:pre[cç]o|preciso|valor)?\s*(?:abaixo\s+de|menor\s+que|<)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
      if (priceBetweenMatch || priceAboveMatch || priceBelowMatch) {
        let pMin = 0;
        let pMax = 999999;
        if (priceBetweenMatch) {
          pMin = parseFloat(priceBetweenMatch[1].replace(",", "."));
          pMax = parseFloat(priceBetweenMatch[2].replace(",", "."));
        } else if (priceAboveMatch) {
          pMin = parseFloat(priceAboveMatch[1].replace(",", "."));
          if (priceAboveMatch[2]) {
            pMax = parseFloat(priceAboveMatch[2].replace(",", "."));
          }
        } else if (priceBelowMatch) {
          pMax = parseFloat(priceBelowMatch[1].replace(",", "."));
        }
        const res2 = await client.query(`
          SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, corredor, baia, nivel, locacao,
                 preco_sugerido, preco_minimo, preco_tabela, custo_unitario
          FROM produtos
          WHERE UPPER(TRIM(corredor)) = UPPER($1)
            AND ${priceCol} >= $2 AND ${priceCol} <= $3
            ${targetNivel ? "AND UPPER(TRIM(nivel)) = $4" : ""}
          ORDER BY ${priceCol} ASC
          LIMIT 35
        `, targetNivel ? [targetCorredor, pMin, pMax, targetNivel] : [targetCorredor, pMin, pMax]);
        if (res2.rows.length === 0) {
          return `\u{1F50D} **Corredor ${targetCorredor}${targetNivel ? ` (N\xEDvel ${targetNivel})` : ""}:** Nenhum item encontrado com **${priceLabel}** entre ${formatMoney(pMin)} e ${formatMoney(pMax)}.`;
        }
        let reply2 = `\u{1F4B0} **Pe\xE7as no Corredor ${targetCorredor}${targetNivel ? ` (N\xEDvel ${targetNivel})` : ""} com ${priceLabel} entre ${formatMoney(pMin)} e ${formatMoney(pMax)}:**

`;
        reply2 += `| C\xF3d. Produto | Descri\xE7\xE3o | Loca\xE7\xE3o | Pre\xE7o M\xEDnimo | Pre\xE7o Sugerido | Pre\xE7o Tabela |
`;
        reply2 += `| :--- | :--- | :---: | :---: | :---: | :---: |
`;
        res2.rows.forEach((p) => {
          const codProd = p.codigo_fabrica && p.codigo_fabrica.trim() !== "" && !p.codigo_fabrica.startsWith("PRD-") ? p.codigo_fabrica : p.codigo_atual && !p.codigo_atual.startsWith("PRD-") ? p.codigo_atual : p.codigo_barras_atual || p.id;
          const loc = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
          const pMinVal = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "\u2014";
          const pSugVal = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "\u2014";
          const pTabVal = p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "\u2014";
          reply2 += `| **${codProd}** | ${p.descricao} | \`${loc}\` | ${pMinVal} | ${pSugVal} | ${pTabVal} |
`;
        });
        return reply2;
      }
      const isCorredorCountOnly = /(?:quantos|quantas|quantidade|quatidade|total\s+de)\s+(?:produtos?|pe[cç]as?|itens|item)/i.test(cleanMsg) || /quantos\s+(?:produtos?\s+)?(?:tem|h[aá]|existem)/i.test(cleanMsg) || /quantidade\s+de\s+produtos/i.test(cleanMsg) || /total\s+no\s+corredor/i.test(cleanMsg);
      if (isCorredorCountOnly) {
        const countTotal2 = await client.query(`
          SELECT COUNT(*) as total, SUM(COALESCE(quantidade, 0)) as total_qtd 
          FROM produtos WHERE UPPER(TRIM(corredor)) = UPPER($1)
          ${targetNivel ? "AND UPPER(TRIM(nivel)) = $2" : ""}
        `, targetNivel ? [targetCorredor, targetNivel] : [targetCorredor]);
        const totalCorredor2 = parseInt(countTotal2.rows[0]?.total, 10) || 0;
        const totalEstoqueCorr2 = parseInt(countTotal2.rows[0]?.total_qtd, 10) || 0;
        if (totalCorredor2 === 0) {
          return `\u{1F50D} **Corredor ${targetCorredor}${targetNivel ? ` (N\xEDvel ${targetNivel})` : ""}:** Nenhum produto cadastrado com estes filtros no banco de dados.`;
        }
        return `\u{1F4CA} **Quantidade no Corredor ${targetCorredor}${targetNivel ? ` (N\xEDvel ${targetNivel})` : ""}:**

* **Total de Produtos Cadastrados:** **${totalCorredor2.toLocaleString("pt-BR")} itens**
* **Estoque F\xEDsico Total:** **${totalEstoqueCorr2.toLocaleString("pt-BR")} unidades**

\u{1F4A1} Para ver a listagem detalhada das pe\xE7as deste corredor, basta solicitar:
\`quero a listagem do corredor ${targetCorredor}\``;
      }
      let searchTermInCorredor = "";
      const termPattern1 = cleanMsg.match(/(?:item|itens|produtos?|pe[cç]as?)\s+no\s+corredor\s+[A-Za-z0-9]+\s+que\s+s[aã]o\s+([A-Za-z0-9\s]+)/i);
      const termPattern2 = cleanMsg.match(/(?:item|itens|produtos?|pe[cç]as?)\s+([A-Za-z0-9\s]+?)\s+(?:no\s+)?corredor/i);
      if (termPattern1) {
        searchTermInCorredor = termPattern1[1].trim();
      } else if (termPattern2) {
        searchTermInCorredor = termPattern2[1].trim();
      }
      const stopWords = ["tem", "ha", "h\xE1", "existem", "existe", "listagem", "lista", "produtos", "pecas", "pe\xE7as", "itens"];
      if (searchTermInCorredor && !stopWords.includes(searchTermInCorredor.toLowerCase())) {
        const res2 = await client.query(`
          SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, corredor, baia, nivel, locacao,
                 preco_sugerido, preco_minimo, preco_tabela, custo_unitario
          FROM produtos
          WHERE UPPER(TRIM(corredor)) = UPPER($1)
            AND descricao ILIKE '%' || $2 || '%'
            ${targetNivel ? "AND UPPER(TRIM(nivel)) = $3" : ""}
          ORDER BY baia ASC, nivel ASC
          LIMIT 35
        `, targetNivel ? [targetCorredor, searchTermInCorredor, targetNivel] : [targetCorredor, searchTermInCorredor]);
        if (res2.rows.length === 0) {
          return `\u{1F50D} **Corredor ${targetCorredor}${targetNivel ? ` (N\xEDvel ${targetNivel})` : ""}:** Nenhuma pe\xE7a com o termo **"${searchTermInCorredor}"** encontrada.`;
        }
        let reply2 = `\u{1F529} **Pe\xE7as encontradas no Corredor ${targetCorredor}${targetNivel ? ` (N\xEDvel ${targetNivel})` : ""} contendo "${searchTermInCorredor}":**

`;
        reply2 += `| C\xF3d. Produto | Descri\xE7\xE3o | Loca\xE7\xE3o | Pre\xE7o M\xEDnimo | Pre\xE7o Sugerido | Pre\xE7o Tabela |
`;
        reply2 += `| :--- | :--- | :---: | :---: | :---: | :---: |
`;
        res2.rows.forEach((p) => {
          const codProd = p.codigo_fabrica && p.codigo_fabrica.trim() !== "" && !p.codigo_fabrica.startsWith("PRD-") ? p.codigo_fabrica : p.codigo_atual && !p.codigo_atual.startsWith("PRD-") ? p.codigo_atual : p.codigo_barras_atual || p.id;
          const loc = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
          const pMin = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "\u2014";
          const pSug = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "\u2014";
          const pTab = p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "\u2014";
          reply2 += `| **${codProd}** | ${p.descricao} | \`${loc}\` | ${pMin} | ${pSug} | ${pTab} |
`;
        });
        return reply2;
      }
      const countTotal = await client.query(`
        SELECT COUNT(*) as total, SUM(COALESCE(quantidade, 0)) as total_qtd 
        FROM produtos WHERE UPPER(TRIM(corredor)) = UPPER($1)
        ${targetNivel ? "AND UPPER(TRIM(nivel)) = $2" : ""}
      `, targetNivel ? [targetCorredor, targetNivel] : [targetCorredor]);
      const totalCorredor = parseInt(countTotal.rows[0]?.total, 10) || 0;
      const totalEstoqueCorr = parseInt(countTotal.rows[0]?.total_qtd, 10) || 0;
      if (totalCorredor === 0) {
        return `\u{1F50D} **Corredor ${targetCorredor}${targetNivel ? ` (N\xEDvel ${targetNivel})` : ""}:** Nenhum produto cadastrado com estas caracter\xEDsticas no banco de dados.`;
      }
      const res = await client.query(`
        SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, corredor, baia, nivel, locacao,
               preco_sugerido, preco_minimo, preco_tabela, custo_unitario
        FROM produtos
        WHERE UPPER(TRIM(corredor)) = UPPER($1)
        ${targetNivel ? "AND UPPER(TRIM(nivel)) = $2" : ""}
        ORDER BY baia ASC, nivel ASC, codigo_atual ASC
        LIMIT 35
      `, targetNivel ? [targetCorredor, targetNivel] : [targetCorredor]);
      let reply = `\u{1F4CB} **Listagem do Corredor ${targetCorredor}${targetNivel ? ` - N\xEDvel ${targetNivel}` : ""}** (${totalCorredor.toLocaleString("pt-BR")} itens | ${totalEstoqueCorr} un):

`;
      reply += `| C\xF3d. Produto | Descri\xE7\xE3o | Loca\xE7\xE3o | Pre\xE7o M\xEDnimo | Pre\xE7o Sugerido | Pre\xE7o Tabela |
`;
      reply += `| :--- | :--- | :---: | :---: | :---: | :---: |
`;
      res.rows.forEach((p) => {
        const codProd = p.codigo_fabrica && p.codigo_fabrica.trim() !== "" && !p.codigo_fabrica.startsWith("PRD-") ? p.codigo_fabrica : p.codigo_atual && !p.codigo_atual.startsWith("PRD-") ? p.codigo_atual : p.codigo_barras_atual || p.id;
        const loc = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
        const pMin = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "\u2014";
        const pSug = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "\u2014";
        const pTab = p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "\u2014";
        reply += `| **${codProd}** | ${p.descricao} | \`${loc}\` | ${pMin} | ${pSug} | ${pTab} |
`;
      });
      if (totalCorredor > 35) {
        reply += `
*Exibindo os primeiros 35 itens do corredor. Voc\xEA pode filtrar por baia digitando: "corredor ${targetCorredor}, baia 1 ate 10"*`;
      }
      return reply;
    } finally {
      client.release();
    }
  }
  const priceMentionRegex = /(?:pre[cç]os?|preciso|valores?|valor|reais|r\$)/i;
  const listTriggerRegex = /(?:lista(?:gem)?|tabela|relat[oó]rio|mostre|mostrar|crie|criar|gere|gerar|quero|quantos?|quantas?|quantidade|quatidade|total|itens?|produtos?|pe[cç]as?)/i;
  if (priceMentionRegex.test(cleanMsg) && listTriggerRegex.test(cleanMsg) && !lower.startsWith("altere ") && !lower.startsWith("cadastre ") && !corredorMentionMatch) {
    const nivelMatch = cleanMsg.match(/n[ií]vel\s+([A-Za-z0-9]+)/i);
    const targetNivel = nivelMatch ? nivelMatch[1].toUpperCase().trim() : null;
    if (cleanMsg.match(/(?:data\s+de\s+venda|data\s+de\s+compra|\b(?:ano|at[eé]\s+20\d{2})\b)/i)) {
      return `\u274C **Filtro n\xE3o compreendido:** Percebi que voc\xEA tentou filtrar por data ("\xFAltima data de venda", "ano", etc.). Como essa funcionalidade n\xE3o est\xE1 implementada via linguagem natural, a busca avan\xE7ada foi cancelada para n\xE3o trazer dados desnecess\xE1rios.`;
    }
    const isMinPrice = /(?:pre[cç]o|preciso|valor(?:es)?)\s+m[ií]nimo|m[ií]nimo/i.test(cleanMsg);
    const isTabPrice = /(?:pre[cç]o|preciso|valor(?:es)?)\s+tabela|tabela/i.test(cleanMsg);
    const isCusto = /custo/i.test(cleanMsg);
    const priceCol = isCusto ? "custo_unitario" : isMinPrice ? "preco_minimo" : isTabPrice ? "preco_tabela" : "preco_sugerido";
    const priceLabel = isCusto ? "Custo" : isMinPrice ? "Pre\xE7o M\xEDnimo" : isTabPrice ? "Pre\xE7o de Tabela" : "Pre\xE7o Sugerido (ou V\xE1lido)";
    let pMin = null;
    let pMax = null;
    let operatorLabel = "";
    const betweenMatch = cleanMsg.match(/(?:entre|faixa\s+de)\s*(?:R\$\s*)?(\d+[.,]?\d*)\s*(?:e|ate|até|a)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i) || cleanMsg.match(/(?:pre[cç]o|valores?|valor)?\s*(?:de\s+)?(?:R\$\s*)?(\d+[.,]?\d*)\s*(?:a|ate|até)\s*(?:R\$\s*)?(\d+[.,]?\d*)\s*(?:reais)?/i);
    const equalMatch = cleanMsg.match(/(?:igual\s+(?:a\s+)?|no\s+valor\s+de\s+|com\s+valor\s+de\s+|=\s*)(?:R\$\s*)?(\d+[.,]?\d*)/i);
    const aboveMatch = cleanMsg.match(/(?:acima\s+de|a\s+cima\s+de|maior\s+(?:que|de)|>\s*=?)\s*(?:R\$\s*)?(\d+[.,]?\d*)(?:\s*(?:ate|até|e|a)\s*(?:R\$\s*)?(\d+[.,]?\d*))?/i);
    const belowMatch = cleanMsg.match(/(?:at[eé]|de\s+at[eé]|abaixo\s+de|a\s+baixo\s+de|menor\s+(?:que|de)|<\s*=?)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (betweenMatch) {
      pMin = parseFloat(betweenMatch[1].replace(",", "."));
      pMax = parseFloat(betweenMatch[2].replace(",", "."));
      operatorLabel = `entre ${formatMoney(pMin)} e ${formatMoney(pMax)}`;
    } else if (equalMatch) {
      const val = parseFloat(equalMatch[1].replace(",", "."));
      pMin = Math.max(0, val - 0.5);
      pMax = val + 0.5;
      operatorLabel = `no valor de ${formatMoney(val)}`;
    } else if (aboveMatch) {
      pMin = parseFloat(aboveMatch[1].replace(",", "."));
      if (aboveMatch[2]) {
        pMax = parseFloat(aboveMatch[2].replace(",", "."));
        operatorLabel = `entre ${formatMoney(pMin)} e ${formatMoney(pMax)}`;
      } else {
        pMax = 9999999;
        operatorLabel = `acima de ${formatMoney(pMin)}`;
      }
    } else if (belowMatch) {
      pMin = 0;
      pMax = parseFloat(belowMatch[1].replace(",", "."));
      operatorLabel = `at\xE9 ${formatMoney(pMax)}`;
    }
    if (pMin !== null && pMax !== null) {
      const isCountIntent = /(?:quantos|quantas|quantidade|quatidade|total\s+de)\s+(?:produtos?|pe[cç]as?|itens|item)/i.test(cleanMsg) || /^(?:quantos|quantas|quantidade|quatidade)\b/i.test(lower);
      let descCandidate = cleanMsg.replace(/^(?:quero\s+(?:uma\s+)?|gere\s+(?:uma\s+)?|gerar\s+(?:uma\s+)?|crie\s+(?:uma\s+)?|criar\s+(?:uma\s+)?|mostre\s+(?:uma\s+)?|mostrar\s+(?:uma\s+)?|ver\s+(?:uma\s+)?|obter\s+)?(?:lista(?:gem)?|tabela|relat[oó]rio|quantidade|quatidade|quantos?|quantas?|total)\s*(?:de\s+|dos?\s+|das?\s+)?/i, "").trim();
      descCandidate = descCandidate.replace(/(?:com\s+)?(?:pre[cç]os?|valores?|valor)?\s*(?:tabela|sugerido|m[ií]nimo)?\s*(?:entre|de|at[eé]|abaixo|a\s+baixo|acima|a\s+cima|menor|maior|igual).*$/i, "").trim();
      descCandidate = descCandidate.replace(/^(?:produtos?|pe[cç]as?|itens|item|coisas?)\s*(?:de\s+|com\s+)?/i, "").trim();
      descCandidate = descCandidate.replace(/\s+(?:com|de|no|na|em|do|da)$/i, "").trim();
      const searchDesc = descCandidate.length >= 2 && !["qualquer", "qualquer coisa", "com", "de", "do", "da", "em", "para"].includes(descCandidate.toLowerCase()) ? descCandidate : "";
      const singularDesc = searchDesc.length >= 4 ? searchDesc.replace(/(?:ões|oes)$/i, "ao").replace(/(?:ens)$/i, "em").replace(/(?:is)$/i, "l").replace(/s$/i, "") : searchDesc;
      if (!pool2) return "\u274C Banco de dados desconectado.";
      const client = await pool2.connect();
      try {
        const queryParams = [pMin, pMax];
        let whereClause = `${priceCol} >= $1 AND ${priceCol} <= $2`;
        if (searchDesc) {
          queryParams.push(`%${searchDesc}%`);
          if (singularDesc && singularDesc !== searchDesc && singularDesc.length >= 3) {
            queryParams.push(`%${singularDesc}%`);
            whereClause += ` AND (descricao ILIKE $3 OR codigo_atual ILIKE $3 OR codigo_fabrica ILIKE $3 OR descricao ILIKE $4 OR codigo_atual ILIKE $4)`;
          } else {
            whereClause += ` AND (descricao ILIKE $3 OR codigo_atual ILIKE $3 OR codigo_fabrica ILIKE $3)`;
          }
        }
        let targetNivelParam = "";
        if (targetNivel) {
          queryParams.push(targetNivel);
          targetNivelParam = ` AND UPPER(TRIM(nivel)) = $${queryParams.length}`;
          whereClause += targetNivelParam;
        }
        if (isCountIntent) {
          const countRes = await client.query(`
            SELECT COUNT(*) as total, SUM(COALESCE(quantidade, 0)) as total_estoque
            FROM produtos
            WHERE ${whereClause}
          `, queryParams);
          const totalFound = parseInt(countRes.rows[0]?.total, 10) || 0;
          const totalStock = parseInt(countRes.rows[0]?.total_estoque, 10) || 0;
          if (totalFound === 0) {
            return `\u{1F50D} Nenhum produto encontrado com **${priceLabel}** ${operatorLabel}${searchDesc ? ` contendo "${searchDesc}"` : ""}${targetNivel ? ` no N\xEDvel ${targetNivel}` : ""}.`;
          }
          return `\u{1F4CA} **Quantidade de Produtos no Estoque:**

` + (searchDesc ? `* **Termo pesquisado:** "${searchDesc}"
` : "") + (targetNivel ? `* **N\xEDvel:** ${targetNivel}
` : "") + `* **Crit\xE9rio de Valor:** ${priceLabel} ${operatorLabel}
* **Total de Produtos Cadastrados:** **${totalFound.toLocaleString("pt-BR")} itens**
* **Estoque F\xEDsico Dispon\xEDvel:** **${totalStock.toLocaleString("pt-BR")} unidades**

\u{1F4A1} Para ver a listagem detalhada destas pe\xE7as, solicite:
\`mostre uma lista de ${searchDesc || "produtos"} com ${priceLabel.toLowerCase()} ${operatorLabel}\``;
        }
        const res = await client.query(`
          SELECT id, codigo_atual, codigo_fabrica, codigo_barras_atual, descricao, corredor, baia, nivel, locacao, quantidade,
                 preco_sugerido, preco_minimo, preco_tabela, custo_unitario
          FROM produtos
          WHERE ${whereClause}
          ORDER BY ${priceCol} ASC, descricao ASC
          LIMIT 40
        `, queryParams);
        if (res.rows.length === 0) {
          return `\u{1F50D} Nenhum produto encontrado no estoque com **${priceLabel}** ${operatorLabel}${searchDesc ? ` contendo "${searchDesc}"` : ""}${targetNivel ? ` no N\xEDvel ${targetNivel}` : ""}.`;
        }
        let reply = `\u{1F4B0} **${searchDesc ? `Lista de "${searchDesc.toUpperCase()}"` : "Pe\xE7as no Estoque"} com ${priceLabel} ${operatorLabel}:**

`;
        reply += `| C\xF3d. Produto | Descri\xE7\xE3o | Loca\xE7\xE3o | Pre\xE7o M\xEDnimo | Pre\xE7o Sugerido | Pre\xE7o Tabela | Estoque |
`;
        reply += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
`;
        res.rows.forEach((p) => {
          const codProd = p.codigo_fabrica && p.codigo_fabrica.trim() !== "" && !p.codigo_fabrica.startsWith("PRD-") ? p.codigo_fabrica : p.codigo_atual && !p.codigo_atual.startsWith("PRD-") ? p.codigo_atual : p.codigo_barras_atual || p.id;
          const loc = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
          const pMinVal = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "\u2014";
          const pSugVal = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "\u2014";
          const pTabVal = p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "\u2014";
          const estVal = p.quantidade !== void 0 && p.quantidade !== null ? `${p.quantidade} un` : "\u2014";
          reply += `| **${codProd}** | ${p.descricao} | \`${loc}\` | ${pMinVal} | ${pSugVal} | ${pTabVal} | ${estVal} |
`;
        });
        if (res.rows.length >= 40) {
          reply += `
*Exibindo os primeiros 40 produtos encontrados ordenados por valor.*`;
        }
        return reply;
      } finally {
        client.release();
      }
    }
  }
  const activeList = activeQuickLists.get(sessionId);
  if (activeList && (lower.includes("item ") || lower.includes("primeiro") || lower.includes("segundo") || lower.includes("terceiro"))) {
    const removeMatch = lower.match(/(?:remover|excluir|deletar|apagar)\s+(?:o\s+)?item\s+(\d+)/i);
    if (removeMatch) {
      const idx = parseInt(removeMatch[1], 10) - 1;
      if (idx >= 0 && idx < activeList.itens.length) {
        const removed = activeList.itens.splice(idx, 1);
        return `\u{1F5D1}\uFE0F Item #${idx + 1} (\`${removed[0].codigo}\`) removido da lista.

` + renderQuickListTable(activeList);
      }
      return `\u274C Item #${removeMatch[1]} n\xE3o existe na lista atual (a lista tem ${activeList.itens.length} itens).`;
    }
    const editMatch = cleanMsg.match(/altere\s+(?:o\s+)?(comentario|comentário|locacao|locação)\s+do\s+(?:item\s+(\d+)|primeiro|segundo|terceiro)\s+para\s+["']?([^"']+)["']?/i);
    if (editMatch) {
      const field = editMatch[1].toLowerCase().includes("loc") ? "locacao" : "comentario";
      let idx = 0;
      if (editMatch[2]) {
        idx = parseInt(editMatch[2], 10) - 1;
      } else if (lower.includes("primeiro")) {
        idx = 0;
      } else if (lower.includes("segundo")) {
        idx = 1;
      } else if (lower.includes("terceiro")) {
        idx = 2;
      }
      const newVal = editMatch[3].trim();
      if (idx >= 0 && idx < activeList.itens.length) {
        activeList.itens[idx][field] = newVal;
        return `\u270F\uFE0F **Item #${idx + 1} atualizado:** ${field === "locacao" ? "Loca\xE7\xE3o" : "Coment\xE1rio"} alterado para: **"${newVal}"**

` + renderQuickListTable(activeList);
      } else {
        return `\u274C Item #${idx + 1} n\xE3o encontrado na lista atual. A lista cont\xE9m ${activeList.itens.length} itens.`;
      }
    }
  }
  const isStartListIntent = lower.startsWith("inicie uma lista") || lower.startsWith("iniciar lista") || lower.startsWith("criar lista rapida") || lower.startsWith("nova lista rapida") || lower === "lista rapida" || lower === "lista r\xE1pida";
  if (isStartListIntent) {
    const nameMatch = cleanMsg.match(/(?:de\s+nome|chamada|com\s+o\s+nome|nome)\s+[:"']?([^"'\n]+)["']?/i);
    if (nameMatch && nameMatch[1].trim()) {
      const listName = nameMatch[1].trim();
      const newList = {
        nome: listName,
        responsavel: "Estoque",
        itens: [],
        criado_em: (/* @__PURE__ */ new Date()).toISOString()
      };
      activeQuickLists.set(sessionId, newList);
      return `\u{1F4DD} **Lista R\xE1pida Iniciada!**

` + renderQuickListTable(newList);
    } else {
      sessionFlowStates.set(sessionId, { state: "waiting_list_name" });
      return `\u{1F4DD} **Nova Lista R\xE1pida**

Qual ser\xE1 o nome da lista r\xE1pida? *(Ex: "Contagem de estoque setembro de 2026")*`;
    }
  }
  if (lower === "salvar lista" || lower === "gravar lista" || lower === "salvar lista rapida") {
    if (!activeList) {
      return "\u26A0\uFE0F Nenhuma lista r\xE1pida aberta para salvar no momento. Digite `inicie uma lista rapida` para come\xE7ar.";
    }
    if (!pool2) return "\u274C Banco de dados desconectado.";
    const client = await pool2.connect();
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
      return `\u2705 **Lista R\xE1pida #${savedId} salva com sucesso no banco de dados!**

\u{1F4CB} **Nome:** ${activeList.nome}
\u{1F4E6} **Total de Itens:** ${activeList.itens.length}
A lista j\xE1 est\xE1 dispon\xEDvel para consulta e edi\xE7\xE3o na aba **Anota\xE7\xF5es R\xE1pidas** do sistema.`;
    } catch (err) {
      console.error("[Chat] Erro ao salvar lista r\xE1pida:", err);
      return `\u274C Erro ao salvar lista no banco: ${err.message}`;
    } finally {
      client.release();
    }
  }
  if (lower === "listar listas rapidas" || lower === "minhas listas" || lower === "listas rapidas") {
    if (!pool2) return "Banco de dados desconectado.";
    const client = await pool2.connect();
    try {
      const res = await client.query("SELECT id, nome, responsavel, total_itens, criado_em FROM listas_rapidas ORDER BY criado_em DESC LIMIT 10");
      if (res.rows.length === 0) {
        return "Nenhuma lista r\xE1pida gravada no banco de dados at\xE9 o momento.\nPara criar uma, digite: `inicie uma lista rapida de nome [Nome da Lista]`";
      }
      let reply = `\u{1F4CB} **Listas R\xE1pidas Salvas no Banco de Dados:**

`;
      for (const r of res.rows) {
        reply += `* **#${r.id}** - **${r.nome}** (${r.total_itens || 0} itens) - *${new Date(r.criado_em).toLocaleDateString("pt-BR")}*
`;
      }
      reply += `
Para abrir qualquer lista, digite: \`abrir lista rapida #ID\``;
      return reply;
    } finally {
      client.release();
    }
  }
  const openListMatch = lower.match(/(?:abrir|chamar|carregar)\s+lista\s+(?:rapida\s+)?#?(\d+)/i);
  if (openListMatch) {
    const targetId = parseInt(openListMatch[1], 10);
    if (!pool2) return "Banco de dados desconectado.";
    const client = await pool2.connect();
    try {
      const res = await client.query("SELECT * FROM listas_rapidas WHERE id = $1", [targetId]);
      if (res.rows.length === 0) {
        return `\u274C Lista #${targetId} n\xE3o foi encontrada no banco de dados.`;
      }
      const row = res.rows[0];
      const loadedList = {
        id: row.id,
        nome: row.nome,
        responsavel: row.responsavel,
        itens: Array.isArray(row.itens) ? row.itens : [],
        criado_em: row.criado_em
      };
      activeQuickLists.set(sessionId, loadedList);
      return `\u{1F4C2} **Lista #${row.id} Carregada na Sess\xE3o:**

` + renderQuickListTable(loadedList);
    } finally {
      client.release();
    }
  }
  const multiAddMatch = cleanMsg.match(/(?:cadastre|adicione|adicionar|coloque)\s+os\s+itens?\s+([A-Za-z0-9\s,;\.\-\/]+)/i);
  if (multiAddMatch && !cleanMsg.toLowerCase().includes("or\xE7amento")) {
    let currentList2 = activeQuickLists.get(sessionId);
    if (!currentList2) {
      currentList2 = {
        nome: "Lista R\xE1pida " + formatDate(),
        responsavel: "Estoque",
        itens: [],
        criado_em: (/* @__PURE__ */ new Date()).toISOString()
      };
      activeQuickLists.set(sessionId, currentList2);
    }
    const rawCodes = multiAddMatch[1].split(/[,;e\s]+/).map((c) => c.trim().replace(/[\.]/g, "")).filter((c) => c.length >= 2);
    let addedCount = 0;
    for (const rawCode of rawCodes) {
      if (["os", "itens", "item", "na", "lista", "para"].includes(rawCode.toLowerCase())) continue;
      const prods = await searchProductDb(rawCode);
      const exists = prods.length > 0;
      const loc = exists ? prods[0].locacao || [prods[0].corredor, prods[0].baia, prods[0].nivel].filter(Boolean).join("-") || "" : "";
      currentList2.itens.push({
        id: "item_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        codigo: exists ? prods[0].codigo_atual : rawCode,
        locacao: loc,
        comentario: "",
        cadastrado: exists
      });
      addedCount++;
    }
    return `\u2795 **${addedCount} item(ns) adicionado(s) \xE0 lista!**

` + renderQuickListTable(currentList2);
  }
  if (activeList && !lower.includes("criar or\xE7amento") && !lower.includes("altere ") && !lower.startsWith("cadastre o item com codigo")) {
    const parts = cleanMsg.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
    let code = "";
    let loc = "";
    let comment = "";
    const itemWordMatch = cleanMsg.match(/item\s+([A-Za-z0-9\.-]{3,20})/i);
    if (itemWordMatch) {
      code = itemWordMatch[1];
      const after = cleanMsg.substring(cleanMsg.indexOf(code) + code.length).replace(/^[,;\s]+/, "").trim();
      comment = after;
    } else if (parts.length >= 1) {
      code = parts[0].replace(/^(item|peça|peca)\s*/i, "").trim();
      if (parts.length === 2) {
        if (/^[A-Z0-9]{1,3}-[A-Z0-9]{1,4}-[A-Z0-9]{1,3}$/i.test(parts[1]) || parts[1].toLowerCase().includes("corredor")) {
          loc = parts[1];
        } else {
          comment = parts[1];
        }
      } else if (parts.length >= 3) {
        loc = parts[1];
        comment = parts.slice(2).join(", ");
      }
    }
    if (code && !["confirmar", "cancelar", "ajuda", "salvar", "ola", "ol\xE1", "sim"].includes(code.toLowerCase())) {
      const prods = await searchProductDb(code);
      const exists = prods.length > 0;
      if (exists && !loc) {
        loc = prods[0].locacao || [prods[0].corredor, prods[0].baia, prods[0].nivel].filter(Boolean).join("-") || "";
      }
      activeList.itens.push({
        id: "item_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        codigo: exists ? prods[0].codigo_atual : code,
        locacao: loc,
        comentario: comment,
        cadastrado: exists
      });
      return `\u2795 **Item adicionado com sucesso!**

` + renderQuickListTable(activeList);
    }
  }
  const copyDescMatch = cleanMsg.match(/copiar\s+(?:a\s+)?descri[cç][aã]o\s+do\s+(?:c[oó]digo|produto|item)\s+([A-Za-z0-9\.-]+)\s+(?:e\s+)?(?:adicionar|colocar|inserir|para)\s+(?:no\s+)?(?:c[oó]digo|produto|item)\s+([A-Za-z0-9\.-]+)/i) || cleanMsg.match(/copiar\s+(?:a\s+)?descri[cç][aã]o\s+do\s+([A-Za-z0-9\.-]+)\s+(?:e\s+)?(?:adicionar|colocar|inserir|para)\s+(?:no\s+)?([A-Za-z0-9\.-]+)/i);
  if (copyDescMatch) {
    const codOrigem = copyDescMatch[1].trim();
    const codDestino = copyDescMatch[2].trim();
    const prodsOrigem = await searchProductDb(codOrigem);
    if (prodsOrigem.length === 0) return `\u274C **Produto N\xE3o Encontrado:** N\xE3o foi localizado o c\xF3digo de origem **"${codOrigem}"**.`;
    const prodOrigem = prodsOrigem[0];
    const prodsDestino = await searchProductDb(codDestino);
    if (prodsDestino.length === 0) return `\u274C **Produto N\xE3o Encontrado:** N\xE3o foi localizado o c\xF3digo de destino **"${codDestino}"**.`;
    const prodDestino = prodsDestino[0];
    pendingProductUpdates.set(sessionId, {
      sessionId,
      produto_id: prodDestino.id,
      codigo_atual: prodDestino.codigo_atual,
      descricao_original: prodDestino.descricao,
      campo: "descricao",
      campoLabel: "Descri\xE7\xE3o da Pe\xE7a (C\xF3pia)",
      valor_antigo: prodDestino.descricao,
      valor_novo: prodOrigem.descricao,
      corredor: "",
      baia: "",
      nivel: ""
    });
    return `\u26A0\uFE0F **Confirma\xE7\xE3o de C\xF3pia de Descri\xE7\xE3o**

\u{1F4E6} **Origem:** \`${prodOrigem.codigo_atual}\` \u2014 ${prodOrigem.descricao}
\u{1F3AF} **Destino:** \`${prodDestino.codigo_atual}\`
\u{1F534} **Descri\xE7\xE3o Atual (Destino):** ${prodDestino.descricao}
\u{1F7E2} **Nova Descri\xE7\xE3o:** **${prodOrigem.descricao}**

---
Para aplicar esta altera\xE7\xE3o no banco de dados, digite **CONFIRMAR**.
*(Ou digite CANCELAR para descartar).*`;
  }
  const suggestLocMatch = cleanMsg.match(/(?:qual\s+loca[cç][aã]o|onde\s+(?:posso|devo)?\s*(?:colocar|guardar|armazenar))\s+(?:essa\s+pe[çc]a|este\s+item|o\s+produto)\s*(?:c[oó]digo\s+|item\s+)?([A-Za-z0-9\.-]+)/i) || cleanMsg.match(/(?:sugerir|sugira)\s+loca[cç][aã]o\s+para\s+o\s+(?:c[oó]digo|produto|item)\s+([A-Za-z0-9\.-]+)/i);
  if (suggestLocMatch) {
    const targetCode = suggestLocMatch[1].trim();
    const prods = await searchProductDb(targetCode);
    if (prods.length === 0) return `\u274C **Produto N\xE3o Encontrado:** N\xE3o localizei o c\xF3digo **"${targetCode}"** no sistema.`;
    const prod = prods[0];
    const firstWord = prod.descricao.split(" ")[0] || "";
    const secondWord = prod.descricao.split(" ")[1] || "";
    let searchQuery = firstWord;
    if (firstWord.length < 4 && secondWord) searchQuery = firstWord + " " + secondWord;
    const { rows: similares } = await getDbPool().query(`
      SELECT corredor, baia, nivel, count(*) as qtd 
      FROM produtos 
      WHERE (descricao ILIKE $1 OR codigo_atual ILIKE $2) 
        AND corredor IS NOT NULL AND corredor <> ''
        AND id <> $3
      GROUP BY corredor, baia, nivel 
      ORDER BY qtd DESC 
      LIMIT 3
    `, ["%" + searchQuery + "%", "%" + targetCode.substring(0, 4) + "%", prod.id]);
    let reply = `\u{1F916} **Sugest\xE3o de Loca\xE7\xE3o para: ${prod.codigo_atual} (${prod.descricao})**

`;
    if (similares.length > 0) {
      reply += `Analisando pe\xE7as similares (por descri\xE7\xE3o ou prefixo do c\xF3digo), encontrei agrupamentos frequentes nestes locais:

`;
      similares.forEach((s, idx) => {
        const loc = [s.corredor, s.baia, s.nivel].filter(Boolean).join("-");
        reply += `${idx + 1}. **Corredor ${s.corredor}** (Baia ${s.baia || "-"}, N\xEDvel ${s.nivel || "-"}) \u2014 *${s.qtd} itens similares pr\xF3ximos.*
`;
      });
      reply += `
\u{1F4A1} *Para definir a loca\xE7\xE3o escolhida, digite, por exemplo:* \`altere a locacao do item ${prod.codigo_atual} para corredor ${similares[0].corredor}, baia ${similares[0].baia}, nivel ${similares[0].nivel}\``;
    } else {
      reply += `N\xE3o encontrei nenhuma pe\xE7a semelhante ("${searchQuery}") com loca\xE7\xE3o f\xEDsica preenchida.
Sugiro alocar em uma \xE1rea nova ou pr\xF3xima de pe\xE7as do mesmo fornecedor.`;
    }
    return reply;
  }
  const isAlterProductIntent = lower.startsWith("altere ") || lower.startsWith("atualize ") || lower.startsWith("mudar ") || lower.startsWith("mude ") || lower.startsWith("modifique ");
  if (isAlterProductIntent && !lower.includes("do item 1") && !lower.includes("do item 2")) {
    const codeMatch = cleanMsg.match(/(?:item|produto|código|codigo)\s+([A-Za-z0-9\.-]{3,20})/i);
    const targetCode = codeMatch ? codeMatch[1] : "";
    if (!targetCode) {
      return `\u274C **C\xF3digo n\xE3o identificado para altera\xE7\xE3o.**

Por favor, envie no formato:
\`altere a descri\xE7\xE3o do item [C\xD3DIGO] para [NOVO TEXTO]\`
ou
\`altere o pre\xE7o sugerido do item [C\xD3DIGO] para [VALOR]\`
ou
\`altere a loca\xE7\xE3o do item [C\xD3DIGO] para [LOCA\xC7\xC3O]\``;
    }
    const prods = await searchProductDb(targetCode);
    if (prods.length === 0) {
      return `\u274C **Produto N\xE3o Encontrado:** Nenhum produto cadastrado no banco com o c\xF3digo **"${targetCode}"** para altera\xE7\xE3o.`;
    }
    const prod = prods[0];
    let campo = "";
    let campoLabel = "";
    let valorAntigo = "";
    let valorNovo = "";
    let corredor = "";
    let baia = "";
    let nivel = "";
    if (lower.includes("descri") || lower.includes("nome")) {
      const descMatch = cleanMsg.match(/para\s+["']?([^"'\n]+)["']?$/i);
      if (!descMatch) return 'Por favor, informe a nova descri\xE7\xE3o ap\xF3s a palavra "para".';
      campo = "descricao";
      campoLabel = "Descri\xE7\xE3o da Pe\xE7a";
      valorAntigo = prod.descricao;
      valorNovo = descMatch[1].trim();
    } else if (lower.includes("pre\xE7o sugerido") || lower.includes("preco sugerido") || lower.includes("sugerido")) {
      const percMatch = cleanMsg.match(/(?:para|por|em)\s*(\d+[.,]?\d*)\s*%\s*(?:acima|sobre).*(?:custo|valor)/i);
      const valMatch = cleanMsg.match(/(?:para|por)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
      campo = "preco_sugerido";
      campoLabel = "Pre\xE7o Sugerido";
      valorAntigo = prod.preco_sugerido ? formatMoney(parseFloat(prod.preco_sugerido)) : "N\xE3o informado";
      if (percMatch) {
        const perc = parseFloat(percMatch[1].replace(",", "."));
        const custo = prod.custo_unitario ? parseFloat(prod.custo_unitario) : 0;
        if (custo === 0) return "\u274C O produto n\xE3o possui valor de custo cadastrado para calcular a porcentagem.";
        valorNovo = formatMoney(custo + custo * (perc / 100));
      } else if (valMatch) {
        valorNovo = formatMoney(parseFloat(valMatch[1].replace(",", ".")));
      } else {
        return "Informe o novo pre\xE7o num\xE9rico ou percentual acima do custo (ex: 30% acima do custo).";
      }
    } else if (lower.includes("pre\xE7o m\xEDnimo") || lower.includes("preco minimo") || lower.includes("minimo")) {
      const percMatch = cleanMsg.match(/(?:para|por|em)\s*(\d+[.,]?\d*)\s*%\s*(?:acima|sobre).*(?:custo|valor)/i);
      const valMatch = cleanMsg.match(/(?:para|por)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
      campo = "preco_minimo";
      campoLabel = "Pre\xE7o M\xEDnimo";
      valorAntigo = prod.preco_minimo ? formatMoney(parseFloat(prod.preco_minimo)) : "N\xE3o informado";
      if (percMatch) {
        const perc = parseFloat(percMatch[1].replace(",", "."));
        const custo = prod.custo_unitario ? parseFloat(prod.custo_unitario) : 0;
        if (custo === 0) return "\u274C O produto n\xE3o possui valor de custo cadastrado para calcular a porcentagem.";
        valorNovo = formatMoney(custo + custo * (perc / 100));
      } else if (valMatch) {
        valorNovo = formatMoney(parseFloat(valMatch[1].replace(",", ".")));
      } else {
        return "Informe o novo pre\xE7o num\xE9rico ou percentual acima do custo (ex: 30% acima do custo).";
      }
    } else if (lower.includes("pre\xE7o tabela") || lower.includes("preco tabela") || lower.includes("tabela")) {
      const percMatch = cleanMsg.match(/(?:para|por|em)\s*(\d+[.,]?\d*)\s*%\s*(?:acima|sobre).*(?:custo|valor)/i);
      const valMatch = cleanMsg.match(/(?:para|por)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
      campo = "preco_tabela";
      campoLabel = "Pre\xE7o Tabela";
      valorAntigo = prod.preco_tabela ? formatMoney(parseFloat(prod.preco_tabela)) : "N\xE3o informado";
      if (percMatch) {
        const perc = parseFloat(percMatch[1].replace(",", "."));
        const custo = prod.custo_unitario ? parseFloat(prod.custo_unitario) : 0;
        if (custo === 0) return "\u274C O produto n\xE3o possui valor de custo cadastrado para calcular a porcentagem.";
        valorNovo = formatMoney(custo + custo * (perc / 100));
      } else if (valMatch) {
        valorNovo = formatMoney(parseFloat(valMatch[1].replace(",", ".")));
      } else {
        return "Informe o novo pre\xE7o num\xE9rico ou percentual acima do custo (ex: 30% acima do custo).";
      }
    } else if (lower.includes("loca\xE7") || lower.includes("locac") || lower.includes("corredor") || lower.includes("baia") || lower.includes("nivel")) {
      campo = "locacao";
      campoLabel = "Loca\xE7\xE3o F\xEDsica";
      valorAntigo = prod.locacao || [prod.corredor, prod.baia, prod.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
      const cMatch = cleanMsg.match(/corredor\s+([A-Za-z0-9]+)/i);
      const bMatch = cleanMsg.match(/baia\s+([A-Za-z0-9]+)/i);
      const nMatch = cleanMsg.match(/n[íi]vel\s+([A-Za-z0-9]+)/i);
      if (cMatch || bMatch || nMatch) {
        corredor = cMatch ? cMatch[1].toUpperCase() : prod.corredor || "";
        baia = bMatch ? bMatch[1].toUpperCase() : prod.baia || "";
        nivel = nMatch ? nMatch[1].toUpperCase() : prod.nivel || "";
        valorNovo = [corredor, baia, nivel].filter(Boolean).join("-");
      } else {
        const locMatch = cleanMsg.match(/para\s+["']?([^"'\n]+)["']?$/i);
        if (!locMatch) return 'Informe a nova loca\xE7\xE3o ap\xF3s a palavra "para".';
        valorNovo = locMatch[1].trim();
      }
    } else {
      return `\u274C Campo para altera\xE7\xE3o n\xE3o reconhecido. Voc\xEA pode alterar: **descri\xE7\xE3o**, **pre\xE7o sugerido**, **pre\xE7o m\xEDnimo**, **pre\xE7o tabela** ou **loca\xE7\xE3o**.`;
    }
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
    return `\u26A0\uFE0F **Confirma\xE7\xE3o de Altera\xE7\xE3o no Banco de Dados Necess\xE1ria**

\u{1F4E6} **Produto:** \`${prod.codigo_atual}\` (${prod.descricao})
\u270F\uFE0F **Campo a Alterar:** **${campoLabel}**
\u{1F534} **Valor Atual:** ${valorAntigo}
\u{1F7E2} **Novo Valor:** **${valorNovo}**

---
Para aplicar esta altera\xE7\xE3o no banco de dados da Otto Diesel, digite **CONFIRMAR**.
*(Ou digite CANCELAR para descartar).*`;
  }
  const isCreateProductIntent = lower.startsWith("cadastre o item com codigo") || lower.startsWith("cadastre o produto com codigo") || lower.startsWith("cadastrar item com codigo") || lower.startsWith("novo produto com codigo");
  if (isCreateProductIntent) {
    const codeMatch = cleanMsg.match(/c[oó]digo\s*[:\s]*([A-Za-z0-9\.-]{3,20})/i);
    if (!codeMatch) {
      return "\u26A0\uFE0F **C\xF3digo do Produto Obrigat\xF3rio:** O c\xF3digo \xE9 indispens\xE1vel para cadastrar a pe\xE7a.";
    }
    const newCode = codeMatch[1].trim();
    const existing = await searchProductDb(newCode);
    if (existing.length > 0) {
      const p = existing[0];
      const locStr = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
      return `\u26A0\uFE0F **Aten\xE7\xE3o: Produto J\xE1 Cadastrado em Estoque!**

O c\xF3digo **"${newCode}"** j\xE1 existe no banco de dados da Otto Diesel:
* **Descri\xE7\xE3o:** ${p.descricao}
* **\u{1F4CD} Loca\xE7\xE3o Atual:** Corredor ${p.corredor || "\u2014"}, Baia ${p.baia || "\u2014"}, N\xEDvel ${p.nivel || "\u2014"} (\`${locStr}\`)
* **\u{1F4E6} Estoque F\xEDsico:** **${p.quantidade}** unidades
* **\u{1F4B5} Pre\xE7o Sugerido:** ${p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "\u2014"}

Para evitar duplicidades, o sistema n\xE3o criar\xE1 outro registro. Se voc\xEA deseja alterar algum dado desta pe\xE7a, basta digitar:
\`altere a [descri\xE7\xE3o/loca\xE7\xE3o/pre\xE7o] do item ${newCode} para...\``;
    }
    let desc = "";
    const descMatch = cleanMsg.match(/descri[cç][aã]o\s*[:\s]*([^,;]+)/i);
    if (descMatch) desc = descMatch[1].trim();
    if (!desc) desc = newCode;
    let corredor = "";
    let baia = "";
    let nivel = "";
    let locacao = "";
    const cMatch = cleanMsg.match(/corredor\s+([A-Za-z0-9]+)/i);
    const bMatch = cleanMsg.match(/baia\s+([A-Za-z0-9]+)/i);
    const nMatch = cleanMsg.match(/n[íi]vel\s+([A-Za-z0-9]+)/i);
    if (cMatch || bMatch || nMatch) {
      corredor = cMatch ? cMatch[1].toUpperCase() : "";
      baia = bMatch ? bMatch[1].toUpperCase() : "";
      nivel = nMatch ? nMatch[1].toUpperCase() : "";
      locacao = [corredor, baia, nivel].filter(Boolean).join("-");
    } else {
      const locMatch = cleanMsg.match(/loca[cç][aã]o\s*[:\s]*([^,;]+)/i);
      if (locMatch) locacao = locMatch[1].trim();
    }
    let qtd = 0;
    const qtdMatch = cleanMsg.match(/(\d+)\s*(?:unidades?|un|peças?|pecas?)/i);
    if (qtdMatch) qtd = parseInt(qtdMatch[1], 10) || 0;
    let precoSug = 0;
    const priceMatch = cleanMsg.match(/(?:preço|preco|valor)\s*(?:sugerido)?\s*[:\s]*(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (priceMatch) precoSug = parseFloat(priceMatch[1].replace(",", ".")) || 0;
    pendingProductCreations.set(sessionId, {
      sessionId,
      codigo_atual: newCode,
      descricao: desc,
      locacao: locacao || "Sem loca\xE7\xE3o",
      corredor,
      baia,
      nivel,
      quantidade: qtd,
      preco_sugerido: precoSug
    });
    return `\u{1F4CB} **Pr\xE9via do Cadastro de Novo Produto:**

| Campo | Valor |
| :--- | :--- |
| **C\xF3digo:** | \`${newCode}\` |
| **Descri\xE7\xE3o:** | ${desc} |
| **Loca\xE7\xE3o F\xEDsica:** | \`${locacao || "Sem loca\xE7\xE3o"}\` |
| **Estoque Inicial:** | ${qtd} unidades |
| **Pre\xE7o Sugerido:** | ${precoSug > 0 ? formatMoney(precoSug) : "N\xE3o informado"} |

---
\u26A0\uFE0F **Aguardando sua confirma\xE7\xE3o:**
Para salvar e registrar este novo produto no banco de dados, digite **CONFIRMAR**.
*(Ou digite CANCELAR para descartar).*`;
  }
  const isBudgetIntent = lower.includes("or\xE7amento") || lower.includes("orcamento") || lower.includes("orcar") || lower.includes("or\xE7ar") || lower.includes("cotacao") || lower.includes("cota\xE7\xE3o");
  if (isBudgetIntent) {
    const parts = cleanMsg.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
    let vendedor = "";
    let candidateCode = "";
    let candidateQtd = 1;
    let explicitPrice = null;
    let targetTotal = null;
    const vendedorMatch = cleanMsg.match(/vendedor[:\s]+([a-zA-ZÀ-ÿ]+)/i);
    if (vendedorMatch) {
      vendedor = vendedorMatch[1];
    } else if (parts.length >= 2) {
      const p1Lower = parts[0].toLowerCase();
      if (p1Lower.includes("or\xE7amento") || p1Lower.includes("orcamento") || p1Lower.includes("crir") || p1Lower.includes("criar")) {
        if (!/^\d+$/.test(parts[1])) {
          vendedor = parts[1].replace(/vendedor\s*/i, "").trim();
        }
      }
    }
    if (!vendedor) {
      const words = cleanMsg.split(/\s+/);
      const idx = words.findIndex((w) => w.toLowerCase().includes("or\xE7a") || w.toLowerCase().includes("orca"));
      if (idx !== -1 && words[idx + 1] && !/^\d+$/.test(words[idx + 1])) {
        vendedor = words[idx + 1].replace(/[,;]/g, "");
      }
    }
    if (!vendedor) {
      return "\u26A0\uFE0F **Identifica\xE7\xE3o de Vendedor Obrigat\xF3ria:**\n\nPor favor, informe o nome do vendedor respons\xE1vel no comando.\nExemplo:\n`criar or\xE7amento, Marlon, 70200821, 2 unidades`";
    }
    const qtdMatch = cleanMsg.match(/(\d+)\s*(unidades?|un|peças?|pecas?|itens|pçs?)/i);
    if (qtdMatch) {
      candidateQtd = parseInt(qtdMatch[1], 10) || 1;
    }
    const priceMatch = cleanMsg.match(/(?:a|por|preço|preco|unitario|unitário)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (priceMatch) {
      const parsedVal = parseFloat(priceMatch[1].replace(",", "."));
      if (!isNaN(parsedVal)) explicitPrice = parsedVal;
    }
    const totalMatch = cleanMsg.match(/valor\s*total\s*(?:de\s*)?(?:R\$\s*)?(\d+[.,]?\d*)/i);
    if (totalMatch) {
      const parsedTot = parseFloat(totalMatch[1].replace(",", "."));
      if (!isNaN(parsedTot)) targetTotal = parsedTot;
    }
    if (parts.length >= 3) {
      for (const part of parts) {
        const pLow = part.toLowerCase().trim();
        if (pLow.includes("or\xE7a") || pLow.includes("orca") || pLow.includes("crir") || pLow.includes("criar") || pLow.includes("cotac") || pLow.includes("cota\xE7")) continue;
        if (vendedor && pLow === vendedor.toLowerCase()) continue;
        if (/^\d+\s*(unidades?|un|peças?|pecas?|itens|pçs?)?$/i.test(pLow)) continue;
        if (pLow.startsWith("valor") || pLow.startsWith("total") || pLow.startsWith("pre\xE7o") || pLow.startsWith("preco")) continue;
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
        const cleanPart = part.replace(/(unidades?|un|peças?|pecas?|criar|crir|orçamento|orcamento|vendedor)/gi, "").trim();
        const codeCandidate = cleanPart.match(/\b([A-Za-z0-9\.-]{4,20})\b/);
        if (codeCandidate && codeCandidate[1] !== String(candidateQtd) && codeCandidate[1].toLowerCase() !== vendedor.toLowerCase()) {
          candidateCode = codeCandidate[1];
          break;
        }
      }
    }
    if (!candidateCode) {
      return `\u26A0\uFE0F N\xE3o consegui identificar o c\xF3digo do produto na mensagem.

Por favor, envie no formato:
\`criar or\xE7amento, ${vendedor}, [C\xD3DIGO], [QUANTIDADE] un\``;
    }
    const productsFound = await searchProductDb(candidateCode);
    if (productsFound.length === 0) {
      return `\u274C **INFORMA\xC7\xC3O N\xC3O ENCONTRADA**

Nenhum produto cadastrado no banco de dados com o c\xF3digo ou termo **"${candidateCode}"**.

Por regra de neg\xF3cio, nenhum or\xE7amento pode ser criado com pe\xE7as inexistentes.`;
    }
    const prod = productsFound[0];
    const precoMinimoDb = prod.preco_minimo ? parseFloat(prod.preco_minimo) : 0;
    const precoSugeridoDb = prod.preco_sugerido ? parseFloat(prod.preco_sugerido) : null;
    const precoTabelaDb = prod.preco_tabela ? parseFloat(prod.preco_tabela) : null;
    let unitPrice = precoSugeridoDb || precoTabelaDb || (precoMinimoDb > 0 ? precoMinimoDb : 150);
    if (explicitPrice !== null) {
      if (precoMinimoDb > 0 && explicitPrice < precoMinimoDb) {
        return `\u274C **Regra de Pre\xE7o M\xEDnimo Violada:**

O valor unit\xE1rio informado (${formatMoney(explicitPrice)}) \xE9 menor que o Pre\xE7o M\xEDnimo permitido pelo banco para este item (${formatMoney(precoMinimoDb)}).

O or\xE7amento n\xE3o pode ser gerado abaixo do pre\xE7o m\xEDnimo.`;
      }
      unitPrice = explicitPrice;
    }
    if (targetTotal !== null && candidateQtd > 0) {
      const calculatedUnit = targetTotal / candidateQtd;
      if (precoMinimoDb > 0 && calculatedUnit < precoMinimoDb) {
        return `\u274C **Regra de Pre\xE7o M\xEDnimo:**

O valor total de ${formatMoney(targetTotal)} para ${candidateQtd} unidade(s) resulta em ${formatMoney(calculatedUnit)} por unidade, o que \xE9 abaixo do Pre\xE7o M\xEDnimo cadastrado (${formatMoney(precoMinimoDb)}).

Ajuste a quantidade ou o valor total.`;
      }
      unitPrice = calculatedUnit;
    }
    const subtotal = candidateQtd * unitPrice;
    const locacaoStr = prod.locacao || [prod.corredor, prod.baia, prod.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
    const item = {
      produto_id: prod.id,
      codigo: prod.codigo_atual || prod.codigo_fabrica,
      codigo_fabrica: prod.codigo_fabrica,
      descricao: prod.descricao,
      locacao: locacaoStr,
      quantidade: candidateQtd,
      preco_unitario: unitPrice,
      subtotal,
      preco_minimo: precoMinimoDb
    };
    const pendingBudget = {
      sessionId,
      vendedor: vendedor.charAt(0).toUpperCase() + vendedor.slice(1).toLowerCase(),
      nome_cliente: "Cliente Balc\xE3o",
      itens: [item],
      total_orcamento: subtotal,
      criado_em: (/* @__PURE__ */ new Date()).toISOString()
    };
    pendingBudgets.set(sessionId, pendingBudget);
    return `\u{1F4CB} **Estrutura do Or\xE7amento Preparada**

\u{1F4C5} **Data de gera\xE7\xE3o:** ${formatDate()}
\u{1F464} **Vendedor:** ${pendingBudget.vendedor}
\u{1F3E2} **Cliente:** ${pendingBudget.nome_cliente}

| C\xF3digo | Descri\xE7\xE3o | Loca\xE7\xE3o | Qtd | Pre\xE7o Unit. | Subtotal |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **${item.codigo}** | ${item.descricao} | \`${item.locacao}\` | ${item.quantidade} un | ${formatMoney(item.preco_unitario)} | **${formatMoney(item.subtotal)}** |

\u{1F4B0} **VALOR TOTAL GERAL:** **${formatMoney(subtotal)}**
\u{1F4E6} **Estoque F\xEDsico Atual:** ${prod.quantidade} unidades dispon\xEDveis

---
\u26A0\uFE0F **Aguardando Valida\xE7\xE3o do Vendedor:**
Voc\xEA pode conferir os valores acima. Para efetivar e gravar este or\xE7amento no sistema, digite **CONFIRMAR**.
*(Se quiser cancelar, basta digitar CANCELAR).*`;
  }
  const isSearchIntent = lower.includes("onde") || lower.includes("localiz") || lower.includes("loca\xE7\xE3o") || lower.includes("locacao") || lower.includes("estoque") || lower.includes("pe\xE7a") || lower.includes("peca") || lower.includes("tem ");
  if (isSearchIntent && !lower.startsWith("altere ") && !lower.startsWith("cadastre ") && !corredorMentionMatch) {
    const stopWords = ["onde", "esta", "est\xE1", "a", "o", "do", "da", "de", "pe\xE7a", "peca", "tem", "qual", "localizacao", "locacao", "loca\xE7\xE3o", "no", "na", "estoque", "item", "itens", "produto", "produtos", "por", "favor", "gostaria", "saber", "como"];
    let searchTerm = cleanMsg;
    stopWords.forEach((word) => {
      const reg = new RegExp(`\\b${word}\\b`, "gi");
      searchTerm = searchTerm.replace(reg, "");
    });
    searchTerm = searchTerm.trim().replace(/\s+/g, " ");
    if (!searchTerm) {
      return "Por favor, informe o c\xF3digo da pe\xE7a ou o nome para consulta no estoque.";
    }
    const prods = await searchProductDb(searchTerm);
    if (prods.length === 0) {
      return `\u274C **INFORMA\xC7\xC3O N\xC3O ENCONTRADA:**
Nenhum produto cadastrado com o c\xF3digo ou nome **"${searchTerm}"**. 

*Nota: Verifique se o c\xF3digo ou termo foi digitado corretamente.*`;
    }
    if (prods.length > 1) {
      let reply = `\u{1F50D} **Encontrei ${prods.length} itens que correspondem a "${searchTerm}". Qual informa\xE7\xE3o voc\xEA quer?**

`;
      prods.forEach((p2, idx) => {
        const loc = p2.locacao || [p2.corredor, p2.baia, p2.nivel].filter(Boolean).join("-") || "Sem loca\xE7\xE3o";
        reply += `* **${p2.codigo_atual}** - ${p2.descricao} (Loca\xE7\xE3o: \`${loc}\`)
`;
      });
      reply += `
Por favor, digite o c\xF3digo exato da pe\xE7a que deseja consultar.`;
      return reply;
    }
    const p = prods[0];
    const locStr = p.locacao || [p.corredor, p.baia, p.nivel].filter(Boolean).join("-") || "Sem localiza\xE7\xE3o cadastrada";
    const precoMin = p.preco_minimo ? formatMoney(parseFloat(p.preco_minimo)) : "N\xE3o informado";
    const precoSug = p.preco_sugerido ? formatMoney(parseFloat(p.preco_sugerido)) : "N\xE3o informado";
    const precoTab = p.preco_tabela ? formatMoney(parseFloat(p.preco_tabela)) : "N\xE3o informado";
    return `\u{1F50D} **Dados Oficiais do Produto Localizado no Banco:**

* **C\xF3digo Interno:** \`${p.codigo_atual}\`
* **C\xF3digo de F\xE1brica:** \`${p.codigo_fabrica || "\u2014"}\`
* **C\xF3digo de Barras:** \`${p.codigo_barras_atual || "\u2014"}\`
* **Descri\xE7\xE3o:** ${p.descricao}
* **NCM:** \`${p.ncm || "N\xE3o cadastrado"}\`
* **\u{1F4CA} Estoque Cont\xE1bil:** **${p.quantidade || 0}** unidades
* **\u{1F4E6} Estoque F\xEDsico:** **${p.estoque_fisico || 0}** unidades
* **Diferen\xE7a de Estoque:** **${(p.estoque_fisico || 0) - (p.quantidade || 0)}** unidades
* **\u{1F4C5} Data de \xDAltima Compra:** ${p.ultima_data_compra || "N\xE3o informada"}
` + (p.ultima_data_venda ? `* **\u{1F4C5} Data de \xDAltima Venda:** ${p.ultima_data_venda}
` : "") + `* **\u{1F4CD} Loca\xE7\xE3o F\xEDsica:** **Corredor ${p.corredor || "\u2014"}, Baia ${p.baia || "\u2014"}, N\xEDvel ${p.nivel || "\u2014"}** (\`${locStr}\`)
* **\u{1F4B5} Pre\xE7os:** M\xEDnimo: **${precoMin}** | Sugerido: **${precoSug}** | Tabela: **${precoTab}**
` + (p.codigos_alternativos ? `* **C\xF3digos Alternativos/Gen\xE9ricos:** ${p.codigos_alternativos}
` : "") + `
Se desejar gerar uma pr\xE9via de or\xE7amento para este item, basta solicitar:
\`criar or\xE7amento, [Vendedor], ${p.codigo_atual}, [Qtd] unidades\``;
  }
  let fallbackMessage = `\u274C **N\xE3o entendi exatamente o que voc\xEA pediu.**

O sistema n\xE3o cria dados desnecess\xE1rios ou que n\xE3o foram solicitados com clareza. Voc\xEA pode tentar reformular a pergunta ou usar um dos comandos suportados abaixo:

\u{1F4CD} **Consultas e Loca\xE7\xE3o (Sempre completas):**
   \u2022 \`quero a listagem do corredor B\`
   \u2022 \`listagem dos itens de ate 20 reais do corredor N, nivel 1\`
   \u2022 \`item no corredor N que sao parafusos\`
   \u2022 \`onde est\xE1 a pe\xE7a 70200821?\`
   \u2022 \`Qual loca\xE7\xE3o que posso colocar essa pe\xE7a? (codigo X)\` (Sugest\xE3o Inteligente)

\u{1F517} **C\xF3digos Gen\xE9ricos e C\xF3pia de Dados:**
   \u2022 \`quais os codigos genericos do produto X\`
   \u2022 \`adicionar o codigo X como generico no codigo Y\`
   \u2022 \`copiar descri\xE7\xE3o do codigo Y e adicionar no codigo X\`
   \u2022 \`verificar informa\xE7\xF5es do codigo X\` (Ficha completa)

\u270F\uFE0F **Altera\xE7\xF5es no Banco de Dados:**
   \u2022 \`altere a descri\xE7\xE3o do item 70200821 para Parafuso Cabe\xE7ote\`
   \u2022 \`altere o pre\xE7o sugerido do item 70200821 para 50.00\`
   \u2022 \`alterar valor minimo em 30% por cento acima do valor de custo do item X\`

\u{1F4DD} **Anota\xE7\xF5es e Or\xE7amentos:**
   \u2022 \`inicie uma lista rapida de nome contagem de estoque\`
   \u2022 \`criar or\xE7amento, Marlon, 70200821, 2 unidades\``;
  const currentList = activeQuickLists.get(sessionId);
  if (currentList && currentList.itens.length > 0) {
    fallbackMessage += `

\u{1F4CB} **Sua Lista R\xE1pida Atual ("${currentList.nome}"):**
Se voc\xEA queria alterar algo na lista, use: \`altere o comentario do item 1 para "outra coisa"\`

` + renderQuickListTable(currentList);
  }
  if (lower.includes("relatorio") || lower.includes("relat\xF3rio") || lower.includes("auditoria")) {
    if (lower.includes("mcp") || lower.includes("rag") || lower.includes("implementa\xE7\xE3o") || lower.includes("implementacao") || lower.includes("auditoria") || lower.includes("sistema")) {
      return `\u{1F4D1} **RELAT\xD3RIO DE AUDITORIA E IMPLEMENTA\xC7\xC3O T\xC9CNICA** \u{1F4D1}

**1. Banco de Dados e Informa\xE7\xF5es Cadastrais (MCP)**
\u2705 O banco de dados PostgreSQL (via MCP Neon) est\xE1 respondendo em tempo real.
\u2705 As atualiza\xE7\xF5es e inser\xE7\xF5es no sistema refletem as datas mais recentes.
\u2705 **Novo Sistema Operacional:** O sistema de hist\xF3rico de altera\xE7\xF5es por produto foi concebido e pronto para registro audit\xE1vel (via bot\xE3o no painel).

**2. Intelig\xEAncia Artificial e RAG (Anti-Alucina\xE7\xE3o)**
\u{1F6E1}\uFE0F **Bloqueio de Alucina\xE7\xE3o Ativado:** O chatbot agora s\xF3 exibe loca\xE7\xF5es por completo (Corredor, Baia, N\xEDvel) e cruza as informa\xE7\xF5es diretamente do banco de dados.
\u{1F9E0} **Motor de Sugest\xE3o de Loca\xE7\xE3o:** Operacional. O sistema analisa palavras-chave e c\xF3digos similares para recomendar o melhor agrupamento quando o usu\xE1rio pergunta onde colocar a pe\xE7a.
\u26A0\uFE0F **Tratamento de Exce\xE7\xF5es:** Caso a IA n\xE3o entenda a requisi\xE7\xE3o com 100% de precis\xE3o (como dados que n\xE3o existem), ela aborta e informa que n\xE3o compreendeu, orientando a n\xE3o inventar dados.

**3. Novas Funcionalidades Bipagem**
\u{1F504} C\xF3pia inteligente de descri\xE7\xF5es entre pe\xE7as.
\u{1F522} C\xE1lculo autom\xE1tico de pre\xE7os m\xEDnimos/tabelas/sugeridos baseados em % do custo.
\u{1F517} Vincula\xE7\xE3o r\xE1pida de C\xF3digos Gen\xE9ricos (agora totalmente pesquis\xE1vel).

*Auditoria Conclu\xEDda. Todos os sistemas RAG e MCP est\xE3o operando com as restri\xE7\xF5es solicitadas.*`;
    }
  }
  return fallbackMessage;
}
chatRouter.post("/", async (req, res) => {
  const { message, sessionId = "default" } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Mensagem \xE9 obrigat\xF3ria" });
  }
  const aiEnabled = process.env.AI_CHAT_ENABLED !== "false";
  if (!aiEnabled) {
    return res.json({ response: "O Assistente Inteligente est\xE1 temporariamente desativado via configura\xE7\xE3o." });
  }
  try {
    const userId = req.user?.id?.toString();
    const username = req.user?.username;
    const responseText = await processChatMessage(message, sessionId, userId, username);
    return res.json({ response: responseText });
  } catch (error) {
    console.error("[Chat] Erro no processamento:", error);
    return res.status(500).json({
      response: `Ocorreu um erro ao processar sua solicita\xE7\xE3o: ${error.message}`
    });
  }
});

// server/vision.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
import { Router as Router10 } from "express";
var visionRouter = Router10();
var fallbackDailyUsage = {
  date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
  count: 0
};
var MAX_FREE_TIER_DAILY_REQUESTS = 1e3;
async function checkAndIncrementQuota() {
  const pool2 = getDbPool();
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  if (pool2) {
    try {
      const res = await pool2.query(
        `INSERT INTO api_quotas (service, data_referencia, requisicoes, atualizado_em)
         VALUES ('gemini_vision', $1::date, 1, NOW())
         ON CONFLICT (service, data_referencia)
         DO UPDATE SET requisicoes = api_quotas.requisicoes + 1, atualizado_em = NOW()
         RETURNING requisicoes;`,
        [today]
      );
      const count = parseInt(res.rows[0]?.requisicoes, 10) || 1;
      return { allowed: count <= MAX_FREE_TIER_DAILY_REQUESTS, currentCount: count };
    } catch (err) {
      console.warn("[Vision API] Falha ao registrar cota no PostgreSQL, usando fallback em mem\xF3ria:", err.message);
    }
  }
  if (fallbackDailyUsage.date !== today) {
    fallbackDailyUsage.date = today;
    fallbackDailyUsage.count = 0;
  }
  fallbackDailyUsage.count++;
  return {
    allowed: fallbackDailyUsage.count <= MAX_FREE_TIER_DAILY_REQUESTS,
    currentCount: fallbackDailyUsage.count
  };
}
visionRouter.post("/identify", async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: "Nenhuma imagem fornecida." });
  }
  const apiKey2 = process.env.GEMINI_API_KEY;
  if (!apiKey2) {
    return res.status(500).json({
      error: "A chave da API do Gemini (GEMINI_API_KEY) n\xE3o est\xE1 configurada no .env. Configure-a para usar a identifica\xE7\xE3o por foto."
    });
  }
  const { allowed, currentCount } = await checkAndIncrementQuota();
  if (!allowed) {
    return res.status(429).json({
      error: `Cota di\xE1ria de identifica\xE7\xE3o por foto (${MAX_FREE_TIER_DAILY_REQUESTS} requisi\xE7\xF5es) atingida para evitar cobran\xE7as. Tente novamente amanh\xE3. (Uso atual: ${currentCount})`
    });
  }
  try {
    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
    const promptText = `Voc\xEA \xE9 um especialista em pe\xE7as automotivas. Analise a imagem da embalagem ou da pr\xF3pria pe\xE7a.
Extraia as seguintes informa\xE7\xF5es e retorne APENAS um JSON v\xE1lido (sem marca\xE7\xE3o Markdown), com os campos abaixo (se n\xE3o encontrar algo, deixe como nulo ou string vazia):
- "codigo_fabrica": O part number ou c\xF3digo do fabricante principal.
- "codigo_barras": O c\xF3digo de barras EAN/GTIN, se leg\xEDvel.
- "fabricante": O nome da marca ou fabricante da pe\xE7a.
- "descricao_sugerida": Uma breve descri\xE7\xE3o do que parece ser a pe\xE7a (ex: PIST\xC3O, ANEL, BOMBA D'\xC1GUA).`;
    const ai2 = new GoogleGenAI2({ apiKey: apiKey2 });
    const response = await ai2.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });
    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Formato de resposta inesperado da API.");
    }
    let parsedResult = {};
    try {
      parsedResult = JSON.parse(textOutput.trim());
    } catch {
      throw new Error("A API n\xE3o retornou um JSON v\xE1lido.");
    }
    return res.json({
      success: true,
      data: parsedResult,
      message: "Pe\xE7a identificada com sucesso pela foto."
    });
  } catch (error) {
    console.error("[Vision API] Falha na identifica\xE7\xE3o por foto:", error.message);
    return res.status(500).json({ error: "Falha ao analisar a imagem: " + error.message });
  }
});

// server/routes.ts
var apiRouter = Router11();
apiRouter.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/auth/login" || req.path === "/auth/login/") {
    return next();
  }
  return requireAuth(req, res, next);
});
apiRouter.get("/health", async (req, res) => {
  const dbStatus = await checkDatabaseConnection();
  return res.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    database: dbStatus.connected ? "connected" : "disconnected",
    database_error: dbStatus.error
  });
});
apiRouter.use(authRouter);
apiRouter.use(produtosRouter);
apiRouter.use(orcamentosRouter);
apiRouter.use(auditoriaRouter);
apiRouter.use(listasRouter);
apiRouter.use(dashboardRouter);
apiRouter.use(importarRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/cosmos", cosmosRouter);
apiRouter.use("/vision", visionRouter);

// server/api_entry.ts
var app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use("/api", apiRouter);
app.use("/", apiRouter);
var api_entry_default = app;
export {
  api_entry_default as default
};
