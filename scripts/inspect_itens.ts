import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

const itensDir = path.resolve('itens');

function inspectTextFile(filename: string) {
    const filepath = path.join(itensDir, filename);
    if (!fs.existsSync(filepath)) {
        console.log(`\n--- ${filename} NOT FOUND ---`);
        return;
    }
    const content = fs.readFileSync(filepath, 'latin1'); // Using latin1 as it's common in Brazil for .txt/.spl exports
    const lines = content.split(/\r?\n/).slice(0, 10);
    console.log(`\n--- ${filename} (First 10 lines) ---`);
    console.log(lines.join('\n'));
}

function inspectExcelFile(filename: string) {
    const filepath = path.join(itensDir, filename);
    if (!fs.existsSync(filepath)) {
        console.log(`\n--- ${filename} NOT FOUND ---`);
        return;
    }
    console.log(`\n--- ${filename} ---`);
    try {
        const workbook = xlsx.read(fs.readFileSync(filepath), { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 5);
        console.log(`Sheet: ${sheetName}`);
        console.log(JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.log(`Error reading excel: ${e.message}`);
    }
}

inspectTextFile('descricao.txt');
inspectTextFile('estoquetodos.txt');
inspectExcelFile('codigo_barras.xlsx');
inspectExcelFile('preco.xlsx');
