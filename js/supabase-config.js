/**
 * MATES. — Configuration Supabase (comptes utilisateurs)
 *
 * Colle ici les 2 valeurs de ton projet Supabase :
 *   Supabase > Project Settings > API
 *     - "Project URL"            -> SUPABASE_URL
 *     - "anon public" (API key)  -> SUPABASE_ANON_KEY
 *
 * La clé "anon public" est faite pour être visible dans le navigateur :
 * la sécurité est assurée par les règles (RLS) du fichier supabase/schema.sql.
 * Ne mets JAMAIS ici la clé "service_role".
 *
 * Tant que ces valeurs sont vides, le site fonctionne en mode démo
 * (connexion simulée, rien n'est enregistré en ligne).
 */
const MATES_SUPABASE_CONFIG = {
  url: "https://auzmawvzjpaoxjqxzjsj.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1em1hd3Z6anBhb3hqcXh6anNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1Mjc3ODEsImV4cCI6MjExMTEwMzc4MX0.NTBXzKKFE2e8VMUyubGYlXY5K0-_H8Lzyvn7GMzQIgY",
  // Passe chaque option à true seulement après avoir activé le fournisseur dans
  // Supabase > Authentication > Providers (voir SUPABASE_SETUP.md)
  googleEnabled: true,  // Connexion Google (activée dans Supabase > Authentication > Providers)
  // ID client Google (public, pas secret) : Google Cloud > Google Auth Platform > Clients
  googleClientId: "194373679701-hroohie6uvu1m5rjv9jsc2fncltqu8rr.apps.googleusercontent.com"
};
