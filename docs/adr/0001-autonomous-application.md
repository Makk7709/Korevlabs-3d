# ADR 0001 - Application autonome reliée à CAEL

Statut : accepté.

## Décision

KOREV Labs 3D est développé comme une application autonome. CAEL se connecte via un gateway dédié et des commandes de domaine typées.

## Raisons

Cette séparation réduit le rayon d'explosion, permet des cycles de livraison indépendants, conserve un usage sans LLM et rend les autorisations observables à une frontière unique.

## Conséquences

Les modèles d'identité, de projet et de révision doivent être cohérents entre les deux systèmes. Le connecteur nécessite un versioning explicite et des tests de compatibilité.

