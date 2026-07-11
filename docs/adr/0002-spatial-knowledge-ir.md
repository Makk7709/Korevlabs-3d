# ADR 0002 - Spatial Knowledge IR canonique

Statut : accepté.

## Décision

Les sources ne génèrent pas directement du code de rendu. Elles sont normalisées vers une représentation intermédiaire sémantique, versionnée et indépendante de Three.js ou d'un moteur de simulation particulier.

## Raisons

La SKIR conserve provenance, unités et hypothèses ; elle permet de changer de renderer, de comparer des révisions et d'empêcher qu'une interprétation visuelle soit confondue avec la source.

## Conséquences

Le schéma SKIR devient une API publique interne et suivra un versioning sémantique. Toute migration doit être déterministe et testée.

