const fs = require('fs');
let content = fs.readFileSync('src/components/anotacoes/AnotacoesView.tsx', 'utf-8');

// Fix text-slate-300 bg-white
content = content.replace(/text-slate-300 bg-white/g, 'text-slate-700 dark:text-slate-300 bg-white');

// Fix text-white on light bg elements that were missed
// For the Refresh list button (line 373 area)
content = content.replace(/text-slate-300 bg-slate-800\/80/g, 'text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/80');

// Fix border-slate-700 where it should be lighter in light mode
content = content.replace(/border-slate-700/g, 'border-slate-300 dark:border-slate-700');

fs.writeFileSync('src/components/anotacoes/AnotacoesView.tsx', content);
console.log('Fixed');
