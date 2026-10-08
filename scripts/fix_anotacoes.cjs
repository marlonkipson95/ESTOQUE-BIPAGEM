const fs = require('fs');
let content = fs.readFileSync('src/components/anotacoes/AnotacoesView.tsx', 'utf-8');

// 1. Add descricao in handleCameraScan
content = content.replace(/id: 'item_' \+ Date\.now\(\) \+ '_' \+ Math\.random\(\)\.toString\(36\)\.substring\(2, 6\),\s*codigo: clean,\s*locacao: locacao,\s*comentario: '',\s*cadastrado: cadastrado,/g,
  `id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          codigo: clean,
          descricao: itemInfoLookup?.descricao,
          locacao: locacao,
          comentario: '',
          cadastrado: cadastrado,`);

// 2. Add descricao in handleAdicionarItem
content = content.replace(/codigo: cleanCod,\s*locacao: itemLocacao\.trim\(\),\s*comentario: itemComentario\.trim\(\),\s*cadastrado: itemInfoLookup\?\.found \?\? false,/g,
  `codigo: cleanCod,
        descricao: itemInfoLookup?.descricao,
        locacao: itemLocacao.trim(),
        comentario: itemComentario.trim(),
        cadastrado: itemInfoLookup?.found ?? false,`);

// 3. Update inputs for better visibility
content = content.replace(/placeholder-slate-500/g, 'placeholder-slate-400 font-bold text-slate-100');

// 4. Desktop Table: Add column for Descrição
content = content.replace(/<th className="px-4 py-3 whitespace-nowrap">C.digo<\/th>/g, 
  '<th className="px-4 py-3 whitespace-nowrap">Código</th>\n                      <th className="px-4 py-3">Descrição</th>');

// Desktop table value
content = content.replace(/<td className="px-4 py-3 font-mono font-bold text-white whitespace-nowrap">\s*\{item\.codigo\}\s*<\/td>/g,
  `<td className="px-4 py-3 font-mono font-bold text-white whitespace-nowrap">
                          {item.codigo}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          {item.descricao || <span className="text-slate-500 italic">Nenhuma</span>}
                        </td>`);

// 5. Mobile view: Add Descrição below the code
content = content.replace(/<span className="font-mono text-sm font-bold text-white tracking-wide">\s*\{item\.codigo\}\s*<\/span>/g,
  `<span className="font-mono text-sm font-bold text-white tracking-wide">
                          {item.codigo}
                        </span>
                        {item.descricao && (
                          <div className="w-full text-xs text-slate-400 mt-0.5">{item.descricao}</div>
                        )}`);

fs.writeFileSync('src/components/anotacoes/AnotacoesView.tsx', content);
console.log('OK');
