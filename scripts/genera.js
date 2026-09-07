#!/usr/bin/env node
/*
 * genera.js — génère un dossier de site statique par client dans /siti.
 *
 *   node scripts/genera.js                      tous les clients
 *   node scripts/genera.js --solo studio49      un sous-ensemble
 *   node scripts/genera.js --pulisci            vide /siti avant de générer
 *   node scripts/genera.js --maps-key AIza...   iframe via l'API Embed + place_id
 *
 * Chaque dossier /siti/<id> est déployable tel quel (Netlify, ou n'importe
 * quel hébergeur statique). Le HTML est pré-rendu : la page est lisible même
 * sans JavaScript, ce qui est indispensable pour l'indexation Google.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Vetrina = require('../template/render.js');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template');

/* Champs publiés dans config.js. Tout le reste (note_prospezione, stato,
   esito, dates de relance…) est interne et ne doit jamais partir en ligne. */
const CAMPI_PUBBLICI = [
  'id', 'nome', 'categoria', 'slogan', 'indirizzo', 'telefono', 'whatsapp', 'email', 'partita_iva',
  'orari', 'servizi', 'recensione', 'recensioni', 'rating', 'num_recensioni',
  'colore_primario', 'colore_accento', 'maps_place_id', 'dominio'
];

/* ---------- arguments ---------- */

function leggiArgomenti(argv) {
  const opz = { dati: 'data/clienti.local.json', out: 'siti', solo: null, pulisci: false, mapsKey: process.env.GOOGLE_MAPS_EMBED_KEY || '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dati') opz.dati = argv[++i];
    else if (a === '--out') opz.out = argv[++i];
    else if (a === '--solo') opz.solo = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--maps-key') opz.mapsKey = argv[++i];
    else if (a === '--pulisci') opz.pulisci = true;
    else if (a === '--tutti') opz.tutti = true;
    else if (a === '--aiuto' || a === '-h' || a === '--help') opz.aiuto = true;
    else throw new Error('Argomento sconosciuto: ' + a);
  }
  return opz;
}

const AIUTO = `
Uso : node scripts/genera.js [opzioni]

  --dati <file>     JSON dei clienti          (default: data/clienti.local.json)
  --out <cartella>  cartella di uscita        (default: siti)
  --solo <id,id>    genera solo questi id
  --maps-key <k>    chiave Google Maps Embed  (oppure GOOGLE_MAPS_EMBED_KEY)
  --pulisci         svuota la cartella di uscita prima di generare
  --tutti           genera anche le schede con stato "escluso_*"

Le schede il cui stato inizia con "escluso" sono saltate: restano nel file
(con un altro argomento tornano contattabili) ma non entrano nel giro.
`;

/* ---------- utilitaires ---------- */

function pubblico(cliente, mapsKey) {
  const out = {};
  for (const campo of CAMPI_PUBBLICI) {
    if (cliente[campo] !== undefined) out[campo] = cliente[campo];
  }
  if (mapsKey) out.maps_embed_key = mapsKey;
  return out;
}

