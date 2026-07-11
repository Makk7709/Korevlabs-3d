# Noyau physique interactif

## Modèle livré

Le Physics Lab utilise une équation d'onde bidimensionnelle discrétisée sur une grille régulière. Il est destiné à explorer qualitativement propagation, atténuation, localisation et activation distribuée : il ne prétend pas reproduire un matériau réel sans calibration.

Pour un déplacement vertical `u`, le Laplacien discret est :

```text
L(u[i,j]) = u[i-1,j] + u[i+1,j] + u[i,j-1] + u[i,j+1] - 4 u[i,j]
```

La mise à jour conserve une vitesse implicite entre deux états, applique une rétention exponentielle liée à l'amortissement, puis ajoute le terme de propagation :

```text
u_next = u + (u - u_previous) exp(-damping dt) + coefficient L(u)
```

Le coefficient est borné à `0,49` pour respecter la condition de stabilité du schéma explicite 2D. Les valeurs de paramètres hostiles sont clampées afin que le solveur reste fini.

## Paramètres

- grille : 52 × 34, soit 1 768 sommets ;
- solveur : 120 Hz fixe ;
- maximum : 8 sous-pas par frame pour éviter la spirale de rattrapage ;
- frontière : bords fixes ;
- excitation : impulsion gaussienne au point cliqué ;
- capteurs : 8 × 6 instances échantillonnant le champ ;
- télémétrie : nombre de pas et énergie numérique.

## Optimisations 3D

- tableaux `Float32Array` préalloués et permutation des buffers sans allocation par pas ;
- mise à jour en place des attributs position/couleur ;
- normales recalculées une frame sur trois ;
- capteurs rendus par `InstancedMesh` ;
- sections PDF et symboles Python regroupés par type en `InstancedMesh` ;
- DPR borné entre 1 et 1,75 ;
- limite de 8 sous-pas et abandon contrôlé de l'arriéré ;
- assets OBJ/GLB normalisés une seule fois et mis en cache par les loaders.
- moteur 3D chargé à la demande : le bundle initial reste séparé du chunk Three.js.

## Ce que ce modèle ne prouve pas

Le solveur actuel ne modélise pas encore anisotropie, viscoélasticité non linéaire, interfaces multicouches, précontrainte, plasticité, plis ou couplage électromécanique. Ces phénomènes devront être ajoutés sous forme de plugins versionnés, comparés à une vérité terrain et marqués `calibrated` uniquement après validation expérimentale.

## Prochaine montée en fidélité

1. coefficients distincts selon X/Y pour l'anisotropie ;
2. couches couplées avec impédances et réflexions ;
3. carte spatiale de matériaux ;
4. conditions aux limites configurables ;
5. solveur Web Worker puis WebGPU pour les campagnes lourdes ;
6. calibration par optimisation sur mesures physiques ;
7. intervalles de confiance attachés aux champs reconstruits.
