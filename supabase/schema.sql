-- =====================================================================
-- MATES. — Base de données des profils (Supabase)
-- À coller une seule fois dans : Supabase > SQL Editor > New query > Run
-- =====================================================================

-- 1. Table des profils publics (1 ligne par compte)
--    L'email et le mot de passe restent dans auth.users (géré par Supabase),
--    ils ne sont jamais copiés ici.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  first_name   text not null default '',
  last_name    text not null default '',
  age          int check (age is null or age between 13 and 99),
  city         text not null default '',
  bio          text not null default '',
  avatar       text,
  sports       jsonb not null default '[]'::jsonb,
  availability jsonb not null default '{}'::jsonb,
  live_until   timestamptz,               -- « Dispo pour jouer ce soir ⚡ »
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Projet déjà créé avec une ancienne version de ce fichier ? Cette ligne ajoute la colonne manquante.
alter table public.profiles add column if not exists live_until timestamptz;

-- 2. Sécurité : tout le monde peut LIRE les profils (page « Trouver un mate »),
--    mais chacun ne peut MODIFIER que le sien.
alter table public.profiles enable row level security;

drop policy if exists "Profils visibles par tous" on public.profiles;
create policy "Profils visibles par tous"
  on public.profiles for select
  using (true);

drop policy if exists "Chacun cree son profil" on public.profiles;
create policy "Chacun cree son profil"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Chacun modifie son profil" on public.profiles;
create policy "Chacun modifie son profil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3. Création automatique du profil à l'inscription
--    (prénom / nom repris du formulaire d'inscription)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'first_name', 40), ''),
    coalesce(left(new.raw_user_meta_data ->> 'last_name', 40), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
