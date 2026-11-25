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
| **Créer mon profil** (en haut à droite) | Crée un vrai compte (email ou Google) |
| Après l'inscription | Assistant en 4 étapes : photo, prénom, âge, ville → sports et niveaux → dispos → bio |
| Connexion | Vérifie vraiment l'email et le mot de passe |
| **Mon profil → Enregistrer** | Sauvegarde le profil en ligne (visible depuis n'importe quel appareil) |
| **Page d'un sport** | Les nouveaux inscrits apparaissent à côté des profils d'exemple (filtres niveau, ville, dispo) |
| Mot de passe oublié ? | Envoie un vrai lien de réinitialisation par email |
| Se déconnecter | Ferme la session |

Pour voir les comptes créés : Supabase → **Authentication** → **Users**.
Pour voir les profils : **Table Editor** → `profiles`.

## 6. Connexion Google (optionnel)

Tant que Google n'est pas activé, le bouton affiche simplement « bientôt disponible » :
l'inscription par email fonctionne toujours. Après chaque activation, passe l'option
correspondante à `true` dans [`js/supabase-config.js`](js/supabase-config.js), puis `git push`.

L'adresse de retour à donner au fournisseur est :
`https://<ton-projet>.supabase.co/auth/v1/callback`
(Supabase → **Authentication** → **Sign In / Providers** → ouvre le fournisseur, l'adresse y est affichée).

### Google (gratuit) → `googleEnabled: true`
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Créer des identifiants** → **ID client OAuth** → type **Application Web**.
2. **URI de redirection autorisés** : colle l'adresse de retour ci-dessus.
3. Supabase → **Authentication** → **Sign In / Providers** → **Google** → active, colle le **Client ID** et le **Client Secret**.

> En **mode démo** (sans Supabase), la connexion Google est simulée et crée un compte de démonstration.

## 7. Photos de profil

Le fichier `schema.sql` crée aussi le dossier de stockage **avatars** (public, 2 Mo max par photo).
Si tu as exécuté une ancienne version du fichier, relance-le en entier dans **SQL Editor** : il ne casse rien.
Les photos sont recadrées en carré et réduites dans le navigateur avant l'envoi.

## 8. Chat des matchs

Le fichier `schema.sql` crée aussi la table **match_messages** et l'active en **temps réel** :
les messages apparaissent instantanément chez tous les joueurs inscrits au match.
Relance le fichier en entier dans **SQL Editor** si tu l'avais exécuté avant cette mise à jour.

En **mode démo**, les messages restent dans le navigateur et un autre joueur « répond »
automatiquement quelques secondes plus tard, pour montrer le fonctionnement.


## 9. Clubs, réservations et administration

Le fichier `schema.sql` (sections 6 à 12) ajoute :

- **Rôles** : un compte peut être `admin` ; un admin peut aussi **bloquer** un compte.
- **Clubs** : un joueur connecté clique sur « Inscrire mon club » (`#devenir-club`). Sa demande reste
  « en attente » jusqu'à ce qu'un admin la valide. Le club gère ensuite ses terrains, horaires, tarifs
  et son planning dans `#mon-club`.
- **Réservations** : les joueurs réservent un créneau libre (paiement sur place). Le prix est calculé
  par la base, et un même créneau ne peut jamais être réservé deux fois.
- **Matchs créés par les joueurs** : enregistrés en ligne et visibles par tout le monde.
- **Sports** : la liste des sports est modifiable depuis l'admin.

### Désigner un administrateur

L'adresse des administrateurs n'est **pas** dans le code (le dépôt est public). Dans **SQL Editor** :

```sql
insert into public.admin_emails (email) values ('adresse@exemple.com');
```

Le compte devient admin tout de suite s'il existe déjà, sinon dès son inscription. L'administration
est ensuite accessible via l'icône bouclier en haut à droite, ou à l'adresse `#admin`.
