import React, { useState, useEffect, useCallback } from 'react';
import {
  AppModule,
  Product,
  ProductCodeHistory,
  StockMovement,
  ImportBatch,
  ConsultaFilters,
  AuthSession,
} from './types';
import { storageService } from './services/storageService';
import { authService } from './services/authService';
import { apiService } from './services/apiService';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import { Sidebar } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { MobileNav } from './components/common/MobileNav';
import { PWAInstallBanner } from './components/common/PWAInstallBanner';
import { CameraScannerModal } from './components/common/CameraScannerModal';
import { ProductDetailModal } from './components/produtos/ProductDetailModal';
import { NewProductModal } from './components/produtos/NewProductModal';
import { LoginView } from './components/auth/LoginView';

// Views
import { DashboardView } from './components/dashboard/DashboardView';
import { ConsultaView } from './components/consulta/ConsultaView';
import { BipagemView } from './components/bipagem/BipagemView';
import { ProdutosView } from './components/produtos/ProdutosView';
import { ImportacaoView } from './components/importacao/ImportacaoView';
import { OrcamentoView } from './components/orcamento/OrcamentoView';
import { AuditoriaView } from './components/auditoria/AuditoriaView';
import { UsuariosView } from './components/usuarios/UsuariosView';
import { ConfiguracoesView } from './components/configuracoes/ConfiguracoesView';

