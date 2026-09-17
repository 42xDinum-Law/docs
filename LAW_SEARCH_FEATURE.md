# Recherche d'articles de loi (Légifrance) — branche `feat-api-client`

Ce document récapitule, pour présentation à l'équipe, tout ce qui a été implémenté sur la branche `feat-api-client` par rapport à `main`. Il part du principe que le lecteur connaît déjà Docs, et se concentre uniquement sur la nouvelle fonctionnalité `/loi`.

## Ce qui a été construit, en une phrase

Un utilisateur tape `/loi` dans l'éditeur, cherche un article de loi en langage naturel (ex. "licenciement pour faute grave"), voit une liste de résultats réels issus de Légifrance, et insère l'un d'eux dans son document — sous forme de simple lien, de citation, ou de bloc encadré complet avec date et statut.

## Les briques externes utilisées

- **Légifrance** : le site officiel du gouvernement français qui publie l'ensemble des textes de loi (codes, lois, décrets, arrêtés, ordonnances). C'est la source des articles trouvés.
- **API Albert** : une API d'intelligence artificielle développée par Etalab (service de l'État français dédié à la donnée publique). Elle héberge notamment une collection indexée des textes Légifrance, interrogeable en langage naturel, et propose aussi des modèles de langage (chat, reformulation) hébergés en France. C'est le seul service tiers auquel se connecte cette fonctionnalité — aucune donnée n'est envoyée à un fournisseur d'IA étranger.
- La feature ne cherche que les textes **en vigueur** ("VIGUEUR" dans Légifrance) — pas les textes abrogés ou historiques.

## Parcours utilisateur (ce qu'on voit à l'écran)

1. Dans l'éditeur, l'utilisateur tape `/loi`. Un champ de recherche s'ouvre automatiquement, avec le focus déjà dedans.
2. Il tape sa requête (ex. "congés payés"). Après une courte pause (300 millisecondes sans frappe, pour ne pas lancer une recherche à chaque lettre), une liste de résultats apparaît dans un menu déroulant sous le champ.
3. Chaque résultat affiche : une icône selon le type de texte (loi, code, décret...), le titre de l'article, et un court résumé généré automatiquement (une phrase, en français).
4. Des onglets au-dessus de la liste permettent de filtrer par catégorie (ex. uniquement les "Codes"), reconstruits à chaque recherche selon ce qui est effectivement trouvé.
5. Au survol d'un résultat, trois boutons d'action apparaissent, pour trois façons d'insérer l'article dans le document :
   - **Lien** : insère juste le titre de l'article, cliquable, pointant vers la page Légifrance correspondante. C'est aussi ce qu'on obtient en appuyant sur `Entrée` (sur le meilleur résultat), comme un raccourci rapide.
   - **Texte complet** : insère "Titre : texte intégral de l'article", sans lien — pour citer le contenu directement.
   - **Bloc encadré** ("callout") : insère un bloc visuellement distinct (fond gris, icône ⚖️) contenant le titre (lien), la date de promulgation et le statut "en vigueur", puis le texte complet en italique. C'est la version la plus "présentable" pour un document officiel.
6. Si l'utilisateur tape `Échap` sans rien choisir, ce qu'il avait tapé est réinséré tel quel comme texte normal (rien n'est perdu). S'il efface tout avec `Retour arrière`, le champ de recherche disparaît, comme s'il avait juste effacé le `/`.
7. Si la recherche échoue (panne réseau, API indisponible), un message d'erreur clair s'affiche au lieu d'un menu vide silencieux.

Cette fonctionnalité est **entièrement optionnelle et activable/désactivable** : elle n'apparaît dans le menu slash que si elle est explicitement activée côté configuration (voir plus bas). Un déploiement où elle est désactivée ne montre rien de nouveau à l'utilisateur.

## Comment ça marche techniquement (vue d'ensemble)

```
Éditeur (utilisateur tape "/loi ...")
        │
        ▼
Frontend : composant de recherche (React)
        │  GET /api/v1.0/law-search/?q=...
        ▼
Backend Django : endpoint dédié, protégé (utilisateur connecté requis)
        │
        ▼
Client Albert (backend) : envoie la requête à l'API Albert
        │
        ▼
API Albert : cherche dans sa collection Légifrance, renvoie des extraits pertinents
        │
        ▼
Backend : reclasse les résultats par pertinence, génère un résumé pour chacun
        │
        ▼
Frontend : affiche la liste, insère le résultat choisi dans le document
```

Le backend ne se contente pas de relayer la requête telle quelle : il fait deux traitements supplémentaires avant de répondre au frontend.

1. **Reclassement des résultats ("reranking")** : l'API Albert renvoie d'abord jusqu'à 50 résultats par une recherche classique par mots-clés. Ce type de recherche a un défaut connu : une référence exacte comme "décret 84-1110" peut se retrouver noyée parmi beaucoup d'autres textes qui partagent juste le mot "décret" ou des chiffres. Pour corriger ça, le backend redemande à Albert de reclasser ces 50 résultats par pertinence réelle par rapport à la question posée, et ne garde que les 10 meilleurs. C'est un compromis vitesse/qualité : la première passe (mots-clés) est rapide et peu coûteuse, la seconde (reclassement) est plus fine mais seulement appliquée à un nombre limité de candidats.
2. **Génération de résumés** : pour chacun des 10 résultats retenus, le backend demande à un modèle de langage léger de produire un résumé d'une phrase (80 caractères max), en français, sans mise en forme. Ces 10 demandes sont envoyées en parallèle (pas les unes après les autres) pour que l'attente supplémentaire reste proche de celle d'un seul appel plutôt que d'être multipliée par 10. Si un résumé échoue individuellement (timeout, erreur), ce résultat précis affichera simplement un extrait brut du texte à la place — l'échec d'un résumé n'empêche jamais d'afficher les résultats.

### Ce que fait précisément le nouveau code, brique par brique

**Backend (Python/Django)**

- Un **client HTTP générique** (`ExternalAPIClient`) a été créé : une classe de base pour appeler n'importe quelle API tierce authentifiée par jeton ("bearer token"), avec gestion d'erreurs uniforme. Elle n'est pas spécifique à Albert — l'idée est que la prochaine intégration d'API externe (ex. la Base Adresse Nationale, ou l'API Sirene des entreprises) réutilise cette même base plutôt que de réécrire la logique de requête HTTP.
- Un **client Albert** (`AlbertApiClient`), qui hérite du client générique, implémente la logique métier décrite ci-dessus (recherche, reclassement, résumés) spécifiquement pour la collection Légifrance.
- Un **nouvel endpoint** `GET /api/v1.0/law-search/?q=<recherche>` :
  - Accessible uniquement aux utilisateurs connectés.
  - Refuse de répondre si la fonctionnalité n'est pas activée en configuration (voir plus bas).
  - Vérifie que la recherche envoyée fait entre 1 et 500 caractères.
  - Si l'appel à Albert échoue, répond avec un code d'erreur "502" (erreur côté fournisseur externe) plutôt qu'une erreur générique — utile pour distinguer en supervision "notre code a un bug" de "le service externe est en panne".
