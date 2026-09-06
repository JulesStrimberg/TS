#!/usr/bin/env node
/*
 * serve.js — petit serveur statique sans dépendance, pour relire les sites
 * générés depuis un vrai téléphone (l'adresse LAN est affichée au démarrage).
 *
 *   node scripts/serve.js [--dir siti] [--porta 4173]
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
function opzione(nome, predefinito) {
  const i = argv.indexOf(nome);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : predefinito;
}

const BASE = path.resolve(ROOT, opzione('--dir', 'siti'));
const PORTA = Number(opzione('--porta', process.env.PORT || 4173));

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  let file = path.join(BASE, rel);
  if (!file.startsWith(BASE)) { res.writeHead(403).end('Forbidden'); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    }).end(data);
  });
});

server.listen(PORTA, () => {
  const reti = Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal);
  console.log('\n  ' + BASE.replace(ROOT + path.sep, '') + '/ servi sur :');
  console.log('    http://localhost:' + PORTA + '/');
  for (const n of reti) console.log('    http://' + n.address + ':' + PORTA + '/   (téléphone, même Wi-Fi)');
  console.log('\n  Ctrl+C pour arrêter.\n');
});
