import {
  Product,
  ProductCodeHistory,
  StockMovement,
  ImportBatch,
  ImportProfile,
  SystemSettings,
  ScanResult,
  CodeType
} from '../types';
import { apiService } from './apiService';
import {
  INITIAL_PRODUCTS,
  INITIAL_CODE_HISTORY,
  INITIAL_MOVEMENTS,
  INITIAL_IMPORT_BATCHES,
  INITIAL_PROFILES,
  DEFAULT_SETTINGS
} from '../data/mockDatabase';

const STORAGE_KEYS = {
  PRODUCTS: 'kipson_products_v1',
  CODE_HISTORY: 'kipson_code_history_v1',
  MOVEMENTS: 'kipson_movements_v1',
  IMPORT_BATCHES: 'kipson_import_batches_v1',
  IMPORT_PROFILES: 'kipson_import_profiles_v1',
  SETTINGS: 'kipson_settings_v1',
};

class StorageService {
  private inMemoryProducts: Product[] | null = null;

  constructor() {
    this.cleanupLegacyFictitiousData();
  }

  // Limpa resquícios de produtos e movimentações fictícias que possam ter ficado no localStorage
  cleanupLegacyFictitiousData(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      if (stored) {
        const prods = JSON.parse(stored);
        if (Array.isArray(prods)) {
          const demoIds = new Set([
            'PRD-MWM-922688', 'PRD-0001', 'PRD-0002', 'PRD-0003', 'PRD-0004',
            'PRD-00001258', 'PRD-00001259', 'PRD-00001260', 'PRD-00001261',
            'PRD-00001262', 'PRD-00001263', 'PRD-00001264', 'PRD-00001265',
            'PRD-00001266', 'PRD-00001267', 'PRD-00001268', 'PRD-00001269',
            'PRD-00001270'
          ]);
          const cleaned = prods.filter((p: any) => !demoIds.has(p.id));
          if (cleaned.length !== prods.length) {
            localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(cleaned));
          }
        }
      }
      const movStored = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
      if (movStored) {
        const movs = JSON.parse(movStored);
        if (Array.isArray(movs)) {
          const cleanedMovs = movs.filter((m: any) => !['MOV-101', 'MOV-102', 'MOV-103'].includes(m.id));
          localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(cleanedMovs));
        }
      }
      const batchStored = localStorage.getItem(STORAGE_KEYS.IMPORT_BATCHES);
      if (batchStored) {
        const batches = JSON.parse(batchStored);
        if (Array.isArray(batches)) {
          const cleanedBatches = batches.filter((b: any) => b.id !== 'IMP-001');
          localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(cleanedBatches));
        }
      }
    } catch (e) {
      console.error('Erro ao limpar dados fictícios de versões anteriores:', e);
    }
  }

  private get<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e: any) {
      console.warn(`[Storage] Armazenamento local da chave "${key}" mantido na memória RAM:`, e?.message);
    }
  }

  // --- Products ---
  getProducts(): Product[] {
    if (this.inMemoryProducts && this.inMemoryProducts.length > 0) {
      return this.inMemoryProducts;
    }
    const fromStorage = this.get<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    this.inMemoryProducts = fromStorage;
    return fromStorage;
  }

  saveProducts(products: Product[]): void {
    this.inMemoryProducts = products;
    this.set(STORAGE_KEYS.PRODUCTS, products);
  }

  getProductById(id: string): Product | undefined {
    return this.getProducts().find(p => p.id === id);
  }

  // --- Code History ---
  getCodeHistory(): ProductCodeHistory[] {
    return this.get<ProductCodeHistory[]>(STORAGE_KEYS.CODE_HISTORY, INITIAL_CODE_HISTORY);
  }

  saveCodeHistory(history: ProductCodeHistory[]): void {
    this.set(STORAGE_KEYS.CODE_HISTORY, history);
  }

  getHistoryByProductId(productId: string): ProductCodeHistory[] {
    return this.getCodeHistory()
      .filter(h => h.produto_id === productId)
      .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
  }

  getProductHistory(productId: string): ProductCodeHistory[] {
    return this.getHistoryByProductId(productId);
  }

  // --- Movements ---
  getMovements(): StockMovement[] {
    return this.get<StockMovement[]>(STORAGE_KEYS.MOVEMENTS, INITIAL_MOVEMENTS);
  }

  addMovement(movement: Omit<StockMovement, 'id' | 'data'>): StockMovement {
    const movements = this.getMovements();
    const newMovement: StockMovement = {
      ...movement,
      id: `MOV-${Date.now().toString().slice(-6)}`,
      data: new Date().toISOString(),
    };
    const updated = [newMovement, ...movements];
    this.set(STORAGE_KEYS.MOVEMENTS, updated);
    return newMovement;
  }

  // --- Import Batches ---
  getImportBatches(): ImportBatch[] {
    return this.get<ImportBatch[]>(STORAGE_KEYS.IMPORT_BATCHES, INITIAL_IMPORT_BATCHES);
  }

  addImportBatch(batch: Omit<ImportBatch, 'id' | 'data'>): ImportBatch {
    const batches = this.getImportBatches();
    const newBatch: ImportBatch = {
      ...batch,
      id: `IMP-${Date.now().toString().slice(-6)}`,
      data: new Date().toISOString(),
    };
    const updated = [newBatch, ...batches];
    this.set(STORAGE_KEYS.IMPORT_BATCHES, updated);
    return newBatch;
  }

  // --- Profiles ---
  getImportProfiles(): ImportProfile[] {
    return this.get<ImportProfile[]>(STORAGE_KEYS.IMPORT_PROFILES, INITIAL_PROFILES);
  }

  saveImportProfile(profile: Omit<ImportProfile, 'id' | 'criado_em'>): ImportProfile {
    const profiles = this.getImportProfiles();
    const existingIndex = profiles.findIndex(p => p.nome.trim().toUpperCase() === profile.nome.trim().toUpperCase());
    
    if (existingIndex >= 0) {
      profiles[existingIndex] = {
        ...profiles[existingIndex],
        mapeamento: profile.mapeamento,
      };
      this.set(STORAGE_KEYS.IMPORT_PROFILES, profiles);
      return profiles[existingIndex];
    } else {
      const newProfile: ImportProfile = {
        ...profile,
        id: `PROF-${Date.now().toString().slice(-5)}`,
        criado_em: new Date().toISOString(),
      };
      const updated = [...profiles, newProfile];
      this.set(STORAGE_KEYS.IMPORT_PROFILES, updated);
      return newProfile;
    }
  }

  deleteImportProfile(id: string): void {
    const profiles = this.getImportProfiles().filter(p => p.id !== id);
    this.set(STORAGE_KEYS.IMPORT_PROFILES, profiles);
  }

  // --- Settings ---
  getSettings(): SystemSettings {
    return this.get<SystemSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }

  saveSettings(settings: SystemSettings): void {
    this.set(STORAGE_KEYS.SETTINGS, settings);
  }

  // --- Core Deterministic Barcode Scanning Engine (Stages 1-4) ---
  scanCode(rawCode: string): ScanResult {
    const code = rawCode.trim();
    if (!code) {
      return {
        code,
        status: 'not_found',
        message: 'Código em branco',
        timestamp: new Date().toISOString(),
      };
    }

    const cleanNorm = (str?: string) => (str ? str.replace(/[\s\.-]/g, '').toLowerCase() : '');
    const stripLeadingZeroes = (str?: string) => (str ? str.replace(/^0+/, '') : '');

    const normalizedInput = cleanNorm(code);
    const codeLower = code.toLowerCase();
    const strippedInput = stripLeadingZeroes(normalizedInput);

    const matchesCode = (target?: string) => {
      if (!target) return false;
      const targetLower = target.toLowerCase();
      if (targetLower === codeLower) return true;
      const targetNorm = cleanNorm(target);
      if (targetNorm.length > 0 && targetNorm === normalizedInput) return true;
      if (strippedInput.length >= 6 && stripLeadingZeroes(targetNorm) === strippedInput) return true;
      return false;
    };

    const products = this.getProducts();
    const codeHistory = this.getCodeHistory();

    // ETAPA 1: Pesquisar código de barras atual, código interno atual, código de fábrica ou códigos alternativos
    const exactCurrentMatch = products.find(
      p => matchesCode(p.codigo_barras_atual) ||
           matchesCode(p.codigo_atual) ||
           matchesCode(p.codigo_fabrica) ||
           (Array.isArray(p.codigos_alternativos) && p.codigos_alternativos.some(alt => matchesCode(alt)))
    );

    if (exactCurrentMatch) {
      const matchType = matchesCode(exactCurrentMatch.codigo_barras_atual)
        ? 'código de barras EAN atual'
        : matchesCode(exactCurrentMatch.codigo_fabrica)
        ? 'código de fábrica'
        : (Array.isArray(exactCurrentMatch.codigos_alternativos) && exactCurrentMatch.codigos_alternativos.some(alt => matchesCode(alt)))
        ? 'código alternativo'
        : 'código interno';

      return {
        code,
        status: 'found_current',
        product: exactCurrentMatch,
        message: `Mercadoria identificada com sucesso pelo ${matchType}. Dados mantidos.`,
        timestamp: new Date().toISOString(),
      };
    }

    // ETAPA 2: Pesquisar códigos históricos (códigos antigos)
    const historicalMatch = codeHistory.find(
      h => !h.ativo && (h.codigo.toLowerCase() === codeLower || cleanNorm(h.codigo) === normalizedInput)
    );

    if (historicalMatch) {
      const parentProduct = products.find(p => p.id === historicalMatch.produto_id);
      if (parentProduct) {
        return {
          code,
          status: 'found_historical',
          product: parentProduct,
          matchedCodeHistory: historicalMatch,
          message: 'Atenção: Este é um código antigo já registrado para este produto. Dados mantidos.',
          timestamp: new Date().toISOString(),
        };
      }
    }

    // ETAPA 3: Código de barras desconhecido, mas coincide com código de fábrica
    const factoryMatch = products.find(
      p => matchesCode(p.codigo_fabrica)
    );

    if (factoryMatch) {
      return {
        code,
        status: 'found_associated',
        product: factoryMatch,
        message: 'Código de fábrica identificado. Você pode associar um novo código de barras se desejar.',
        timestamp: new Date().toISOString(),
      };
    }

    // ETAPA 4: Nenhum identificador encontrado
    return {
      code,
      status: 'not_found',
      message: 'Nenhum produto cadastrado com este identificador.',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Localiza produto por qualquer código existente (EAN, interno, fábrica, alternativo ou histórico)
   */
  findProductByAnyCode(rawCode: string): Product | undefined {
    const code = rawCode.trim();
    if (!code) return undefined;

    const cleanNorm = (str?: string) => (str ? str.replace(/[\s\.-]/g, '').toLowerCase() : '');
    const stripLeadingZeroes = (str?: string) => (str ? str.replace(/^0+/, '') : '');

    const normalizedInput = cleanNorm(code);
    const codeLower = code.toLowerCase();
    const strippedInput = stripLeadingZeroes(normalizedInput);

    const matchesCode = (target?: string) => {
      if (!target) return false;
      const targetLower = target.toLowerCase();
      if (targetLower === codeLower) return true;
      const targetNorm = cleanNorm(target);
      if (targetNorm.length > 0 && targetNorm === normalizedInput) return true;
      if (strippedInput.length >= 6 && stripLeadingZeroes(targetNorm) === strippedInput) return true;
      return false;
    };

    const products = this.getProducts();
    const current = products.find(
      p => matchesCode(p.codigo_barras_atual) ||
           matchesCode(p.codigo_atual) ||
           matchesCode(p.codigo_fabrica) ||
           (Array.isArray(p.codigos_alternativos) && p.codigos_alternativos.some(c => matchesCode(c)))
    );
    if (current) return current;

    const codeHistory = this.getCodeHistory();
    const hist = codeHistory.find(
      h => h.codigo.toLowerCase() === codeLower || cleanNorm(h.codigo) === normalizedInput
    );
    if (hist) {
      return products.find(p => p.id === hist.produto_id);
    }

    return undefined;
  }

  // --- Core Operation: Update Product Code with Historical Preservation ---
  /**
   * CRITICAL RULE 1: Never delete old code automatically.
   * CRITICAL RULE 2: Never create duplicate product because code changed.
   * CRITICAL RULE 3: Never change code without user confirmation.
   * CRITICAL RULE 4: Never lose existing location.
   */
  updateProductCode(
    productId: string,
    tipo: CodeType,
    newCode: string,
    motivo: string = 'Atualização manual confirmada pelo operador',
    userName: string = 'Operador Almoxarifado'
  ): { success: boolean; product?: Product; error?: string; message?: string } {
    const products = this.getProducts();
    const productIndex = products.findIndex(p => p.id === productId);
    if (productIndex === -1) {
      return { success: false, error: 'Produto não encontrado' };
    }

    const currentProduct = products[productIndex];
    const codeHistory = this.getCodeHistory();
    const now = new Date().toISOString();

    const cleanNewCode = newCode.trim();
    if (!cleanNewCode) {
      return { success: false, error: 'O novo código não pode ser vazio' };
    }

    let previousCode = '';
    if (tipo === 'codigo_barras') {
      previousCode = currentProduct.codigo_barras_atual;
      if (previousCode === cleanNewCode) {
        return { success: true, product: currentProduct };
      }
      currentProduct.codigo_barras_atual = cleanNewCode;
    } else if (tipo === 'codigo_produto') {
      previousCode = currentProduct.codigo_atual;
      if (previousCode === cleanNewCode) {
        return { success: true, product: currentProduct };
      }
      currentProduct.codigo_atual = cleanNewCode;
    } else if (tipo === 'codigo_fabrica') {
      previousCode = currentProduct.codigo_fabrica;
      if (previousCode === cleanNewCode) {
        return { success: true, product: currentProduct };
      }
      currentProduct.codigo_fabrica = cleanNewCode;
    }

    // Deactivate previous active code in history for this type
    const updatedHistory = codeHistory.map(h => {
      if (h.produto_id === productId && h.tipo === tipo && h.ativo) {
        return {
          ...h,
          ativo: false,
          desativado_em: now,
          motivo: `Substituído por ${cleanNewCode}. ${motivo}`,
        };
      }
      return h;
    });

    // If previous code existed and wasn't in history, record it
    if (previousCode) {
      const alreadyInHistory = updatedHistory.some(
        h => h.produto_id === productId && h.tipo === tipo && h.codigo === previousCode
      );
      if (!alreadyInHistory) {
        updatedHistory.push({
          id: `HIST-${Date.now()}-OLD`,
          produto_id: productId,
          tipo,
          codigo: previousCode,
          ativo: false,
          criado_em: currentProduct.criado_em,
          desativado_em: now,
          motivo: `Código anterior substituído por ${cleanNewCode}.`,
        });
      }
    }

    // Add new code to history as active
    updatedHistory.push({
      id: `HIST-${Date.now()}-NEW`,
      produto_id: productId,
      tipo,
      codigo: cleanNewCode,
      ativo: true,
      criado_em: now,
      motivo,
    });

    currentProduct.atualizado_em = now;
    products[productIndex] = currentProduct;

    this.saveProducts(products);
    this.saveCodeHistory(updatedHistory);

    // Audit movement log
    this.addMovement({
      produto_id: productId,
      tipo: 'alteracao_codigo',
      quantidade: currentProduct.quantidade,
      quantidade_anterior: currentProduct.quantidade,
      detalhes: `Código (${tipo}) alterado de "${previousCode || 'Nenhum'}" para "${cleanNewCode}". Motivo: ${motivo}`,
      usuario: userName,
    });

    return { success: true, product: currentProduct, message: 'Código atualizado com sucesso' };
  }

  addProduct(productData: Partial<Product> & { descricao: string }): Product {
    return this.saveProduct(productData);
  }

  updateProduct(product: Product): Product {
    return this.saveProduct(product);
  }

  recordImportBatch(arquivo: string, total: number, novos: number, atualizados: number): ImportBatch {
    return this.addImportBatch({
      arquivo,
      total,
      novos,
      atualizados,
      erros: 0,
      usuario: 'Operador Almoxarifado',
    });
  }

  exportFullDatabaseJSON(): string {
    return JSON.stringify({
      products: this.getProducts(),
      codeHistory: this.getCodeHistory(),
      movements: this.getMovements(),
      importBatches: this.getImportBatches(),
      profiles: this.getImportProfiles(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  importFullDatabaseJSON(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data.products)) this.saveProducts(data.products);
      if (Array.isArray(data.codeHistory)) this.saveCodeHistory(data.codeHistory);
      if (Array.isArray(data.movements)) this.set(STORAGE_KEYS.MOVEMENTS, data.movements);
      if (Array.isArray(data.importBatches)) this.set(STORAGE_KEYS.IMPORT_BATCHES, data.importBatches);
      if (Array.isArray(data.profiles)) this.set(STORAGE_KEYS.IMPORT_PROFILES, data.profiles);
      if (data.settings) this.saveSettings(data.settings);
      return true;
    } catch {
      return false;
    }
  }

  resetToInitialData(): void {
    this.resetToDefaultData();
  }

  // --- Save / Create Product ---
  saveProduct(productData: Partial<Product> & { descricao: string }): Product {
    const products = this.getProducts();
    const now = new Date().toISOString();

    if (productData.id) {
      // Editing existing product - preserve stable ID and location unless explicitly changed
      const index = products.findIndex(p => p.id === productData.id);
      if (index >= 0) {
        const existing = products[index];

        // Check if barcode or product code changed
        if (productData.codigo_barras_atual && productData.codigo_barras_atual !== existing.codigo_barras_atual) {
          this.updateProductCode(existing.id, 'codigo_barras', productData.codigo_barras_atual, 'Edição no formulário');
        }
        if (productData.codigo_atual && productData.codigo_atual !== existing.codigo_atual) {
          this.updateProductCode(existing.id, 'codigo_produto', productData.codigo_atual, 'Edição no formulário');
        }
        if (productData.codigo_fabrica && productData.codigo_fabrica !== existing.codigo_fabrica) {
          this.updateProductCode(existing.id, 'codigo_fabrica', productData.codigo_fabrica, 'Edição no formulário');
        }

        const updated: Product = {
          ...existing,
          ...productData,
          id: existing.id, // Stable ID guaranteed
          corredor: productData.corredor ?? existing.corredor,
          baia: productData.baia ?? existing.baia,
          nivel: productData.nivel ?? existing.nivel,
          locacao: productData.locacao ?? existing.locacao,
          atualizado_em: now,
        };

        products[index] = updated;
        this.saveProducts(products);

        // Sincronizar edição no banco PostgreSQL em segundo plano
        apiService.updateProduct(existing.id, updated).catch(err => {
          console.warn('[StorageService] Atualização no backend PostgreSQL adiada:', err.message);
        });

        return updated;
      }
    }

    // REGRA DE OURO: Prevenção rigorosa de duplicidade ao bipar/salvar mercadoria
    // "quando bipar a mercadoria, se bipar duas vezes o mesmo codigo EAN, o sistema nao pode criar um novo, ele tem apenas que entender que é a mesma mercadoria e manter os dados"
    const cleanNorm = (str?: string) => (str ? str.replace(/[\s\.-]/g, '').toLowerCase() : '');
    const stripZeros = (str?: string) => (str ? str.replace(/^0+/, '') : '');

    const barcodeInput = productData.codigo_barras_atual?.trim();
    const codeInput = productData.codigo_atual?.trim();
    const factoryInput = productData.codigo_fabrica?.trim();

    const matchesVal = (target?: string, input?: string) => {
      if (!target || !input) return false;
      const tNorm = cleanNorm(target);
      const iNorm = cleanNorm(input);
      if (tNorm === iNorm) return true;
      const tStrip = stripZeros(tNorm);
      const iStrip = stripZeros(iNorm);
      if (iStrip.length >= 6 && tStrip === iStrip) return true;
      return false;
    };

    let existingProduct: Product | undefined;

    if (barcodeInput) {
      existingProduct = products.find(p => 
        matchesVal(p.codigo_barras_atual, barcodeInput) ||
        (Array.isArray(p.codigos_alternativos) && p.codigos_alternativos.some(c => matchesVal(c, barcodeInput)))
      );
    }
    if (!existingProduct && codeInput) {
      existingProduct = products.find(p => matchesVal(p.codigo_atual, codeInput));
    }
    if (!existingProduct && factoryInput) {
      existingProduct = products.find(p => matchesVal(p.codigo_fabrica, factoryInput));
    }

    if (existingProduct) {
      // Mercadoria já cadastrada identificada! Manter todos os dados cadastrais e localização existente!
      const finalLoc = existingProduct.locacao || 
        (existingProduct.corredor && existingProduct.baia && existingProduct.nivel 
          ? `${existingProduct.corredor}-${existingProduct.baia}-${existingProduct.nivel}`
          : productData.locacao || '');

      const updatedExisting: Product = {
        ...existingProduct,
        // Manter dados existentes; só preenche localização se o produto existente ainda não tinha
        corredor: existingProduct.corredor || productData.corredor || '',
        baia: existingProduct.baia || productData.baia || '',
        nivel: existingProduct.nivel || productData.nivel || '',
        locacao: finalLoc,
        descricao: existingProduct.descricao || productData.descricao || '',
        atualizado_em: now,
      };

      const existingIndex = products.findIndex(p => p.id === existingProduct!.id);
      if (existingIndex >= 0) {
        products[existingIndex] = updatedExisting;
        this.saveProducts(products);
      }
      return updatedExisting;
    }

    // Creating new product only when truly non-existent
    const nextSeq = products.length + 1258;
    const newId = productData.id || `PRD-0000${nextSeq}`;
    const newCode = productData.codigo_atual || `0000${nextSeq}`;

    const newProduct: Product = {
      id: newId,
      codigo_atual: newCode,
      codigo_fabrica: productData.codigo_fabrica || '',
      descricao: productData.descricao.trim(),
      custo_unitario: Number(productData.custo_unitario) || 0,
      quantidade: Number(productData.quantidade) || 0,
      estoque_minimo: Number(productData.estoque_minimo) || 5,
      codigo_barras_atual: productData.codigo_barras_atual?.trim() || '',
      corredor: productData.corredor || '',
      baia: productData.baia || '',
      nivel: productData.nivel || '',
      locacao: productData.locacao || '',
      criado_em: now,
      atualizado_em: now,
    };

    const updatedProducts = [newProduct, ...products];
    this.saveProducts(updatedProducts);

    // Record initial codes in history
    const history = this.getCodeHistory();
    if (newProduct.codigo_barras_atual) {
      history.push({
        id: `HIST-${Date.now()}-EAN`,
        produto_id: newId,
        tipo: 'codigo_barras',
        codigo: newProduct.codigo_barras_atual,
        ativo: true,
        criado_em: now,
        motivo: 'Cadastro inicial do produto',
      });
    }
    if (newProduct.codigo_atual) {
      history.push({
        id: `HIST-${Date.now()}-COD`,
        produto_id: newId,
        tipo: 'codigo_produto',
        codigo: newProduct.codigo_atual,
        ativo: true,
        criado_em: now,
        motivo: 'Cadastro inicial do produto',
      });
    }
    if (newProduct.codigo_fabrica) {
      history.push({
        id: `HIST-${Date.now()}-FAB`,
        produto_id: newId,
        tipo: 'codigo_fabrica',
        codigo: newProduct.codigo_fabrica,
        ativo: true,
        criado_em: now,
        motivo: 'Cadastro inicial do produto',
      });
    }
    this.saveCodeHistory(history);

    this.addMovement({
      produto_id: newId,
      tipo: 'ajuste',
      quantidade: newProduct.quantidade,
      quantidade_anterior: 0,
      detalhes: 'Cadastro inicial do produto no sistema',
      usuario: 'Operador Almoxarifado',
    });

    // Sincronizar novo produto com o banco PostgreSQL
    apiService.createProduct(newProduct).catch(err => {
      console.warn('[StorageService] Cadastro no backend PostgreSQL adiado:', err.message);
    });

    return newProduct;
  }

  // --- Receiving Inbound Goods Workflow ---
  receiveGoods(
    productId: string,
    receivedQuantity: number,
    barcodeScanned?: string,
    notes?: string
  ): { success: boolean; product?: Product; error?: string } {
    const products = this.getProducts();
    const index = products.findIndex(p => p.id === productId);
    if (index === -1) return { success: false, error: 'Produto não encontrado' };

    const product = products[index];
    const prevQty = product.quantidade;
    const newQty = prevQty + Math.max(0, receivedQuantity);

    product.quantidade = newQty;
    product.atualizado_em = new Date().toISOString();
    products[index] = product;
    this.saveProducts(products);

    this.addMovement({
      produto_id: productId,
      tipo: 'recebimento',
      quantidade: receivedQuantity,
      quantidade_anterior: prevQty,
      detalhes: notes || `Recebimento de ${receivedQuantity} unidade(s)${barcodeScanned ? ` (Bipado: ${barcodeScanned})` : ''}`,
      usuario: 'Operador Recebimento',
    });

    // Sincronizar recebimento de mercadoria no backend PostgreSQL
    apiService.updateStock(productId, {
      quantidade: newQty,
      motivo: notes || `Recebimento de mercadoria (+${receivedQuantity})`,
      usuario: 'Operador Recebimento',
    }).catch(err => {
      console.warn('[StorageService] Sincronização de recebimento com backend adiada:', err.message);
    });

    return { success: true, product };
  }

  // --- Exclusive Location Update (CRITICAL DATA INTEGRITY RULE) ---
  // "Alterar localização NÃO pode alterar ou apagar: produto, código, código de fábrica, código de barras, descrição, custo, quantidade, histórico."
  updateLocation(
    productId: string,
    locationData: {
      corredor?: string;
      baia?: string;
      nivel?: string;
      locacao?: string;
      motivo?: string;
    },
    userName: string = 'Operador Almoxarifado'
  ): { success: boolean; product?: Product; error?: string } {
    const products = this.getProducts();
    const index = products.findIndex(p => p.id === productId);
    if (index === -1) return { success: false, error: 'Produto não encontrado' };

    const existing = products[index];
    const prevLoc = {
      corredor: existing.corredor,
      baia: existing.baia,
      nivel: existing.nivel,
      locacao: existing.locacao,
    };

    const finalCorredor = locationData.corredor !== undefined ? locationData.corredor.trim() : existing.corredor;
    const finalBaia = locationData.baia !== undefined ? locationData.baia.trim() : existing.baia;
    const finalNivel = locationData.nivel !== undefined ? locationData.nivel.trim() : existing.nivel;
    const finalLoc = locationData.locacao !== undefined
      ? locationData.locacao.trim()
      : (finalCorredor || finalBaia || finalNivel ? `${finalCorredor}-${finalBaia}-${finalNivel}`.replace(/^-|-$/g, '') : existing.locacao);

    const now = new Date().toISOString();

    const updatedProduct: Product = {
      ...existing,
      // Strictly update only location fields and updated timestamp
      corredor: finalCorredor,
      baia: finalBaia,
      nivel: finalNivel,
      locacao: finalLoc,
      atualizado_em: now,
    };

    products[index] = updatedProduct;
    this.saveProducts(products);

    // Audit movement log
    this.addMovement({
      produto_id: productId,
      tipo: 'alteracao_localizacao',
      quantidade: existing.quantidade,
      quantidade_anterior: existing.quantidade,
      detalhes: `Localização física alterada de "${prevLoc.locacao || 'Sem locação'}" para "${finalLoc}". Motivo: ${locationData.motivo || 'Reorganização operacional'}`,
      usuario: userName,
    });

    // Asynchronous synchronization with PostgreSQL Neon API
    apiService.updateLocation(productId, {
      corredor: finalCorredor,
      baia: finalBaia,
      nivel: finalNivel,
      locacao: finalLoc,
      motivo: locationData.motivo,
    }).catch(err => {
      console.warn('[StorageService] Sincronização de localização com backend adiada:', err.message);
    });

    return { success: true, product: updatedProduct };
  }

  // --- Real Deletion with Referential Integrity ---
  async deleteProduct(productId: string): Promise<{ success: boolean; error?: string }> {
    const products = this.getProducts();
    const idx = products.findIndex(p => p.id === productId);
    if (idx === -1) {
      return { success: false, error: 'Produto não encontrado' };
    }

    const removed = products.splice(idx, 1)[0];
    this.saveProducts(products);

    // Limpar códigos históricos do produto no cache local
    const history = this.getCodeHistory().filter(h => h.produto_id !== productId);
    this.saveCodeHistory(history);

    // Sincronizar exclusão definitiva no backend PostgreSQL
    try {
      await apiService.deleteProduct(productId);
    } catch (err: any) {
      console.warn('[StorageService] Falha ao sincronizar exclusão com o backend:', err.message);
    }

    return { success: true };
  }

  // --- Quick Stock Adjustment / Beep Inbound ---
  async updateStock(
    productId: string,
    quantityOrDelta: { quantidade?: number; incremento?: number },
    motivo: string = 'Ajuste de estoque',
    usuario: string = 'Operador Almoxarifado'
  ): Promise<{ success: boolean; product?: Product; error?: string }> {
    const products = this.getProducts();
    const idx = products.findIndex(p => p.id === productId);
    if (idx === -1) return { success: false, error: 'Produto não encontrado' };

    const prod = products[idx];
    const prevQty = prod.quantidade;
    let newQty = prevQty;

    if (quantityOrDelta.quantidade !== undefined) {
      newQty = Math.max(0, quantityOrDelta.quantidade);
    } else if (quantityOrDelta.incremento !== undefined) {
      newQty = Math.max(0, prevQty + quantityOrDelta.incremento);
    }

    prod.quantidade = newQty;
    prod.atualizado_em = new Date().toISOString();
    products[idx] = prod;
    this.saveProducts(products);

    this.addMovement({
      produto_id: productId,
      tipo: newQty >= prevQty ? 'recebimento' : 'ajuste',
      quantidade: Math.abs(newQty - prevQty),
      quantidade_anterior: prevQty,
      detalhes: motivo,
      usuario,
    });

    // Sincronizar com o backend
    apiService.updateStock(productId, {
      quantidade: newQty,
      motivo,
      usuario,
    }).catch(err => {
      console.warn('[StorageService] Sincronização de estoque com backend adiada:', err.message);
    });

    return { success: true, product: prod };
  }

  // --- Consolidação e Deduplicação Preventiva ---
  deduplicateProducts(): { consolidated: number } {
    const products = this.getProducts();
    const cleanNorm = (str?: string) => (str ? str.replace(/[\s\.-]/g, '').toLowerCase() : '');
    const seen = new Map<string, Product>();
    let consolidated = 0;

    for (const p of products) {
      const barcodeKey = cleanNorm(p.codigo_barras_atual);
      const codeKey = cleanNorm(p.codigo_atual);
      const key = barcodeKey || codeKey || p.id;

      if (seen.has(key)) {
        consolidated++;
        const prev = seen.get(key)!;
        const merged: Product = {
          ...prev,
          corredor: prev.corredor || p.corredor,
          baia: prev.baia || p.baia,
          nivel: prev.nivel || p.nivel,
          locacao: prev.locacao || p.locacao,
          quantidade: Math.max(prev.quantidade || 0, p.quantidade || 0),
        };
        seen.set(key, merged);
      } else {
        seen.set(key, p);
      }
    }

    if (consolidated > 0) {
      this.saveProducts(Array.from(seen.values()));
    }
    return { consolidated };
  }

  // --- Synchronization with Neon PostgreSQL backend ---
  async syncWithBackend(): Promise<{ synced: boolean; count: number; error?: string }> {
    try {
      const res = await apiService.getProducts({ limit: 50000 });
      if (res && Array.isArray(res.products)) {
        this.saveProducts(res.products);
        return { synced: true, count: res.total ?? res.products.length };
      }
      return { synced: false, count: 0 };
    } catch (err: any) {
      return { synced: false, count: 0, error: err.message };
    }
  }

  // --- Reset to Clean Data ---
  resetToDefaultData(): void {
    this.inMemoryProducts = [];
    this.set(STORAGE_KEYS.PRODUCTS, []);
    this.set(STORAGE_KEYS.CODE_HISTORY, []);
    this.set(STORAGE_KEYS.MOVEMENTS, []);
    this.set(STORAGE_KEYS.IMPORT_BATCHES, []);
    this.set(STORAGE_KEYS.IMPORT_PROFILES, INITIAL_PROFILES);
    this.set(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }
}

export const storageService = new StorageService();
