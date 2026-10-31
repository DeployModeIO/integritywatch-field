# IntegrityWatch Field — Manuel utilisateur

**Pour qui ce manuel est conçu :** opérateurs de terrain, ingénieurs de l'intégrité, superviseurs de maintenance et d'exploitation. Aucun savoir en programmation requis. L'application fonctionne **100 % en mode hors ligne**. Vos données ne quittent jamais votre ordinateur.

---

## 1. Installation et lancement de l'application

### Windows (portable)
1. Téléchargez `IntegrityWatch-Field-Portable.part1.rar` et `part2.rar` depuis GitHub Releases.
2. Placez toutes les parties dans le même dossier et extrayez avec WinRAR ou 7-Zip.
3. Cliquez deux fois sur `START-HERE.bat`. Un serveur local s'active et votre navigateur ouvre l'application.
4. L'application peut aussi fonctionner depuis une clé USB. Aucune installation, aucun droit d'administrateur requis.

### macOS
1. Décompressez le package et cliquez deux fois sur `START-HERE.command`.
2. Votre navigateur ouvre `http://localhost:8419`.

### Linux
1. Décompressez le package et cliquez deux fois sur `start.sh` (ou exécutez `./start.sh`).
2. Votre navigateur ouvre `http://localhost:8419`.

### Installation comme application (PWA) — recommandée pour l'utilisation quotidienne
1. Lancez l'application avec `START-HERE.bat`.
2. Dans la barre d'adresse du navigateur, cliquez sur l'icône **Installer** (ou sur le menu ⋮ → "Installer l'application").
3. À partir de maintenant, l'application s'ouvre via son propre icône et fonctionne entièrement hors ligne.

**Conditions d'utilisation :** Chrome, Edge, Firefox ou Safari (dernières versions). Écran minimum de 1366×768. Fonctionne sur tablettes et téléphones.

---

## 2. Première utilisation (5 minutes)

1. L'application s'ouvre avec des **données de démonstration** : 8 points de corrosion, 5 vannes, un pipeline avec 12 actifs, 9 actifs APM et environ 120 relevés. Cela permet de vérifier que tous les écrans fonctionnent.
2. **Choisissez votre langue** dans l'en-tête : Anglais, Español, Français, Português, 简体中文, Русский, العربية. L'arabe inverse l'ensemble de l'affichage de gauche à droite.
3. **Choisissez votre thème** : le bouton ☀/🌙/🖥 passe du mode clair au mode sombre puis automatique. Votre choix est conservé.
4. **Filtre de secteur** (Tout / Haut-étage / Milieu / Bas) filtre le tableau de bord et les actifs APM.

> Pour commencer avec vos propres données : menu **Administration → Réinitialiser les données de démonstration** (ou effacer tout).

---

## 3. Surveillance de la corrosion