export default function App() {
  // Authentication State
  const [authSession, setAuthSession] = useState<AuthSession>(authService.getSession());

  // Navigation State - Default to 'bipagem' for direct access to scanning & locating
  const [activeModule, setActiveModule] = useState<AppModule>('bipagem');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  // Data State from Storage
  const [products, setProducts] = useState<Product[]>([]);
  const [codeHistory, setCodeHistory] = useState<ProductCodeHistory[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);

  // Modal States
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [prefilledBarcode, setPrefilledBarcode] = useState<string>('');

  // Scanned code carrier for modules
  const [incomingScannedCode, setIncomingScannedCode] = useState<string>('');

  // Consulta Filter State
  const [consultaFilters, setConsultaFilters] = useState<ConsultaFilters>({
    searchTerm: '',
    corredor: '',
    baia: '',
    nivel: '',
    locacao: '',
    estoque: 'todos',
    cadastro: 'todos',
    tipoCodigo: 'todos',
  });

  // Reload data from storage service and sync with PostgreSQL backend
  const refreshData = useCallback(() => {
    storageService.deduplicateProducts();
    setProducts(storageService.getProducts());
    setCodeHistory(storageService.getCodeHistory());
    setMovements(storageService.getMovements());
    setImportBatches(storageService.getImportBatches());

    // Attempt backend sync with Neon PostgreSQL
    storageService.syncWithBackend().then(res => {
      if (res.synced) {
        setProducts(storageService.getProducts());
      }
    });
  }, []);

  useEffect(() => {
    if (!authSession.isAuthenticated) return;
    refreshData();

    // Sincronização inteligente em segundo plano: verifica se o total do banco mudou
    const syncInterval = setInterval(async () => {
      try {
        const stats = await apiService.getDashboardStats();
        const currentCount = storageService.getProducts().length;
        if (stats && stats.total_produtos !== undefined && stats.total_produtos !== currentCount) {
          const res = await storageService.syncWithBackend();
          if (res.synced) {
            setProducts(storageService.getProducts());
          }
        }
      } catch {
        // Silencioso se offline
      }
    }, 12000);

    // Sincroniza imediatamente quando o operador foca ou volta para a aba do navegador
    const handleFocus = () => {
      refreshData();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [authSession.isAuthenticated, refreshData]);

  // Global USB Barcode Scanner Handler
  const handleBarcodeScanned = useCallback(
    (code: string) => {
      if (!authSession.isAuthenticated) return;
      setIncomingScannedCode(code);

      // Route intelligence
      if (activeModule === 'consulta') {
        setConsultaFilters(prev => ({ ...prev, searchTerm: code }));
      } else if (activeModule === 'orcamento') {
        // Stay in orcamento to add the item
      } else {
        setActiveModule('bipagem');
      }
    },
    [activeModule, authSession.isAuthenticated]
  );

  // Initialize USB listener hook
  useBarcodeScanner({
    onScan: handleBarcodeScanned,
    enabled: authSession.isAuthenticated && !isCameraScannerOpen && !selectedProduct && !isNewProductModalOpen,
  });

  // Camera Barcode Scanner Handler
  const handleCameraScan = (code: string) => {
    handleBarcodeScanned(code);
    setIsCameraScannerOpen(false);
  };

  // Open New Product modal with scanned code
  const handleOpenNewProductWithCode = (code: string) => {
    setPrefilledBarcode(code);
    setIsNewProductModalOpen(true);
  };

  // Logout handler
  const handleLogout = () => {
    authService.logout();
    setAuthSession(authService.getSession());
  };

  // Reset or update Consulta Filters
  const handleUpdateConsultaFilters = (newFilters: Partial<ConsultaFilters>) => {
    setConsultaFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleResetConsultaFilters = () => {
    setConsultaFilters({
      searchTerm: '',
      corredor: '',
      baia: '',
      nivel: '',
      locacao: '',
      estoque: 'todos',
      cadastro: 'todos',
      tipoCodigo: 'todos',
    });
  };

  // 1. Mandatory Gate: If not authenticated, require login
  if (!authSession.isAuthenticated || !authSession.user) {
    return (
      <LoginView
        onLoginSuccess={() => {
          setAuthSession(authService.getSession());
        }}
      />
    );
  }

  // 2. Authenticated Application
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-100 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Navigation Sidebar */}
      <Sidebar
        activeModule={activeModule}
        onSelectModule={mod => setActiveModule(mod)}
        totalProductsCount={products.length}
        currentUser={authSession.user}
        onLogout={handleLogout}
      />

      {/* Main Content Stage */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* PWA In-App Install Banner */}
        <PWAInstallBanner />

        {/* Global Sticky Top Header */}
        <Header
          activeModule={activeModule}
          currentUser={authSession.user}
          onLogout={handleLogout}
          onOpenMobileMenu={() => setIsMobileDrawerOpen(true)}
          onOpenQuickScan={() => setIsCameraScannerOpen(true)}
          totalProducts={products.length}
        />

        {/* Scrollable Workspace Container */}
        <main className="flex-1 overflow-y-auto px-3 py-4 pb-24 md:px-8 md:py-6 md:pb-8 overscroll-y-contain">
          {activeModule === 'dashboard' && (
            <DashboardView
              products={products}
              codeHistory={codeHistory}
              movements={movements}
              importBatches={importBatches}
              onNavigateToModule={mod => setActiveModule(mod)}
              onApplyConsultaFilter={handleUpdateConsultaFilters}
              onSelectProduct={p => setSelectedProduct(p)}
            />
          )}

          {activeModule === 'consulta' && (
            <ConsultaView
              products={products}
              codeHistory={codeHistory}
              filters={consultaFilters}
              onUpdateFilters={handleUpdateConsultaFilters}
              onResetFilters={handleResetConsultaFilters}
              onSelectProduct={p => setSelectedProduct(p)}
              onOpenQuickScan={() => setIsCameraScannerOpen(true)}
            />
          )}

          {activeModule === 'bipagem' && (
            <BipagemView
              onSelectProduct={p => setSelectedProduct(p)}
              onOpenNewProductWithCode={handleOpenNewProductWithCode}
              onOpenQuickScan={() => setIsCameraScannerOpen(true)}
              externalScannedCode={incomingScannedCode}
              onClearExternalScannedCode={() => setIncomingScannedCode('')}
            />
          )}

          {activeModule === 'produtos' && (
            <ProdutosView
              products={products}
              codeHistory={codeHistory}
              onSelectProduct={p => setSelectedProduct(p)}
              onOpenNewProduct={() => {
                setPrefilledBarcode('');
                setIsNewProductModalOpen(true);
              }}
            />
          )}

          {activeModule === 'orcamento' && (
            <OrcamentoView 
              products={products}
              onOpenQuickScan={() => setIsCameraScannerOpen(true)}
              externalScannedCode={incomingScannedCode}
              onClearExternalScannedCode={() => setIncomingScannedCode('')}
            />
          )}

          {activeModule === 'auditoria' && (
            <AuditoriaView 
              onSelectProduct={id => {
                const found = products.find(p => p.id === id);
                if (found) setSelectedProduct(found);
              }}
            />
          )}

          {activeModule === 'importacao' && (
            <ImportacaoView
              onImportCompleted={() => {
                refreshData();
              }}
            />
          )}

          {activeModule === 'usuarios' && <UsuariosView />}

          {activeModule === 'configuracoes' && (
            <ConfiguracoesView
              onDatabaseReset={() => {
                refreshData();
              }}
            />
          )}
        </main>

        {/* Mobile Touch Navigation Bar & Drawer */}
        <MobileNav
          activeModule={activeModule}
          onSelectModule={mod => setActiveModule(mod)}
          isDrawerOpen={isMobileDrawerOpen}
          onCloseDrawer={() => setIsMobileDrawerOpen(false)}
          onOpenQuickScan={() => setIsCameraScannerOpen(true)}
          totalProductsCount={products.length}
          currentUser={authSession.user}
          onLogout={handleLogout}
        />
      </div>

      {/* Product Detail & Edit Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onProductUpdated={updated => {
            setSelectedProduct(updated);
            refreshData();
          }}
          onProductDeleted={() => {
            setSelectedProduct(null);
            refreshData();
          }}
        />
      )}

      {/* New Product Creation Modal */}
      {isNewProductModalOpen && (
        <NewProductModal
          initialCode={prefilledBarcode}
          initialBarcode={prefilledBarcode}
          onClose={() => {
            setIsNewProductModalOpen(false);
            setPrefilledBarcode('');
          }}
          onProductCreated={() => {
            refreshData();
            setIsNewProductModalOpen(false);
            setPrefilledBarcode('');
          }}
        />
      )}

      {/* Camera Barcode Scanner Modal */}
      <CameraScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={handleCameraScan}
      />
    </div>
  );
}
