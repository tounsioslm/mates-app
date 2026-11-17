# 🚀 Guide de Déploiement Gratuit sur Render (Static Site)

Le site **Mates** est conçu comme une application web moderne (SPA) sans serveur complexe, ce qui permet de l'héberger **gratuitement, avec HTTPS sécurisé et nom de domaine automatique sur Render**.

---

## 📋 Prérequis (2 minutes)

1. Un compte gratuit sur [GitHub](https://github.com)
2. Un compte gratuit sur [Render](https://render.com)

---

## 🛠️ Méthode 1 : Déploiement automatique via GitHub (Recommandée)

### Étape 1 : Créer le dépôt sur GitHub
1. Rends-toi sur [github.com/new](https://github.com/new).
2. Nomme ton dépôt (par exemple : `mates-app` ou `mates-helmo`).
3. Laisse le dépôt en **Public**.
4. Ne coche pas "Initialize with README" (nous l'avons déjà créé en local).
5. Clique sur **Create repository**.

### Étape 2 : Envoyer le projet vers GitHub
Dans le terminal (PowerShell) ouvert dans le dossier `C:\Users\leila\Documents\Mates`, exécute les commandes suivantes en remplaçant `TON-NOM-UTILISATEUR` par ton pseudo GitHub :

```bash
git remote add origin https://github.com/TON-NOM-UTILISATEUR/mates-app.git
git branch -M main
git push -u origin main
```

---

### Étape 3 : Créer le service sur Render
1. Connecte-toi sur [dashboard.render.com](https://dashboard.render.com).
2. Clique sur le bouton bleu **+ New** en haut à droite, puis sélectionne **Static Site**.
3. Associe ton compte GitHub et sélectionne le dépôt `mates-app`.
4. Remplis les champs comme suit :
   - **Name :** `mates` (ou le nom de ton choix, ton URL sera `mates-xxxx.onrender.com`)
   - **Branch :** `main`
   - **Build Command :** *(laisser vide)*
   - **Publish Directory :** `.` *(un simple point pour publier la racine)*
5. Clique tout en bas sur **Create Static Site**.

🎉 **C'est tout !** En moins de 30 secondes, Render déploie le site et t'affiche une URL en `https://mates-xxxx.onrender.com`. À chaque `git push`, le site se met à jour automatiquement !

---

## ⚡ Méthode 2 : Déploiement instantané avec `render.yaml` (Blueprint)

Le fichier `render.yaml` est déjà présent dans ton projet. Tu peux également :
1. Sur Render, cliquer sur **+ New** > **Blueprint**.
2. Sélectionner ton dépôt GitHub `mates-app`.
3. Render va automatiquement lire le fichier `render.yaml` et configurer le site sans aucune action supplémentaire !

---

## 💻 Comment tester le site en local immédiatement ?

Tu peux simplement ouvrir le fichier `index.html` dans ton navigateur habituel (Chrome, Edge, Firefox) :
- Double-clique sur `index.html` dans l'explorateur de fichiers.
- Ou dans PowerShell : `start index.html`
