# Catalogue des prestations — Caprice D'Ebène

Extrait des 4 menus réels (Barber, Spa/Relaxation, Nails, Salon). Organisé en catégories
correspondant exactement aux regroupements déjà utilisés sur les affiches du salon.

**AP** = « à partir de » — prix de départ, pas fixe (couvert par la saisie manuelle du prix déjà
décidée pour le registre, aucun champ supplémentaire nécessaire).

---

## Barber

| Prestation             | Prix     |
| ---------------------- | -------- |
| Traçage                | 1 000 F  |
| Coupe simple           | 2 000 F  |
| Nattes simples         | 1 500 F  |
| Twist                  | 5 000 F  |
| Dreadlocks             | 25 000 F |
| Traitement dread       | 15 000 F |
| Curly                  | 4 000 F  |
| Coupe plus traitement  | 7 000 F  |
| Coupe plus soins barbe | 10 000 F |
| Coupe plus coloration  | 5 000 F  |

## Massages

| Prestation            | 30 min   | 60 min   |
| --------------------- | -------- | -------- |
| Massage dorsal        | 5 000 F  | 8 000 F  |
| Massage relaxant      | 10 000 F | 20 000 F |
| Massage sportif       | 20 000 F | 35 000 F |
| Massage thaïlandais   | 15 000 F | 25 000 F |
| Massage thérapeutique | 10 000 F | 18 000 F |

## Faciale

| Prestation           | Prix     |
| -------------------- | -------- |
| Coup d'éclat         | 5 000 F  |
| Soin classique       | 8 000 F  |
| Soin hydratant       | 10 000 F |
| Soin aux céréales    | 10 000 F |
| Soin anti-acné       | 15 000 F |
| Soin luminothérapie  | 15 000 F |
| Soin haute fréquence | 15 000 F |
| Soin anti-âge        | 20 000 F |

## Soins corporel

| Prestation                            | Prix     |
| ------------------------------------- | -------- |
| Hammam                                | 5 000 F  |
| Hammam gommage hydratant              | 15 000 F |
| Hammam gommage éclaircissant          | 18 000 F |
| Hammam gommage modelage enveloppement | 20 000 F |

## Onglerie

| Prestation                              | Prix     |
| --------------------------------------- | -------- |
| Manucure sèche                          | 3 000 F  |
| Manucure trempée                        | 5 000 F  |
| Gants hydratants                        | 2 500 F  |
| Vernis gel                              | 3 000 F  |
| Manucure sèche + vernis gel sur capsule | 7 000 F  |
| Gainage                                 | 10 000 F |
| Construction sur capsule                | 12 000 F |
| Construction sur chablon                | 15 000 F |
| Baby boomer                             | 15 000 F |
| Construction 3D                         | 25 000 F |
| Décoration (AP)                         | 2 000 F  |
| Dépose                                  | 2 000 F  |

## Pédicure

| Prestation             | Prix     |
| ---------------------- | -------- |
| Pédicure sèche         | 4 000 F  |
| Pédicure spa           | 10 000 F |
| Pédicure traitante     | 15 000 F |
| Chaussettes traitantes | 2 500 F  |

## Soins de cheveux

| Prestation                  | Prix     |
| --------------------------- | -------- |
| Shampooing                  | 2 000 F  |
| Traitement de cheveux       | 10 000 F |
| Coloration noir (AP)        | 5 000 F  |
| Coloration couleur (AP)     | 7 000 F  |
| Défrisage (AP)              | 5 000 F  |
| Traitement de perruque (AP) | 7 000 F  |

## Tresses

| Prestation               | Prix     |
| ------------------------ | -------- |
| Nattes simples           | 1 000 F  |
| Gros rasta               | 4 000 F  |
| Moyens rasta             | 6 500 F  |
| Petit rasta              | 8 500 F  |
| Gros rasta américains    | 6 000 F  |
| Moyens rasta américains  | 8 000 F  |
| Petit rasta américains   | 10 000 F |
| Micro twist (AP)         | 25 000 F |
| Passe mèche (AP)         | 5 000 F  |
| Dreadlocks (AP)          | 25 000 F |
| Retouche dreadlocks (AP) | 15 000 F |
| Faux locks (AP)          | 5 000 F  |

## Pose perruque

| Prestation             | Prix    |
| ---------------------- | ------- |
| Perruque               | 3 000 F |
| Closure                | 4 000 F |
| Lace frontale          | 5 000 F |
| Lace + customisation   | 8 000 F |
| Chignon avec lace      | 5 000 F |
| Coiffure perruque (AP) | 3 000 F |

## Enfant

| Prestation          | Prix    |
| ------------------- | ------- |
| Nattes simples      | 1 000 F |
| Renversés en pompon | 2 500 F |
| Rasta               | 5 000 F |
| Curly               | 3 000 F |
| Chignon             | 2 000 F |

## Beauty

| Prestation    | Prix     |
| ------------- | -------- |
| Babyliss      | 5 000 F  |
| Brushing (AP) | 3 000 F  |
| Lissage (AP)  | 4 000 F  |
| Curly (AP)    | 10 000 F |

---

## Implication schéma

Onze catégories au total (Barber, Massages, Faciale, Soins corporel, Onglerie, Pédicure, Soins
de cheveux, Tresses, Pose perruque, Enfant, Beauty). Modèle proposé : `ServiceCategory`,
tenant-scopé, même pattern que `JobTitle` (nom libre géré par le salon, pas de liste imposée —
un autre salon pourrait avoir des catégories complètement différentes). `Service.categoryId`
en référence.

## Points à trancher avant le prompt

1. **Nattes simples** apparaît trois fois (Barber 1 500 F, Tresses 1 000 F, Enfant 1 000 F) —
   même nom, prix et catégorie différents. Faut-il les garder comme prestations distinctes par
   catégorie (recommandé, évite toute ambiguïté au registre), ou dédupliquer ?
2. **Massages** — un seul Service avec deux prix (30/60 min) nécessite un champ durée sur le
   prix lui-même (pas juste un `defaultPrice`), ou bien deux lignes de Service séparées
   ("Massage dorsal 30 min" / "Massage dorsal 60 min") ? La deuxième option ne demande aucun
   changement de schéma.
3. **Curly** apparaît dans Barber (4 000 F) et Beauty (AP 10 000 F) — même remarque qu'au point 1.

_Document de travail — à valider avant intégration au schéma des prestations._
