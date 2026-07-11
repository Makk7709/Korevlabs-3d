# Modèle textile non linéaire

Ce moteur remplace la membrane linéaire pure par un modèle réduit de textile multicouche destiné à la simulation exploratoire d'impacts.

## Algorithmes intégrés

- masse surfacique discrétisée par nœud ;
- traction orthotrope chaîne/trame ;
- cisaillement diagonal ;
- précontrainte ;
- rigidité de flexion discrète ;
- amortissement visqueux ;
- endommagement progressif au-delà de la limite élastique ;
- perforation lorsque l'énergie dépasse la capacité balistique indicative ;
- conservation de l'énergie cinétique transférée lors de l'impact ;
- séparation entre énergie incidente, énergie transférée, énergie résiduelle, dissipation et énergie récupérée ;
- TDOA calculé sur un front de signal mécanique distinct du mouvement global de la membrane.

## Statut des paramètres

Les profils aramide, UHMWPE et élastomère sont des profils numériques non calibrés. Ils servent à vérifier les algorithmes, les tendances et l'architecture logicielle. Ils ne doivent pas être interprétés comme une certification balistique ou une prédiction de protection réelle.

La simulation réelle exigera des mesures de banc : masse surfacique, courbes contrainte-déformation selon chaîne et trame, cisaillement, précontrainte, vitesse de propagation, amortissement, diamètre et masse du projectile, énergie transférée, flèche arrière, endommagement et perforation.

## Échelle visuelle

Le rendu utilise une conversion constante de mètres physiques vers unités 3D. Il ne normalise plus la déformation par l'énergie de l'impact. Une énergie plus élevée produit donc une flèche visuelle plus importante jusqu'à l'endommagement ou la perforation. Une compression logarithmique ne s'applique qu'au-delà d'une amplitude d'affichage très élevée afin d'éviter la destruction de la caméra, sans modifier l'état physique.