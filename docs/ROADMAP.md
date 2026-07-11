# Feuille de route auditable

La roadmap est organisée en chantiers produisant chacun une preuve démontrable. Une date n'est fixée qu'après mesure de la vélocité ; les dépendances et critères de sortie sont fixés dès maintenant.

## Chantier 0 - Fondations et frontière CAEL

**Objectif** : rendre l'architecture exécutable sans créer de faux sentiment de sécurité.

Livrables :

- monorepo web/API ;
- modèle Project/SceneRevision/Patch ;
- preview puis apply avec verrou de révision ;
- CI, tests et documentation de menace ;
- ADR sur l'application autonome et les intentions typées.

Critères de sortie :

- build frontend et tests API verts ;
- opération non enregistrée refusée ;
- patch périmé refusé ;
- aucun secret ni contenu KOREV confidentiel dans le repo public.

Statut initial : **livré dans la PR de bootstrap**.

## Chantier 1 - Spatial Workbench V0

**Objectif** : manipuler une scène sémantique avec provenance.

Livrables : viewport R3F, scene graph, inspector, gizmos, import GLB, niveaux conceptual/parametric/calibrated, diff avant/après et undo par révision.

Preuves : scénario E2E chargeant une scène, modifiant un objet et restaurant la révision précédente.

## Chantier 2 - Ingestion contrôlée

**Objectif** : accepter PDF, code, données et mesh sans leur faire confiance.

Livrables : upload signé, quarantaine, MIME réel, limites d'archives, workers rootless, adaptateurs PDF/AST/mesh, rapport d'ambiguïtés et SKIR v1.

Preuves hostiles : PDF malformé, archive récursive, mesh géant, métadonnées injectées, unités absentes et tentative de path traversal.

## Chantier 3 - Algorithm Graph

**Objectif** : relier algorithmes et objets spatiaux.

Livrables : graphe visuel, ports typés, paramètres avec unités, version de code, visualisation des entrées/sorties et liaison d'un nœud aux zones 3D.

Preuves : remplacement d'un nœud sur une branche, comparaison des résultats et traçabilité jusqu'au code source.

## Chantier 4 - Experiment Engine

**Objectif** : rendre les simulations reproductibles et comparables.

Livrables : manifeste de moteur, jobs bornés, graines, datasets, métriques, timeline, runs A/B, campagnes Monte-Carlo et artefacts Parquet/GLB.

Preuves : reproduction bit-à-bit lorsque le moteur le garantit ; sinon tolérances documentées et testées.

## Chantier 5 - CAEL Gateway

**Objectif** : permettre la co-conception conversationnelle sans déléguer l'autorité au modèle.

Livrables : API/MCP étroit, authentification service-to-service, scopes par projet, idempotence, budgets, preview obligatoire, UI d'approbation et rattachement aux Missions CAEL.

Preuves hostiles : prompt injection dans un PDF, outil hors scope, replay, patch concurrent, dépassement de budget et usurpation de project_id.

## Chantier 6 - PRISM et Evidence

**Objectif** : visualiser divergences et provenance décisionnelle lorsqu'ils seront disponibles.

Livrables : adaptateurs, vues de consensus, désaccords, sources soutenant chaque interprétation, scellement des artefacts et export de dossier de preuve.

La disponibilité de PRISM/Evidence n'est pas une dépendance des chantiers 0 à 5.

## Chantier 7 - Industrialisation

**Objectif** : exploitation confidentielle et multi-projet.

Livrables : SSO, RBAC/ABAC, chiffrement, rétention, observabilité, sauvegarde/restauration, quotas, facturation calcul, déploiement GPU optionnel et procédures d'incident.

## Ordre de démonstration recommandé

1. Charger un GLB et explorer sa provenance.
2. Demander à CAEL un patch paramétrique et afficher son diff.
3. Approuver, appliquer et restaurer la révision.
4. Charger un algorithme simple lié à un objet 3D.
5. lancer deux runs et comparer spatialement leurs résultats.
6. Charger un PDF et distinguer visuellement extraction, calcul et hypothèse.

## Discipline de livraison

Chaque chantier exige : ADR si nécessaire, contrat versionné, tests nominaux, tests hostiles, métriques de qualité, démonstration reproductible, revue de sécurité et documentation opérateur. Aucun chantier n'est marqué terminé sur la seule présence de code.

