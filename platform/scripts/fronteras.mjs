// Las fronteras de la arquitectura (docs/ARQUITECTURA.md), comprobadas.
//
//   1. Un módulo no importa de otro módulo.
//   2. core/, ui/, lib/, services/, config/ y types/ no importan de ningún
//      módulo: lo compartido no puede depender de lo particular.
//
// Sin dependencias: lee los archivos y mira los `from '@/…'`. Corre en CI.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const src = new URL('../src/', import.meta.url).pathname;
const COMPARTIDO = ['core', 'ui', 'lib', 'services', 'config', 'types', 'hooks'];

function* archivos(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* archivos(p);
    else if (/\.(ts|tsx)$/.test(n)) yield p;
  }
}

const faltas = [];
for (const f of archivos(src)) {
  const rel = relative(src, f).split(sep);
  const zona = rel[0];
  const modulo = zona === 'modules' ? rel[1] : null;
  const texto = readFileSync(f, 'utf8');
  for (const m of texto.matchAll(/from\s+['"]@\/modules\/([^/'"]+)/g)) {
    const destino = m[1];
    const linea = texto.slice(0, m.index).split('\n').length;
    const donde = `src/${rel.join('/')}:${linea}`;
    if (modulo && destino !== modulo)
      faltas.push(`${donde} — el módulo «${modulo}» importa de «${destino}». Lo común va a ui/ o core/.`);
    if (COMPARTIDO.includes(zona))
      faltas.push(`${donde} — ${zona}/ importa del módulo «${destino}». Lo compartido no depende de un módulo.`);
  }
}

if (faltas.length) {
  console.error(faltas.map(x => '✗ ' + x).join('\n'));
  process.exit(1);
}
console.log('✓ Fronteras entre módulos respetadas');