/* JSON sûr à l'intérieur d'une balise <script> */
function jsonSicuro(valore) {
  return JSON.stringify(valore, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function iniziali(nome) {
  return String(nome || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((m) => m[0].toUpperCase()).join('');
}

function favicon(cliente) {
  const sfondo = cliente.colore_primario || '#1f2933';
  const testo = cliente.colore_accento || '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${sfondo}"/>
  <text x="32" y="42" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="bold"
        text-anchor="middle" fill="${testo}">${Vetrina.esc(iniziali(cliente.nome))}</text>
</svg>
`;
}

const NETLIFY_TOML = `# Configuration Netlify du site (dossier déployé tel quel).
[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/*.css"
  [headers.values]
    Cache-Control = "public, max-age=86400"

[[headers]]
  for = "/*.js"
  [headers.values]
    Cache-Control = "public, max-age=86400"
`;

/* ---------- contrôles de complétude ---------- */

function avvisi(cliente) {
  const lista = [];
  if (!Vetrina.ok(cliente.telefono)) lista.push('telefono mancante (nessun bottone « Chiama »)');
  if (!Vetrina.ok(cliente.whatsapp)) lista.push('whatsapp mancante (bottone nascosto)');
  if (!Vetrina.haOrari(cliente)) lista.push('orari assenti o solo « chiuso » (sezione nascosta)');
  else if (Vetrina.giorniAttivi(cliente).length < 7) lista.push('orari parziali (' + Vetrina.giorniAttivi(cliente).length + '/7 giorni)');
  var avis = Vetrina.elencoRecensioni(cliente).length;
  if (!avis) lista.push('nessuna recensione (sezione nascosta) — incollane 2-3 da Google');
  else if (avis < 2) lista.push('una sola recensione (meglio 2-3)');
  if (!Vetrina.ok(cliente.maps_place_id)) lista.push('maps_place_id mancante');
  if (!Vetrina.ok(cliente.partita_iva)) lista.push('partita IVA mancante (obbligatoria sul sito)');
  return lista;
}

/* ---------- génération ---------- */

function generaSito(cliente, opz, sorgenti) {
  const cartella = path.join(ROOT, opz.out, cliente.id);
  fs.mkdirSync(cartella, { recursive: true });

  const config = pubblico(cliente, opz.mapsKey);

  const html = sorgenti.index
    .replace('data-prerender="false"', 'data-prerender="true"')
    .replace('<!--VETRINA:HEAD-->', Vetrina.renderHead(config))
    .replace('<!--VETRINA:TESTATA-->', Vetrina.renderTestata(config))
    .replace('<!--VETRINA:MAIN-->', Vetrina.renderMain(config))
    .replace('<!--VETRINA:BARRA-->', Vetrina.renderBarra(config));

  fs.writeFileSync(path.join(cartella, 'index.html'), html);
  fs.writeFileSync(path.join(cartella, 'style.css'), sorgenti.css);
  fs.writeFileSync(path.join(cartella, 'render.js'), sorgenti.render);
  fs.writeFileSync(path.join(cartella, 'app.js'), sorgenti.app);
  fs.writeFileSync(
    path.join(cartella, 'config.js'),
    '/* Generato da scripts/genera.js — non modificare a mano. */\n' +
    'window.CONFIG_VETRINA = ' + jsonSicuro(config) + ';\n'
  );
  fs.writeFileSync(path.join(cartella, 'favicon.svg'), favicon(cliente));
  fs.writeFileSync(path.join(cartella, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  fs.writeFileSync(path.join(cartella, 'netlify.toml'), NETLIFY_TOML);

  return { cartella, peso: Buffer.byteLength(html) };
}

/* Index interne : sert à relire les 9 sites d'affilée sur le téléphone.
   Il reste à la racine de /siti et n'est jamais déployé (on déploie /siti/<id>). */
function generaIndice(risultati, opz) {
  const righe = risultati.map((r) => {
    const p = r.cliente.colore_primario || '#1f2933';
    const a = r.cliente.colore_accento || '#c9a227';
    return `
    <li>
      <a href="./${Vetrina.esc(r.cliente.id)}/index.html">
        <span class="palette" title="${Vetrina.esc(p)} / ${Vetrina.esc(a)}">
          <i style="background:${Vetrina.esc(p)}"></i><i style="background:${Vetrina.esc(a)}"></i>
        </span>
        <span class="testo">
          <strong>${Vetrina.esc(r.cliente.nome)}</strong>
          <span>${Vetrina.esc(r.cliente.categoria || '')} · ${Vetrina.esc(p)} / ${Vetrina.esc(a)}</span>
        </span>
      </a>
      ${r.avvisi.length ? '<p class="avvisi">⚠ ' + r.avvisi.map(Vetrina.esc).join('<br>⚠ ') + '</p>' : '<p class="ok">Scheda completa</p>'}
    </li>`;
  }).join('');

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Anteprima siti generati</title>
<style>
  body{font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:24px 18px;background:#f5f6f8;color:#16181d}
  h1{font-size:1.4rem;margin:0 0 6px}
  p.sub{color:#5b6472;margin:0 0 22px}
  ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
  li{background:#fff;border:1px solid #e2e5ea;border-radius:14px;padding:16px}
  li a{display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit;min-height:44px}
  li a .testo{display:flex;flex-direction:column;gap:2px}
  li a strong{font-size:1.05rem}
  li a .testo span{color:#5b6472;font-size:.9rem}
  .palette{display:flex;flex:none;border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.1)}
  .palette i{display:block;width:22px;height:44px}
  .avvisi{margin:10px 0 0;font-size:.85rem;color:#a15c00}
  .ok{margin:10px 0 0;font-size:.85rem;color:#1c7c40}
</style>
</head>
<body>
<h1>Siti generati</h1>
<p class="sub">${risultati.length} schede · pagina interna, non pubblicata</p>
<ul>${righe}
</ul>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, opz.out, 'index.html'), html);
}

/* ---------- main ---------- */

function main() {
  let opz;
  try {
    opz = leggiArgomenti(process.argv.slice(2));
  } catch (e) {
    console.error(e.message + '\n' + AIUTO);
    process.exit(1);
  }
  if (opz.aiuto) { console.log(AIUTO); return; }

  const percorso = path.resolve(ROOT, opz.dati);
  if (!fs.existsSync(percorso)) {
    console.error(
      'File dati assente: ' + opz.dati + '\n\n' +
      'Le schede clienti non stanno nel repository (note commerciali).\n' +
      'Parti dall\'esempio:  cp data/clienti.esempio.json data/clienti.local.json\n' +
      'oppure indica un altro file:  node scripts/genera.js --dati <file>\n'
    );
    process.exit(1);
  }
  const dati = JSON.parse(fs.readFileSync(percorso, 'utf8'));
  let clienti = dati.clienti || [];
  if (opz.solo) {
    const set = new Set(opz.solo);
    const mancanti = opz.solo.filter((id) => !clienti.some((c) => c.id === id));
    if (mancanti.length) { console.error('id sconosciuti: ' + mancanti.join(', ')); process.exit(1); }
    clienti = clienti.filter((c) => set.has(c.id));
  }
  let saltati = [];
  if (!opz.solo && !opz.tutti) {
    // --solo est un choix explicite : il l'emporte sur le statut
    saltati = clienti.filter((c) => /^escluso/i.test(String(c.stato || '')));
    clienti = clienti.filter((c) => !/^escluso/i.test(String(c.stato || '')));
  }
  if (!clienti.length) { console.error('Nessun cliente da generare.'); process.exit(1); }

  const uscita = path.join(ROOT, opz.out);
  if (opz.pulisci && fs.existsSync(uscita)) fs.rmSync(uscita, { recursive: true, force: true });
  fs.mkdirSync(uscita, { recursive: true });

  const sorgenti = {
    index: fs.readFileSync(path.join(TEMPLATE, 'index.html'), 'utf8'),
    css: fs.readFileSync(path.join(TEMPLATE, 'style.css'), 'utf8'),
    render: fs.readFileSync(path.join(TEMPLATE, 'render.js'), 'utf8'),
    app: fs.readFileSync(path.join(TEMPLATE, 'app.js'), 'utf8')
  };

  const risultati = clienti.map((cliente) => {
    if (!cliente.id) throw new Error('Cliente senza id: ' + (cliente.nome || '?'));
    const info = generaSito(cliente, opz, sorgenti);
    return { cliente, avvisi: avvisi(cliente), ...info };
  });

  generaIndice(risultati, opz);

  console.log('\n' + risultati.length + ' siti generati in ' + opz.out + '/\n');
  if (saltati.length) {
    console.log('  Saltati (stato escluso, --tutti per includerli):');
    for (const c of saltati) console.log('    ' + c.id.padEnd(22) + (c.motivo_esclusione || c.stato));
    console.log('');
  }
  for (const r of risultati) {
    console.log('  ' + r.cliente.id.padEnd(22) + (r.peso / 1024).toFixed(1).padStart(6) + ' Ko   ' + r.cliente.nome);
    for (const a of r.avvisi) console.log('      - ' + a);
  }
  if (!opz.mapsKey) {
    console.log('\n  Nota: nessuna chiave Maps Embed. La mappa usa l\'embed classico sull\'indirizzo;');
    console.log('  il place_id resta usato per il link « indicazioni stradali ».');
    console.log('  Con una chiave: node scripts/genera.js --maps-key AIza...');
  }
  console.log('\n  Anteprima locale: npm run serve   →   http://localhost:4173/\n');
}

main();
