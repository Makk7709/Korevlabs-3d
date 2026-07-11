# Guide utilisateur - verticale produit

## Lancement

La méthode recommandée est `docker compose up --build`, puis l'ouverture de `http://localhost:5173`. Les projets sont conservés dans le volume privé `korev_data`.

Le badge `API connected` doit être vert. Si l'API est indisponible, l'interface affiche son URL attendue au lieu de laisser les boutons échouer silencieusement.

## Créer et ouvrir un projet

`New project` demande un nom, crée le projet côté serveur et le sélectionne. Le sélecteur de la barre supérieure permet de rouvrir tout projet persistant.

## Importer une source

Formats actuellement exécutables :

| Format | Analyse | Spatialisation |
|---|---|---|
| PDF | pages, texte, métadonnées et titres probables | document central et sections avec références de page |
| Python | AST, classes, fonctions et imports | symboles algorithmiques reliés à leurs lignes |
| OBJ | sommets, faces et enveloppe | mesh réel chargé dans le viewport |
| GLB v2 | signature, version et longueur | scène binaire réelle chargée dans le viewport |

Les fichiers sont limités à 25 MiB, hashés en SHA-256 et contrôlés par signature ou parseur. Les GLTF à ressources externes ne sont pas acceptés : utiliser un GLB autonome.

L'import déclenche automatiquement la spatialisation. `Spatialize all` reconstruit explicitement toutes les sources dans une nouvelle révision sans dupliquer leurs objets.

## Examiner la provenance

Sélectionner un objet dans la scène ou dans `Scene graph`. L'inspecteur indique son type, son origine extraite ou inférée, puis chaque référence de source : page ou ligne, méthode et confiance.

Le clic sur une source affiche son analyse structurée dans le journal de droite.

## Utiliser le Physics Lab

`Physics Lab` bascule entre la scène issue des sources et une membrane simulée. Dans ce mode :

- cliquer sur la membrane injecte une impulsion au point choisi ;
- `Wave speed` règle la vitesse de propagation ;
- `Damping` règle l'atténuation ;
- `Impulse` règle l'énergie des prochains impacts ;
- `Pause` fige le solveur sans perdre son état ;
- `Reset` recrée les conditions initiales ;
- l'énergie et le nombre de pas apparaissent dans l'inspecteur.

La couleur représente l'amplitude absolue du déplacement. Les 48 points matérialisent les cellules d'échantillonnage et suivent la surface.

## Modifier une scène

Les champs X, Y et Z ne changent pas immédiatement l'état serveur :

1. modifier les coordonnées ;
2. sélectionner `Preview transform patch` ;
3. vérifier la révision de base ;
4. sélectionner `Approve and apply`.

Un autre changement entre la prévisualisation et l'approbation produit un conflit explicite. L'utilisateur doit alors recharger la scène et reformuler le patch.

## Statut de sécurité

Cette verticale est destinée au travail local contrôlé. Elle refuse de démarrer en production tant que l'authentification et les workers d'ingestion rootless ne sont pas livrés. Pour de la PI sensible : conserver le dépôt de code séparé des volumes de données et ne jamais commiter `.data/`.
