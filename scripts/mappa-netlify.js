#!/usr/bin/env node
/*
 * mappa-netlify.js — petit utilitaire pour deploy.sh : mémorise quel site
 * Netlify correspond à quel client, dans netlify-siti.json (versionné).
 * Le dossier /siti est jetable, la correspondance ne doit pas l'être.
 *
 *   node scripts/mappa-netlify.js get <id>
 *   node scripts/mappa-netlify.js set <id> <site_id> [url]
 *   node scripts/mappa-netlify.js elenca
 *   ... | node scripts/mappa-netlify.js campo <chiave> [chiave...]   (lit du JSON sur stdin)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, '..', process.env.MAPPA_NETLIFY || 'netlify-siti.json');
const [comando, ...args] = process.argv.slice(2);

function leggi() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function scrivi(dati) {
  fs.writeFileSync(FILE, JSON.stringify(dati, null, 2) + '\n');
}
function stdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return null; }
}

const dati = comando === 'campo' ? null : leggi();

switch (comando) {
  case 'get': {
    const voce = dati[args[0]];
    if (voce && voce.site_id) process.stdout.write(voce.site_id);
    break;
  }
  case 'set': {
    const [id, siteId, url] = args;
    if (!id || !siteId) { console.error('uso: set <id> <site_id> [url]'); process.exit(1); }
    dati[id] = { site_id: siteId, url: url || (dati[id] && dati[id].url) || '', aggiornato: new Date().toISOString() };
    scrivi(dati);
    break;
  }
  case 'elenca': {
    const voci = Object.entries(dati);
    if (!voci.length) { console.log('  (nessun sito ancora creato)'); break; }
    for (const [id, v] of voci) console.log('  ' + id.padEnd(24) + (v.url || '—'));
    break;
  }
  case 'campo': {
    const oggetto = stdin();
    if (!oggetto) break;
    for (const chiave of args) {
      if (oggetto[chiave]) { process.stdout.write(String(oggetto[chiave])); break; }
    }
    break;
  }
  default:
    console.error('comandi: get | set | elenca | campo');
    process.exit(1);
}
