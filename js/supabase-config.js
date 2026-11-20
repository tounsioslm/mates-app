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
  url: "",
  anonKey: "",
  // Passe à true seulement après avoir activé Google dans
  // Supabase > Authentication > Providers > Google
  googleEnabled: false
};
