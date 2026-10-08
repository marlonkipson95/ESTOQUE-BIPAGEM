const fs = require('fs');
let content = fs.readFileSync('src/components/orcamento/OrcamentoView.tsx', 'utf-8');

// 1. Add comentario to new Item
content = content.replace(/subtotal: defaultPrice\n\s*};/g, `subtotal: defaultPrice,\n        comentario: ''\n      };`);

// 2. Add function to update comentario
content = content.replace(/const updateItemPrice = \(id: string, newVal: number\) => {/g, 
`const updateItemComment = (id: string, newComment: string) => {
    setCurrentOrcamento(prev => {
      const currentItens = prev.itens || [];
      return {
        ...prev,
        itens: currentItens.map(it => 
          it.id === id ? { ...it, comentario: newComment } : it
        )
      };
    });
  };

  const updateItemPrice = (id: string, newVal: number) => {`);

// 3. Add input in desktop view
content = content.replace(/<div className="font-bold text-sm text-slate-900 dark:text-white">\{item\.descricao\}<\/div>\n\s*<\/td>/g, 
`<div className="font-bold text-sm text-slate-900 dark:text-white">{item.descricao}</div>
                      <input 
                        type="text"
                        value={item.comentario || ''}
                        onChange={e => updateItemComment(item.id, e.target.value)}
                        placeholder="Adicionar comentário (opcional)"
                        className="w-full mt-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1.5 text-xs font-medium text-slate-900 dark:text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 print:hidden"
                      />
                      {item.comentario && <div className="hidden print:block text-xs italic text-slate-600 mt-1">{item.comentario}</div>}
                    </td>`);

// 4. Add input in mobile view
content = content.replace(/<div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">\{item\.descricao\}<\/div>\n\s*<\/div>/g,
`<div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{item.descricao}</div>
                    <input 
                      type="text"
                      value={item.comentario || ''}
                      onChange={e => updateItemComment(item.id, e.target.value)}
                      placeholder="Adicionar comentário (opcional)"
                      className="w-full mt-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-xs font-medium text-slate-900 dark:text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 print:hidden"
                    />
                    {item.comentario && <div className="hidden print:block text-xs italic text-slate-600 mt-1">{item.comentario}</div>}
                  </div>`);

fs.writeFileSync('src/components/orcamento/OrcamentoView.tsx', content);
console.log('OK');
