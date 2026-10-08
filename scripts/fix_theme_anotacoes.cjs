const fs = require('fs');
let content = fs.readFileSync('src/components/anotacoes/AnotacoesView.tsx', 'utf-8');

// Title input:
content = content.replace(/className="text-base font-bold text-white bg-transparent/g, 'className="text-base font-bold text-slate-900 dark:text-white bg-transparent');

// Header title:
content = content.replace(/<h2 className="text-xl font-bold tracking-tight text-white">/g, '<h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">');

// List item titles
content = content.replace(/<h3 className="text-sm font-bold text-white mt-2\.5/g, '<h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2.5');

// Border slate 800 to responsive
content = content.replace(/border-slate-800/g, 'border-slate-200 dark:border-slate-800');

// "Voltar para todas as listas" button
content = content.replace(/hover:text-white hover:bg-slate-800/g, 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800');

// "Itens Registrados" block in edit mode (line 644)
content = content.replace(/<span className="text-xs font-bold uppercase tracking-wider text-slate-300">/g, '<span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">');

// For the main edit mode layout container: pb-32 space-y-6 -> it doesn't have bg, it's transparent (takes page bg).
// Buttons that are slate-800:
content = content.replace(/bg-slate-800 border/g, 'bg-white dark:bg-slate-800 border');
content = content.replace(/bg-slate-800\/80 border/g, 'bg-white dark:bg-slate-800/80 border');
content = content.replace(/text-slate-300 bg-slate-800/g, 'text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800');

// Input placeholder text-slate-400
content = content.replace(/placeholder-slate-400/g, 'placeholder-slate-500 dark:placeholder-slate-400');

// Fix text-slate-400 out of dark containers (e.g., subtitle text-xs text-slate-400)
// It's safer to just change the specific title input text-white first.
// The user specifically complained about "o testo do nome da anotação esta em branco".

fs.writeFileSync('src/components/anotacoes/AnotacoesView.tsx', content);
console.log('Fixed theme in AnotacoesView');
