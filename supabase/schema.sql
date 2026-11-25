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

-- 2. Sécurité : tout le monde peut LIRE les profils (pages des sports),
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
--    (prénom / nom / photo repris de Google ou Apple si disponibles ;
--     le reste est rempli par l'assistant « Crée ton profil »)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, avatar)
  values (
    new.id,
    coalesce(left(coalesce(new.raw_user_meta_data ->> 'first_name',
                           split_part(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)), 40), ''),
    coalesce(left(coalesce(new.raw_user_meta_data ->> 'last_name',
                           nullif(substring(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '') from position(' ' in coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')) + 1), coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))), 40), ''),
    case when new.raw_user_meta_data ->> 'avatar_url' like 'https://%'
         then left(new.raw_user_meta_data ->> 'avatar_url', 500) end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Photos de profil : dossier public « avatars »
--    Chacun peut envoyer / remplacer des photos uniquement dans SON dossier (avatars/<son id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Photos visibles par tous" on storage.objects;
create policy "Photos visibles par tous"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Chacun envoie sa photo" on storage.objects;
create policy "Chacun envoie sa photo"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Chacun remplace sa photo" on storage.objects;
create policy "Chacun remplace sa photo"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Chacun supprime sa photo" on storage.objects;
create policy "Chacun supprime sa photo"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 5. Chat des matchs (messages en temps réel)
create table if not exists public.match_messages (
  id          bigint generated always as identity primary key,
  match_id    text not null check (char_length(match_id) between 1 and 80),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author      text not null check (char_length(author) between 1 and 60),
  avatar      text check (avatar is null or avatar like 'https://%'),
  body        text not null check (char_length(body) between 1 and 280),
  created_at  timestamptz not null default now()
);
create index if not exists match_messages_match_idx on public.match_messages (match_id, created_at);

alter table public.match_messages enable row level security;

drop policy if exists "Messages lisibles par les membres" on public.match_messages;
create policy "Messages lisibles par les membres"
  on public.match_messages for select to authenticated
  using (true);

drop policy if exists "Chacun écrit en son nom" on public.match_messages;
create policy "Chacun écrit en son nom"
  on public.match_messages for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Chacun supprime ses messages" on public.match_messages;
create policy "Chacun supprime ses messages"
  on public.match_messages for delete to authenticated
  using (auth.uid() = user_id);

-- Diffusion en temps réel des nouveaux messages
do $$
begin
  alter publication supabase_realtime add table public.match_messages;
exception when duplicate_object then null;
end $$;


-- =====================================================================
-- 6. RÔLES : administrateur + comptes bloqués
-- =====================================================================
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists banned boolean not null default false;
do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin'));
exception when duplicate_object then null; end $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not banned);
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not banned);
$$;

-- Un utilisateur ne peut pas se donner lui-même le rôle admin ni se débloquer
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.banned is distinct from old.banned)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le rôle ou le blocage d''un compte';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

drop policy if exists "Chacun cree son profil" on public.profiles;
create policy "Chacun cree son profil"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'user' and banned = false);

drop policy if exists "Admin modifie les profils" on public.profiles;
create policy "Admin modifie les profils"
  on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- Liste des comptes avec leur email (réservée aux admins)
create or replace function public.admin_list_users()
returns table (id uuid, email text, first_name text, last_name text, city text, avatar text,
               role text, banned boolean, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.first_name, p.last_name, p.city, p.avatar, p.role, p.banned,
         u.created_at, u.last_sign_in_at
  from public.profiles p join auth.users u on u.id = p.id
  where public.is_admin()
  order by u.created_at desc;
$$;

-- =====================================================================
-- 7. SPORTS (modifiables depuis l'admin)
-- =====================================================================
create table if not exists public.sports (
  id                text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name              text not null check (char_length(name) between 2 and 40),
  icon              text not null default '🏅' check (char_length(icon) <= 8),
  category          text not null default 'Autre' check (char_length(category) <= 30),
  players_per_match text not null default '' check (char_length(players_per_match) <= 60),
  duration          text not null default '' check (char_length(duration) <= 30),
  slogan            text not null default '' check (char_length(slogan) <= 200),
  description       text not null default '' check (char_length(description) <= 600),
  popular_in        text not null default '' check (char_length(popular_in) <= 120),
  active            boolean not null default true,
  sort              int not null default 100,
  created_at        timestamptz not null default now()
);
alter table public.sports enable row level security;
drop policy if exists "Sports visibles par tous" on public.sports;
create policy "Sports visibles par tous" on public.sports for select using (true);
drop policy if exists "Admin gere les sports" on public.sports;
create policy "Admin gere les sports" on public.sports for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.sports (id, name, icon, category, players_per_match, duration, slogan, description, popular_in, sort) values
  ('padel', 'Padel', '🎾', 'Raquette', '4 joueurs (2 vs 2)', '60 - 90 min', 'Le sport de raquette le plus convivial. 4 joueurs, du rythme et du pur plaisir !', 'Mélange détonant de tennis et de squash avec parois vitrées. Rapide à prendre en main, ultra convivial et parfait pour se dépenser entre potes.', 'Liège, Bruxelles, Namur, Wavre', 10),
  ('football', 'Football', '⚽', 'Collectif', '10 joueurs (Five) ou 14 (Seven)', '60 min', 'Trouve ton 5e ou rejoins une team sur terrain synthétique indoor ou outdoor.', 'Foot à 5 (UrbanSoccer / Five) ou foot classique. Ne repousse plus jamais un match parce qu''il manque un gardien ou un attaquant !', 'Liège, Bruxelles, Charleroi, Liège-Angleur', 20),
  ('tennis', 'Tennis', '🎾', 'Raquette', '2 ou 4 joueurs', '60 - 90 min', 'Simples ou doubles, trouve un joueur de ton classement sur terre ou résine.', 'Sur surface rapide, terre battue ou synthétique. Affronte des partenaires réguliers calibrés exactement sur ton niveau technique.', 'Liège, Sart-Tilman, Louvain-la-Neuve', 30),
  ('basketball', 'Basket-ball', '🏀', 'Collectif', '6 joueurs (3x3) ou 10 (5x5)', '45 - 60 min', 'Du playground urbain au parquet en salle, forme ton 3x3 n''importe quel jour.', 'Ambiance streetball ou match officiel en salle. Rejoins des pick-up games locaux et enchaîne les paniers sans prise de tête.', 'Liège Centre, Bruxelles, Namur', 40),
  ('badminton', 'Badminton', '🏸', 'Raquette', '2 ou 4 joueurs', '60 min', 'Le sport le plus rapide du monde pour brûler des calories à toute allure.', 'Réflexes éclair, cardio à bloc et amortis millimétrés. Idéal après le boulot ou les cours pour une séance intense et dynamique.', 'Liège, Rocourt, Bruxelles', 50),
  ('volleyball', 'Volley-ball', '🏐', 'Collectif', '4 à 12 joueurs', '60 - 90 min', 'Salle ou beach-volley, partage de l''énergie et des smashs spectaculaires.', 'Pour les adeptes du jeu en équipe, passes précises et contres au filet. Disponible en gymnase couvert ou sur sable l''été.', 'Liège, Bruxelles, Namur', 60),
  ('running', 'Running', '🏃‍♂️', 'Endurance', 'Groupes de 2 à 15', '45 - 75 min', 'Ne cours plus jamais seul : sorties collectives, fractionné et prépa trail.', 'De la simple boucle de 5 km pour reprendre en douceur jusqu''aux sorties longues le dimanche matin le long de la Meuse ou en forêt.', 'Liège (Bords de Meuse), Bruxelles (Bois de la Cambre)', 70),
  ('escalade', 'Escalade', '🧗', 'Agilité', '2 joueurs (voie) ou solo / groupe (bloc)', '90 - 120 min', 'Trouve ton assureur pour la voie ou partage des sessions bloc stimulantes.', 'Salles de bloc ouvertes et murs de cordes. Trouve un assureur de confiance du même gabarit et dépasse tes plafonds de cotation.', 'Liège (Top Rock), Louvain-la-Neuve, Bruxelles', 80),
  ('squash', 'Squash', '🎾', 'Raquette', '2 joueurs', '45 min', '45 minutes non-stop d''intensité pure pour se vider la tête.', 'Un court clos, une balle noire et un rythme effréné. Idéal pour ceux qui recherchent une dépense cardio maximale en un temps record.', 'Liège, Bruxelles, Wavre', 90),
  ('pingpong', 'Tennis de table', '🏓', 'Précision', '2 ou 4 joueurs', '45 - 60 min', 'Topspin, slice et batailles de réflexes à la table.', 'Que ce soit sur des tables de club ou en extérieur dans un parc au soleil, défie des mates pour des parties fun et disputées.', 'Liège, Namur, Mons', 100),
  ('rugby', 'Rugby', '🏉', 'Collectif', '10 à 14 joueurs', '60 - 80 min', 'Touch rugby, rugby à 7 ou entraînement aux valeurs collectives fortes.', 'Sans placage violent pour les sessions loisir (touch rugby) ou entraînement physique complet. Solidarité et 3e mi-temps garanties.', 'Liège, Bruxelles, Ottignies', 110),
  ('handball', 'Handball', '🤾', 'Collectif', '12 à 14 joueurs', '60 min', 'Puissance, tactique et roucoulettes dans la zone des 9 mètres.', 'Sport collectif spectaculaire nécessitant cohésion et esprit d''équipe. Rejoins des matchs organisés en salle par les clubs partenaires.', 'Liège, Herstal, Visé, Bruxelles', 120),
  ('fitness', 'Fitness & Muscu', '🏋️', 'Force', '2 à 4 mates', '60 - 90 min', 'Un binôme pour se motiver à la salle, t''assurer au développé couché et progresser.', 'Finis les entraînements en solo où l''on hésite à charger la barre. Trouve un partenaire régulier pour garder le cap et dépasser tes objectifs.', 'Liège, Bruxelles, Namur, Mons', 130),
  ('natation', 'Natation', '🏊‍♂️', 'Aquatique', '2 à 6 nageurs', '45 - 60 min', 'Longueurs en couloir dédié ou sessions eau libre en groupe.', 'Nage sportive, travail technique ou récupération active. Motivez-vous mutuellement pour enchaîner les 50 mètres de bon matin.', 'Liège (Outremeuse, Sart-Tilman), Bruxelles', 140)
on conflict (id) do nothing;

-- =====================================================================
-- 8. CLUBS (demande du club -> validation par un admin)
-- =====================================================================
create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  city        text not null check (char_length(city) between 2 and 60),
  address     text not null default '' check (char_length(address) <= 160),
  phone       text not null default '' check (char_length(phone) <= 30),
  description text not null default '' check (char_length(description) <= 600),
  photo       text check (photo is null or photo like 'https://%'),
  sports      text[] not null default '{}',
  amenities   text[] not null default '{}',
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  admin_note  text not null default '' check (char_length(admin_note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists clubs_owner_idx on public.clubs (owner_id);
alter table public.clubs enable row level security;

create or replace function public.is_club_owner(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clubs where id = p_club and owner_id = auth.uid());
$$;

create or replace function public.protect_club_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status is distinct from old.status or new.admin_note is distinct from old.admin_note
      or new.owner_id is distinct from old.owner_id) and auth.uid() is not null and not public.is_admin() then
    raise exception 'Seul un administrateur peut valider ou suspendre un club';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists protect_club_status on public.clubs;
create trigger protect_club_status before update on public.clubs
  for each row execute function public.protect_club_status();

drop policy if exists "Clubs visibles" on public.clubs;
create policy "Clubs visibles" on public.clubs for select
  using (status = 'approved' or owner_id = auth.uid() or public.is_admin());
drop policy if exists "Demande de club" on public.clubs;
create policy "Demande de club" on public.clubs for insert to authenticated
  with check (owner_id = auth.uid() and status = 'pending' and public.is_active_user());
drop policy if exists "Le club modifie sa fiche" on public.clubs;
create policy "Le club modifie sa fiche" on public.clubs for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "Suppression de club" on public.clubs;
create policy "Suppression de club" on public.clubs for delete
  using (owner_id = auth.uid() or public.is_admin());

-- =====================================================================
-- 9. TERRAINS : sport, tarif, durée d'un créneau, horaires d'ouverture
--    opening = {"0":[9,22], "1":[8,23], ...}  (0 = dimanche ... 6 = samedi ; null = fermé)
-- =====================================================================
create table if not exists public.courts (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubs (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 60),
  sport_id       text not null references public.sports (id),
  indoor         boolean not null default true,
  price_per_hour numeric(7,2) not null default 0 check (price_per_hour between 0 and 1000),
  slot_minutes   int not null default 60 check (slot_minutes in (30, 45, 60, 90, 120)),
  opening        jsonb not null default '{"0":[9,22],"1":[9,23],"2":[9,23],"3":[9,23],"4":[9,23],"5":[9,23],"6":[9,22]}'::jsonb,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists courts_club_idx on public.courts (club_id);
alter table public.courts enable row level security;
drop policy if exists "Terrains visibles" on public.courts;
create policy "Terrains visibles" on public.courts for select
  using (exists (select 1 from public.clubs c where c.id = club_id
                 and (c.status = 'approved' or c.owner_id = auth.uid() or public.is_admin())));
drop policy if exists "Le club gere ses terrains" on public.courts;
create policy "Le club gere ses terrains" on public.courts for all
  using (public.is_club_owner(club_id) or public.is_admin())
  with check (public.is_club_owner(club_id) or public.is_admin());

-- =====================================================================
-- 10. RÉSERVATIONS de créneaux (joueurs) et créneaux bloqués (club)
-- =====================================================================
create extension if not exists btree_gist;
create table if not exists public.court_bookings (
  id          uuid primary key default gen_random_uuid(),
  court_id    uuid not null references public.courts (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  kind        text not null default 'booking' check (kind in ('booking', 'block')),
  user_id     uuid references public.profiles (id) on delete set null default auth.uid(),
  note        text not null default '' check (char_length(note) <= 200),
  price       numeric(7,2) not null default 0,
  status      text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '4 hours')
);
do $$ begin
  alter table public.court_bookings add constraint court_bookings_no_overlap
    exclude using gist (court_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'confirmed');
exception when duplicate_object then null; end $$;
create index if not exists court_bookings_court_idx on public.court_bookings (court_id, starts_at);
create index if not exists court_bookings_user_idx on public.court_bookings (user_id, starts_at);
alter table public.court_bookings enable row level security;

create or replace function public.court_club(p_court uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select club_id from public.courts where id = p_court;
$$;

-- Prix calculé par la base (le joueur ne peut pas le choisir) + règles de modification
create or replace function public.booking_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_court public.courts%rowtype;
  v_manager boolean;
begin
  select * into v_court from public.courts where id = new.court_id;
  v_manager := public.is_club_owner(v_court.club_id) or public.is_admin();
  if tg_op = 'INSERT' then
    if not v_manager then
      if new.kind <> 'booking' or new.user_id is distinct from auth.uid() then
        raise exception 'Réservation non autorisée';
      end if;
      if new.starts_at < now() then
        raise exception 'Ce créneau est déjà passé';
      end if;
      if not v_court.active or not exists (select 1 from public.clubs c where c.id = v_court.club_id and c.status = 'approved') then
        raise exception 'Ce terrain n''est pas réservable';
      end if;
    end if;
    if new.kind = 'booking' then
      new.price := round(v_court.price_per_hour * extract(epoch from (new.ends_at - new.starts_at)) / 3600, 2);
    else
      new.price := 0;
    end if;
  else
    if not v_manager then
      -- un joueur peut seulement annuler sa réservation
      if new.status <> 'cancelled' or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at
         or new.court_id <> old.court_id or new.kind <> old.kind or new.price <> old.price then
        raise exception 'Tu peux seulement annuler ta réservation';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists booking_rules on public.court_bookings;
create trigger booking_rules before insert or update on public.court_bookings
  for each row execute function public.booking_rules();

drop policy if exists "Voir ses reservations" on public.court_bookings;
create policy "Voir ses reservations" on public.court_bookings for select
  using (user_id = auth.uid() or public.is_club_owner(public.court_club(court_id)) or public.is_admin());
drop policy if exists "Reserver" on public.court_bookings;
create policy "Reserver" on public.court_bookings for insert to authenticated
  with check (public.is_active_user() and (user_id = auth.uid() or public.is_club_owner(public.court_club(court_id)) or public.is_admin()));
drop policy if exists "Modifier une reservation" on public.court_bookings;
create policy "Modifier une reservation" on public.court_bookings for update
  using (user_id = auth.uid() or public.is_club_owner(public.court_club(court_id)) or public.is_admin())
  with check (user_id = auth.uid() or public.is_club_owner(public.court_club(court_id)) or public.is_admin());
drop policy if exists "Supprimer un blocage" on public.court_bookings;
create policy "Supprimer un blocage" on public.court_bookings for delete
  using (public.is_club_owner(public.court_club(court_id)) or public.is_admin());

-- Créneaux occupés d'un club (sans dire QUI a réservé) : pour afficher les disponibilités
create or replace function public.club_busy_slots(p_club uuid, p_from timestamptz, p_to timestamptz)
returns table (court_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.court_id, b.starts_at, b.ends_at
  from public.court_bookings b join public.courts ct on ct.id = b.court_id
  where ct.club_id = p_club and b.status = 'confirmed'
    and b.starts_at < p_to and b.ends_at > p_from;
$$;

-- =====================================================================
-- 11. MATCHS créés par les joueurs (partagés entre tous les appareils)
-- =====================================================================
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  sport_id       text not null references public.sports (id),
  title          text not null check (char_length(title) between 2 and 100),
  club_id        uuid references public.clubs (id) on delete set null,
  club_name      text not null check (char_length(club_name) between 2 and 80),
  court_name     text not null default '' check (char_length(court_name) <= 60),
  city           text not null check (char_length(city) between 2 and 60),
  starts_at      timestamptz not null,
  duration_min   int not null default 90 check (duration_min between 30 and 240),
  level_required text not null default 'Tous niveaux' check (char_length(level_required) <= 40),
  price          numeric(6,2) not null default 0 check (price between 0 and 100),
  payment        text not null default '' check (char_length(payment) <= 80),
  court_booked   boolean not null default false,
  total_slots    int not null check (total_slots between 2 and 30),
  outdoor        boolean not null default false,
  amenities      text[] not null default '{}',
  status         text not null default 'open' check (status in ('open', 'cancelled')),
  created_at     timestamptz not null default now()
);
create index if not exists matches_starts_idx on public.matches (starts_at);
alter table public.matches enable row level security;
drop policy if exists "Matchs visibles" on public.matches;
create policy "Matchs visibles" on public.matches for select using (true);
drop policy if exists "Creer un match" on public.matches;
create policy "Creer un match" on public.matches for insert to authenticated
  with check (created_by = auth.uid() and public.is_active_user());
drop policy if exists "Modifier son match" on public.matches;
create policy "Modifier son match" on public.matches for update
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
drop policy if exists "Supprimer son match" on public.matches;
create policy "Supprimer son match" on public.matches for delete
  using (created_by = auth.uid() or public.is_admin());

create table if not exists public.match_players (
  match_id  uuid not null references public.matches (id) on delete cascade,
  user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
alter table public.match_players enable row level security;

-- Pas d'inscription à un match complet, annulé ou passé
create or replace function public.match_join_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype; v_count int;
begin
  select * into v_match from public.matches where id = new.match_id for update;
  if v_match.status <> 'open' or v_match.starts_at < now() then
    raise exception 'Ce match n''est plus ouvert';
  end if;
  select count(*) into v_count from public.match_players where match_id = new.match_id;
  if v_count >= v_match.total_slots then
    raise exception 'Ce match est complet';
  end if;
  return new;
end $$;
drop trigger if exists match_join_rules on public.match_players;
create trigger match_join_rules before insert on public.match_players
  for each row execute function public.match_join_rules();

drop policy if exists "Joueurs visibles" on public.match_players;
create policy "Joueurs visibles" on public.match_players for select using (true);
drop policy if exists "Rejoindre un match" on public.match_players;
create policy "Rejoindre un match" on public.match_players for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
drop policy if exists "Quitter un match" on public.match_players;
create policy "Quitter un match" on public.match_players for delete
  using (user_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.matches m where m.id = match_id and m.created_by = auth.uid()));

-- L'admin peut aussi supprimer des messages du chat
drop policy if exists "Admin supprime les messages" on public.match_messages;
create policy "Admin supprime les messages" on public.match_messages for delete
  using (public.is_admin());

-- Un compte bloqué ne peut plus écrire dans les chats
drop policy if exists "Chacun écrit en son nom" on public.match_messages;
create policy "Chacun écrit en son nom"
  on public.match_messages for insert to authenticated
  with check (auth.uid() = user_id and public.is_active_user());

-- =====================================================================
-- 12. ADMINISTRATEURS désignés par email (liste privée, jamais lisible depuis le site)
--     Pour ajouter un admin : SQL Editor >
--       insert into public.admin_emails (email) values ('adresse@exemple.com');
-- =====================================================================
create table if not exists public.admin_emails (
  email text primary key check (email = lower(email))
);
alter table public.admin_emails enable row level security;  -- aucune règle : invisible depuis le site

-- Donne le rôle admin si l'email est dans la liste (à l'inscription et pour les comptes existants)
create or replace function public.apply_admin_emails()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p set role = 'admin'
  from auth.users u
  where u.id = p.id and lower(u.email) = new.email and p.role <> 'admin';
  return new;
end $$;
drop trigger if exists apply_admin_emails on public.admin_emails;
create trigger apply_admin_emails after insert on public.admin_emails
  for each row execute function public.apply_admin_emails();

create or replace function public.promote_listed_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.admin_emails a join auth.users u on lower(u.email) = a.email where u.id = new.id) then
    new.role := 'admin';
  end if;
  return new;
end $$;
drop trigger if exists promote_listed_admin on public.profiles;
create trigger promote_listed_admin before insert on public.profiles
  for each row execute function public.promote_listed_admin();

-- Les profils créés avec le rôle admin par ce mécanisme passent la règle d'insertion
drop policy if exists "Chacun cree son profil" on public.profiles;
create policy "Chacun cree son profil"
  on public.profiles for insert
  with check (auth.uid() = id and banned = false
              and (role = 'user' or exists (select 1 from public.admin_emails a join auth.users u on lower(u.email) = a.email where u.id = auth.uid())));
