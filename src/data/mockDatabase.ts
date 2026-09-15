import { Product, ProductCodeHistory, StockMovement, ImportBatch, ImportProfile, SystemSettings } from '../types';

// Base de dados inicial limpa - sem dados fictícios (apenas mercadorias reais cadastradas/sincronizadas)
export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_CODE_HISTORY: ProductCodeHistory[] = [];

export const INITIAL_MOVEMENTS: StockMovement[] = [];

export const INITIAL_IMPORT_BATCHES: ImportBatch[] = [];

export const INITIAL_PROFILES: ImportProfile[] = [
  {
    id: 'PROF-A',
    nome: 'FORNECEDOR A (PADRÃO DISTRIBUIDOR)',
    mapeamento: {
      'CODIGO': 'codigo_fabrica',
      'DESCRICAO': 'descricao',
      'PRECO': 'custo_unitario',
      'ESTOQUE': 'quantidade',
      'EAN': 'codigo_barras_atual',
    },
    criado_em: '2026-01-10T10:00:00Z',
  },
  {
    id: 'PROF-B',
    nome: 'FORNECEDOR B (SISTEMA INTERNO ANTIGO)',
    mapeamento: {
      'COD_PROD': 'codigo_atual',
      'REF_ORIG': 'codigo_fabrica',
      'ITEM_NOME': 'descricao',
      'COD_BARRAS': 'codigo_barras_atual',
      'VALOR': 'custo_unitario',
      'SALDO': 'quantidade',
      'CORREDOR': 'corredor',
      'BAIA': 'baia',
      'NIVEL': 'nivel',
      'LOCACAO': 'locacao',
    },
    criado_em: '2026-01-20T14:00:00Z',
  }
];

export const DEFAULT_SETTINGS: SystemSettings = {
  nomeSistema: 'KIPSON ESTOQUE',
  tema: 'light',
  beepSom: true,
  vibracao: true,
  autoLimparSegundos: 0,
  exigirConfirmacaoAtualizacao: true,
  corredoresPredefinidos: ['01', '02', '03', '04', '05', '06', '07', '08'],
  baiasPredefinidas: ['A01', 'A02', 'A03', 'A05', 'B04', 'B12', 'C01', 'C09', 'D08', 'E02'],
  niveisPredefinidos: ['01', '02', '03', '04', '05'],
  mascaraLocacao: 'C-{corredor}-B{baia}-{nivel}',
  neonDatabase: {
    conectado: true,
    ultimaSincronizacao: new Date().toISOString(),
  },
};
