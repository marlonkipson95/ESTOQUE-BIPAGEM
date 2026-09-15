/**
 * Kipson Estoque - TypeScript Types & Data Models
 */

export type CodeType = 'codigo_barras' | 'codigo_produto' | 'codigo_fabrica' | 'codigo_alternativo';

export interface RelatedProductSummary {
  id: string;
  codigo_atual: string; // Código Interno Único
  descricao: string;
  codigo_barras_atual?: string;
  codigo_fabrica?: string;
  codigos_alternativos?: string[];
  quantidade: number;
  locacao?: string;
  corredor?: string;
  baia?: string;
  nivel?: string;
  motivo?: string;
}

export interface ProductCodeHistory {
  id: string;
  produto_id: string; // Stable internal ID
  tipo: CodeType;
  codigo: string;
  ativo: boolean;
  criado_em: string;
  desativado_em?: string;
  motivo?: string;
}

export interface Product {
  id: string; // Stable internal system ID (e.g. 'PRD-001258') - NEVER changes
  codigo_atual: string; // Código Interno ÚNICO do produto (ex: '00001258' ou 'PRD-0001')
  codigo_fabrica: string; // Factory/Original part number (e.g. 'ABC-4589')
  descricao: string; // Product name/description
  custo_unitario: number; // Unit cost in BRL (exibido apenas em visualização detalhada)
  preco_tabela?: number; // Preço Tabela
  preco_sugerido?: number; // Preço Sugerido
  preco_minimo?: number; // Preço Mínimo
  quantidade: number; // Current stock count
  estoque_minimo?: number; // Minimum safe stock
  codigo_barras_atual: string; // Current active barcode / EAN (e.g. '7891234567890')
  codigos_alternativos?: string[]; // Códigos alternativos adicionais apontando para este mesmo produto
  produtos_relacionados?: RelatedProductSummary[]; // Lista de produtos genéricos / similares relacionados
  corredor: string; // Aisle (e.g. '03')
  baia: string; // Bay (e.g. 'B12')
  nivel: string; // Shelf Level (e.g. '04')
  locacao: string; // Full location tag (e.g. 'C-03-B12-04') ou 'SEM LOCALIZAÇÃO'
  criado_em: string;
  atualizado_em: string;
}

export interface ImportComparisonChange {
  field: string;
  label: string;
  currentValue: string;
  newValue: string;
}

export interface ImportComparisonItem {
  id: string;
  status: 'novo' | 'sem_alteracao' | 'com_alteracao';
  matchedBy?: 'codigo_interno' | 'codigo_barras' | 'codigo_fabrica' | 'codigo_alternativo';
  existingProduct?: Product;
  importData: Partial<Product>;
  changes: ImportComparisonChange[];
  selected: boolean;
}

export type ScanMatchStatus = 
  | 'found_current' // Step 1: Found via current barcode or product code
  | 'found_historical' // Step 2: Found via historical code (Old code warning)
  | 'found_associated' // Step 3: Barcode unknown, but factory or other code matches
  | 'not_found'; // Step 4: No match at all

export interface ScanResult {
  code: string;
  status: ScanMatchStatus;
  product?: Product;
  matchedCodeHistory?: ProductCodeHistory;
  message?: string;
  timestamp: string;
}

export interface StockMovement {
  id: string;
  produto_id: string;
  tipo: 'recebimento' | 'ajuste' | 'alteracao_codigo' | 'alteracao_localizacao';
  quantidade: number;
  quantidade_anterior: number;
  detalhes: string;
  data: string;
  usuario: string;
}

export interface DatabaseHealth {
  status: string;
  database: 'connected' | 'disconnected';
  provider?: string;
  error?: string | null;
}

export interface AuditLog {
  id: number;
  produto_id: string;
  campo: string;
  valor_anterior?: string;
  valor_novo?: string;
  motivo?: string;
  usuario: string;
  criado_em: string;
}

export interface DashboardStats {
  total_produtos: number;
  com_estoque: number;
  sem_estoque: number;
  sem_localizacao: number;
  sem_codigo_barras: number;
  codigos_alterados_recentes: number;
  ultimas_importacoes: ImportBatch[];
}

export interface ImportBatch {
  id: string;
  arquivo: string;
  data: string;
  usuario: string;
  total: number;
  novos: number;
  atualizados: number;
  erros: number;
}

export interface ImportProfile {
  id: string;
  nome: string;
  mapeamento: Record<string, string>; // { "EAN": "codigo_barras_atual", "COD": "codigo_fabrica" }
  criado_em: string;
}

export interface SystemSettings {
  nomeSistema: string;
  tema: 'light' | 'dark' | 'system';
  beepSom: boolean;
  vibracao: boolean;
  autoLimparSegundos: number; // 0 = never, or 5, 10, 15
  exigirConfirmacaoAtualizacao: boolean; // Must confirm code updates
  corredoresPredefinidos: string[];
  baiasPredefinidas: string[];
  niveisPredefinidos: string[];
  mascaraLocacao: string;
  neonDatabase: {
    conectado: boolean;
    ultimaSincronizacao?: string;
  };
}

export interface SystemUser {
  id: number | string;
  username: string;
  password?: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  criado_em?: string;
  ultimo_login?: string;
}

export interface AuthSession {
  isAuthenticated: boolean;
  user: SystemUser | null;
  token?: string;
}

export interface ScannedLabelInfo {
  raw: string;
  codigo_barras?: string;
  codigo_fabrica?: string;
  codigo_interno?: string;
  fabricante?: string;
  descricao_sugerida?: string;
}

export type AppModule = 
  | 'dashboard'
  | 'bipagem'
  | 'consulta'
  | 'produtos'
  | 'usuarios'
  | 'importacao'
  | 'configuracoes';

export interface ConsultaFilters {
  searchTerm: string;
  corredor: string;
  baia: string;
  nivel: string;
  locacao: string;
  estoque: 'todos' | 'com_estoque' | 'sem_estoque' | 'baixo_estoque';
  cadastro: 'todos' | 'com_barras' | 'sem_barras' | 'com_locacao' | 'sem_locacao';
  tipoCodigo: 'todos' | 'codigo_atual' | 'codigo_antigo' | 'codigo_barras' | 'codigo_fabrica';
}

export interface ImportParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  mapped: Partial<Product>;
  status: 'novo' | 'atualizacao' | 'conflito' | 'invalido';
  conflictReason?: string;
  existingProduct?: Product;
}