1. **Créez un point de surveillance** : Corrosion → "Nouveau point". Remplissez le code (ex : MP-CORR-021), le matériau (13 aciers et alliages), le type de capteur (coupon, ER, LPR, capteur H₂S, UT, visuel) et les données de processus (H₂S, CO₂, pression, température, BS&W, vitesse, cible d'inhibiteur et résiduel). Ajoutez la protection cathodique et l'isolation contre la corrosion sous pression si applicable.
2. **Enregistrez les relevés** : ouvrez le point → "Nouveau relevé" → date + taux (mpy) + remarque.
3. **Enregistrez les coupons (paires inhibiteur/blanc)** : "Nouveau coupon" → choisissez le **Rôle** (Blanc ou Inhibé) et la **Paire** (ex : P3), puis le poids initial et final, la surface et les jours. Le taux de corrosion est calculé automatiquement (ASTM G1/G4). Le panneau **Efficacité de l'inhibiteur** compare les deux coupons et évalue le résultat (Excellent ≥90 %, Mauvais <70 %).
4. **Panels automatiques** : équilibre de l'inhibiteur (fenêtre 80–150 %), modèle De Waard–Milliams comparé aux mesures, évaluation de la corrosion acide NACE MR0175 (pH₂S), protection cathodique et corrosion sous pression.
5. **Dossier du point** : le bouton "Dossier du point" génère un rapport imprimable — une page par point de surveillance.

---

## 4. Vannes de sécurité de pression (PSV)

1. **Enregistrez une vanne** : "Nouvelle PSV" → étiquette, type (conventionnel / bouchon équilibré / piloté), fluide (11 préchargés, modifiable), pression de réglage, température, pression de retour et dates de tests.
2. **Dimensionnez la vanne** : ouvrez la vanne → onglets **Gaz** et **Liquid** :
   - Gaz : débit W, pression/température, Z, M, k → surface requise selon API 520. L'application détecte un débit critique ou sub-critique.
   - Liquide : débit Q, gravité G, viscosité → surface avec correction de viscosité Kv.
   - L'application **sélectionne l'orifice API 526** (D–T) et affiche la marge et la capacité réelle.
3. **Enregistrez la dimension** sur la vanne et imprimez le **fiche technique** (format API 520 / ISA).

---

## 5. Pipelines (milieu du parcours)

1. **Créez le système** : nom, opérateur, produit, diamètre, épaisseur de paroi, matériau, longueur et plage de station (km).
2. **Actifs de ligne** : à l'intérieur du système, "Nouvel actif de ligne" → type (12 types : vannes, joints, stations de pompe et de compresseur, réservoirs, traversées, zone de propriété, comptage…), kilomètre de station et côté.
3. **Inspections** : type (ILI, corrosion externe, visuel, UT, réparation, remplacement), section en km, gravité, constatations.
4. **Carte** : les nœuds sont tracés sur la ligne à échelle en km, colorés selon la gravité de l'inspection récente. Navigable au clavier (Tab et Entrée).

---

## 6. Performance des actifs (APM)

1. **Créez un actif** : code, nom, secteur, catégorie (puits, plateformes, pompes, compresseurs, échangeurs, tours, installations…), criticité A/B/C, et **risque POF × COF** (style RBI). La date de prochaine inspection est suggérée par la bande de risque.
2. **Enregistrez les événements** : panne, maintenance, arrêt non planifié, ordre de travail ou inspection, avec dates et temps d'arrêt. L'application calcule **la disponibilité, le MTBF et le MTTR** et affiche un indicateur de santé en traffic light.
3. La **matrice de risque 5×5** montre où se situe chaque actif et quel niveau de priorité d'inspection il reçoit.

---

## 7. Importation de vos données (CSV, WITSML, JSON)

1. Onglet **CSV** → "Choisir un fichier" (ou glisser le fichier). Accepte des fichiers séparés par virgule, point d'interrogation ou tabulation.
2. Vérifiez la **correspondance des colonnes** — l'application détecte automatiquement le point, la date, le taux, Wi, Wf, surface, jours, résiduel, température, bsw, catégorie, remarque. Les en-têtes en espagnol et en anglais sont reconnues.
3. Cochez **"Créer des points manquants"** si le fichier contient de nouveaux points de surveillance.
4. **Exécutez la validation** → le tableau des erreurs affiche les lignes invalides (date future, Wf supérieur à Wi, hors plage, point inconnu, les doublons sont ignorés). Si vous modifiez la case, validez à nouveau avant d'importer.
5. **Importez** → résumé, et l'action est enregistrée dans l'historique.
6. Onglets supplémentaires : **WITSML** (puits, trajectoires, canaux) et **JSON** (sauvegarde complète, mode fusion ou remplacement).

---

## 8. Règles et recommandations

- Cliquez sur **Exécuter les règles** (bouton en haut) pour analyser tout le système. L'application contient 17 règles d'ingénierie (R1–R17) : taux de perte de paroi, pitting, tests de PSV en retard, problèmes d'inhibiteur, constatations de pipeline et mouvements de risque APM.
- Chaque recommandation affiche la règle, les valeurs réelles, l'actif concerné et un lien vers son dossier.
- Actions : **Acknowledge** → **Résoudre** (avec une remarque). Tout est daté et attribué à l'utilisateur.
- Si la condition revient après résolution, la recommandation **se réouvre automatiquement**.

---

## 9. Rapports

1. **Rapport trimestriel** : sélectionnez la période → Générer → page d'accueil, indicateurs clés, graphique hebdomadaire, points les plus critiques, efficacité des paires, campagnes et recommandations ouvertes. Bouton **Imprimer** → "Enregistrer au format PDF".
2. **Dossier du point** : feuille technique + historique + calculs ASTM G1/G4 + classe SP0775 + évaluation MR0175.
3. **Fiche technique de vanne** : feuille complète de dimensionnement, copiable dans le presse-papier.

---

## 10. Sauvegardes

1. **Administration → Exporter** crée un fichier JSON contenant toutes vos données. Enregistrez-le sur le réseau ou sur une clé USB.
2. **Restaurer** : Ingestion → onglet JSON → choisissez le fichier → mode **fusion** (ajout) ou **remplacement** (restauration complète).
3. Faites une sauvegarde **chaque semaine** et toujours avant un grand import.

---

## 11. Recettes rapides

| Vous souhaitez… | Faites cela |
|---|---|
| Charger la campagne mensuelle de coupons | Ingestion → CSV → fichier → valider → importer → attribuer Role/Pair → Exécuter les règles → vérifier les recommandations |
| Programmer une inspection RBI | APM → actif → ajuster POF/COF → réplanifier la prochaine inspection (la date suit le risque) |
| Imprimer le rapport trimestriel | Rapports → Trimestriel → dates → Générer → Imprimer → PDF |
| Déplacer les données sur un second ordinateur | Administration → Exporter → copier le fichier JSON → sur l'autre ordinateur : Ingestion → JSON → fusion |

---

## 12. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| "Port occupé" lors de START-HERE | Un autre programme utilise le port 8419 | Exécutez `tools\serve.ps1 -Port 9000`, ou fermez l'autre programme |
| PowerShell bloque le script | Politique d'exécution | Utilisez `START-HERE.bat` (il inclut déjà le bypass), ou `py tools\serve.py` |
| Aucun bouton "Installer l'application" | Vous avez ouvert `index.html` depuis le disque | Démarrer avec `START-HERE.bat` (le PWA nécessite `http://localhost`) |
| Données disparues | Fenêtre privée ou données du site effacées | Restaurer votre sauvegarde JSON ; évitez le mode privé |
| Message "Mise à jour disponible" | Une nouvelle version est publiée | Cliquez sur **Recharger** sur le message |
| Version ancienne toujours affichée | Cache du service worker | Cliquez sur **Recharger**, ou Ctrl+F5 une fois, ou dans DevTools → Application → Service Workers → Mettre à jour |

---

## 13. Notes importantes

- IntegrityWatch Field est un **outil de support**. Il ne remplace pas l'appréciation d'un ingénieur qualifié.
- Vérifiez toutes les calculs contre la dernière édition des normes applicables (API 510/570/653, ASME PCC-2, NACE SP0775/MR0175, ASTM G1/G4) et les données du fabricant avant toute décision opérationnelle.
- Licence MIT. Libre d'utilisation, de copie et de modification. Lien vers le dépôt GitHub : voir le référentiel de ce projet.

---

## Validation de la saisie de données (31-10-2026)

Chaque module acceptant des données a été exercé via son propre formulaire : point de surveillance, relevé manuel, coupon, actif, événement d’actif, soupape, système de pipeline, actif de ligne, inspection, import CSV et les trois rapports. **9 formulaires enregistrés, 22 captures, 0 erreur.** Le stockage contient 9 points, 137 relevés, 5 coupons, 19 actifs, 25 événements, 6 PSV, 2 systèmes, 13 actifs de ligne et 6 inspections.

Dossier complet : `docs/data-entry-2026-10-31/`

![Nouveau point de surveillance](../data-entry-2026-10-31/02-corrosion-new-point.png)

![Coupon avec calcul ASTM](../data-entry-2026-10-31/04-corrosion-new-coupon.png)

![Événement de défaillance](../data-entry-2026-10-31/06-apm-new-event.png)

![Résultat d’inspection](../data-entry-2026-10-31/10-pipelines-new-inspection.png)

![Résumé de validation CSV](../data-entry-2026-10-31/12-ingest-csv-validation.png)
