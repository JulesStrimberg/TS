/*
 * app.js — comportements côté navigateur.
 * 1. si la page n'a pas été pré-rendue par le générateur, elle est construite ici
 *    à partir de l'objet `config` (window.CONFIG_VETRINA) ;
 * 2. badge « Aperto ora / Chiuso », mis à jour toutes les minutes ;
 * 3. jour courant surligné dans le tableau des horaires ;
 * 4. carte Google chargée seulement quand elle entre dans l'écran (données mobiles).
 */
(function () {
  'use strict';

  var config = window.CONFIG_VETRINA;
  if (!config || !window.Vetrina) return;
  var V = window.Vetrina;

  /* --- 1. rendu de secours (ouverture directe du template, sans build) --- */
  if (document.documentElement.getAttribute('data-prerender') !== 'true') {
    document.head.insertAdjacentHTML('beforeend', V.renderHead(config));
    var main = document.querySelector('[data-main]');
    var barra = document.querySelector('[data-barra]');
    var testata = document.querySelector('[data-testata]');
    if (main) main.innerHTML = V.renderMain(config);
    if (barra) barra.innerHTML = V.renderBarra(config);
    if (testata) testata.innerHTML = V.renderTestata(config);
    document.documentElement.setAttribute('data-prerender', 'true');
  }

  /* --- 2. état d'ouverture --- */
  var nodoStato = document.querySelector('[data-stato]');

  function aggiornaStato() {
    if (!nodoStato) return;
    var stato = V.statoApertura(config, new Date());
    if (!stato) { nodoStato.hidden = true; return; }
    nodoStato.hidden = false;
    nodoStato.textContent = stato.testo;
    nodoStato.setAttribute('data-aperto', String(stato.aperto));
  }

  aggiornaStato();
  setInterval(aggiornaStato, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) aggiornaStato();
  });

  /* --- 3. jour courant dans le tableau --- */
  (function () {
    var chiave = V.GIORNI[(new Date().getDay() + 6) % 7][0];
    var riga = document.querySelector('.orari tr[data-giorno="' + chiave + '"]');
    if (riga) riga.setAttribute('data-oggi', '');
  })();

  /* --- 4. carte chargée à la demande --- */
  (function () {
    var box = document.querySelector('[data-mappa]');
    if (!box) return;
    var src = box.getAttribute('data-src');
    if (!src) return;

    function carica() {
      if (box.querySelector('iframe')) return;
      var iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = 'Mappa · ' + (config.nome || '');
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.setAttribute('allowfullscreen', '');
      box.appendChild(iframe);
    }

    if (!('IntersectionObserver' in window)) { carica(); return; }
    var osservatore = new IntersectionObserver(function (voci) {
      voci.forEach(function (v) {
        if (v.isIntersecting) { carica(); osservatore.disconnect(); }
      });
    }, { rootMargin: '300px' });
    osservatore.observe(box);
  })();

  /* --- 5. hauteur réelle de la barre fixe (2 lignes si le texte est agrandi) --- */
  (function () {
    var barra = document.querySelector('[data-barra]');
    if (!barra) return;
    function misura() {
      var h = barra.getBoundingClientRect().height;
      if (h > 0) document.documentElement.style.setProperty('--barra-h', Math.ceil(h) + 'px');
    }
    misura();
    window.addEventListener('resize', misura);
    window.addEventListener('orientationchange', misura);
    // le texte peut grossir après coup (réglage d'accessibilité, police système)
    if ('ResizeObserver' in window) new ResizeObserver(misura).observe(barra);
    window.addEventListener('load', misura);
  })();

  /* --- 6. année du pied de page (site statique servi pendant des mois) --- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-anno]'), function (n) {
    n.textContent = String(new Date().getFullYear());
  });
})();
