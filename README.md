# Vetrine locali — template de site vitrine + génération et déploiement en lot

Template de **site vitrine une page en italien**, HTML/CSS/JS pur : aucune
dépendance, aucun framework, aucun build. Le template lit un objet `config`
qui correspond à **un élément du tableau `clienti`** de `data/clienti.json`.

Un script Node génère un dossier de site par client dans `/siti`, et un script
shell les déploie tous sur Netlify en une commande.

```
data/clienti.json      les fiches clients (source de vérité)
template/              le template (ouvrable tel quel dans un navigateur)
  index.html           coquille + marqueurs de pré-rendu
  style.css            feuille de style unique, mobile-first
  render.js            rendu HTML partagé navigateur + Node
  app.js               comportements navigateur
  config.js            exemple de config (réécrit à la génération)
scripts/
  genera.js            génère /siti/<id>/ pour chaque client
  deploy.sh            déploiement Netlify en lot
  serve.js             serveur statique local (relecture sur téléphone)
  mappa-netlify.js     correspondance client → site Netlify
netlify-siti.json      créé au premier déploiement, à versionner
siti/                  sortie générée (non versionnée)
```

## Utilisation

```bash
npm run genera              # génère les 9 sites dans siti/
npm run genera -- --solo la-pelucchiera,pet-club
npm run genera -- --pulisci # vide siti/ d'abord
npm run serve               # http://localhost:4173/ + adresse LAN pour le téléphone
```

`npm run genera` affiche pour chaque client les champs manquants (téléphone,
horaires, avis) et donc les sections qui seront masquées — c'est la liste des
questions à poser en boutique.

## Le template

Un seul objet en entrée, exactement la forme d'un élément de `clienti` :

```js
window.CONFIG_VETRINA = { id, nome, categoria, slogan, indirizzo, telefono,
  whatsapp, email, orari, servizi, recensione, rating, num_recensioni,
  colore_primario, colore_accento, maps_place_id };
```

Sections, dans l'ordre :

