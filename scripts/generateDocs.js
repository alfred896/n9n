"use strict";

// generateDocs.js
// Script per generare documentazione automatica per ogni modulo del monorepo.
// Esegue una scansione di tutte le cartelle in `packages/`, individua i package.json
// e raccoglie alcune informazioni di base (descrizione, dipendenze, esportazioni principali).
// Infine crea/aggiorna la cartella `documentazione` con un file Markdown per ciascun modulo.

const fs = require("fs");
const path = require("path");

/** Utility: Legge JSON in maniera sicura, restituisce oggetto vuoto in caso di errore */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Ricerca ricorsivamente le cartelle che contengono un file package.json.
 * @param {string} dir - directory di partenza
 * @returns {string[]} array di assolute path delle cartelle pacchetto
 */
function findPackageDirs(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    const pkgJsonPath = path.join(full, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      result.push(full);
    }
    // Ricorsione
    result.push(...findPackageDirs(full));
  }
  return result;
}

/**
 * Estrae i nomi delle esportazioni principali da un file sorgente usando regex.
 * @param {string} fileContent
 * @returns {string[]} nomi trovati
 */
function extractExports(fileContent) {
  const names = new Set();
  const regexes = [
    /export\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s+default\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s+class\s+([A-Za-z0-9_]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/g,
    /export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g,
  ];
  for (const reg of regexes) {
    let m;
    while ((m = reg.exec(fileContent)) !== null) {
      names.add(m[1]);
    }
  }
  return Array.from(names);
}

/**
 * Analizza la directory del pacchetto per trovare esportazioni principali.
 * Esegue la scansione dei file .ts/.tsx all'interno di `src/` (se esiste).
 * @param {string} pkgDir
 * @returns {string[]} elenco di esportazioni trovate
 */
function scanExports(pkgDir) {
  const srcDir = path.join(pkgDir, "src");
  if (!fs.existsSync(srcDir)) return [];
  const stack = [srcDir];
  const exportsFound = new Set();
  while (stack.length) {
    const current = stack.pop();
    const items = fs.readdirSync(current, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(ts|tsx|js)$/i.test(item.name)) {
        const content = fs.readFileSync(fullPath, "utf8");
        extractExports(content).forEach((e) => exportsFound.add(e));
      }
    }
  }
  return Array.from(exportsFound);
}

/**
 * Genera documentazione per un singolo pacchetto.
 * @param {string} pkgDir
 * @param {string} docsDir
 */
function generateDoc(pkgDir, docsDir) {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  const pkg = readJsonSafe(pkgJsonPath);
  const name = pkg.name || path.basename(pkgDir);
  const description = pkg.description || "N/A";
  const dependencies = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
  const exports = scanExports(pkgDir);

  const fileSafeName = name.replace(/\//g, "__");
  const docPath = path.join(docsDir, `${fileSafeName}.md`);

  const lines = [];
  lines.push(`# ${name}`);
  lines.push("");
  lines.push(`Percorso: \`${path.relative(path.join(__dirname, ".."), pkgDir)}\``);
  lines.push("");
  lines.push(`Descrizione: ${description}`);
  lines.push("");
  lines.push("## Dipendenze principali");
  if (dependencies.length) {
    dependencies.slice(0, 20).forEach((dep) => lines.push(`- ${dep}`));
    if (dependencies.length > 20) {
      lines.push("- ...altre");
    }
  } else {
    lines.push("- Nessuna");
  }
  lines.push("");
  lines.push("## Esportazioni principali");
  if (exports.length) {
    exports.forEach((e) => lines.push(`- ${e}`));
  } else {
    lines.push("- Nessuna esportazione individuata");
  }
  lines.push("");
  lines.push("## Esempio di utilizzo");
  lines.push("\n```js");
  lines.push(`import { /* ... */ } from '${name}';`);
  lines.push("// ...");
  lines.push("```\n");
  fs.writeFileSync(docPath, lines.join("\n"), "utf8");
}

function main() {
  const baseDir = path.join(__dirname, "..");
  const packagesDir = path.join(baseDir, "packages");
  const docsDir = path.join(baseDir, "documentazione");

  // Ricrea la cartella documentazione
  if (fs.existsSync(docsDir)) {
    fs.rmSync(docsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(docsDir, { recursive: true });

  const pkgDirs = findPackageDirs(packagesDir);
  const uniquePkgDirs = Array.from(new Set(pkgDirs));

  uniquePkgDirs.forEach((dir) => {
    try {
      generateDoc(dir, docsDir);
      console.log(`Generata documentazione per ${dir}`);
    } catch (err) {
      console.error(`Errore durante la generazione per ${dir}:`, err);
    }
  });

  // Crea un README generale nella cartella documentazione
  const listLines = ["# Documentazione Moduli", "", "Elenco dei moduli documentati:", ""];
  uniquePkgDirs.forEach((d) => {
    const pkg = readJsonSafe(path.join(d, "package.json"));
    const name = pkg.name || path.basename(d);
    const fileSafeName = name.replace(/\//g, "__");
    listLines.push(`- [${name}](${fileSafeName}.md)`);
  });
  fs.writeFileSync(path.join(docsDir, "README.md"), listLines.join("\n"), "utf8");

  console.log(`\nDocumentazione generata in: ${docsDir}`);
}

if (require.main === module) {
  main();
}