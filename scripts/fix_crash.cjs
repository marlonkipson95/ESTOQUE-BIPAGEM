const fs = require('fs');
let content = fs.readFileSync('src/components/anotacoes/AnotacoesView.tsx', 'utf-8');

content = content.replace(/const alt = \(p\.codigos_alternativos \|\| \[\]\)\.join\(' '\)\.toUpperCase\(\);\s*/, "");
content = content.replace(/\|\|\s*alt\.includes\(term\)\s*\|\|\s*alt\.includes\(termWithoutE\)/, "");

fs.writeFileSync('src/components/anotacoes/AnotacoesView.tsx', content);
console.log('Fixed using regex');
