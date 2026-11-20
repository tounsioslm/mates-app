# 🔐 Activer les vrais comptes utilisateurs (Supabase)

Mates utilise **Supabase** (gratuit) pour les inscriptions, les connexions et l'enregistrement des profils.
Tant que ce n'est pas configuré, le site tourne en **mode démo** (connexion simulée).

Temps nécessaire : environ 5 minutes.

---

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → **Start your project** → connecte-toi avec GitHub.
2. **New project** :
   - **Name :** `mates`
   - **Database Password :** génère-en un et garde-le de côté (il ne servira pas dans le site)
   - **Region :** `West EU (Ireland)` ou `Central EU (Frankfurt)`
3. Attends 1 à 2 minutes que le projet soit prêt.

## 2. Créer la table des profils

1. Menu de gauche → **SQL Editor** → **New query**.
2. Copie-colle **tout** le contenu du fichier [`supabase/schema.sql`](supabase/schema.sql).
3. Clique sur **Run**. Tu dois voir « Success. No rows returned ».

## 3. Régler les adresses du site

Menu **Authentication** → **URL Configuration** :

- **Site URL :** l'adresse de ton site Render (ex. `https://mates-xxxx.onrender.com`)
- **Redirect URLs :** ajoute la même adresse, plus `http://localhost:5500` si tu testes en local

C'est ce qui permet aux liens reçus par email (confirmation, mot de passe oublié) de revenir sur ton site.

## 4. (Optionnel) Confirmation par email

Par défaut, Supabase envoie un email de confirmation à chaque inscription.
Pour une démo en classe, c'est plus simple de la couper :

**Authentication** → **Sign In / Providers** → **Email** → décoche **Confirm email** → **Save**.

> ℹ️ Le service d'email gratuit de Supabase est limité à quelques emails par heure. Couper la confirmation évite d'être bloqué pendant une présentation.

## 5. Brancher le site

1. Menu **Project Settings** → **API** (ou **Data API**).
2. Copie :
   - **Project URL** (ex. `https://abcdefgh.supabase.co`)
   - la clé **anon public** (une longue chaîne qui commence par `eyJ...`), ou la **publishable key** (`sb_publishable_...`) sur les nouveaux projets
3. Ouvre [`js/supabase-config.js`](js/supabase-config.js) et colle-les :

```js
const MATES_SUPABASE_CONFIG = {
  url: "https://abcdefgh.supabase.co",
  anonKey: "eyJhbGciOi...",
  googleEnabled: false
};
```

> ⚠️ N'utilise **jamais** la clé `service_role` / `secret` : elle donne tous les droits sur la base.
> La clé `anon` / `publishable`, elle, est faite pour être publique : ce sont les règles du fichier `schema.sql` qui protègent les données (chacun ne peut modifier que son propre profil).

4. Envoie les changements sur GitHub (`git push`). Render redéploie le site tout seul.

---

## ✅ Ce que ça donne

| Action | Résultat |
|---|---|
| **Créer mon profil** (en haut à droite) | Crée un vrai compte (email + mot de passe, 6 caractères min.) |
| Connexion | Vérifie vraiment l'email et le mot de passe |
| **Mon profil → Enregistrer** | Sauvegarde le profil en ligne (visible depuis n'importe quel appareil) |
| **Trouver un mate** | Les nouveaux inscrits apparaissent en premier, à côté des profils d'exemple |
| Mot de passe oublié ? | Envoie un vrai lien de réinitialisation par email |
| Se déconnecter | Ferme la session |

Pour voir les comptes créés : Supabase → **Authentication** → **Users**.
Pour voir les profils : **Table Editor** → `profiles`.

## (Plus tard) Connexion Google

1. Crée des identifiants OAuth dans la [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Supabase → **Authentication** → **Sign In / Providers** → **Google** → colle le Client ID et le Secret.
3. Dans `js/supabase-config.js`, passe `googleEnabled` à `true`.

Tant que ce n'est pas fait, le bouton « Continuer avec Google » affiche simplement « bientôt disponible ».