| Section | Contenu | Si le champ est vide |
|---|---|---|
| Hero | `nome`, `slogan`, note Google (`rating` + `num_recensioni`), badge « Aperto ora / Chiuso » calculé depuis `orari` | la note disparaît si `rating` est `null` ; le badge disparaît si aucun horaire n'est connu |
| Servizi | une carte par service | section masquée si `servizi` est vide |
| Orari | tableau, jour courant surligné | **les jours vides ne sont pas affichés** ; si aucun jour ne porte de vraie plage horaire (fiche vide, ou seulement « Chiuso »), toute la section disparaît |
| Recensioni | 2-3 avis Google, chacun sur un **post-it** (papier teinté par la couleur d'accent, adhésif, coin corné, léger angle) | section masquée si `recensioni` est vide |
| Mappa | iframe Google chargée à l'approche de l'écran | lien « indications » toujours présent |
| Footer | nom, **adresse**, téléphone, e-mail | chaque ligne absente est simplement omise |
| Barre fixe | **Chiama** + **WhatsApp** | WhatsApp masqué si `whatsapp` est vide ; sans téléphone ni WhatsApp, la barre bascule sur « Come arrivare » plutôt que de rester vide |

Les champs internes (`note_prospezione`, `stato`, `esito`, dates…) ne sont
**jamais** copiés dans le site publié.

### Avis

Les avis vivent dans `recensioni`, un tableau de 2 à 3 avis choisis :

```json
"recensioni": [
  { "testo": "…texte italien copié tel quel depuis Google Maps…",
    "autore": "Elisa R.", "data": "febbraio 2026", "stelle": 5 }
]
```

`data` et `stelle` sont facultatifs. Chaque avis devient un post-it, et le
corps de texte rétrécit d'un cran au-delà de 170 puis de 320 caractères pour
que toutes les fiches gardent la même allure. Les avis partent aussi dans le
JSON-LD (`review`). Le champ `recensione` au singulier reste accepté.

### Couleurs

`colore_primario` (aplats : hero, en-tête, pied de page) et `colore_accento`
(boutons, soulignés, étoiles, teinte du papier des post-it) sont censées venir
de la **devanture ou de l'enseigne** du commerce. Comme on ne peut rien
présumer de leur clarté, tout ce qui doit rester lisible est calculé à la
génération plutôt que fixé :

- `--su-primario` / `--su-accento` : texte noir ou blanc, selon le meilleur
  contraste sur l'aplat ;
- `--accento-chiaro` : l'accent éclairci juste ce qu'il faut pour atteindre un
  contraste de 3,5:1 sur le fond du hero (utilisé pour les étoiles et le
  sur-titre).

Une palette de devanture peut donc être remplacée sans rien casser : deux
valeurs dans `data/clienti.json`, `npm run genera`, c'est tout. La page
`siti/index.html` affiche les pastilles des 9 palettes pour les comparer.

### Mobile-first strict

La cible est un écran de 6 pouces tenu à bout de bras, et le reste n'est que de
l'amélioration progressive :

- corps de texte 17→19 px fluide, aucun texte publié sous ~14,5 px ;
- cibles tactiles de 52 px minimum, barre de contact au pouce ;
- une seule colonne jusqu'à 560 px, aucun survol nécessaire ;
- `viewport-fit=cover` + `env(safe-area-inset-*)` (encoche et barre gestuelle iOS) ;
- hauteur de la barre fixe mesurée au chargement et re-mesurée si le texte
  grossit, pour qu'elle ne recouvre jamais la fin du contenu ;
- carte Google chargée seulement quand elle entre dans l'écran (données mobiles) ;
- vérifié sans débordement horizontal de 320 px à 1920 px, y compris avec la
  police système agrandie à 22 px.

### Et sur ordinateur

Au-delà de 900 px le site change de mise en page plutôt que de s'étirer :

- la barre fixe du bas disparaît au profit d'une **en-tête collante** (nom,
  menu des sections réellement présentes, bouton d'appel) ;
- hero centré, typographie plus haute, respirations doublées ;
- services sur trois colonnes, post-it en grille (redressés au survol) ;
- **horaires et carte côte à côte** — mais seulement si les deux existent :
  une section seule reprend toute la largeur avec une colonne de lecture
  limitée, pour qu'une fiche incomplète ne laisse jamais une demi-page vide ;
- gouttières alignées au pixel entre l'en-tête, les sections et le pied de
  page, à toutes les largeurs (vérifié à 1024, 1280, 1440 et 1920 px).

Le HTML est **pré-rendu** par le générateur : la page est complète sans
JavaScript (indexation Google, JSON-LD `LocalBusiness` avec horaires et note).
Ouvert directement, `template/index.html` se construit à la volée depuis
`template/config.js` — pratique pour travailler le design.

### Carte Google

Sans clé d'API, l'iframe utilise l'embed classique sur l'adresse et le
`maps_place_id` sert aux liens « ouvrir dans Google Maps » / « indications ».
Avec une clé Maps Embed, l'iframe pointe directement sur le `place_id` :

```bash
npm run genera -- --maps-key AIza...     # ou GOOGLE_MAPS_EMBED_KEY=...
```

## Déploiement Netlify en lot

Un site Netlify par client, une URL stable par client. Le premier déploiement
crée les sites (`vetrina-<id>.netlify.app`) et enregistre la correspondance
dans `netlify-siti.json` ; les suivants réutilisent le même site.

```bash
npm run genera
NETLIFY_AUTH_TOKEN=xxxx npm run deploy                     # tout, en production
NETLIFY_AUTH_TOKEN=xxxx npm run deploy -- --bozza          # deploy preview
NETLIFY_AUTH_TOKEN=xxxx npm run deploy -- --solo studio49
NETLIFY_AUTH_TOKEN=xxxx npm run deploy -- --prefisso vetrina --account mon-equipe
```

Le jeton se crée sur
<https://app.netlify.com/user/applications#personal-access-tokens>.
`netlify-cli` est utilisé s'il est installé, sinon via `npx`. Le script
affiche à la fin le tableau des URLs de production — c'est cette liste qu'on
montre en rendez-vous.

## Ajouter ou mettre à jour un client

1. modifier la fiche dans `data/clienti.json` (le tableau `recensioni` se
   remplit en copiant le texte italien d'origine depuis Google Maps, il ne
   s'invente pas) ;
2. `npm run genera` ;
3. `npm run serve` et relecture sur un vrai téléphone ;
4. `npm run deploy`.
