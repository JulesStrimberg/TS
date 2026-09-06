/*
 * render.js — moteur de rendu du site vitrine.
 * Zéro dépendance. Le même fichier tourne dans le navigateur (window.Vetrina)
 * et dans Node (require) : le générateur s'en sert pour pré-rendre le HTML,
 * le navigateur s'en sert si la page n'a pas été pré-rendue.
 *
 * Entrée : un objet `config` = un élément du tableau `clienti` de clienti.json.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vetrina = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var GIORNI = [
    ['lun', 'Lunedì', 'Mo'],
    ['mar', 'Martedì', 'Tu'],
    ['mer', 'Mercoledì', 'We'],
    ['gio', 'Giovedì', 'Th'],
    ['ven', 'Venerdì', 'Fr'],
    ['sab', 'Sabato', 'Sa'],
    ['dom', 'Domenica', 'Su']
  ];

  /* ---------- utilitaires ---------- */

  var ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ENTITES[c]; });
  }

  function ok(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  function numeroTel(n) { return String(n || '').replace(/[^\d+]/g, ''); }
  function telHref(n) { return 'tel:' + numeroTel(n); }

  function waHref(n, messaggio) {
    var cifre = String(n || '').replace(/\D/g, '');
    return 'https://wa.me/' + cifre + (messaggio ? '?text=' + encodeURIComponent(messaggio) : '');
  }

  function numeroIt(n) { return Number(n).toFixed(1).replace('.', ','); }

  function hhmm(min) {
    var h = Math.floor((min % 1440) / 60), m = (min % 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* Découpe "07:30 - 13:00 / 15:00 - 19:30" en [{apre,chiude}] (minutes depuis minuit).
     Retourne [] si fermé, null si l'information est absente / illisible. */
  function intervalli(valore) {
    if (!ok(valore)) return null;
    if (/chius/i.test(valore)) return [];
    var out = [];
    String(valore).split(/\s*[\/;,]\s*|\s+e\s+/i).forEach(function (pezzo) {
      var m = pezzo.match(/(\d{1,2})[:.h](\d{2})\s*[-–—]\s*(\d{1,2})[:.h](\d{2})/);
      if (!m) return;
      var apre = (+m[1]) * 60 + (+m[2]);
      var chiude = (+m[3]) * 60 + (+m[4]);
      if (chiude <= apre) chiude += 1440; // passe minuit
      out.push({ apre: apre, chiude: chiude });
    });
    return out.length ? out : null;
  }

  /* Les jours réellement renseignés, dans l'ordre de la semaine. */
  function giorniAttivi(config) {
    var orari = (config && config.orari) || {};
    return GIORNI.filter(function (g) { return ok(orari[g[0]]); })
      .map(function (g) {
        return { chiave: g[0], nome: g[1], schema: g[2], valore: String(orari[g[0]]).trim() };
      });
  }

  /* Vrai seulement si au moins un jour porte une vraie plage horaire.
     Une fiche où l'on sait uniquement « dimanche : fermé » n'apprend rien :
     mieux vaut masquer la section que publier un tableau à une ligne négative. */
  function haOrari(config) {
    return giorniAttivi(config).some(function (g) {
      var f = intervalli(g.valore);
      return !!(f && f.length);
    });
  }

  /* État d'ouverture à l'instant `adesso`. null si les horaires sont inconnus. */
  function statoApertura(config, adesso) {
    var orari = (config && config.orari) || {};
    if (!haOrari(config)) return null;
    var d = adesso || new Date();
    var indiceOggi = (d.getDay() + 6) % 7; // 0 = lundi
    var minuti = d.getHours() * 60 + d.getMinutes();

    var oggi = intervalli(orari[GIORNI[indiceOggi][0]]);
    if (oggi) {
      for (var i = 0; i < oggi.length; i++) {
        if (minuti >= oggi[i].apre && minuti < oggi[i].chiude) {
          return { aperto: true, testo: 'Aperto ora · chiude alle ' + hhmm(oggi[i].chiude) };
        }
      }
      for (var j = 0; j < oggi.length; j++) {
        if (minuti < oggi[j].apre) {
          return { aperto: false, testo: 'Chiuso · apre oggi alle ' + hhmm(oggi[j].apre) };
        }
      }
    }
    for (var k = 1; k <= 7; k++) {
      var idx = (indiceOggi + k) % 7;
      var giorno = intervalli(orari[GIORNI[idx][0]]);
      if (giorno && giorno.length) {
        var quando = k === 1 ? 'domani' : GIORNI[idx][1].toLowerCase();
        return { aperto: false, testo: 'Chiuso · apre ' + quando + ' alle ' + hhmm(giorno[0].apre) };
      }
    }
    return { aperto: false, testo: 'Chiuso' };
  }

  /* ---------- liens externes ---------- */

  function mapsLink(config) {
    var q = encodeURIComponent(config.indirizzo || config.nome || '');
    var url = 'https://www.google.com/maps/search/?api=1&query=' + q;
    if (ok(config.maps_place_id)) url += '&query_place_id=' + encodeURIComponent(config.maps_place_id);
    return url;
  }

  function itinerarioLink(config) {
    var q = encodeURIComponent(config.indirizzo || config.nome || '');
    var url = 'https://www.google.com/maps/dir/?api=1&destination=' + q;
    if (ok(config.maps_place_id)) url += '&destination_place_id=' + encodeURIComponent(config.maps_place_id);
    return url;
  }

  /* iframe : API Embed (avec clé, via le place_id) sinon embed classique sur l'adresse. */
  function mappaSrc(config) {
    var chiave = config.maps_embed_key || config.maps_api_key;
    if (ok(chiave) && ok(config.maps_place_id)) {
      return 'https://www.google.com/maps/embed/v1/place?key=' + encodeURIComponent(chiave) +
        '&q=place_id:' + encodeURIComponent(config.maps_place_id) + '&language=it&zoom=16';
    }
    return 'https://maps.google.com/maps?q=' + encodeURIComponent(config.indirizzo || config.nome || '') +
      '&hl=it&z=16&output=embed';
  }

  function messaggioWa(config) {
    return 'Buongiorno ' + (config.nome || '') + ', vorrei un appuntamento.';
  }

  /* ---------- blocs ---------- */

  function renderTema(config) {
    var p = config.colore_primario || '#1f2933';
    var a = config.colore_accento || '#c9a227';
    return '<style>:root{--primario:' + esc(p) + ';--accento:' + esc(a) + ';}</style>';
  }

  function renderRating(config) {
    if (!ok(config.rating)) return '';
    var r = Number(config.rating);
    var pct = Math.max(0, Math.min(100, (r / 5) * 100));
    var recensioni = ok(config.num_recensioni)
      ? '<span class="rating__conteggio">' + esc(config.num_recensioni) + ' recensioni su Google</span>'
      : '<span class="rating__conteggio">su Google</span>';
    return '<p class="rating">' +
      '<span class="stelle" style="--p:' + pct.toFixed(1) + '%" role="img" aria-label="' +
      esc(numeroIt(r)) + ' stelle su 5"></span>' +
      '<span class="rating__voto">' + esc(numeroIt(r)) + '</span>' +
      recensioni + '</p>';
  }

  function renderHero(config) {
    var sotto = [config.categoria, 'Milano'].filter(ok).map(esc).join(' · ');
    var azioni = [];
    if (ok(config.telefono)) {
      azioni.push('<a class="btn btn--pieno" href="' + esc(telHref(config.telefono)) + '">Chiama ora</a>');
    } else if (ok(config.whatsapp)) {
      azioni.push('<a class="btn btn--pieno" href="' + esc(waHref(config.whatsapp, messaggioWa(config))) +
        '" target="_blank" rel="noopener">Scrivi su WhatsApp</a>');
    } else {
      azioni.push('<a class="btn btn--pieno" href="' + esc(itinerarioLink(config)) +
        '" target="_blank" rel="noopener">Come arrivare</a>');
    }
    azioni.push('<a class="btn btn--vuoto" href="#servizi">I servizi</a>');

    return '<header class="hero">' +
      (sotto ? '<p class="hero__occhiello">' + sotto + '</p>' : '') +
      '<h1 class="hero__titolo">' + esc(config.nome) + '</h1>' +
      (ok(config.slogan) ? '<p class="hero__slogan">' + esc(config.slogan) + '</p>' : '') +
      renderRating(config) +
      '<p class="stato" data-stato hidden></p>' +
      '<div class="hero__azioni">' + azioni.join('') + '</div>' +
      '</header>';
  }

  function renderServizi(config) {
    var lista = (config.servizi || []).filter(function (s) {
      return ok(typeof s === 'string' ? s : s && s.nome);
    });
    if (!lista.length) return '';
    var carte = lista.map(function (s) {
      var nome = typeof s === 'string' ? s : s.nome;
      var desc = typeof s === 'string' ? '' : s.descrizione;
      return '<li class="carta">' +
        '<h3 class="carta__titolo">' + esc(nome) + '</h3>' +
        (ok(desc) ? '<p class="carta__testo">' + esc(desc) + '</p>' : '') +
        '</li>';
    }).join('');
    return '<section class="sezione" id="servizi">' +
      '<h2 class="sezione__titolo">I nostri servizi</h2>' +
      '<ul class="carte">' + carte + '</ul>' +
      '</section>';
  }

  function renderOrari(config) {
    if (!haOrari(config)) return ''; // aucun horaire exploitable : la section disparaît
    var giorni = giorniAttivi(config);
    var righe = giorni.map(function (g) {
      var chiuso = /chius/i.test(g.valore);
      return '<tr data-giorno="' + g.chiave + '">' +
        '<th scope="row">' + esc(g.nome) + '</th>' +
        '<td' + (chiuso ? ' class="chiuso"' : '') + '>' + esc(g.valore) + '</td>' +
        '</tr>';
    }).join('');
    var parziale = giorni.length < 7
      ? '<p class="nota">Per gli altri giorni chiamaci: ti rispondiamo volentieri.</p>'
      : '';
    return '<section class="sezione" id="orari">' +
      '<h2 class="sezione__titolo">Orari di apertura</h2>' +
      '<table class="orari"><tbody>' + righe + '</tbody></table>' +
      parziale +
      '</section>';
  }

  function renderRecensione(config) {
    var r = config.recensione || {};
    if (!ok(r.testo)) return ''; // pas d'avis : rien plutôt que du vide
    return '<section class="sezione sezione--citazione" id="recensioni">' +
      '<h2 class="sezione__titolo">Dicono di noi</h2>' +
      '<figure class="citazione">' +
      '<blockquote>' + esc(r.testo) + '</blockquote>' +
      '<figcaption>' + (ok(r.autore) ? esc(r.autore) + ' · ' : '') + 'recensione Google</figcaption>' +
      '</figure>' +
      '</section>';
  }

  function renderMappa(config) {
    if (!ok(config.indirizzo) && !ok(config.maps_place_id)) return '';
    var src = mappaSrc(config);
    var titolo = 'Mappa · ' + (config.nome || '');
    return '<section class="sezione" id="dove">' +
      '<h2 class="sezione__titolo">Dove siamo</h2>' +
      (ok(config.indirizzo) ? '<p class="indirizzo">' + esc(config.indirizzo) + '</p>' : '') +
      '<div class="mappa" data-mappa data-src="' + esc(src) + '">' +
      '<p class="mappa__attesa">Caricamento della mappa…</p>' +
      '<noscript><iframe src="' + esc(src) + '" title="' + esc(titolo) +
      '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></noscript>' +
      '</div>' +
      '<a class="btn btn--vuoto btn--largo" href="' + esc(itinerarioLink(config)) +
      '" target="_blank" rel="noopener">Apri le indicazioni stradali</a>' +
      '</section>';
  }

  function renderFooter(config) {
    var righe = [];
    if (ok(config.indirizzo)) {
      righe.push('<a class="footer__link" href="' + esc(mapsLink(config)) +
        '" target="_blank" rel="noopener">' + esc(config.indirizzo) + '</a>');
    }
    if (ok(config.telefono)) {
      righe.push('<a class="footer__link" href="' + esc(telHref(config.telefono)) + '">' +
        esc(config.telefono) + '</a>');
    }
    if (ok(config.email)) {
      righe.push('<a class="footer__link" href="mailto:' + esc(config.email) + '">' + esc(config.email) + '</a>');
    }
    return '<footer class="footer">' +
      '<p class="footer__nome">' + esc(config.nome) + '</p>' +
      '<address class="footer__contatti">' + righe.join('') + '</address>' +
      '<p class="footer__legale">© <span data-anno>' + new Date().getFullYear() + '</span> ' +
      esc(config.nome) + '</p>' +
      '</footer>';
  }

  /* Barre fixe en bas : Chiama + WhatsApp. Chaque bouton disparaît si le champ est vide ;
     si aucun contact n'existe, on garde un bouton utile (itinéraire) plutôt qu'une barre vide. */
  function renderBarra(config) {
    var bottoni = [];
    if (ok(config.telefono)) {
      bottoni.push('<a class="barra__btn barra__btn--chiama" href="' + esc(telHref(config.telefono)) + '">' +
        iconaTel() + '<span>Chiama</span></a>');
    }
    if (ok(config.whatsapp)) {
      bottoni.push('<a class="barra__btn barra__btn--wa" href="' +
        esc(waHref(config.whatsapp, messaggioWa(config))) + '" target="_blank" rel="noopener">' +
        iconaWa() + '<span>WhatsApp</span></a>');
    }
    if (!bottoni.length) {
      bottoni.push('<a class="barra__btn barra__btn--chiama" href="' + esc(itinerarioLink(config)) +
        '" target="_blank" rel="noopener">' + iconaPin() + '<span>Come arrivare</span></a>');
    }
    return bottoni.join('');
  }

  function iconaTel() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.4 21 3 12.6 3 2c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z"/></svg>';
  }
  function iconaWa() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.1.1-.3.3-.1.6.1.2.6 1 1.3 1.7.9.8 1.6 1 1.8 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.7-.1 1.3Z"/></svg>';
  }
  function iconaPin() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>';
  }

  /* ---------- <head> ---------- */

  function descrizione(config) {
    var pezzi = [config.nome];
    if (ok(config.slogan)) pezzi.push(config.slogan);
    if (ok(config.indirizzo)) pezzi.push(config.indirizzo);
    if (ok(config.telefono)) pezzi.push('Tel. ' + config.telefono);
    return pezzi.join(' — ');
  }

  function titolo(config) {
    var coda = [config.categoria, 'Milano'].filter(ok).join(' a ');
    return config.nome + (coda ? ' | ' + coda.charAt(0).toUpperCase() + coda.slice(1) : '');
  }

  function jsonLd(config) {
    var dati = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: config.nome
    };
    if (ok(config.slogan)) dati.description = config.slogan;
    if (ok(config.telefono)) dati.telephone = numeroTel(config.telefono);
    if (ok(config.email)) dati.email = config.email;
    if (ok(config.indirizzo)) {
      var parti = String(config.indirizzo).split(',');
      var via = parti[0].trim();
      var resto = (parti[1] || '').trim().match(/^(\d{5})\s+(.*)$/);
      dati.address = {
        '@type': 'PostalAddress',
        streetAddress: via,
        postalCode: resto ? resto[1] : undefined,
        addressLocality: resto ? resto[2] : (parti[1] || 'Milano').trim(),
        addressCountry: 'IT'
      };
    }
    if (ok(config.rating)) {
      dati.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: config.rating,
        reviewCount: ok(config.num_recensioni) ? config.num_recensioni : undefined
      };
    }
    var spec = giorniAttivi(config).map(function (g) {
      var fasce = intervalli(g.valore);
      if (!fasce || !fasce.length) return null;
      return fasce.map(function (f) {
        return {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'https://schema.org/' + { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' }[g.schema],
          opens: hhmm(f.apre),
          closes: hhmm(f.chiude)
        };
      });
    }).filter(Boolean).reduce(function (a, b) { return a.concat(b); }, []);
    if (spec.length) dati.openingHoursSpecification = spec;
    if (ok(config.maps_place_id)) dati.hasMap = mapsLink(config);
    return JSON.stringify(dati).replace(/</g, '\\u003c');
  }

  function renderHead(config) {
    return [
      '<title>' + esc(titolo(config)) + '</title>',
      '<meta name="description" content="' + esc(descrizione(config)) + '">',
      '<meta name="theme-color" content="' + esc(config.colore_primario || '#1f2933') + '">',
      '<meta property="og:type" content="website">',
      '<meta property="og:locale" content="it_IT">',
      '<meta property="og:title" content="' + esc(titolo(config)) + '">',
      '<meta property="og:description" content="' + esc(descrizione(config)) + '">',
      renderTema(config),
      '<script type="application/ld+json">' + jsonLd(config) + '</' + 'script>'
    ].join('\n');
  }

  /* ---------- page complète ---------- */

  function renderMain(config) {
    return [
      renderHero(config),
      renderServizi(config),
      renderOrari(config),
      renderRecensione(config),
      renderMappa(config),
      renderFooter(config)
    ].filter(Boolean).join('\n');
  }

  return {
    GIORNI: GIORNI,
    esc: esc,
    ok: ok,
    intervalli: intervalli,
    giorniAttivi: giorniAttivi,
    haOrari: haOrari,
    statoApertura: statoApertura,
    mappaSrc: mappaSrc,
    mapsLink: mapsLink,
    itinerarioLink: itinerarioLink,
    titolo: titolo,
    descrizione: descrizione,
    renderTema: renderTema,
    renderHead: renderHead,
    renderMain: renderMain,
    renderBarra: renderBarra
  };
});
