// Nom stable partagé par le navigateur et le serveur. Indispensable en local :
// NEXT_PUBLIC_SUPABASE_URL utilise localhost tandis que SUPABASE_INTERNAL_URL utilise
// le hostname Docker nginx ; le nom par défaut dérivé de l’URL serait donc différent.
export const SUPABASE_AUTH_COOKIE = "saluni-auth";
