# Noyau somatosensoriel causal

## Statut

Le laboratoire implémente un modèle **conceptuel** aligné sur la chaîne fonctionnelle du brevet : stimulus mécanique, propagation, conversion énergétique bornée, stockage, réveil autonome, acquisition distribuée, localisation TDOA, encodage somatotopique et rétro-modulation de la sensibilité.

Il ne constitue pas encore une validation expérimentale du textile réel. Les paramètres matière, rendements, seuils, délais et erreurs de localisation devront être calibrés sur prototype avant tout passage au niveau `calibrated`.

## Chaîne causale simulée

```text
impact mécanique borné en joules
  -> champ d'onde anisotrope X/Y
  -> activité de N mécanorécepteurs
  -> conversion piézo/triboélectrique simulée
  -> stockage borné par E_impact × rendement
  -> réveil au franchissement d'un seuil configurable
  -> mesure des temps d'arrivée
  -> localisation TDOA sur la carte somatotopique
  -> jeton horodaté : classe, modalité, coordonnées, énergie, confiance
  -> rétro-modulation de la sensibilité
```

La récupération d'énergie ne peut jamais dépasser l'énergie du stimulus multipliée par le rendement configuré. Cette contrainte remplace l'ancien cumul non causal qui pouvait créer artificiellement de l'énergie.

## Modèle de propagation

Le substrat est discrétisé sur une grille de 52 × 34 nœuds. Le solveur utilise deux vitesses de propagation indépendantes `c_x` et `c_y`, afin de représenter une anisotropie simple du textile. Les coefficients numériques sont renormalisés lorsque la condition CFL explicite est dépassée :

```text
(c_x dt / dx)² + (c_y dt / dy)² <= 0,49
```

Les conditions aux limites disponibles sont : fixe, réfléchissante et absorbante simplifiée.

## Réseau somatotopique

Le démonstrateur utilise 48 récepteurs en grille 8 × 6, conformément à la plage de 4 à 64 nœuds décrite dans le brevet. Chaque récepteur enregistre le premier franchissement du seuil de détection.

La localisation n'est plus un barycentre visuel. Elle minimise l'erreur entre les différences de temps d'arrivée observées et celles prédites pour chaque position candidate, en tenant compte des vitesses anisotropes et de la géométrie métrique du substrat.

Le jeton produit contient :

- identifiant et horodatage de l'événement ;
- classe `impact` et modalité `mechanical` ;
- coordonnées corporelles normalisées ;
- coordonnées de grille estimées ;
- énergie d'impact et énergie récupérée ;
- latence de réveil ;
- arrivées par capteur ;
- RMSE temporelle et confiance de localisation.

## Boucle efférente

Le paramètre `sensitivityGain` modifie le seuil effectif de détection. Il représente la rétro-modulation descendante prévue par le brevet. Cette première version ne modifie pas encore dynamiquement la topologie des capteurs ni les politiques de priorité énergétique.

## Limites non masquées

Le modèle ne simule pas encore explicitement les couches aramide/UHMWPE, PVDF/PTFE, le redressement Schottky GaN, les supercondensateurs MXene/graphène, les pertes électriques détaillées, la viscoélasticité non linéaire, les plis, la précontrainte, le bruit capteur, la dispersion fréquentielle ou une électronique neuromorphique réelle.

Les valeurs affichées sont donc des paramètres d'ingénierie exploratoire, pas des mesures certifiées.

## Validation nécessaire

La prochaine étape physique doit comparer le simulateur à un banc d'essai : impacts instrumentés, énergie récupérée, temps de réveil, temps d'arrivée par nœud, erreur de localisation et consommation de la chaîne de traitement. Les écarts devront alimenter une calibration versionnée et des intervalles de confiance.
