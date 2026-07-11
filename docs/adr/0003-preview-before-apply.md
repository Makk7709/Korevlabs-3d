# ADR 0003 - Prévisualisation avant application

Statut : accepté.

## Décision

Toute mutation proposée par CAEL est stockée comme patch, prévisualisée, puis explicitement appliquée contre une révision de base exacte.

## Raisons

Une réponse de modèle n'est pas une autorisation. Le diff rend l'intention compréhensible et le verrou de révision empêche les écrasements concurrents.

## Conséquences

Le système accepte un surcoût d'interaction. Des mandats bornés pourront ultérieurement autoriser certaines opérations réversibles, sans supprimer l'enregistrement du patch.

