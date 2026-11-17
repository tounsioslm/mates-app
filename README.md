# 🎾 Mates. — L'application de sport amateur tout-en-un

> **Projet académique :** UE04 – Analyse Informatique (HELMo)  
> **Enseignant :** Christophe Thomas  
> **Auteur :** Leila  
> **Design & Identité :** Thème sportif vert néon inspiré du logo officiel (`#C0FB18`) et modèle inspiré de Playtomic.

---

## 📖 Présentation du projet

**Mates** est l'application tout-en-un qui facilite la pratique du sport amateur en groupe. 

Inspirée du modèle de Playtomic, mais ouverte à **tous les sports collectifs et de raquette** (padel, football, basket-ball, tennis, badminton, volley-ball, running, escalade, squash, tennis de table, rugby, handball, musculation, natation), Mates permet aux joueurs de :
1. **Trouver des partenaires** de leur niveau près de chez eux.
2. **Rejoindre des matchs ouverts** où il manque des joueurs.
3. **Réserver un terrain** en quelques clics dans les complexes partenaires.

---

## 📱 Les 7 Écrans Principaux (Conformes aux Wireframes)

1. **Accueil (`#home`)**
   - En-tête avec logo officiel Mates et navigation.
   - Bandeau d'accroche avec le badge « 14 sports », grand slogan percutant et 2 boutons d'action (« Trouver un mate », « Explorer les sports »).
   - Carte de match en direct style Playtomic (Padel 2 vs 2, reste 1 place).
   - Bande « Choisis ton terrain » : Grille des 14 sports cliquables avec compteurs de mates actifs.
   - Trois cartes « Comment ça marche » (01 Crée ton profil, 02 Filtre, 03 Bouge).

2. **Recherche de mates (`#mates`)**
   - Titre « Trouve ton mate ».
   - Barre de filtres en temps réel : par **sport**, par **niveau** (Débutant, Intermédiaire, Confirmé, Expert), par **ville** (Liège, Bruxelles, Namur, etc.).
   - Grille de cartes de mates : photo, prénom/âge, ville, distance GPS, bio, badges sports + niveau, boutons « Voir profil » et « Jouer ».

3. **Liste des sports (`#sports`)**
   - Titre « Les sports » avec recherche instantanée.
   - 14 cartes de sports avec grande icône, catégorie, description courte, nombre de joueurs recommandés et bouton vers la page dédiée.

4. **Page d'un sport (`#sport/:id`)**
   - Bandeau dynamique : icône du sport, nom, slogan officiel, statistiques clés (joueurs, durée moyenne, complexes).
   - Bouton d'action « Filtrer les mates » (pré-filtre la recherche sur ce sport).
   - Section « Ils pratiquent [sport] » avec liste des joueurs spécifiques.
   - Section des terrains & clubs partenaires recommandés avec tarifs.

5. **Profil public (`#mate/:id`)**
   - Carte identité : grand avatar, nom, prénom, âge, ville, bio, badges de fiabilité et fair-play.
   - Carte Sports : liste détaillée des sports pratiqués avec jauges d'étoiles et niveaux.
   - **Carte Disponibilités : Grille hebdomadaire Jours (Lun - Dim) × Créneaux (Matin, Midi, Après-midi, Soir)** avec cases actives mises en valeur en vert électrique.
   - Bouton « Proposer une partie ».

6. **Mon profil (édition) (`#edit-profile`)**
   - Titre + bouton « Voir public ».
   - Photo de profil cliquable (modification d'avatar en direct).
   - Formulaire d'édition : Prénom, Nom, Âge, Ville avec bouton interactif « Position GPS ».
   - Gestion dynamique des sports : ajout parmi les 14 disciplines, réglage du niveau et suppression (×).
   - **Grille de disponibilités cliquable** : active ou désactive n'importe quel créneau en un clic.
   - Boutons « Enregistrer » (sauvegarde locale `localStorage` + notification toast) et « Se déconnecter ».

7. **Connexion / Inscription (`#auth`)**
   - Carte centrale moderne avec logo Mates.
   - Bouton d'authentification sociale « Continuer avec Google ».
   - Formulaire Email / Mot de passe avec bascule fluide entre Connexion et Inscription.
   - Bouton de pré-remplissage rapide d'un compte de démonstration pour les présentations.

---

## 📊 Section Analyse Informatique & Modélisation UML (UE04 HELMo)

Accessible directement via l'onglet **📊 Analyse & UML** (`#uml`) :
- **Diagramme de Cas d'Utilisation UML** interactif au format standard (Acteur primaire `Joueur` à gauche, Acteurs secondaires `Système de paiement` et `Système de géolocalisation` à droite, relations `<<include>>` et `<<extend>>`).
- **Fiches textuelles de cas d'utilisation** rédigées selon le formalisme enseigné par M. Christophe Thomas (Nom avec verbe à l'infinitif, Événement déclencheur, Description, Acteurs, Préconditions, Postconditions, Garanties).

---

## 🚀 Déploiement sur Render

Consulte le fichier [DEPLOY_RENDER.md](file:///c:/Users/leila/Documents/Mates/DEPLOY_RENDER.md) pour héberger le site gratuitement en 3 minutes sur **Render**.
