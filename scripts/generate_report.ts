import * as fs from 'fs';
import * as path from 'path';

const data = JSON.parse(fs.readFileSync(path.resolve('RELATORIO_PRE_IMPORTACAO.json'), 'utf-8'));

let md = `# RELATÓRIO DE DRY-RUN (PRÉ-IMPORTAÇÃO)

## RESUMO DA CONCILIAÇÃO

- **TOTAL DE PRODUTOS ANALISADOS (Fontes):** ${data.report.TOTAL_ANALISADOS}
- **TOTAL CONFIRMADO:** ${data.report.TOTAL_CONFIRMADO}
- **TOTAL SEM ALTERAÇÃO:** ${data.report.TOTAL_SEM_ALTERACAO}
- **TOTAL COM ALTERAÇÃO:** ${data.report.TOTAL_COM_ALTERACAO}
- **TOTAL COMPLEMENTADO:** ${data.report.TOTAL_COMPLEMENTADO}
- **TOTAL NOVO:** ${data.report.TOTAL_NOVO}
- **TOTAL CONFLITO:** ${data.report.TOTAL_CONFLITO}
- **TOTAL PENDENTE (S/ Identificação):** ${data.report.TOTAL_PENDENTE}

---

## ESTATÍSTICAS POR CAMPO

**DESCRIÇÃO**
- ${data.report.ESTATISTICAS.descricao.alteradas} alteradas
- ${data.report.ESTATISTICAS.descricao.mantidas} mantidas
- ${data.report.ESTATISTICAS.descricao.complementadas} complementadas

**EAN (Códigos de Barras)**
- ${data.report.ESTATISTICAS.ean.adicionados} adicionados
- ${data.report.ESTATISTICAS.ean.mantidos} mantidos
- ${data.report.ESTATISTICAS.ean.conflitos} conflitos

**NCM**
- ${data.report.ESTATISTICAS.ncm.adicionados} adicionados
- ${data.report.ESTATISTICAS.ncm.alterados} alterados
- ${data.report.ESTATISTICAS.ncm.mantidos} mantidos

**PREÇOS**
- ${data.report.ESTATISTICAS.precos.alterados} alterados

**ESTOQUE (Contábil)**
- ${data.report.ESTATISTICAS.estoque.alterados} alterados

**LOCALIZAÇÃO**
- ${data.report.ESTATISTICAS.localizacao.alteradas} alteradas

**CUSTO**
- ${data.report.ESTATISTICAS.custo.alterados} alterados

**ÚLTIMA VENDA / ÚLTIMA COMPRA**
- ${data.report.ESTATISTICAS.ultima_venda.atualizadas} atualizadas
- ${data.report.ESTATISTICAS.ultima_compra.atualizadas} atualizadas

---

## RELATÓRIO DETALHADO (Amostra / Primeiras 100 alterações)

| Cod. Original | Produto (ID Interno) | Campo | Antes | Depois | Fonte | Motivo |
| ------------- | ------- | ----- | ----- | ------ | ----- | ------ |
`;

const maxDetailed = 100;
const changes = data.changes.slice(0, maxDetailed);

for (const c of changes) {
    const antes = c.antes !== null && c.antes !== undefined ? String(c.antes).replace(/\|/g, '-') : 'Vazio';
    const depois = c.depois !== null && c.depois !== undefined ? String(c.depois).replace(/\|/g, '-') : 'Vazio';
    md += `| ${c.codOrig} | ${c.idInterno} | ${c.campo} | ${antes} | ${depois} | ${c.fonte} | ${c.motivo} |\n`;
}

if (data.changes.length > maxDetailed) {
    md += `\n*... e mais ${data.changes.length - maxDetailed} alterações ocultadas para brevidade.* \n`;
}

md += `\n\n## CONFLITOS CRÍTICOS\n\n`;

if (data.conflicts.length === 0) {
    md += `Nenhum conflito crítico identificado.\n`;
} else {
    md += `| Cod. Original | Produto | Campo | Valor Banco | Valor Fonte | Arquivo | Tipo de Conflito | Decisão |\n`;
    md += `| ------------- | ------- | ----- | ----------- | ----------- | ------- | ---------------- | ------- |\n`;
    for (const c of data.conflicts.slice(0, 50)) {
        md += `| ${c.codOriginal} | ${c.produto} | ${c.campo} | ${c.valorBanco} | ${c.valorFonte} | ${c.arquivo} | ${c.tipoConflito} | ${c.decisao} |\n`;
    }
    if (data.conflicts.length > 50) {
        md += `\n*... e mais ${data.conflicts.length - 50} conflitos ocultados.*\n`;
    }
}

const artifactPath = "C:\\Users\\Funcionario\\.gemini\\antigravity-ide\\brain\\c838807a-8eb1-4246-8bb0-555269c3e4c2\\RELATORIO_PRE_IMPORTACAO.md";
fs.writeFileSync(artifactPath, md);
console.log('Markdown report generated at', artifactPath);