- Une **limite de fréquence dédiée** ("rate limit") : comme la recherche loi se déclenche à chaque pause de frappe, elle génère beaucoup plus de requêtes qu'une génération de texte par IA classique déjà existante dans l'app. Une limite séparée (20 requêtes/minute, 200/heure, 1000/jour par utilisateur) a donc été créée pour cette fonctionnalité, afin qu'elle ne consomme pas le quota partagé avec les autres fonctionnalités IA existantes et ne pénalise pas les autres usages.
- De nouveaux réglages de configuration ont été ajoutés (clé d'API Albert, URL de l'API, identifiant de la collection Légifrance, modèles utilisés pour le reclassement et les résumés, interrupteur marche/arrêt de la fonctionnalité).
- Des tests automatisés couvrent : le comportement de l'endpoint (accès refusé si non connecté, si fonctionnalité désactivée, si erreur externe), et le client Albert (recherche, reclassement, génération de résumé, gestion des échecs partiels, filtrage par catégorie).

**Frontend (React/TypeScript)**

- Le composant `/loi` réutilise le même mécanisme qu'une fonctionnalité de recherche déjà existante dans l'éditeur (le lien interne entre documents), pour rester cohérent avec le reste de l'application plutôt que d'inventer un nouveau pattern.
- Toutes les chaînes de texte affichées sont traduites (français par défaut, structure prête pour d'autres langues).
- Attention particulière portée à l'**accessibilité** : le champ de recherche et la liste de résultats utilisent les rôles standards attendus par les lecteurs d'écran (combobox, listbox), et la catégorie de chaque résultat est annoncée vocalement même si elle n'est affichée que visuellement par une icône.
- Le composant entier ne s'affiche que si la fonctionnalité est activée côté serveur (récupéré via la configuration publique de l'application au chargement) — donc désactivable sans redéployer de code, juste en changeant une variable d'environnement côté serveur.

## Une seconde brique, à part : `/api-search` (prototype)

En plus de `/loi`, la branche contient un second bloc, `/api-search`, qui n'a **pas de rapport fonctionnel** avec la recherche de lois. C'est une démonstration du même pattern ("chercher puis insérer un résultat") appliqué à deux API publiques de test (une liste d'utilisateurs factices, et des photos de chiens aléatoires). Son but est de prouver que l'architecture du client HTTP générique se prête bien à d'autres intégrations futures. Ce n'est pas destiné à être livré en production tel quel.

## Comment activer/désactiver la fonctionnalité

Trois réglages, tous côté serveur, doivent être réunis pour que `/loi` fonctionne :

1. Un interrupteur dédié doit être activé (`LAW_SEARCH_FEATURE_ENABLED`).
2. Une clé d'accès valide à l'API Albert doit être fournie (`ALBERT_API_KEY`) — sans elle, l'endpoint échoue dès la première utilisation (pas au démarrage du serveur).
3. L'identifiant de la collection Légifrance dans Albert doit être renseigné (`LAW_SEARCH_LEGIFRANCE_COLLECTION_ID`).

Si l'un des trois manque, soit la fonctionnalité reste invisible (interrupteur désactivé — cas normal), soit elle échoue proprement avec une erreur explicite (clé ou identifiant manquant alors que l'interrupteur est activé — cas de mauvaise configuration).

En environnement de développement, ces réglages sont déjà pré-remplis dans les fichiers de configuration du projet, à l'exception de la clé d'API elle-même qui doit être fournie individuellement (question de sécurité : une clé d'API n'est jamais versionnée dans le code).

## Limites connues (ce qui n'est volontairement pas fait dans cette branche)

- Seuls les textes **en vigueur** sont cherchés — pas les textes abrogés, ni d'autres bases que Légifrance.
- **Pas de mise en cache** des résultats de recherche côté serveur : chaque pause de frappe déclenche un véritable appel à l'API Albert (recherche + reclassement + génération de résumés). Seuls le délai de 300ms et la limite de fréquence protègent contre un volume d'appels excessif.
- **Pas de pagination** : au maximum 10 résultats sont retournés, sans possibilité d'en afficher davantage.
- Le bloc `/api-search` est un prototype de démonstration technique, non lié à la fonctionnalité de recherche de lois et non destiné à la production.
