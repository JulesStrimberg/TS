#!/usr/bin/env bash
#
# deploy.sh — déploiement en lot de tous les sites de /siti sur Netlify.
#
# Un site Netlify par client. La correspondance client → site Netlify est
# mémorisée dans netlify-siti.json : le site est créé au premier déploiement,
# puis réutilisé (l'URL reste stable, on peut la donner au commerçant).
#
#   NETLIFY_AUTH_TOKEN=xxx ./scripts/deploy.sh            # tout, en production
#   ./scripts/deploy.sh --bozza                           # deploy preview
#   ./scripts/deploy.sh --solo la-pelucchiera,pet-club    # un sous-ensemble
#   ./scripts/deploy.sh --prefisso vetrina                # préfixe des sous-domaines
#
# Jeton : https://app.netlify.com/user/applications#personal-access-tokens

set -euo pipefail

RADICE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RADICE"

DIR_SITI="siti"
PREFISSO="${NETLIFY_PREFISSO:-vetrina}"
ACCOUNT="${NETLIFY_ACCOUNT_SLUG:-}"
SOLO=""
PRODUZIONE=1

aiuto() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR_SITI="$2"; shift 2 ;;
    --prefisso) PREFISSO="$2"; shift 2 ;;
    --account) ACCOUNT="$2"; shift 2 ;;
    --solo) SOLO="$2"; shift 2 ;;
    --bozza) PRODUZIONE=0; shift ;;
    -h|--help|--aiuto) aiuto ;;
    *) echo "Opzione sconosciuta: $1" >&2; exit 1 ;;
  esac
done

# --- outils ---------------------------------------------------------------

if command -v netlify >/dev/null 2>&1; then
  NETLIFY=(netlify)
else
  echo "netlify-cli non installé : utilisation de npx (première exécution un peu lente)."
  NETLIFY=(npx --yes netlify-cli)
fi

if [ -z "${NETLIFY_AUTH_TOKEN:-}" ]; then
  echo "NETLIFY_AUTH_TOKEN non défini — la CLI utilisera la session locale (netlify login)."
fi

[ -d "$DIR_SITI" ] || { echo "Dossier $DIR_SITI absent. Lance d'abord : npm run genera" >&2; exit 1; }

contiene() { # contiene <liste csv> <valeur>
  case ",$1," in *",$2,"*) return 0 ;; *) return 1 ;; esac
}

# --- boucle de déploiement ------------------------------------------------

ETICHETTA=$([ "$PRODUZIONE" -eq 1 ] && echo "produzione" || echo "bozza")
echo ""
echo "Déploiement Netlify — $ETICHETTA — préfixe « $PREFISSO »"
echo ""

FALLITI=()
CONTATORE=0

for CARTELLA in "$DIR_SITI"/*/; do
  ID="$(basename "$CARTELLA")"
  [ -f "$CARTELLA/index.html" ] || continue
  if [ -n "$SOLO" ] && ! contiene "$SOLO" "$ID"; then continue; fi

  SITE_ID="$(node scripts/mappa-netlify.js get "$ID" || true)"

  if [ -z "$SITE_ID" ]; then
    NOME="$PREFISSO-$ID"
    echo "→ création du site Netlify « $NOME »"
    if ! CREAZIONE="$("${NETLIFY[@]}" sites:create --name "$NOME" ${ACCOUNT:+--account-slug "$ACCOUNT"} --json 2>/dev/null)"; then
      echo "  ✗ création impossible (nom déjà pris ? équipe à préciser avec --account)"
      FALLITI+=("$ID")
      continue
    fi
    SITE_ID="$(printf '%s' "$CREAZIONE" | node scripts/mappa-netlify.js campo site_id id)"
    URL="$(printf '%s' "$CREAZIONE" | node scripts/mappa-netlify.js campo ssl_url url)"
    if [ -z "$SITE_ID" ]; then
      echo "  ✗ réponse inattendue de sites:create"
      FALLITI+=("$ID")
      continue
    fi
    node scripts/mappa-netlify.js set "$ID" "$SITE_ID" "$URL"
  fi

  echo "→ $ID"
  ARGOMENTI=(deploy --dir "$CARTELLA" --site "$SITE_ID" --message "vetrina $ID $(date +%F)")
  [ "$PRODUZIONE" -eq 1 ] && ARGOMENTI+=(--prod)

  if RISPOSTA="$("${NETLIFY[@]}" "${ARGOMENTI[@]}" --json 2>/dev/null)"; then
    URL="$(printf '%s' "$RISPOSTA" | node scripts/mappa-netlify.js campo ssl_url url deploy_url)"
    [ "$PRODUZIONE" -eq 1 ] && [ -n "$URL" ] && node scripts/mappa-netlify.js set "$ID" "$SITE_ID" "$URL"
    echo "  ✓ ${URL:-déployé}"
    CONTATORE=$((CONTATORE + 1))
  else
    echo "  ✗ échec du déploiement"
    FALLITI+=("$ID")
  fi
done

# --- récapitulatif --------------------------------------------------------

echo ""
echo "$CONTATORE site(s) déployé(s)."
if [ ${#FALLITI[@]} -gt 0 ]; then
  echo "Échecs : ${FALLITI[*]}"
fi
echo ""
echo "URLs de production :"
node scripts/mappa-netlify.js elenca
echo ""

[ ${#FALLITI[@]} -eq 0 ]
