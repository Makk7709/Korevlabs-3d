# Modèle de menace initial

## Actifs critiques

- documents et algorithmes confidentiels ;
- propriété intellectuelle et résultats non publiés ;
- géométries, datasets et paramètres expérimentaux ;
- identités, autorisations et décisions d'approbation ;
- intégrité des simulations et de leur provenance ;
- ressources CPU/GPU et stockage.

## Frontières

1. navigateur vers Domain API ;
2. CAEL vers CAEL Gateway ;
3. API vers stockage ;
4. file de jobs vers workers ;
5. quarantaine vers espace d'artefacts validés ;
6. fournisseurs IA externes éventuels.

## Menaces prioritaires

| Menace | Exemple | Contrôle attendu |
|---|---|---|
| Prompt injection documentaire | un PDF ordonne à CAEL d'exfiltrer un projet | contenu traité comme donnée, scopes serveur |
| Exécution arbitraire | code chargé ou métadonnée de mesh | parsing sandboxé, aucun shell générique |
| Déni de service | mesh de milliards de faces | quotas taille/temps/mémoire |
| Traversée de chemin | nom de texture `../../secret` | stockage adressé par hash |
| SSRF | URL de texture interne | fetcher allowlisté ou réseau coupé |
| Confused deputy | CAEL agit sur un autre projet | identité et project scope liés au token |
| Patch périmé | modification appliquée après changement humain | expected base revision |
| Unités trompeuses | millimètres interprétés en mètres | unités obligatoires et validation dimensionnelle |
| Fausse provenance | objet présenté comme extrait | source refs signées par le pipeline |
| Exfiltration fournisseur | document confidentiel envoyé au LLM | classification et routage local par défaut |
| Supply chain | convertisseur ou image compromis | versions figées, SBOM, signature d'image |

## Règles de lancement

- Le V0 refuse explicitement de démarrer avec un environnement autre que `development` ou `test` tant que l'authentification n'est pas livrée.
- Aucun upload public avant livraison de la quarantaine.
- Aucun moteur de code utilisateur avant sandbox rootless, sans réseau et bornée.
- Aucun connecteur CAEL en production avant authentification service-to-service et tests de confused deputy.
- Aucun qualificatif « calibré » sans dataset de calibration et métriques attachés.
- Aucun détail de brevet ou document restreint dans ce dépôt public.

## Tests hostiles minimum

- opération de patch inconnue ;
- révision absente ou périmée ;
- identifiant d'objet invalide ;
- NaN, Infinity et valeurs hors bornes ;
- payload surdimensionné ;
- doublon de clé d'idempotence avec contenu différent ;
- source sans hash ;
- changement d'unité silencieux ;
- artefact dont le hash ne correspond pas ;
- simulation dépassant budget, profondeur ou durée.
