const fs = require('fs');
let content = fs.readFileSync('src/components/anotacoes/AnotacoesView.tsx', 'utf-8');

// 1. Add useMemo and Product to imports if not present
if (!content.includes('import { Product ')) {
  content = content.replace(/import \{ QuickList, QuickListItem \} from '\.\.\/\.\.\/types';/, "import { QuickList, QuickListItem, Product } from '../../types';");
}
if (!content.includes('useMemo')) {
  content = content.replace(/import React, \{ useState, useEffect, useRef \}/, "import React, { useState, useEffect, useRef, useMemo }");
}

// 2. Add products? to AnotacoesViewProps
if (!content.includes('products?: Product[]')) {
  content = content.replace(/interface AnotacoesViewProps \{/, "interface AnotacoesViewProps {\n  products?: Product[];");
}
if (!content.includes('products = []')) {
  content = content.replace(/export const AnotacoesView: React\.FC<AnotacoesViewProps> = \(\{/, "export const AnotacoesView: React.FC<AnotacoesViewProps> = ({\n  products = [],");
}

// 3. Add states and useMemo
const statesToAdd = `
  const [showDropdown, setShowDropdown] = useState(false);

  const searchResults = useMemo(() => {
    if (!products || products.length === 0) return [];
    if (!itemCodigo.trim()) return [];
    const term = itemCodigo.toUpperCase().trim();
    const termWithoutE = term.endsWith('E') ? term.slice(0, -1) : term;
    
    return products.filter(p => {
      const desc = (p.descricao || '').toUpperCase();
      const ca = (p.codigo_atual || '').toUpperCase();
      const cf = (p.codigo_fabrica || '').toUpperCase();
      const cb = (p.codigo_barras_atual || '').toUpperCase();
      const alt = (p.codigos_alternativos || []).join(' ').toUpperCase();
      
      return (
        desc.includes(term) ||
        ca.includes(term) || ca.includes(termWithoutE) ||
        cf.includes(term) || cf.includes(termWithoutE) ||
        cb.includes(term) || cb.includes(termWithoutE) ||
        alt.includes(term) || alt.includes(termWithoutE)
      );
    }).slice(0, 10);
  }, [itemCodigo, products]);

  const handleSelectProductFromDropdown = (p: Product) => {
    const cod = p.codigo_fabrica || p.codigo_atual || '';
    setItemCodigo(cod);
    setItemInfoLookup({
      found: true,
      codigo: p.codigo_atual,
      descricao: p.descricao,
      locacao: p.locacao || ''
    });
    if (p.locacao) {
      setItemLocacao(p.locacao);
    }
    setShowDropdown(false);
  };
`;
if (!content.includes('const [showDropdown')) {
  content = content.replace(/const \[itemComentario, setItemComentario\] = useState\(''\);/, "const [itemComentario, setItemComentario] = useState('');\n" + statesToAdd);
}

// 4. In handleCodigoChange, setShowDropdown(true)
if (!content.includes('setShowDropdown(true)')) {
  content = content.replace(/setItemCodigo\(val\);/, "setItemCodigo(val);\n    setShowDropdown(true);");
}

// 5. In input, add onFocus and render dropdown
// The input starts at line 578:
const inputBlockOld = `                <input
                  ref={codigoInputRef}
                  type="text"
                  value={itemCodigo}
                  onChange={handleCodigoChange}
                  placeholder="Bipar ou digitar..."`;
const inputBlockNew = `                <input
                  ref={codigoInputRef}
                  type="text"
                  value={itemCodigo}
                  onChange={handleCodigoChange}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar peça por código ou desc..."`;
                  
if (content.includes(inputBlockOld)) {
  content = content.replace(inputBlockOld, inputBlockNew);
}

const overlayBlock = `              </div>

              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
                  {searchResults.map(p => (
                    <button 
                      type="button"
                      key={p.id}
                      onClick={() => handleSelectProductFromDropdown(p)}
                      className="w-full text-left p-3 hover:bg-slate-700 border-b border-slate-700/50 last:border-0"
                    >
                      <div className="font-bold text-sm text-white">{p.descricao}</div>
                      <div className="text-xs text-slate-400 font-mono mt-1">Ref: {p.codigo_fabrica || p.codigo_atual} {p.locacao ? \` | Loc: \${p.locacao}\` : ''}</div>
                    </button>
                  ))}
                </div>
              )}`;

// We replace `              </div>` that follows the camera button with `overlayBlock`
// Note: It's safer to match the whole block.
const cameraButtonBlock = `                <button
                  type="button"
                  onClick={onOpenQuickScan}
                  className="absolute right-2 p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-700/60 transition"
                  title="Abrir Leitor de Câmera"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>`;
              
if (content.includes(cameraButtonBlock) && !content.includes('max-h-64 overflow-y-auto')) {
  content = content.replace(cameraButtonBlock, cameraButtonBlock.replace('</div>', overlayBlock));
}

fs.writeFileSync('src/components/anotacoes/AnotacoesView.tsx', content);
console.log('OK');
