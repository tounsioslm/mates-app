/**
 * MATES. — Logique Applicative & Routeur SPA
 * Gestion des 7 écrans du wireframe, des filtres, du profil, des disponibilités et de l'auth.
 */

const MatesApp = (() => {
  // Clés de stockage LocalStorage
  const STORAGE_KEY_PROFILE = "mates_user_profile";
  const STORAGE_KEY_AUTH = "mates_is_authenticated";
  const STORAGE_KEY_MATCHES = "mates_open_matches"; // ancien format, nettoyé au chargement
  const STORAGE_KEY_MATCH_STATE = "mates_match_state_v2";
  const STORAGE_KEY_LIVE = "mates_live_until";
  const STORAGE_KEY_ALERTS = "mates_search_alerts";

  // Hash présent au chargement (retour d'un lien email / Google de Supabase)
  const INITIAL_HASH = window.location.hash || "";

  // Client Supabase (null => mode démo sans comptes réels)
  const SB = (() => {
    const cfg = typeof MATES_SUPABASE_CONFIG !== "undefined" ? MATES_SUPABASE_CONFIG : null;
    if (!cfg || !cfg.url || !cfg.anonKey) return null;
    if (!window.supabase || !window.supabase.createClient) {
      console.warn("Librairie Supabase non chargée : mode démo.");
      return null;
    }
    try {
      return window.supabase.createClient(cfg.url, cfg.anonKey);
    } catch (e) {
      console.warn("Configuration Supabase invalide :", e);
      return null;
    }
  })();
  // Moyens de connexion activés dans Supabase (voir js/supabase-config.js)
  const GOOGLE_CLIENT_ID = (SB && MATES_SUPABASE_CONFIG.googleClientId) || "";
  const PROVIDERS = {
    google: { label: "Google", enabled: !!(SB && MATES_SUPABASE_CONFIG.googleEnabled) }
  };

  const LEVELS = ["Débutant", "Intermédiaire", "Confirmé", "Expert"];
  const FEATURED_CITIES = ["Liège", "Bruxelles", "Namur"];
  const DEFAULT_AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#1B2438'/>" +
    "<circle cx='50' cy='38' r='18' fill='#C0FB18'/><path d='M16 92c4-20 18-30 34-30s30 10 34 30' fill='#C0FB18'/></svg>"
  );

  // État local de l'application
  let state = {
    currentRoute: "home",
    selectedSportId: null,
    selectedMateId: null,
    userProfile: null,
    isAuthenticated: false,
    authMode: "login", // 'login' ou 'register'
    matches: [],
    filters: {
      sport: "all",
      level: "all",
      city: "all"
    },
    // Profils des vrais inscrits (Supabase)
    remoteMates: [],
    // Matchs : inscriptions, matchs créés et messages (sauvegardés en localStorage)
    matchState: { joined: {}, created: [], chat: {} },
    matesWhen: null,
    matchesWhen: null,
    liveUntil: 0,
    weather: {},
    openMatchId: null,
    countdownTimer: null,
    sessionReady: !SB,
    // Données temporaires d'édition du profil
    editingProfile: null,
    pendingJoinMatchId: null,
    pendingProposeMateId: null,
    // Inscription : étape en cours de l'assistant de profil
    onboardingStep: 1,
    avatarTarget: "edit",
    googleNonce: "",
    // Chat de match
    chatMatchId: null,
    remoteChat: {}
  };

  /**
   * Initialisation de l'application au chargement
   */
  function init() {
    loadStorageData();
    setupRouting();
    setupEventListeners();
    renderAllViews();
    handleHashChange();
    lucide.createIcons();
    if (SB) initSupabaseSession();
  }

  /* ==========================================================================
     COMPTES UTILISATEURS (Supabase)
     ========================================================================== */
  function cleanText(value, max) {
    return String(value == null ? "" : value).replace(/[<>"`]/g, "").trim().slice(0, max);
  }

  function cleanAvatar(value) {
    return typeof value === "string" && /^https:\/\/[^\s"'<>`]+$/.test(value) ? value : DEFAULT_AVATAR;
  }

  function levelToRating(level) {
    return level === "Expert" ? 5 : level === "Confirmé" ? 4 : level === "Intermédiaire" ? 3 : 2;
  }

  function cleanSports(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.map(s => {
      const meta = INITIAL_SPORTS.find(sp => sp.id === (s && s.id));
      if (!meta || seen.has(meta.id)) return null;
      seen.add(meta.id);
      const level = LEVELS.includes(s.level) ? s.level : "Débutant";
      return { id: meta.id, name: meta.name, level, rating: levelToRating(level) };
    }).filter(Boolean);
  }

  function cleanAvailability(av) {
    const out = {};
    if (!av || typeof av !== "object") return out;
    DAYS_OF_WEEK.forEach(day => {
      if (Array.isArray(av[day])) {
        out[day] = av[day].filter(slot => TIME_SLOTS.some(t => t.id === slot));
      }
    });
    return out;
  }

  // Convertit une ligne de la table "profiles" en objet "mate" utilisé par l'interface
  function profileFromRow(row, isMe) {
    return {
      id: isMe ? "my-profile" : "user-" + row.id,
      userId: row.id,
      firstName: cleanText(row.first_name, 40) || "Sportif",
      lastName: cleanText(row.last_name, 40),
      age: Number.isInteger(row.age) ? row.age : null,
      city: cleanText(row.city, 60),
      distanceKm: null,
      avatar: cleanAvatar(row.avatar),
      bio: cleanText(row.bio, 400),
      sports: cleanSports(row.sports),
      availability: cleanAvailability(row.availability),
      matchesPlayed: 0,
      fairPlayScore: null,
      liveUntil: row.live_until || null,
      isNew: true
    };
  }

  function getAllMates() {
    return state.remoteMates.concat(INITIAL_MATES);
  }

  /* ==========================================================================
     OUTILS : stockage local, dates, échappement HTML
     ========================================================================== */
  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function dayName(date) {
    return DAYS_OF_WEEK[(new Date(date).getDay() + 6) % 7]; // Lundi = 0
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  // Prochain samedi (6) / dimanche (0) : aujourd'hui compris
  function nextWeekday(target) {
    const today = startOfDay(new Date());
    const diff = (target - today.getDay() + 7) % 7;
    return addDays(today, diff);
  }

  function formatMatchDay(date) {
    const d = startOfDay(date);
    const today = startOfDay(new Date());
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Demain";
    return d.toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" })
      .replace(/^./, c => c.toUpperCase());
  }

  function formatHour(date) {
    return new Date(date).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
  }

  function formatAgo(date) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000));
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    return `il y a ${Math.round(hours / 24)} j`;
  }

  function isTonight(date) {
    const d = new Date(date);
    return startOfDay(d).getTime() === startOfDay(new Date()).getTime() && d.getHours() >= 17;
  }

  function isTomorrow(date) {
    return startOfDay(date).getTime() === startOfDay(addDays(new Date(), 1)).getTime();
  }

  function isThisWeekend(date) {
    const d = startOfDay(date);
    const sat = nextWeekday(6);
    const sun = addDays(sat, 1);
    const today = startOfDay(new Date());
    // Si on est dimanche, « ce week-end » = aujourd'hui
    if (today.getDay() === 0) return d.getTime() === today.getTime();
    return d.getTime() === sat.getTime() || d.getTime() === sun.getTime();
  }

  function sportMeta(sportId) {
    return INITIAL_SPORTS.find(sp => sp.id === sportId) || { id: sportId, name: "Sport", icon: "🏅" };
  }

  /* ==========================================================================
     DISPO CE SOIR ⚡
     ========================================================================== */
  function endOfToday() {
    const d = new Date();
    d.setHours(23, 59, 59, 0);
    return d.getTime();
  }

  function isMeLive() {
    return state.liveUntil > Date.now();
  }

  function isMateLive(mate) {
    if (mate.id === "my-profile") return isMeLive();
    if (mate.liveUntil) return new Date(mate.liveUntil).getTime() > Date.now();
    return !!mate.liveTonight;
  }

  function syncLiveToggles() {
    document.querySelectorAll("#live-toggle-mates, #live-toggle-dash").forEach(btn => {
      btn.setAttribute("aria-checked", isMeLive() ? "true" : "false");
    });
  }

  async function toggleLiveTonight() {
    if (!requireAuth("Connecte-toi pour indiquer que tu es dispo ce soir.")) {
      syncLiveToggles();
      return;
    }
    state.liveUntil = isMeLive() ? 0 : endOfToday();
    writeStore(STORAGE_KEY_LIVE, state.liveUntil);
    syncLiveToggles();

    if (SB && state.userProfile && state.userProfile.userId) {
      const { error } = await SB.from("profiles")
        .update({ live_until: state.liveUntil ? new Date(state.liveUntil).toISOString() : null })
        .eq("id", state.userProfile.userId);
      if (error) console.warn("Statut « dispo ce soir » non synchronisé :", error.message);
    }

    showToast(isMeLive()
      ? "Tu es dispo ce soir ⚡ Tu apparais en premier pour les autres mates jusqu'à minuit."
      : "Statut « dispo ce soir » désactivé.", isMeLive() ? "success" : "info");
  }

  /* ==========================================================================
     CONFIANCE, PROGRESSION & BADGES
     ========================================================================== */
  function trustChipsHtml(mate) {
    if (mate.isNew && !mate.matchesPlayed) {
      return `<span class="trust-chip"><i data-lucide="sparkles" class="w-3 h-3 text-mates-green"></i>Nouveau membre</span>`;
    }
    const chips = [];
    if (mate.punctuality != null) chips.push(`<span class="trust-chip" title="Arrive à l'heure aux matchs"><i data-lucide="clock" class="w-3 h-3 text-mates-green"></i><strong>${mate.punctuality} %</strong> ponctuel</span>`);
    if (mate.matchesPlayed) chips.push(`<span class="trust-chip"><i data-lucide="swords" class="w-3 h-3 text-mates-green"></i><strong>${mate.matchesPlayed}</strong> matchs joués</span>`);
    if (mate.fairPlayScore) chips.push(`<span class="trust-chip" title="Note moyenne laissée par les autres joueurs"><i data-lucide="heart-handshake" class="w-3 h-3 text-mates-green"></i>Fair-play <strong>${Number(mate.fairPlayScore).toFixed(1)}</strong>/5</span>`);
    return chips.join("");
  }

  function getBadges(mate) {
    const played = mate.matchesPlayed || 0;
    const organized = mate.matchesOrganized || 0;
    const early = mate.earlyMatches || 0;
    const sportsCount = (mate.sports || []).length;
    return [
      { icon: "🧩", title: "Multisport", desc: `${sportsCount}/3 disciplines pratiquées`, earned: sportsCount >= 3 },
      { icon: "🏛️", title: "Pilier de la communauté", desc: `${Math.min(organized, 10)}/10 matchs organisés`, earned: organized >= 10 },
      { icon: "🌅", title: "Lève-tôt", desc: `${Math.min(early, 5)}/5 matchs joués avant 9h`, earned: early >= 5 },
      { icon: "⏱️", title: "Toujours à l'heure", desc: "100 % de ponctualité sur 10 matchs", earned: mate.punctuality === 100 && played >= 10 },
      { icon: "🤝", title: "Esprit fair-play", desc: "Note fair-play ≥ 4,9 / 5", earned: (mate.fairPlayScore || 0) >= 4.9 },
      { icon: "🔥", title: "Habitué", desc: `${Math.min(played, 50)}/50 matchs joués`, earned: played >= 50 }
    ];
  }

  function badgesHtml(mate) {
    return getBadges(mate)
      .sort((a, b) => Number(b.earned) - Number(a.earned))
      .map(b => `
        <div class="achievement ${b.earned ? "" : "locked"}">
          <div class="achievement-icon">${b.icon}</div>
          <div class="min-w-0">
            <div class="text-sm font-bold text-white truncate">${b.title}</div>
            <div class="text-[11px] text-slate-400">${b.earned ? "✓ " : ""}${b.desc}</div>
          </div>
        </div>`).join("");
  }

  function progressHtml(mate) {
    const recent = Array.isArray(mate.recent) ? mate.recent.slice(0, 3) : [];
    if (mate.levelScore == null && recent.length === 0) {
      return `
        <div class="text-center py-6 space-y-2">
          <div class="text-4xl">🏁</div>
          <p class="text-sm text-slate-300">Pas encore de match joué.</p>
          <p class="text-xs text-slate-500">Le niveau Mates se calcule après le premier match.</p>
        </div>`;
    }
    const trend = mate.levelTrend || 0;
    const trendHtml = trend > 0
      ? `<span class="text-mates-green font-bold">▲ +${trend.toFixed(1)}</span>`
      : trend < 0
        ? `<span class="text-rose-400 font-bold">▼ ${trend.toFixed(1)}</span>`
        : `<span class="text-slate-400 font-bold">= stable</span>`;
    const mainSport = mate.sports && mate.sports[0] ? mate.sports[0].name : "Multisport";
    const pct = Math.max(0, Math.min(100, ((mate.levelScore || 0) / 5) * 100));
    return `
      <div class="flex items-end justify-between gap-4">
        <div>
          <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400">Niveau Mates · ${mainSport}</div>
          <div class="font-display text-5xl text-white leading-none mt-1">Nv. ${(mate.levelScore || 0).toFixed(1)}</div>
        </div>
        <div class="text-right text-xs text-slate-400">${trendHtml}<br>ce mois-ci</div>
      </div>
      <div class="h-2 rounded-full bg-mates-off mt-3 overflow-hidden"><div class="h-full bg-mates-green rounded-full" style="width:${pct}%"></div></div>
      <div class="mt-5 space-y-2">
        <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400">3 derniers matchs</div>
        ${recent.map(r => `
          <div class="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-mates-off border border-slate-800">
            <div class="flex items-center gap-3 min-w-0">
              <span class="result-pill ${r.result === "V" ? "win" : "loss"}">${r.result}</span>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-white truncate">${r.sport}</div>
                <div class="text-[11px] text-slate-500">${r.when}</div>
              </div>
            </div>
            <span class="text-sm font-bold ${r.result === "V" ? "text-mates-green" : "text-slate-300"} whitespace-nowrap">${r.score}</span>
          </div>`).join("")}
      </div>`;
  }

  /* ==========================================================================
     MATCHS : données datées + inscriptions locales
     ========================================================================== */
  const OUTDOOR_SPORTS = ["football", "tennis", "running", "rugby", "volleyball", "basketball"];

  function loadMatchState() {
    const saved = readStore(STORAGE_KEY_MATCH_STATE, null);
    state.matchState = {
      joined: (saved && saved.joined) || {},
      created: (saved && Array.isArray(saved.created)) ? saved.created : [],
      chat: (saved && saved.chat) || {},
      read: (saved && saved.read) || {}   // dernier passage dans chaque chat (messages non lus)
    };
    // Nettoyage de l'ancien format
    try { localStorage.removeItem(STORAGE_KEY_MATCHES); } catch (e) { /* ignore */ }
  }

  function saveMatchState() {
    writeStore(STORAGE_KEY_MATCH_STATE, state.matchState);
  }

  function computeStart(match) {
    let base;
    if (match.day === "sat") base = nextWeekday(6);
    else if (match.day === "sun") base = nextWeekday(0);
    else base = addDays(startOfDay(new Date()), Number(match.day) || 0);
    const [h, m] = String(match.start || "19:00").split(":").map(Number);
    base.setHours(h || 0, m || 0, 0, 0);
    // Un match de démo déjà passé aujourd'hui est décalé au lendemain
    if (base.getTime() + (match.durationMin || 60) * 60000 < Date.now()) base = addDays(base, match.day === "sat" || match.day === "sun" ? 7 : 1);
    return base;
  }

  function buildMatches() {
    const demo = INITIAL_OPEN_MATCHES.map(m => Object.assign({}, m, {
      startsAt: computeStart(m).toISOString(),
      players: m.players.slice(),
      chat: m.chat.map(c => Object.assign({}, c, { at: new Date(Date.now() - c.ago * 60000).toISOString() }))
    }));
    const now = Date.now();
    const created = state.matchState.created
      .filter(m => new Date(m.startsAt).getTime() + (m.durationMin || 60) * 60000 > now - 86400000)
      .map(m => Object.assign({}, m, { players: m.players.slice(), chat: [] }));
    return created.concat(demo).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }

  function getMatch(id) {
    return state.matches.find(m => m.id === id) || null;
  }

  function myPlayerEntry() {
    const p = state.userProfile || {};
    return {
      name: `${p.firstName || "Moi"}${p.lastName ? " " + p.lastName.charAt(0) + "." : ""}`,
      avatar: p.avatar || DEFAULT_AVATAR,
      mateId: "my-profile",
      me: true
    };
  }

  function isJoined(match) {
    return !!state.matchState.joined[match.id] || !!match.mine;
  }

  function matchPlayers(match) {
    const players = match.players.slice();
    if (state.matchState.joined[match.id] && state.isAuthenticated) players.push(myPlayerEntry());
    return players;
  }

  function matchChat(match) {
    return (match.chat || []).concat(state.matchState.chat[match.id] || []);
  }

  function remainingSlots(match) {
    return Math.max(0, match.totalSlots - matchPlayers(match).length);
  }

  function priceLabel(match) {
    return match.price > 0 ? `${String(match.price).replace(".", ",")} € / pers.` : "Gratuit";
  }

  function statusBadgeHtml(match) {
    const players = matchPlayers(match).length;
    if (match.courtBooked) {
      return `<span class="badge-spots inline-flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>Terrain réservé & confirmé</span>`;
    }
    return `<span class="badge-neutral inline-flex items-center gap-1"><i data-lucide="hourglass" class="w-3.5 h-3.5"></i>En attente du ${players + 1}e joueur</span>`;
  }

  function spotsBadgeHtml(match) {
    const r = remainingSlots(match);
    if (r === 0) return `<span class="badge-full">Complet</span>`;
    return `<span class="badge-spots">Reste ${r} place${r > 1 ? "s" : ""}</span>`;
  }

  function mapsLinks(match) {
    const q = encodeURIComponent(`${match.clubName}, ${match.city}, Belgique`);
    return {
      google: `https://www.google.com/maps/search/?api=1&query=${q}`,
      waze: `https://waze.com/ul?q=${q}&navigate=yes`
    };
  }

  function matchShareUrl(match) {
    return `${siteUrl()}#match/${encodeURIComponent(match.id)}`;
  }

  /* ==========================================================================
     MÉTÉO (Open-Meteo, gratuit et sans clé) pour les sports en extérieur
     ========================================================================== */
  const WEATHER_CODES = [
    { max: 0, label: "Ensoleillé", icon: "sun" },
    { max: 2, label: "Éclaircies", icon: "cloud-sun" },
    { max: 3, label: "Couvert", icon: "cloud" },
    { max: 48, label: "Brouillard", icon: "cloud-fog" },
    { max: 57, label: "Bruine", icon: "cloud-drizzle" },
    { max: 67, label: "Pluie", icon: "cloud-rain" },
    { max: 77, label: "Neige", icon: "snowflake" },
    { max: 82, label: "Averses", icon: "cloud-rain" },
    { max: 86, label: "Neige", icon: "snowflake" },
    { max: 99, label: "Orage", icon: "cloud-lightning" }
  ];

  function loadWeather() {
    const cities = [...new Set(state.matches.filter(m => m.outdoor).map(m => normalizeCity(m.city)))];
    cities.forEach(key => {
      const coords = CITY_COORDS[key];
      if (!coords || state.weather[key]) return;
      state.weather[key] = "loading";
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&hourly=temperature_2m,weather_code&forecast_days=8&timezone=Europe%2FBrussels`;
      fetch(url)
        .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
        .then(data => {
          state.weather[key] = data.hourly || null;
          if (state.currentRoute === "matches" || state.currentRoute === "match") renderOpenMatches();
          if (state.openMatchId) renderMatchDetail(state.openMatchId);
          if (state.currentRoute === "dashboard") renderDashboard();
        })
        .catch(err => {
          console.warn("Météo indisponible :", err.message);
          state.weather[key] = null;
        });
    });
  }

  function weatherFor(match) {
    if (!match.outdoor) return null;
    const hourly = state.weather[normalizeCity(match.city)];
    if (!hourly || hourly === "loading" || !Array.isArray(hourly.time)) return null;
    const d = new Date(match.startsAt);
    const pad = n => String(n).padStart(2, "0");
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
    const i = hourly.time.indexOf(key);
    if (i < 0) return null;
    const code = hourly.weather_code[i];
    const meta = WEATHER_CODES.find(w => code <= w.max) || WEATHER_CODES[2];
    return { temp: Math.round(hourly.temperature_2m[i]), label: meta.label, icon: meta.icon };
  }

  function weatherChipHtml(match) {
    const w = weatherFor(match);
    if (!w) return "";
    return `<span class="inline-flex items-center gap-1 text-slate-300" title="Prévision météo au coup d'envoi"><i data-lucide="${w.icon}" class="w-3.5 h-3.5 text-mates-green"></i>${w.temp}°C • ${w.label}</span>`;
  }

  /* ==========================================================================
     TITRE D'ONGLET + BARRE MOBILE
     ========================================================================== */
  function setTitle(text) {
    document.title = text ? `Mates — ${text}` : "Mates — Trouve tes partenaires de sport et réserve ton terrain";
  }

  function updateMatesTitle() {
    const sport = state.filters.sport !== "all" ? sportMeta(state.filters.sport).name : null;
    const city = state.filters.city !== "all" ? state.filters.city : null;
    if (sport && city) setTitle(`${sport} à ${city}`);
    else if (sport) setTitle(`Partenaires de ${sport}`);
    else if (city) setTitle(`Sport à ${city}`);
    else setTitle("Trouver un partenaire de sport");
  }

  function updateTabbar(route) {
    const map = { welcome: "home", home: "home", sports: "sports", sport: "sports", mate: "sports", matches: "matches", match: "matches", chat: "matches", dashboard: "dashboard", "edit-profile": "dashboard", onboarding: "dashboard", auth: "dashboard" };
    const active = map[route] || "";
    document.querySelectorAll(".bottom-tabbar a").forEach(a => {
      a.classList.toggle("active", a.dataset.tab === active);
      if (a.dataset.tab === active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function siteUrl() {
    return window.location.origin + window.location.pathname;
  }

  async function initSupabaseSession() {
    try {
      const { data } = await SB.auth.getSession();
      if (data && data.session) {
        await applySession(data.session);
      }
    } catch (e) {
      console.warn("Session Supabase indisponible :", e);
    }
    await loadRemoteMates();
    state.sessionReady = true;

    const fromRecovery = INITIAL_HASH.includes("type=recovery");
    const fromAuthLink = INITIAL_HASH.includes("access_token=");
    const linkError = INITIAL_HASH.includes("error_description=");

    if (linkError) {
      showToast("Ce lien a expiré ou n'est plus valide. Réessaie depuis la page de connexion.", "warning");
      window.location.hash = "#auth/login";
    } else if (fromRecovery && state.isAuthenticated) {
      window.location.hash = "#edit-profile";
      setTimeout(promptNewPassword, 400);
    } else if (fromAuthLink && state.isAuthenticated) {
      showToast(`Bienvenue sur Mates, ${state.userProfile.firstName} !`, "success");
      goAfterLogin();
    } else {
      handleHashChange();
    }
  }

  async function applySession(session) {
    const user = session.user;
    const { data: row, error } = await SB.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) console.warn("Lecture du profil impossible :", error.message);

    let profileRow = row;
    if (!profileRow) {
      // Profil absent (ex : 1re connexion Google) -> on le crée
      const meta = user.user_metadata || {};
      const fullName = (meta.full_name || meta.name || "").split(" ");
      profileRow = {
        id: user.id,
        first_name: cleanText(meta.first_name || fullName[0], 40),
        last_name: cleanText(meta.last_name || fullName.slice(1).join(" "), 40),
        avatar: typeof meta.avatar_url === "string" ? meta.avatar_url : null
      };
      const { error: upsertError } = await SB.from("profiles").upsert(profileRow);
      if (upsertError) console.warn("Création du profil impossible :", upsertError.message);
    }

    state.userProfile = profileFromRow(profileRow, true);
    state.userProfile.email = user.email || "";
    state.isAuthenticated = true;
    if (profileRow.live_until) {
      state.liveUntil = new Date(profileRow.live_until).getTime() || 0;
      writeStore(STORAGE_KEY_LIVE, state.liveUntil);
    }
    renderHeaderUserSection();
  }

  async function loadRemoteMates() {
    if (!SB) return;
    const { data, error } = await SB.from("profiles")
      .select("*")
      .neq("first_name", "")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.warn("Profils Supabase indisponibles :", error.message);
      return;
    }
    const myId = state.userProfile && state.userProfile.userId;
    state.remoteMates = (data || [])
      .filter(row => row.id !== myId)
      .map(row => profileFromRow(row, false));
    populateCityDropdown();
    renderMatesGrid();
  }

  function isProfileComplete(p) {
    return !!(p && p.firstName && p.city && p.sports && p.sports.length);
  }

  function goAfterLogin() {
    // Nouveau compte (ou profil incomplet) -> assistant de personnalisation
    window.location.hash = isProfileComplete(state.userProfile) ? "#dashboard" : "#onboarding";
  }

  function translateAuthError(err) {
    const m = String((err && err.message) || "").toLowerCase();
    console.warn("Erreur d'authentification :", err);
    if (m.includes("invalid login")) return "Email ou mot de passe incorrect.";
    if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "Ce moyen de connexion n'est pas encore activé. Utilise ton email.";
    if (m.includes("token") || m.includes("otp")) return "Code incorrect ou expiré. Redemande un code.";
    if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cet email. Connecte-toi !";
    if (m.includes("email not confirmed")) return "Confirme d'abord ton email (regarde ta boîte de réception).";
    if (m.includes("rate limit") || m.includes("security purposes")) return "Trop de tentatives, réessaie dans une minute.";
    if (m.includes("password")) return "Le mot de passe doit contenir au moins 6 caractères.";
    if (m.includes("email")) return "Adresse email invalide.";
    if (m.includes("fetch") || m.includes("network")) return "Serveur injoignable. Vérifie ta connexion internet.";
    return "Une erreur est survenue, réessaie.";
  }

  function requireAuth(message) {
    if (state.isAuthenticated && state.userProfile) return true;
    showToast(message || "Connecte-toi pour continuer.", "info");
    window.location.hash = "#auth/login";
    return false;
  }

  async function promptNewPassword() {
    const pwd = prompt("Choisis ton nouveau mot de passe (6 caractères minimum) :");
    if (!pwd) return;
    if (pwd.length < 6) {
      showToast("6 caractères minimum, réessaie.", "warning");
      return promptNewPassword();
    }
    const { error } = await SB.auth.updateUser({ password: pwd });
    if (error) showToast(translateAuthError(error), "warning");
    else showToast("Mot de passe modifié !", "success");
  }

  /**
   * Récupération ou initialisation des données du LocalStorage
   */
  function loadStorageData() {
    // Profil utilisateur
    const savedProfile = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (savedProfile) {
      try {
        state.userProfile = JSON.parse(savedProfile);
      } catch (e) {
        state.userProfile = JSON.parse(JSON.stringify(DEFAULT_MY_PROFILE));
      }
    } else {
      state.userProfile = JSON.parse(JSON.stringify(DEFAULT_MY_PROFILE));
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(state.userProfile));
    }

    // Authentification
    const savedAuth = localStorage.getItem(STORAGE_KEY_AUTH);
    state.isAuthenticated = savedAuth === "true";

    // Avec Supabase : personne n'est connecté tant que la session n'est pas vérifiée
    if (SB) {
      state.isAuthenticated = false;
      state.userProfile = null;
    }

    // Matchs ouverts (dates recalculées + inscriptions / créations / messages sauvegardés)
    loadMatchState();
    state.matches = buildMatches();

    // Statut « dispo ce soir »
    state.liveUntil = Number(readStore(STORAGE_KEY_LIVE, 0)) || 0;
  }

  /**
   * Configuration du routeur par hash (#home, #mates, #sports, #sport/padel, #mate/mate-1, etc.)
   */
  function setupRouting() {
    window.addEventListener("hashchange", handleHashChange);
  }

  function handleHashChange() {
    // Sans adresse précise : page de bienvenue pour les visiteurs pas encore inscrits
    const rawHash = window.location.hash.replace("#", "") || (state.isAuthenticated ? "home" : "welcome");
    const parts = rawHash.split("/");
    const mainView = parts[0];
    let param = parts[1] || null;
    try { if (param) param = decodeURIComponent(param); } catch (e) { /* hash mal formé */ }

    state.currentRoute = mainView;
    if (mainView !== "match") closeModals(true);
    if (mainView !== "chat") closeChat();
    if (mainView !== "dashboard" && state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }

    // Cacher toutes les vues
    document.querySelectorAll(".page-view").forEach(el => {
      el.classList.add("hidden");
      el.classList.remove("fade-in");
    });

    // Mettre à jour l'état de la navbar
    updateNavLinks(mainView);
    updateTabbar(mainView);

    // Routage vers la vue demandée
    switch (mainView) {
      case "welcome":
        setTitle(null);
        showView("view-welcome");
        renderWelcome();
        break;

      case "home":
        // Visiteur pas encore inscrit : page de bienvenue (comme la page d'accueil de Playtomic)
        if (!state.isAuthenticated) {
          setTitle(null);
          showView("view-welcome");
          renderWelcome();
          break;
        }
        setTitle(null);
        showView("view-home");
        break;

      case "mates": {
        // Ancienne page « Trouver un mate » : les mates sont maintenant dans chaque sport
        const city = param ? (findCityOption(param) || "") : "";
        const sport = state.filters.sport !== "all" ? state.filters.sport : null;
        window.location.replace(sport ? `#sport/${sport}${city ? "/" + encodeURIComponent(city) : ""}` : "#sports");
        return;
      }

      case "sports":
        setTitle("Les 14 sports");
        showView("view-sports");
        renderSportsCatalog();
        break;

      case "sport": {
        state.selectedSportId = param || "padel";
        let cityParam = parts[2] || null;
        try { if (cityParam) cityParam = decodeURIComponent(cityParam); } catch (e) { cityParam = null; }
        if (cityParam) {
          state.filters.city = findCityOption(cityParam) || "all";
          const citySelect = document.getElementById("filter-city");
          if (citySelect) citySelect.value = state.filters.city;
        }
        showView("view-single-sport");
        renderSingleSportPage(state.selectedSportId);
        updateMatesTitle();
        break;
      }

      case "mate":
        state.selectedMateId = param || "mate-1";
        showView("view-public-profile");
        renderPublicProfile(state.selectedMateId);
        break;

      case "edit-profile":
        if (!state.sessionReady) return; // session en cours de vérification
        if (!state.isAuthenticated) {
          window.location.hash = "#auth/login";
          showToast("Connecte-toi pour modifier ton profil.", "info");
          return;
        }
        setTitle("Mon profil");
        showView("view-edit-profile");
        initEditProfileForm();
        break;

      case "onboarding":
        if (!state.sessionReady) return;
        if (!state.isAuthenticated) {
          window.location.hash = "#auth/register";
          return;
        }
        setTitle("Crée ton profil");
        showView("view-onboarding");
        startOnboarding();
        break;

      case "auth":
        if (state.sessionReady && state.isAuthenticated && SB) {
          window.location.hash = "#dashboard";
          return;
        }
        if (param === "register" || param === "login") state.authMode = param;
        setTitle(state.authMode === "register" ? "Inscription" : "Connexion");
        showView("view-auth");
        showAuthPanel("main");
        renderGoogleButton();
        updateAuthCard();
        break;

      case "matches":
        setTitle("Matchs ouverts");
        showView("view-matches");
        renderOpenMatches();
        break;

      case "match": {
        showView("view-matches");
        renderOpenMatches();
        const match = getMatch(param);
        if (match) {
          openMatchDetail(match.id, true);
        } else {
          setTitle("Matchs ouverts");
          showToast("Ce match n'existe plus ou est déjà terminé.", "info");
        }
        break;
      }

      case "chat": {
        if (!state.sessionReady) return;
        const match = getMatch(param);
        if (!match) {
          showToast("Ce match n'existe plus ou est déjà terminé.", "info");
          window.location.replace("#matches");
          return;
        }
        if (!requireAuth("Connecte-toi pour accéder à la discussion du match.")) return;
        if (!isJoined(match)) {
          showToast("Rejoins le match pour accéder à sa discussion.", "info");
          window.location.replace(`#match/${match.id}`);
          return;
        }
        setTitle(`Chat · ${match.title}`);
        showView("view-match-chat");
        openChat(match);
        break;
      }

      case "dashboard":
        if (!state.sessionReady) return;
        if (!state.isAuthenticated) {
          window.location.hash = "#auth/login";
          showToast("Connecte-toi pour accéder à ton espace.", "info");
          return;
        }
        setTitle("Mon espace");
        showView("view-dashboard");
        renderDashboard();
        renderDashChats();
        break;

      default:
        showView("view-home");
        break;
    }

    // Scroll en haut de page fluide
    window.scrollTo({ top: 0, behavior: "smooth" });
    lucide.createIcons();
  }

  function showView(viewId) {
    const view = document.getElementById(viewId);
    if (view) {
      view.classList.remove("hidden");
      view.classList.add("fade-in");
    }
  }

  function updateNavLinks(activeHash) {
    document.querySelectorAll(".nav-link").forEach(link => {
      const href = link.getAttribute("href") || "";
      if (href === `#${activeHash}` || (activeHash === "sport" && href === "#sports")) {
        link.className = "nav-link px-5 py-2 rounded-full text-sm font-bold bg-mates-green text-mates-dark shadow-md transition-all";
      } else {
        link.className = "nav-link px-5 py-2 rounded-full text-sm font-semibold transition-all hover:text-white text-slate-300";
      }
    });

    renderHeaderUserSection();
  }

  /**
   * Rendu de la zone utilisateur dans l'en-tête (Connexion ou Avatar)
   */
  function renderHeaderUserSection() {
    const container = document.getElementById("header-user-section");
    if (!container) return;

    if (state.isAuthenticated && state.userProfile) {
      container.innerHTML = `
        <a href="#dashboard" class="flex items-center gap-2.5 bg-mates-card hover:bg-mates-cardElevated border border-mates-border hover:border-mates-green/60 p-1.5 pr-3.5 rounded-full transition-all group">
          <img src="${state.userProfile.avatar}" alt="${state.userProfile.firstName}" class="w-8 h-8 rounded-full object-cover ring-2 ring-mates-green">
          <div class="text-left hidden sm:block leading-tight">
            <div class="text-xs font-bold text-white group-hover:text-mates-green transition-colors">${state.userProfile.firstName}</div>
            <div class="text-[10px] text-slate-400">Mon espace</div>
          </div>
        </a>
      `;
    } else {
      container.innerHTML = `
        <a href="#auth/login" class="hidden sm:inline-flex text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 transition-colors">
          Se connecter
        </a>
        <a href="#auth/register" class="btn-neon text-xs py-2 px-4 shadow-sm">
          <i data-lucide="user-plus" class="w-4 h-4"></i>
          <span>Créer mon profil</span>
        </a>
      `;
    }

    const mobileAuth = document.getElementById("mobile-auth-links");
    if (mobileAuth) {
      mobileAuth.innerHTML = state.isAuthenticated && state.userProfile
        ? `<a href="#dashboard" class="block px-4 py-2 rounded-lg font-semibold bg-mates-green text-mates-dark text-center">Mon espace</a>`
        : `<a href="#auth/register" class="block px-4 py-2 rounded-lg font-semibold bg-mates-green text-black text-center">Créer mon profil</a>
           <a href="#auth/login" class="block px-4 py-2 rounded-lg font-semibold border border-mates-border text-center">Se connecter</a>`;
    }
    if (window.lucide) lucide.createIcons({ root: container });
  }

  /**
   * Écouteurs d'événements globaux
   */
  function setupEventListeners() {
    // Menu mobile
    const mobileBtn = document.getElementById("mobile-menu-btn");
    const mobileDrawer = document.getElementById("mobile-drawer");
    if (mobileBtn && mobileDrawer) {
      mobileBtn.addEventListener("click", () => {
        mobileDrawer.classList.toggle("hidden");
      });
      mobileDrawer.addEventListener("click", (e) => {
        if (e.target.closest("a")) mobileDrawer.classList.add("hidden");
      });
    }

    // Filtres des mates (page d'un sport)
    const levelSelect = document.getElementById("filter-level");
    const cityInput = document.getElementById("filter-city");
    const resetBtn = document.getElementById("filter-reset-btn");

    if (levelSelect) {
      levelSelect.addEventListener("change", (e) => {
        state.filters.level = e.target.value;
        renderMatesGrid();
      });
    }

    if (cityInput) {
      cityInput.addEventListener("change", (e) => {
        state.filters.city = e.target.value;
        renderMatesGrid();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", resetFilters);
    }

    // Échap ferme les fenêtres, un clic ailleurs ferme l'infobulle des niveaux
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModals();
        const panel = document.getElementById("level-help-panel");
        if (panel) panel.classList.add("hidden");
      }
    });
    document.addEventListener("click", (e) => {
      const panel = document.getElementById("level-help-panel");
      if (panel && !panel.classList.contains("hidden") && !e.target.closest(".level-help")) {
        panel.classList.add("hidden");
        const btn = document.getElementById("level-help-btn");
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    });

    // Recherche dans le catalogue des sports
    const sportSearchInput = document.getElementById("search-sport-input");
    if (sportSearchInput) {
      sportSearchInput.addEventListener("input", (e) => {
        renderSportsCatalog(e.target.value.trim().toLowerCase());
      });
    }
  }

  /**
   * Rendu de tous les composants de base
   */
  function renderAllViews() {
    renderHomeSportsGrid();
    populateSportDropdowns();
    populateCityDropdown();
    renderMatesGrid();
    renderSportsCatalog();
    renderOpenMatches();
  }
  /**
   * Remplissage des sélecteurs de sports
   */
  function populateSportDropdowns() {
    const addSportSelect = document.getElementById("add-new-sport-select");
    const proposeSportSelect = document.getElementById("propose-sport-select");

    const optionsHtml = INITIAL_SPORTS.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join("");

    const heroSport = document.getElementById("hero-sport");
    if (heroSport) heroSport.innerHTML = `<option value="all">Tous les sports</option>` + optionsHtml;
    const cmSport = document.getElementById("cm-sport");
    if (cmSport) cmSport.innerHTML = optionsHtml;

    if (addSportSelect) {
      addSportSelect.innerHTML = `<option value="">Choisir un sport à ajouter...</option>` + optionsHtml;
    }
    if (proposeSportSelect) {
      proposeSportSelect.innerHTML = optionsHtml;
    }
  }

  // "Liège (Centre)", "liege", "LIÈGE" -> "liege"
  function normalizeCity(city) {
    return String(city || "").split("(")[0].trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function getCityOptions() {
    const byKey = new Map();
    FEATURED_CITIES.concat(getAllMates().map(m => m.city)).forEach(city => {
      const key = normalizeCity(city);
      if (key && !byKey.has(key)) byKey.set(key, cleanText(city.split("(")[0], 60));
    });
    const rest = [...byKey.values()].filter(c => !FEATURED_CITIES.includes(c)).sort((a, b) => a.localeCompare(b, "fr"));
    return FEATURED_CITIES.concat(rest);
  }

  function findCityOption(city) {
    const key = normalizeCity(city);
    return getCityOptions().find(c => normalizeCity(c) === key) || null;
  }

  function populateCityDropdown() {
    const cityOptions = getCityOptions().map(c => `<option value="${c}">${c}</option>`).join("");
    const heroCity = document.getElementById("hero-city");
    if (heroCity) {
      const current = heroCity.value || "all";
      heroCity.innerHTML = `<option value="all">Toutes les villes</option>` + cityOptions;
      heroCity.value = current;
    }
    const cmCity = document.getElementById("cm-city");
    if (cmCity) {
      const current = cmCity.value;
      cmCity.innerHTML = cityOptions;
      if (current) cmCity.value = current;
    }

    const select = document.getElementById("filter-city");
    if (!select) return;
    const cities = getCityOptions();
    select.innerHTML = `<option value="all">Toutes les villes</option>` +
      cities.map(c => `<option value="${c}">${c}</option>`).join("");
    if (state.filters.city !== "all" && !cities.includes(state.filters.city)) state.filters.city = "all";
    select.value = state.filters.city;
  }

  /* ==========================================================================
     1. ÉCRAN ACCUEIL (Wireframe 1)
     ========================================================================== */
  function renderHomeSportsGrid() {
    const container = document.getElementById("home-sports-grid");
    if (!container) return;

    container.innerHTML = INITIAL_SPORTS.map(sport => `
      <a href="#sport/${sport.id}" class="sport-card-tile p-4 rounded-2xl flex flex-col items-center text-center group cursor-pointer relative overflow-hidden">
        <div class="text-3xl mb-2 group-hover:scale-110 transition-transform">${sport.icon}</div>
        <h4 class="text-sm font-bold text-white group-hover:text-mates-green transition-colors">${sport.name}</h4>
        <span class="text-[11px] text-slate-400 mt-1">${sport.activeMatesCount} mates</span>
      </a>
    `).join("");
  }

  /* ==========================================================================
     2. ÉCRAN RECHERCHE DE MATES (Wireframe 2)
     ========================================================================== */
  function renderMatesGrid() {
    const container = document.getElementById("mates-grid");
    const emptyState = document.getElementById("mates-empty-state");
    const countBadge = document.getElementById("mates-count-badge");
    if (!container) return;

    // Filtrage des mates
    const filtered = getAllMates().filter(mate => {
      // Filtre Sport
      if (state.filters.sport !== "all") {
        const hasSport = mate.sports.some(s => s.id === state.filters.sport);
        if (!hasSport) return false;
      }
      // Filtre Niveau
      if (state.filters.level !== "all") {
        const hasLevel = mate.sports.some(s => s.level.toLowerCase() === state.filters.level.toLowerCase());
        if (!hasLevel) return false;
      }
      // Filtre Ville
      if (state.filters.city !== "all") {
        if (normalizeCity(mate.city) !== normalizeCity(state.filters.city)) {
          return false;
        }
      }
      // Filtres rapides (pilules)
      const av = mate.availability || {};
      const today = dayName(new Date());
      const tomorrow = dayName(addDays(new Date(), 1));
      if (state.matesWhen === "tonight" && !(isMateLive(mate) || (av[today] || []).includes("soir"))) return false;
      if (state.matesWhen === "tomorrow" && !(av[tomorrow] || []).length) return false;
      if (state.matesWhen === "weekend" && !((av["Samedi"] || []).length || (av["Dimanche"] || []).length)) return false;
      if (state.matesWhen === "live" && !isMateLive(mate)) return false;
      return true;
    });

    // Les joueurs « dispo ce soir » apparaissent en premier
    filtered.sort((a, b) => Number(isMateLive(b)) - Number(isMateLive(a)));

    document.querySelectorAll("#mates-quick-pills .pill").forEach(p => {
      p.classList.toggle("active", p.dataset.when === state.matesWhen);
      p.setAttribute("aria-pressed", p.dataset.when === state.matesWhen ? "true" : "false");
    });
    if (state.currentRoute === "sport") updateMatesTitle();

    if (countBadge) {
      countBadge.textContent = filtered.length;
    }
    const countLabel = document.getElementById("mates-count-label");
    if (countLabel) countLabel.textContent = filtered.length > 1 ? "mates trouvés" : "mate trouvé";

    if (filtered.length === 0) {
      container.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      const emptyText = document.getElementById("mates-empty-text");
      if (emptyText) {
        const parts = [];
        if (state.filters.sport !== "all") parts.push(sportMeta(state.filters.sport).name);
        if (state.filters.city !== "all") parts.push(`à ${state.filters.city}`);
        if (state.matesWhen === "tonight") parts.push("ce soir");
        if (state.matesWhen === "tomorrow") parts.push("demain");
        if (state.matesWhen === "weekend") parts.push("ce week-end");
        emptyText.textContent = parts.length
          ? `Personne pour ${parts.join(" ")} pour l'instant. Publie une alerte : on te prévient dès qu'un mate correspond.`
          : "Personne ne correspond encore à ces critères.";
      }
      lucide.createIcons();
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    // Rendu des cartes de mates (Wireframe 2: photo, prénom/âge, ville, bio, sports + niveau)
    container.innerHTML = filtered.map(mate => {
      // Badges de sports pratiqués
      const sportsBadges = mate.sports.slice(0, 3).map(s => `
        <span class="badge-sport">
          <span>${s.name}</span>
          <span class="opacity-80 font-normal">(${s.level})</span>
        </span>
      `).join("");

      const live = isMateLive(mate);
      return `
        <div class="bg-mates-card border ${live ? "border-mates-green/50" : "border-mates-border"} hover:border-mates-green/60 rounded-3xl p-6 flex flex-col justify-between transition-all hover:-translate-y-1 hover:shadow-xl group relative">
          ${live ? `<span class="absolute top-4 right-4 badge-spots inline-flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3"></i>Dispo ce soir</span>` : ""}
          <div>
            <!-- En-tête de la carte : photo, prénom/âge, ville -->
            <div class="flex items-center gap-4 mb-4">
              <a href="#mate/${mate.id}" class="relative flex-shrink-0">
                <img src="${mate.avatar}" alt="${mate.firstName}" loading="lazy" class="w-16 h-16 rounded-full object-cover ring-2 ring-mates-border group-hover:ring-mates-green transition-all ${live ? "live-halo" : ""}">
              </a>
              <div class="overflow-hidden">
                <a href="#mate/${mate.id}" class="text-lg font-bold text-white group-hover:text-mates-green transition-colors flex items-center gap-1.5">
                  <span>${mate.firstName}${mate.age ? `, ${mate.age} ans` : ""}</span>
                  <i data-lucide="badge-check" class="w-4 h-4 text-mates-green flex-shrink-0"></i>
                </a>
                <div class="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <i data-lucide="map-pin" class="w-3.5 h-3.5 text-mates-green"></i>
                  <span>${mate.city || "Ville non renseignée"}${mate.distanceKm != null ? ` • à ${mate.distanceKm} km` : ""}</span>
                </div>
              </div>
            </div>

            <!-- Indicateurs de confiance -->
            <div class="flex flex-wrap gap-1.5 mb-3">${trustChipsHtml(mate)}</div>

            <!-- Bio -->
            <p class="text-xs text-slate-300 leading-relaxed mb-4 line-clamp-2">
              ${mate.bio ? `"${mate.bio}"` : `<span class="italic text-slate-500">Nouveau sur Mates !</span>`}
            </p>

            <!-- Sports + niveau (Wireframe 2) -->
            <div class="space-y-1.5 mb-5">
              <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sports & Niveau :</div>
              <div class="flex flex-wrap gap-1.5">
                ${sportsBadges}
              </div>
            </div>
          </div>

          <!-- Boutons d'action (Voir public / Proposer partie) -->
          <div class="pt-4 border-t border-mates-border flex items-center gap-2">
            <a href="#mate/${mate.id}" class="w-1/2 btn-outline-neon py-2 text-xs flex items-center justify-center gap-1">
              <i data-lucide="user" class="w-3.5 h-3.5"></i>
              <span>Voir profil</span>
            </a>
            <button onclick="MatesApp.openProposeMatchModal('${mate.id}')" class="w-1/2 btn-neon py-2 text-xs flex items-center justify-center gap-1">
              <i data-lucide="swords" class="w-3.5 h-3.5"></i>
              <span>Jouer</span>
            </button>
          </div>
        </div>
      `;
    }).join("");

    lucide.createIcons();
  }

  function setMatesWhen(when) {
    state.matesWhen = state.matesWhen === when ? null : when;
    renderMatesGrid();
  }

  /* ==========================================================================
     0. PAGE DE BIENVENUE (avant l'inscription)
     ========================================================================== */
  function renderWelcome() {
    const sportSel = document.getElementById("welcome-sport");
    if (sportSel && !sportSel.options.length) {
      sportSel.innerHTML = INITIAL_SPORTS.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join("");
    }
    const list = document.getElementById("welcome-city-list");
    if (list) list.innerHTML = getCityOptions().map(c => `<option value="${escapeHtml(c)}"></option>`).join("");

    const upcoming = state.matches
      .filter(m => new Date(m.startsAt) > new Date() && remainingSlots(m) > 0)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    const tonight = upcoming.filter(m => isTonight(new Date(m.startsAt))).length;
    const live = document.getElementById("welcome-live-count");
    if (live) live.textContent = tonight ? `${tonight} match${tonight > 1 ? "s" : ""} ce soir` : `${upcoming.length} matchs cette semaine`;

    const box = document.getElementById("welcome-matches");
    if (!box) return;
    box.innerHTML = upcoming.slice(0, 8).map(m => {
      const sport = sportMeta(m.sportId);
      const start = new Date(m.startsAt);
      const left = remainingSlots(m);
      return `
        <a href="#match/${m.id}" class="snap-start flex-shrink-0 w-64 bg-mates-card border border-mates-border hover:border-mates-green/60 rounded-3xl p-5 space-y-3 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-3xl">${sport.icon}</span>
            <span class="text-[11px] font-bold px-2 py-1 rounded-full bg-mates-green/15 text-mates-green">${left} place${left > 1 ? "s" : ""}</span>
          </div>
          <div>
            <div class="text-[11px] font-bold text-mates-green uppercase tracking-wider">${sport.name} • ${escapeHtml(m.city)}</div>
            <div class="font-bold text-white truncate">${escapeHtml(m.title)}</div>
            <div class="text-xs text-slate-400 truncate">${escapeHtml(m.clubName)}</div>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-300 pt-3 border-t border-mates-border">
            <span>${formatMatchDay(start)} • ${formatHour(start)}</span>
            <strong class="text-white">${priceLabel(m)}</strong>
          </div>
        </a>`;
    }).join("") || `<p class="text-sm text-slate-400">Aucun match ouvert pour l'instant : crée le premier !</p>`;
    lucide.createIcons();
  }

  function welcomeSearch(event) {
    if (event) event.preventDefault();
    const sport = (document.getElementById("welcome-sport") || {}).value || "padel";
    const cityRaw = ((document.getElementById("welcome-city") || {}).value || "").trim();
    const city = cityRaw ? findCityOption(cityRaw) : null;
    if (cityRaw && !city) {
      showToast(`Pas encore de mates à « ${cityRaw} ». Essaie Liège, Bruxelles, Namur ou Charleroi.`, "info");
      return;
    }
    if (!city) {
      state.filters.city = "all";
      const c = document.getElementById("filter-city");
      if (c) c.value = "all";
    }
    window.location.hash = `#sport/${sport}${city ? "/" + encodeURIComponent(city) : ""}`;
  }

  function heroSearch(event) {
    if (event) event.preventDefault();
    const sport = document.getElementById("hero-sport");
    const city = document.getElementById("hero-city");
    state.filters.sport = sport ? sport.value : "all";
    state.filters.city = city ? city.value : "all";
    state.filters.level = "all";
    const fc = document.getElementById("filter-city");
    const fl = document.getElementById("filter-level");
    if (fc) fc.value = state.filters.city;
    if (fl) fl.value = "all";
    if (state.filters.sport === "all") {
      showToast("Choisis ton sport pour voir les mates" + (state.filters.city !== "all" ? ` à ${state.filters.city}` : "") + " !", "info");
      window.location.hash = "#sports";
      return;
    }
    const target = `#sport/${state.filters.sport}`;
    if (window.location.hash === target) handleHashChange();
    else window.location.hash = target;
  }

  function toggleLevelHelp(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById("level-help-panel");
    const btn = document.getElementById("level-help-btn");
    if (!panel) return;
    const willOpen = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !willOpen);
    if (btn) btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }

  function createSearchAlert() {
    if (!requireAuth("Connecte-toi pour publier une alerte.")) return;
    const alerts = readStore(STORAGE_KEY_ALERTS, []);
    const alert = {
      sport: state.filters.sport,
      city: state.filters.city,
      level: state.filters.level,
      when: state.matesWhen,
      createdAt: new Date().toISOString()
    };
    alerts.push(alert);
    writeStore(STORAGE_KEY_ALERTS, alerts.slice(-20));
    const what = state.filters.sport !== "all" ? sportMeta(state.filters.sport).name : "sport";
    const where = state.filters.city !== "all" ? ` à ${state.filters.city}` : "";
    showToast(`Alerte publiée ! On te prévient dès qu'un mate ${what}${where} est dispo.`, "success");
  }

  function resetFilters() {
    state.matesWhen = null;
    state.filters = { sport: state.filters.sport, level: "all", city: "all" };
    const l = document.getElementById("filter-level");
    const c = document.getElementById("filter-city");
    if (l) l.value = "all";
    if (c) c.value = "all";
    renderMatesGrid();
    showToast("Filtres réinitialisés.", "info");
  }

  /* ==========================================================================
     3. ÉCRAN LISTE DES SPORTS (Wireframe 3)
     ========================================================================== */
  function renderSportsCatalog(searchQuery = "") {
    const container = document.getElementById("all-sports-grid");
    if (!container) return;

    const list = INITIAL_SPORTS.filter(s => {
      if (!searchQuery) return true;
      return s.name.toLowerCase().includes(searchQuery) || s.category.toLowerCase().includes(searchQuery);
    });

    container.innerHTML = list.map(sport => `
      <a href="#sport/${sport.id}" class="bg-mates-card border border-mates-border hover:border-mates-green/70 rounded-3xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl group flex flex-col justify-between">
        <div>
          <!-- En-tête carte sport (icône, nom) -->
          <div class="flex items-center justify-between mb-4">
            <span class="text-4xl p-2.5 bg-mates-cardElevated rounded-2xl border border-mates-border group-hover:border-mates-green/40 transition-colors">${sport.icon}</span>
            <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-mates-green/10 text-mates-green border border-mates-green/30 uppercase tracking-wider">
              ${sport.category}
            </span>
          </div>

          <h3 class="text-xl font-bold text-white group-hover:text-mates-green transition-colors mb-2">${sport.name}</h3>
          
          <!-- Description courte (Wireframe 3) -->
          <p class="text-xs text-slate-400 leading-relaxed mb-4">
            ${sport.description}
          </p>
        </div>

        <!-- Méta & CTA -->
        <div class="pt-4 border-t border-mates-border space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span>${sport.activeMatesCount} mates actifs</span>
            <span class="text-slate-300 font-semibold">${sport.playersPerMatch.split("(")[0]}</span>
          </div>
          <div class="text-xs font-bold text-mates-green flex items-center justify-end gap-1 pt-1 group-hover:translate-x-1 transition-transform">
            <span>Découvrir</span>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </div>
        </div>
      </a>
    `).join("");

    lucide.createIcons();
  }

  /* ==========================================================================
     4. ÉCRAN PAGE D'UN SPORT (Wireframe 4)
     ========================================================================== */
  function renderSingleSportPage(sportId) {
    const sport = INITIAL_SPORTS.find(s => s.id === sportId) || INITIAL_SPORTS[0];

    // Bandeau : icône, nom, slogan, bouton « Filtrer les mates » (Wireframe 4)
    const heroBanner = document.getElementById("sport-hero-banner");
    if (heroBanner) {
      heroBanner.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div class="flex items-center gap-5">
            <div class="text-6xl p-4 bg-slate-900/80 rounded-3xl border border-mates-border shadow-xl">
              ${sport.icon}
            </div>
            <div>
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mates-green/15 text-mates-green text-xs font-bold uppercase mb-2">
                Sport officiel • ${sport.category}
              </div>
              <h1 class="text-3xl sm:text-4xl font-extrabold text-white">${sport.name}</h1>
              <p class="text-slate-300 text-sm mt-1 max-w-xl font-medium">"${sport.slogan}"</p>
            </div>
          </div>

          <!-- Bouton « Filtrer les mates » (Wireframe 4) -->
          <div class="flex flex-wrap items-center gap-3">
            <button onclick="MatesApp.filterMatesForSport()" class="btn-neon text-sm py-3 px-5 shadow-lg">
              <i data-lucide="users" class="w-4 h-4"></i>
              <span>Voir les mates</span>
            </button>
            <button onclick="MatesApp.openBookingModal('${sport.id}')" class="btn-outline-neon text-sm py-3 px-5">
              <i data-lucide="calendar" class="w-4 h-4"></i>
              <span>Voir les matchs</span>
            </button>
          </div>
        </div>

        <div class="mt-8 pt-6 border-t border-mates-border/60 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-300">
          <div>
            <span class="text-slate-500 block uppercase font-bold text-[10px]">Format classique</span>
            <span class="text-white font-semibold">${sport.playersPerMatch}</span>
          </div>
          <div>
            <span class="text-slate-500 block uppercase font-bold text-[10px]">Durée moyenne</span>
            <span class="text-white font-semibold">${sport.duration}</span>
          </div>
          <div>
            <span class="text-slate-500 block uppercase font-bold text-[10px]">Clubs partenaires</span>
            <span class="text-white font-semibold">${sport.venuesCount} centres</span>
          </div>
          <div>
            <span class="text-slate-500 block uppercase font-bold text-[10px]">Zones actives</span>
            <span class="text-white font-semibold">${sport.popularIn}</span>
          </div>
        </div>
      `;
    }

    // Titre section "Ils pratiquent [sport]" (Wireframe 4)
    const titleEl = document.getElementById("sport-mates-title");
    if (titleEl) {
      titleEl.textContent = `Ils pratiquent le ${sport.name}`;
    }

    // Grille des mates de ce sport (filtres niveau / ville / dispo)
    state.filters.sport = sport.id;
    renderMatesGrid();
    syncLiveToggles();

    // Section Terrains Partenaires
    const venuesGrid = document.getElementById("sport-venues-grid");
    if (venuesGrid) {
      venuesGrid.innerHTML = `
        <div class="bg-mates-card border border-mates-border rounded-2xl p-5 space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <span class="text-xs font-bold text-mates-green uppercase">Centre recommandé</span>
              <h4 class="text-base font-bold text-white mt-1">${sport.name} Club Belle-Île</h4>
            </div>
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Ouvert</span>
          </div>
          <p class="text-xs text-slate-400">Courts intérieurs chauffés et terrains extérieurs panoramiques.</p>
          <div class="pt-2 flex justify-between items-center text-xs">
            <span class="text-slate-300 font-bold">À partir de 9 € / pers.</span>
            <button onclick="MatesApp.openCreateMatchModal('${sport.id}')" class="btn-neon text-[11px] py-1.5 px-3">Organiser</button>
          </div>
        </div>

        <div class="bg-mates-card border border-mates-border rounded-2xl p-5 space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <span class="text-xs font-bold text-mates-green uppercase">Complexe Métropole</span>
              <h4 class="text-base font-bold text-white mt-1">Sport Arena Rocourt</h4>
            </div>
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Ouvert</span>
          </div>
          <p class="text-xs text-slate-400">Infrastructures modernes de dernière génération avec vestiaires et club-house.</p>
          <div class="pt-2 flex justify-between items-center text-xs">
            <span class="text-slate-300 font-bold">À partir de 8 € / pers.</span>
            <button onclick="MatesApp.openCreateMatchModal('${sport.id}')" class="btn-neon text-[11px] py-1.5 px-3">Organiser</button>
          </div>
        </div>

        <div class="bg-mates-card border border-mates-border rounded-2xl p-5 space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <span class="text-xs font-bold text-mates-green uppercase">Club Universitaire</span>
              <h4 class="text-base font-bold text-white mt-1">Centre Sart-Tilman</h4>
            </div>
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Tarif étudiant</span>
          </div>
          <p class="text-xs text-slate-400">Accessible aux étudiants HELMo et grand public. Réductions membres.</p>
          <div class="pt-2 flex justify-between items-center text-xs">
            <span class="text-slate-300 font-bold">À partir de 6 € / pers.</span>
            <button onclick="MatesApp.openCreateMatchModal('${sport.id}')" class="btn-neon text-[11px] py-1.5 px-3">Organiser</button>
          </div>
        </div>
      `;
    }

    lucide.createIcons();
  }

  function filterMatesForSport() {
    const section = document.getElementById("sport-mates-section");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ==========================================================================
     5. ÉCRAN PROFIL PUBLIC (Wireframe 5)
     ========================================================================== */
  function renderPublicProfile(mateId) {
    let mate = getAllMates().find(m => m.id === mateId);

    // Si on regarde notre propre profil public
    if ((mateId === "my-profile" || mateId === "me") && state.userProfile) {
      mate = state.userProfile;
    }

    if (!mate) {
      mate = INITIAL_MATES[0];
    }

    state.selectedMateId = mate.id;
    setTitle(mate.id === "my-profile" ? "Mon profil public" : `Profil de ${mate.firstName}`);
    const live = isMateLive(mate);

    // Progression & badges
    const progressEl = document.getElementById("public-progress");
    if (progressEl) progressEl.innerHTML = progressHtml(mate);
    const badgesEl = document.getElementById("public-badges");
    if (badgesEl) badgesEl.innerHTML = badgesHtml(mate);

    // CARTE IDENTITÉ : photo, nom, âge, ville, bio (Wireframe 5)
    const identityCard = document.getElementById("public-identity-card");
    if (identityCard) {
      identityCard.innerHTML = `
        <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div class="relative flex-shrink-0">
            <img src="${mate.avatar}" alt="${mate.firstName}" class="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl object-cover ring-4 ring-mates-border shadow-2xl ${live ? "live-halo" : ""}">
            <span class="absolute -bottom-2 -right-2 px-3 py-1 bg-mates-green text-mates-dark font-extrabold text-xs rounded-full shadow-lg">
              ${live ? "⚡ Dispo ce soir" : mate.isNew ? "Nouveau" : `${mate.reliability || '100%'} Fiable`}
            </span>
          </div>

          <div class="space-y-3 text-center sm:text-left flex-grow">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 class="text-3xl font-extrabold text-white flex items-center justify-center sm:justify-start gap-2">
                  <span>${mate.firstName} ${mate.lastName || ''}</span>
                  <i data-lucide="badge-check" class="w-6 h-6 text-mates-green"></i>
                </h1>
                <div class="text-sm text-slate-400 flex items-center justify-center sm:justify-start gap-2 mt-1">
                  ${mate.age ? `<span>${mate.age} ans</span><span>•</span>` : ""}
                  <i data-lucide="map-pin" class="w-4 h-4 text-mates-green"></i>
                  <span>${mate.city || "Ville non renseignée"} ${mate.distanceKm ? `(à ${mate.distanceKm} km)` : ''}</span>
                </div>
              </div>

              <!-- Bouton Proposer un match -->
              <button onclick="MatesApp.openProposeMatchModal('${mate.id}')" class="btn-neon text-xs py-2.5 px-5 shadow-lg">
                <i data-lucide="swords" class="w-4 h-4"></i>
                <span>Proposer une partie</span>
              </button>
            </div>

            <!-- Bio -->
            <p class="text-sm text-slate-300 leading-relaxed max-w-2xl bg-mates-cardElevated/40 p-4 rounded-2xl border border-mates-border">
              ${mate.bio ? `"${mate.bio}"` : `<span class="italic text-slate-500">Pas encore de bio.</span>`}
            </p>

            <!-- Stats -->
            <div class="flex flex-wrap items-center justify-center sm:justify-start gap-6 pt-2 text-xs text-slate-400">
              <div><strong class="text-white text-sm">${mate.matchesPlayed ?? 0}</strong> matchs joués</div>
              <div><strong class="text-mates-green text-sm">${mate.fairPlayScore ? `★ ${mate.fairPlayScore}` : "–"}</strong> note fair-play</div>
              <div><strong class="text-white text-sm">${mate.sports.length}</strong> sports pratiqués</div>
            </div>
          </div>
        </div>
      `;
    }

    const topProposeBtn = document.getElementById("propose-match-top-btn");
    if (topProposeBtn) {
      topProposeBtn.classList.toggle("hidden", mate.id === "my-profile");
      topProposeBtn.onclick = () => openProposeMatchModal(mate.id);
    }

    // CARTE SPORTS : liste des sports avec le niveau (Wireframe 5)
    const sportsList = document.getElementById("public-sports-list");
    const sportsCount = document.getElementById("public-sports-count");
    if (sportsCount) sportsCount.textContent = `${mate.sports.length} sport${mate.sports.length > 1 ? 's' : ''}`;

    if (sportsList) {
      sportsList.innerHTML = mate.sports.map(s => {
        const sportMeta = INITIAL_SPORTS.find(sp => sp.id === s.id) || { icon: "🏅" };
        const stars = "★".repeat(s.rating || 3) + "☆".repeat(5 - (s.rating || 3));
        return `
          <div class="p-3.5 bg-mates-cardElevated rounded-2xl border border-mates-border flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-2xl">${sportMeta.icon}</span>
              <div>
                <h4 class="font-bold text-white text-sm">${s.name}</h4>
                <span class="text-[11px] text-mates-green">${stars}</span>
              </div>
            </div>
            <span class="badge-level font-semibold text-xs">
              ${s.level}
            </span>
          </div>
        `;
      }).join("");
    }

    // CARTE DISPONIBILITÉS : grille jours × créneaux (cases actives en vert foncé) (Wireframe 5)
    const matrixContainer = document.getElementById("public-availability-matrix");
    if (matrixContainer) {
      matrixContainer.innerHTML = buildAvailabilityMatrixHtml(mate.availability, false);
    }

    lucide.createIcons();
  }

  /**
   * Construction du HTML de la grille de disponibilités (Wireframe 5 & 6)
   * 7 jours x 4 créneaux (Matin, Midi, Après-midi, Soir)
   */
  function buildAvailabilityMatrixHtml(availabilityMap = {}, isInteractive = false) {
    let headerRow = `<div class="font-bold text-[11px] text-slate-400 uppercase py-2 text-center">Créneau</div>`;
    DAYS_OF_WEEK.forEach(day => {
      const shortDay = day.substring(0, 3);
      headerRow += `<div class="font-bold text-[11px] text-slate-300 uppercase py-2 text-center">${shortDay}</div>`;
    });

    let rowsHtml = "";
    TIME_SLOTS.forEach(slot => {
      let rowCells = `<div class="text-[11px] font-semibold text-slate-400 flex items-center">${slot.label.split("(")[0]}</div>`;
      DAYS_OF_WEEK.forEach(day => {
        const daySlots = availabilityMap[day] || [];
        const isActive = daySlots.includes(slot.id);
        const activeClass = isActive ? "active" : "";
        const interactiveClass = isInteractive ? "interactive" : "";
        const onclickAttr = isInteractive ? `onclick="MatesApp.toggleEditSlot('${day}', '${slot.id}')"` : "";
        const content = isActive ? `<i data-lucide="check" class="w-3.5 h-3.5"></i>` : "";

        rowCells += `
          <div class="availability-cell ${activeClass} ${interactiveClass}" data-day="${day}" data-slot="${slot.id}" ${onclickAttr}>
            ${content}
          </div>
        `;
      });
      rowsHtml += rowCells;
    });

    return `
      <div class="availability-grid">
        ${headerRow}
        ${rowsHtml}
      </div>
    `;
  }

  /* ==========================================================================
     6. ÉCRAN MON PROFIL (ÉDITION) (Wireframe 6)
     ========================================================================== */
  function initEditProfileForm() {
    state.editingProfile = JSON.parse(JSON.stringify(state.userProfile));
    const p = state.editingProfile;

    // Remplissage des champs de base
    const fn = document.getElementById("edit-firstname");
    const ln = document.getElementById("edit-lastname");
    const age = document.getElementById("edit-age");
    const city = document.getElementById("edit-city");
    const bio = document.getElementById("edit-bio");
    const avatarPreview = document.getElementById("edit-avatar-preview");
    const avatarUrl = document.getElementById("edit-avatar-url");

    if (fn) fn.value = p.firstName || "";
    if (ln) ln.value = p.lastName || "";
    if (age) age.value = p.age || "";
    if (city) city.value = p.city || "";
    if (bio) bio.value = p.bio || "";
    if (avatarPreview) avatarPreview.src = p.avatar || DEFAULT_AVATAR;
    if (avatarUrl) avatarUrl.value = p.avatar || "";

    renderEditSportsList();
    renderEditAvailabilityMatrix();
    lucide.createIcons();
  }

  function renderEditSportsList() {
    const container = document.getElementById("edit-sports-list");
    if (!container || !state.editingProfile) return;

    if (state.editingProfile.sports.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-400 italic">Aucun sport ajouté pour l'instant.</p>`;
      return;
    }

    container.innerHTML = state.editingProfile.sports.map((sport, index) => {
      const sportMeta = INITIAL_SPORTS.find(s => s.id === sport.id) || { icon: "🏅" };
      return `
        <div class="p-3.5 bg-mates-cardElevated rounded-2xl border border-mates-border flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="text-2xl">${sportMeta.icon}</span>
            <span class="font-bold text-white text-sm">${sport.name}</span>
          </div>

          <div class="flex items-center gap-3">
            <select onchange="MatesApp.updateSportLevel(${index}, this.value)" class="bg-mates-card border border-mates-border rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-mates-green">
              <option value="Débutant" ${sport.level === 'Débutant' ? 'selected' : ''}>Débutant</option>
              <option value="Intermédiaire" ${sport.level === 'Intermédiaire' ? 'selected' : ''}>Intermédiaire</option>
              <option value="Confirmé" ${sport.level === 'Confirmé' ? 'selected' : ''}>Confirmé</option>
              <option value="Expert" ${sport.level === 'Expert' ? 'selected' : ''}>Expert</option>
            </select>

            <!-- Bouton suppression (×) (Wireframe 6) -->
            <button type="button" onclick="MatesApp.removeSportFromProfile(${index})" title="Supprimer ce sport" class="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-colors">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");

    lucide.createIcons();
  }

  function renderEditAvailabilityMatrix() {
    const container = document.getElementById("edit-availability-matrix");
    if (!container || !state.editingProfile) return;

    container.innerHTML = buildAvailabilityMatrixHtml(state.editingProfile.availability, true);
    lucide.createIcons();
  }

  function toggleEditSlot(day, slotId) {
    if (!state.editingProfile) return;
    if (!state.editingProfile.availability[day]) {
      state.editingProfile.availability[day] = [];
    }

    const daySlots = state.editingProfile.availability[day];
    const index = daySlots.indexOf(slotId);

    if (index > -1) {
      daySlots.splice(index, 1);
    } else {
      daySlots.push(slotId);
    }

    renderEditAvailabilityMatrix();
    renderObAvailability();
  }

  function addSportToProfile() {
    const selectSport = document.getElementById("add-new-sport-select");
    const selectLevel = document.getElementById("add-new-sport-level");
    if (!selectSport || !selectSport.value) {
      showToast("Veuillez choisir un sport dans la liste.", "warning");
      return;
    }

    const sportId = selectSport.value;
    const level = selectLevel.value;
    const sportMeta = INITIAL_SPORTS.find(s => s.id === sportId);

    // Vérifier si déjà présent
    if (state.editingProfile.sports.some(s => s.id === sportId)) {
      showToast("Vous avez déjà ce sport dans votre profil.", "warning");
      return;
    }

    state.editingProfile.sports.push({
      id: sportId,
      name: sportMeta ? sportMeta.name : sportId,
      level: level,
      rating: level === "Expert" ? 5 : level === "Confirmé" ? 4 : level === "Intermédiaire" ? 3 : 2
    });

    renderEditSportsList();
    selectSport.value = "";
    showToast(`Sport ${sportMeta.name} ajouté !`, "success");
  }

  function removeSportFromProfile(index) {
    if (!state.editingProfile) return;
    const removed = state.editingProfile.sports.splice(index, 1);
    renderEditSportsList();
    if (removed[0]) {
      showToast(`${removed[0].name} supprimé de votre profil.`, "info");
    }
  }

  function updateSportLevel(index, newLevel) {
    if (!state.editingProfile || !state.editingProfile.sports[index]) return;
    state.editingProfile.sports[index].level = newLevel;
    state.editingProfile.sports[index].rating = newLevel === "Expert" ? 5 : newLevel === "Confirmé" ? 4 : newLevel === "Intermédiaire" ? 3 : 2;
  }

  function locateGps(inputId) {
    const cityInput = document.getElementById(inputId || "edit-city");
    if (!cityInput) return;
    if (!navigator.geolocation) {
      showToast("La géolocalisation n'est pas disponible : tape ta ville.", "info");
      return;
    }
    showToast("Recherche de ta position...", "info");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Ville Mates la plus proche de la position
        let best = null;
        Object.keys(CITY_COORDS).forEach(key => {
          const c = CITY_COORDS[key];
          const d = Math.hypot(c.lat - pos.coords.latitude, (c.lon - pos.coords.longitude) * Math.cos(c.lat * Math.PI / 180));
          if (!best || d < best.d) best = { key, d };
        });
        const city = best && (findCityOption(best.key) || best.key);
        if (city) {
          cityInput.value = city;
          cityInput.dispatchEvent(new Event("input"));
          showToast(`Ville la plus proche : ${city}`, "success");
        }
      },
      () => showToast("Position indisponible : tape ta ville.", "info"),
      { timeout: 8000 }
    );
  }

  function triggerAvatarChange() {
    pickAvatar("edit");
  }

  function pickAvatar(target) {
    state.avatarTarget = target;
    const input = document.getElementById("avatar-file-input");
    if (!input) return;
    input.value = "";
    input.click();
  }

  // Recadre la photo en carré et la réduit (léger à envoyer / stocker)
  function resizeImage(file, size) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image illisible")); };
      img.src = url;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function onAvatarFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !state.editingProfile) return;
    if (!/^image\//.test(file.type)) {
      showToast("Choisis une image (JPG, PNG, HEIC...).", "warning");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast("Cette photo est trop lourde (15 Mo maximum).", "warning");
      return;
    }

    let blob;
    try {
      blob = await resizeImage(file, 400);
    } catch (e) {
      showToast("Impossible de lire cette image, essaie une autre photo.", "warning");
      return;
    }

    let url;
    if (SB && state.userProfile && state.userProfile.userId) {
      showToast("Envoi de la photo...", "info");
      const path = `${state.userProfile.userId}/avatar-${Date.now()}.jpg`;
      const bucket = SB.storage.from("avatars");
      const { error } = await bucket.upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) {
        console.warn("Envoi de la photo impossible :", error.message);
        showToast("Envoi de la photo impossible, réessaie plus tard.", "warning");
        return;
      }
      url = bucket.getPublicUrl(path).data.publicUrl;
    } else {
      url = await blobToDataUrl(blob);
    }

    state.editingProfile.avatar = url;
    ["edit-avatar-preview", "ob-avatar"].forEach(id => {
      const img = document.getElementById(id);
      if (img) img.src = url;
    });
    if (state.currentRoute === "onboarding") renderOnboardingPreview();
    showToast("Photo ajoutée !", "success");
  }

  async function saveProfile(event) {
    if (event) event.preventDefault();

    const fn = document.getElementById("edit-firstname").value.trim();
    const ln = document.getElementById("edit-lastname").value.trim();
    const age = parseInt(document.getElementById("edit-age").value, 10);
    const city = document.getElementById("edit-city").value.trim();
    const bio = document.getElementById("edit-bio").value.trim();

    if (!fn || !city) {
      showToast("Veuillez renseigner au moins votre prénom et votre ville.", "warning");
      return;
    }

    state.editingProfile.firstName = fn;
    state.editingProfile.lastName = ln;
    state.editingProfile.age = age || 22;
    state.editingProfile.city = city;
    state.editingProfile.bio = bio;

    if (!(await persistProfile(state.editingProfile))) return;
    showToast(SB ? "Profil enregistré ! Les autres mates voient déjà tes changements." : "Profil enregistré avec succès !", "success");

    // Redirection vers le profil public
    setTimeout(() => {
      window.location.hash = "#mate/my-profile";
    }, 800);
  }

  // Enregistre le profil (Supabase si comptes réels, sinon navigateur)
  async function persistProfile(p) {
    if (SB && state.userProfile && state.userProfile.userId) {
      const age = parseInt(p.age, 10);
      const row = {
        id: state.userProfile.userId,
        first_name: cleanText(p.firstName, 40),
        last_name: cleanText(p.lastName, 40),
        age: Number.isInteger(age) && age >= 13 && age <= 99 ? age : null,
        city: cleanText(findCityOption(p.city) || String(p.city || "").split("(")[0], 60),
        bio: cleanText(p.bio, 400),
        avatar: cleanAvatar(p.avatar) === DEFAULT_AVATAR ? null : p.avatar,
        sports: cleanSports(p.sports),
        availability: cleanAvailability(p.availability),
        updated_at: new Date().toISOString()
      };
      const { error } = await SB.from("profiles").upsert(row);
      if (error) {
        console.warn("Enregistrement du profil impossible :", error.message);
        showToast("Impossible d'enregistrer le profil, réessaie.", "warning");
        return false;
      }
      const { email } = state.userProfile;
      state.userProfile = profileFromRow(row, true);
      state.userProfile.email = email;
    } else {
      state.userProfile = JSON.parse(JSON.stringify(p));
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(state.userProfile));
    }
    populateCityDropdown();
    renderHeaderUserSection();
    return true;
  }

  function viewMyPublicProfile() {
    window.location.hash = "#mate/my-profile";
  }

  async function logout() {
    state.liveUntil = 0;
    writeStore(STORAGE_KEY_LIVE, 0);
    if (SB) {
      await SB.auth.signOut();
      state.userProfile = null;
      state.isAuthenticated = false;
      renderHeaderUserSection();
      showToast("Tu es déconnecté. À bientôt sur le terrain !", "info");
      window.location.hash = "#welcome";
      loadRemoteMates();
      return;
    }
    state.isAuthenticated = false;
    localStorage.setItem(STORAGE_KEY_AUTH, "false");
    renderHeaderUserSection();
    showToast("Vous avez été déconnecté.", "info");
    window.location.hash = "#welcome";
  }

  /* ==========================================================================
     7. ÉCRAN CONNEXION / INSCRIPTION (Wireframe 7)
     ========================================================================== */
  function toggleAuthMode() {
    state.authMode = state.authMode === "login" ? "register" : "login";
    updateAuthCard();
    renderGoogleButton();
  }

  function updateAuthCard() {
    const title = document.getElementById("auth-title");
    const subtitle = document.getElementById("auth-subtitle");
    const submitBtn = document.getElementById("auth-submit-btn");
    const toggleQuestion = document.getElementById("auth-toggle-question");
    const toggleBtn = document.getElementById("auth-toggle-btn");
    const pwdInput = document.getElementById("auth-password");
    const pwdHint = document.getElementById("auth-password-hint");
    const forgotBtn = document.getElementById("auth-forgot-btn");
    const isRegister = state.authMode === "register";
    if (pwdInput) pwdInput.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
    if (pwdHint) pwdHint.classList.toggle("hidden", !isRegister);
    if (forgotBtn) forgotBtn.classList.toggle("hidden", isRegister);

    if (state.authMode === "register") {
      if (title) title.textContent = "Inscription sur Mates";
      if (subtitle) subtitle.textContent = "Crée ton compte en 10 secondes, puis personnalise ton profil.";
      if (submitBtn) submitBtn.innerHTML = `<span>Créer mon compte</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      if (toggleQuestion) toggleQuestion.textContent = "Déjà un compte ?";
      if (toggleBtn) toggleBtn.textContent = "Se connecter";
    } else {
      if (title) title.textContent = "Connexion à Mates";
      if (subtitle) subtitle.textContent = "Rejoins des milliers de sportifs passionnés près de chez toi.";
      if (submitBtn) submitBtn.innerHTML = `<span>Se connecter</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      if (toggleQuestion) toggleQuestion.textContent = "Pas encore de compte ?";
      if (toggleBtn) toggleBtn.textContent = "S'inscrire";
    }
    lucide.createIcons();
  }

  function showAuthPanel() {
    ["auth-providers", "auth-email-block"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("hidden");
    });
  }

  /* ---- Bouton Google officiel (Google Identity Services)
     Google affiche alors l'adresse du site (et, une fois validé, le nom « Mates »)
     au lieu de l'adresse technique de Supabase. */
  let gisLoading = null;

  function loadGoogleScript() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if (!gisLoading) {
      gisLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = resolve;
        s.onerror = () => { gisLoading = null; reject(new Error("gsi")); };
        document.head.appendChild(s);
      });
    }
    return gisLoading;
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function renderGoogleButton() {
    const slot = document.getElementById("google-signin-slot");
    const fallback = document.getElementById("google-fallback-btn");
    if (!slot || !GOOGLE_CLIENT_ID || !PROVIDERS.google.enabled || !window.crypto || !crypto.subtle) return;
    try {
      await loadGoogleScript();
    } catch (e) {
      console.warn("Bouton Google indisponible, on garde la redirection classique.");
      return;
    }
    // Nonce : protège contre la réutilisation d'un jeton Google volé
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
    state.googleNonce = raw;
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      nonce: await sha256Hex(raw),
      ux_mode: "popup",
      context: state.authMode === "register" ? "signup" : "signin",
      itp_support: true
    });
    slot.innerHTML = "";
    const width = Math.min(400, Math.max(220, (slot.parentElement || slot).clientWidth || 320));
    google.accounts.id.renderButton(slot, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      text: state.authMode === "register" ? "signup_with" : "continue_with",
      logo_alignment: "center",
      locale: "fr",
      width
    });
    slot.classList.remove("hidden");
    if (fallback) fallback.classList.add("hidden");
  }

  async function onGoogleCredential(response) {
    if (!response || !response.credential) return;
    try {
      const { data, error } = await SB.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
        nonce: state.googleNonce
      });
      if (error) throw error;
      await applySession(data.session);
      await loadRemoteMates();
      const complete = isProfileComplete(state.userProfile);
      showToast(complete ? `Content de te revoir, ${state.userProfile.firstName} !` : "Compte Google connecté ! Personnalise ton profil.", "success");
      goAfterLogin();
    } catch (err) {
      showToast(translateAuthError(err), "warning");
      renderGoogleButton(); // nouveau nonce pour un nouvel essai
    }
  }

  async function handleOAuth(provider) {
    const info = PROVIDERS[provider];
    if (!info) return;
    if (SB) {
      if (!info.enabled) {
        showToast(`La connexion ${info.label} arrive bientôt. Utilise ton email en attendant !`, "info");
        return;
      }
      // Le bouton officiel Google remplace ce bouton dès qu'il est chargé.
      // S'il n'a pas pu se charger (bloqueur de pubs, réseau), on propose l'email.
      showToast("Le bouton Google n'a pas pu se charger (bloqueur de publicités ?). Recharge la page ou utilise ton email.", "warning");
      renderGoogleButton();
      return;
    }
    showToast(`Connexion ${info.label} simulée (mode démo)...`, "info");
    setTimeout(() => demoSocialLogin("demo@gmail.com"), 600);
  }

  function setButtonLoading(id, isLoading) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle("opacity-60", isLoading);
    btn.classList.toggle("pointer-events-none", isLoading);
  }

  function setAuthLoading(isLoading) {
    const btn = document.getElementById("auth-submit-btn");
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle("opacity-60", isLoading);
    btn.classList.toggle("pointer-events-none", isLoading);
  }

  async function handleAuthSubmit(e) {
    if (e) e.preventDefault();
    if (SB) return handleSupabaseAuthSubmit();
    const email = document.getElementById("auth-email").value.trim();
    if (!email) {
      showToast("Saisis ton adresse email.", "warning");
      return;
    }
    if (state.authMode === "register") {
      startDemoAccount({ email });
      showToast("Compte créé ! Personnalise ton profil.", "success");
      goAfterLogin();
      return;
    }
    loginSuccess(email);
  }

  async function handleSupabaseAuthSubmit() {
    const emailInput = document.getElementById("auth-email");
    const pwdInput = document.getElementById("auth-password");
    const email = emailInput.value.trim();
    const password = pwdInput.value;

    if (!email) {
      showToast("Saisis ton adresse email.", "warning");
      return;
    }
    if (password.length < 6) {
      showToast("Le mot de passe doit contenir au moins 6 caractères.", "warning");
      return;
    }

    setAuthLoading(true);
    try {
      if (state.authMode === "register") {
        const { data, error } = await SB.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: siteUrl() }
        });
        if (error) throw error;
        // Email déjà utilisé (Supabase ne renvoie pas d'erreur pour ne pas le révéler)
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw { message: "User already registered" };
        }
        pwdInput.value = "";

        if (!data.session) {
          // Confirmation par email activée dans Supabase
          state.authMode = "login";
          updateAuthCard();
          showToast("Compte créé ! Clique sur le lien reçu par email pour l'activer.", "success");
          return;
        }

        await applySession(data.session);
        await loadRemoteMates();
        showToast("Compte créé ! Personnalise ton profil.", "success");
        goAfterLogin();
      } else {
        const { data, error } = await SB.auth.signInWithPassword({ email, password });
        if (error) throw error;
        pwdInput.value = "";
        await applySession(data.session);
        await loadRemoteMates();
        showToast(`Content de te revoir, ${state.userProfile.firstName} !`, "success");
        goAfterLogin();
      }
    } catch (err) {
      showToast(translateAuthError(err), "warning");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!SB) {
      showToast("Lien de réinitialisation envoyé (mode démo).", "info");
      return;
    }
    const emailInput = document.getElementById("auth-email");
    const email = emailInput ? emailInput.value.trim() : "";
    if (!email) {
      showToast("Saisis ton email ci-dessus, puis clique à nouveau sur « Mot de passe oublié ? ».", "info");
      if (emailInput) emailInput.focus();
      return;
    }
    const { error } = await SB.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
    if (error) showToast(translateAuthError(error), "warning");
    else showToast("Si un compte existe, un lien de réinitialisation vient d'être envoyé.", "success");
  }

  function newBlankProfile(extra) {
    const p = JSON.parse(JSON.stringify(DEFAULT_MY_PROFILE));
    return Object.assign(p, {
      firstName: "", lastName: "", email: "", age: null, city: "", bio: "",
      avatar: DEFAULT_AVATAR, sports: [], availability: {}, onboarded: false
    }, extra || {});
  }

  // Mode démo : nouveau compte vide -> assistant de profil
  function startDemoAccount(extra) {
    state.userProfile = newBlankProfile(extra);
    state.isAuthenticated = true;
    localStorage.setItem(STORAGE_KEY_AUTH, "true");
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(state.userProfile));
    renderHeaderUserSection();
  }

  // Mode démo : Google -> on retrouve le compte déjà personnalisé, sinon nouveau compte
  function demoSocialLogin(email) {
    const p = state.userProfile;
    if (p && p.onboarded && isProfileComplete(p)) {
      loginSuccess(p.email || email);
      return;
    }
    startDemoAccount({ email });
    showToast("Compte créé ! Personnalise ton profil.", "success");
    goAfterLogin();
  }

  function loginSuccess(email) {
    state.isAuthenticated = true;
    localStorage.setItem(STORAGE_KEY_AUTH, "true");

    if (!state.userProfile) {
      state.userProfile = JSON.parse(JSON.stringify(DEFAULT_MY_PROFILE));
    }
    if (email) state.userProfile.email = email;
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(state.userProfile));

    renderHeaderUserSection();
    showToast(`Content de te revoir${state.userProfile.firstName ? ", " + state.userProfile.firstName : ""} !`, "success");
    setTimeout(goAfterLogin, 400);
  }

  /* ==========================================================================
     8. INSCRIPTION : ASSISTANT DE PERSONNALISATION DU PROFIL (4 étapes)
     ========================================================================== */
  const OB_STEPS = 4;

  function startOnboarding() {
    state.editingProfile = JSON.parse(JSON.stringify(state.userProfile));
    const p = state.editingProfile;
    p.sports = Array.isArray(p.sports) ? p.sports : [];
    p.availability = p.availability || {};
    state.onboardingStep = 1;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? "" : v; };
    set("ob-firstname", p.firstName);
    set("ob-lastname", p.lastName);
    set("ob-age", p.age);
    set("ob-city", p.city);
    set("ob-bio", p.bio);
    const avatar = document.getElementById("ob-avatar");
    if (avatar) avatar.src = p.avatar || DEFAULT_AVATAR;
    const list = document.getElementById("ob-city-list");
    if (list) list.innerHTML = getCityOptions().map(c => `<option value="${escapeHtml(c)}"></option>`).join("");

    renderOnboardingStep();
  }

  function readOnboardingIdentity() {
    const p = state.editingProfile;
    const val = id => (document.getElementById(id) || {}).value || "";
    p.firstName = cleanText(val("ob-firstname"), 40);
    p.lastName = cleanText(val("ob-lastname"), 40);
    const age = parseInt(val("ob-age"), 10);
    p.age = Number.isInteger(age) ? age : null;
    const city = cleanText(val("ob-city"), 60);
    p.city = findCityOption(city) || city;
    p.bio = cleanText(val("ob-bio"), 400);
  }

  function renderOnboardingStep() {
    const step = state.onboardingStep;
    document.querySelectorAll("#view-onboarding .ob-step").forEach(el => {
      el.classList.toggle("hidden", Number(el.dataset.step) !== step);
    });
    const num = document.getElementById("ob-step-num");
    if (num) num.textContent = step;
    const bar = document.getElementById("ob-progress");
    if (bar) bar.style.width = `${(step / OB_STEPS) * 100}%`;
    const back = document.getElementById("ob-back");
    if (back) back.classList.toggle("invisible", step === 1);
    const skip = document.getElementById("ob-skip");
    if (skip) skip.classList.toggle("hidden", step < 3);
    const next = document.getElementById("ob-next");
    if (next) {
      next.innerHTML = step === OB_STEPS
        ? `<span>C'est parti !</span><i data-lucide="check" class="w-4 h-4"></i>`
        : `<span>Continuer</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
    }

    if (step === 2) renderObSports();
    if (step === 3) renderObAvailability();
    if (step === 4) renderOnboardingPreview();
    lucide.createIcons();
  }

  function onboardingNext(skip) {
    const p = state.editingProfile;
    if (!p) return;
    readOnboardingIdentity();

    if (state.onboardingStep === 1) {
      if (!p.firstName) {
        showToast("Indique ton prénom.", "warning");
        document.getElementById("ob-firstname").focus();
        return;
      }
      if (p.age != null && (p.age < 13 || p.age > 99)) {
        showToast("Ton âge doit être compris entre 13 et 99 ans.", "warning");
        return;
      }
      if (!p.city) {
        showToast("Indique ta ville pour trouver des mates près de chez toi.", "warning");
        document.getElementById("ob-city").focus();
        return;
      }
    }
    if (state.onboardingStep === 2 && p.sports.length === 0) {
      showToast("Choisis au moins un sport.", "warning");
      return;
    }
    if (skip && state.onboardingStep === 4) p.bio = "";

    if (state.onboardingStep >= OB_STEPS) {
      finishOnboarding();
      return;
    }
    state.onboardingStep += 1;
    renderOnboardingStep();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onboardingBack() {
    if (state.onboardingStep <= 1) return;
    readOnboardingIdentity();
    state.onboardingStep -= 1;
    renderOnboardingStep();
  }

  async function finishOnboarding() {
    const p = state.editingProfile;
    p.onboarded = true;
    setButtonLoading("ob-next", true);
    const ok = await persistProfile(p);
    setButtonLoading("ob-next", false);
    if (!ok) return;
    if (SB) loadRemoteMates();
    showToast(`Ton profil est prêt, ${state.userProfile.firstName} ! Voici ton espace.`, "success");
    window.location.hash = "#dashboard";
  }

  function renderObSports() {
    const p = state.editingProfile;
    const grid = document.getElementById("ob-sports-grid");
    if (grid) {
      grid.innerHTML = INITIAL_SPORTS.map(sp => {
        const on = p.sports.some(s => s.id === sp.id);
        return `
          <button type="button" onclick="MatesApp.toggleObSport('${sp.id}')" aria-pressed="${on}"
            class="flex items-center gap-2.5 px-3 py-3 rounded-2xl border text-left transition-all ${on ? "border-mates-green bg-mates-green/10 text-white" : "border-mates-border bg-mates-cardElevated text-slate-300 hover:border-slate-500"}">
            <span class="text-2xl">${sp.icon}</span>
            <span class="text-sm font-bold flex-1">${sp.name}</span>
            ${on ? `<i data-lucide="check-circle-2" class="w-4 h-4 text-mates-green"></i>` : ""}
          </button>`;
      }).join("");
    }
    const levels = document.getElementById("ob-levels");
    if (levels) {
      levels.innerHTML = p.sports.length === 0 ? "" : `
        <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Ton niveau</div>
        ${p.sports.map(s => {
          const meta = sportMeta(s.id);
          return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-mates-cardElevated border border-mates-border">
              <div class="flex items-center gap-2 font-bold text-white text-sm"><span class="text-xl">${meta.icon || "🏅"}</span>${s.name}</div>
              <div class="flex flex-wrap gap-1.5">
                ${LEVELS.map(l => `<button type="button" onclick="MatesApp.setObLevel('${s.id}', '${l}')" class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${s.level === l ? "bg-mates-green text-mates-dark border-mates-green" : "border-mates-border text-slate-300 hover:border-slate-500"}">${l}</button>`).join("")}
              </div>
            </div>`;
        }).join("")}`;
    }
    lucide.createIcons();
  }

  function toggleObSport(sportId) {
    const p = state.editingProfile;
    if (!p) return;
    const i = p.sports.findIndex(s => s.id === sportId);
    if (i > -1) p.sports.splice(i, 1);
    else {
      const meta = INITIAL_SPORTS.find(s => s.id === sportId);
      if (!meta) return;
      p.sports.push({ id: meta.id, name: meta.name, level: "Débutant", rating: levelToRating("Débutant") });
    }
    renderObSports();
  }

  function setObLevel(sportId, level) {
    const s = state.editingProfile && state.editingProfile.sports.find(x => x.id === sportId);
    if (!s || !LEVELS.includes(level)) return;
    s.level = level;
    s.rating = levelToRating(level);
    renderObSports();
  }

  function renderObAvailability() {
    const container = document.getElementById("ob-availability");
    if (!container || !state.editingProfile) return;
    container.innerHTML = buildAvailabilityMatrixHtml(state.editingProfile.availability, true);
    lucide.createIcons();
  }

  function presetAvailability(kind) {
    const p = state.editingProfile;
    if (!p) return;
    const add = (days, slots) => days.forEach(d => {
      p.availability[d] = Array.from(new Set((p.availability[d] || []).concat(slots)));
    });
    if (kind === "clear") p.availability = {};
    if (kind === "evenings") add(["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"], ["soir"]);
    if (kind === "weekend") add(["Samedi", "Dimanche"], ["matin", "apresmidi"]);
    renderObAvailability();
  }

  function addBioTag(text) {
    const bio = document.getElementById("ob-bio");
    if (!bio) return;
    if (!bio.value.includes(text)) bio.value = (bio.value.trim() + " " + text).trim().slice(0, 400);
    renderOnboardingPreview();
  }

  function renderOnboardingPreview() {
    const box = document.getElementById("ob-preview");
    if (!box || !state.editingProfile) return;
    readOnboardingIdentity();
    const p = state.editingProfile;
    const slots = Object.values(p.availability || {}).reduce((n, list) => n + (list ? list.length : 0), 0);
    box.innerHTML = `
      <div class="bg-mates-cardElevated border border-mates-green/40 rounded-3xl p-5">
        <div class="flex items-center gap-4 mb-3">
          <img src="${escapeHtml(p.avatar || DEFAULT_AVATAR)}" alt="" class="w-16 h-16 rounded-full object-cover ring-2 ring-mates-green">
          <div>
            <div class="text-lg font-bold text-white">${escapeHtml(p.firstName || "Toi")}${p.age ? `, ${p.age} ans` : ""}</div>
            <div class="text-xs text-slate-400 flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-mates-green"></i>${escapeHtml(p.city || "Ta ville")}</div>
          </div>
        </div>
        <p class="text-xs text-slate-300 mb-3">${p.bio ? `"${escapeHtml(p.bio)}"` : `<span class="italic text-slate-500">Nouveau sur Mates !</span>`}</p>
        <div class="flex flex-wrap gap-1.5">
          ${p.sports.map(s => `<span class="badge-sport"><span>${escapeHtml(s.name)}</span><span class="opacity-80 font-normal">(${s.level})</span></span>`).join("")}
        </div>
        <div class="text-[11px] text-slate-500 mt-3">${slots ? `${slots} créneau${slots > 1 ? "x" : ""} de dispo par semaine` : "Aucune dispo renseignée (tu pourras l'ajouter plus tard)"}</div>
      </div>`;
    lucide.createIcons();
  }

  /* ==========================================================================
     MATCHS OUVERTS : liste, fiche détaillée, chat, partage, création
     ========================================================================== */
  function filterMatchesByWhen(list) {
    const when = state.matchesWhen;
    return list.filter(m => {
      const start = new Date(m.startsAt);
      if (start.getTime() + (m.durationMin || 60) * 60000 < Date.now()) return false;
      if (when === "tonight") return isTonight(start);
      if (when === "tomorrow") return isTomorrow(start);
      if (when === "weekend") return isThisWeekend(start);
      if (when === "free") return !m.price;
      return true;
    });
  }

  function setMatchesWhen(when) {
    state.matchesWhen = when && state.matchesWhen !== when ? when : null;
    renderOpenMatches();
  }

  function playersAvatarsHtml(match, size = "w-8 h-8") {
    const players = matchPlayers(match);
    const shown = players.slice(0, 6);
    const extra = players.length - shown.length;
    return shown.map(p => `
        <div class="${size} rounded-full bg-slate-700 border-2 ${p.me ? "border-mates-green" : "border-mates-card"} -ml-2 first:ml-0 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden" title="${escapeHtml(p.name)}">
          ${p.avatar ? `<img src="${p.avatar}" alt="" loading="lazy" class="w-full h-full object-cover">` : escapeHtml(p.name.substring(0, 2))}
        </div>`).join("") +
      (extra > 0 ? `<div class="${size} rounded-full bg-mates-off border-2 border-mates-card -ml-2 flex items-center justify-center text-[10px] font-bold text-slate-300">+${extra}</div>` : "");
  }

  function amenitiesIconsHtml(match) {
    return (match.amenities || []).map(a => AMENITIES[a]).filter(Boolean).map(a => `
      <span class="w-7 h-7 rounded-lg bg-mates-off border border-slate-800 flex items-center justify-center" title="${a.label}">
        <i data-lucide="${a.icon}" class="w-3.5 h-3.5 text-slate-300"></i>
        <span class="sr-only">${a.label}</span>
      </span>`).join("");
  }

  function renderOpenMatches() {
    const container = document.getElementById("open-matches-list");
    if (!container) return;

    document.querySelectorAll("#matches-quick-pills .pill").forEach(p => {
      p.classList.toggle("active", p.dataset.when === state.matchesWhen);
      p.setAttribute("aria-pressed", p.dataset.when === state.matchesWhen ? "true" : "false");
    });

    const list = filterMatchesByWhen(state.matches);
    const empty = document.getElementById("matches-empty-state");
    if (empty) empty.classList.toggle("hidden", list.length > 0);

    container.innerHTML = list.map(m => {
      const sport = sportMeta(m.sportId);
      const joined = isJoined(m);
      const full = remainingSlots(m) === 0;
      const start = new Date(m.startsAt);
      return `
        <article class="bg-mates-card border ${joined ? "border-mates-green/60" : "border-mates-border"} rounded-3xl p-6 flex flex-col justify-between hover:border-mates-green/60 transition-all hover:shadow-xl cursor-pointer" onclick="MatesApp.openMatchDetail('${m.id}')">
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-3xl">${sport.icon}</span>
                <div class="min-w-0">
                  <div class="text-[11px] font-bold text-mates-green uppercase tracking-wider">${sport.name} • ${escapeHtml(m.city)}</div>
                  <h3 class="font-bold text-white text-base truncate">${escapeHtml(m.title)}</h3>
                  <div class="text-xs text-slate-400 truncate">${escapeHtml(m.clubName)}</div>
                </div>
              </div>
              ${spotsBadgeHtml(m)}
            </div>

            <div class="p-3.5 bg-mates-off rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div class="flex justify-between gap-2 text-slate-300">
                <span class="flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5 text-mates-green"></i>${formatMatchDay(start)} • ${formatHour(start)}</span>
                ${weatherChipHtml(m)}
              </div>
              <div class="flex justify-between gap-2 text-slate-300">
                <span>Niveau</span>
                <strong class="text-white text-right">${escapeHtml(m.levelRequired)}</strong>
              </div>
              <div class="flex justify-between gap-2 text-slate-300">
                <span>Prix</span>
                <span class="text-right"><strong class="text-white">${priceLabel(m)}</strong><span class="block text-[11px] text-slate-500">${escapeHtml(m.payment)}</span></span>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
              ${statusBadgeHtml(m)}
              <div class="flex items-center gap-1">${amenitiesIconsHtml(m)}</div>
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center pl-2">${playersAvatarsHtml(m)}</div>
              <span class="text-[11px] text-slate-400 font-semibold">${matchPlayers(m).length}/${m.totalSlots} joueurs</span>
            </div>
          </div>

          <div class="pt-5 border-t border-mates-border mt-4 flex gap-2">
            ${joined
              ? `<button onclick="event.stopPropagation(); MatesApp.openMatchDetail('${m.id}')" class="flex-1 btn-outline-neon py-2.5 text-xs"><i data-lucide="check" class="w-4 h-4"></i><span>${m.mine ? "Ton match" : "Inscrit"} · Détails</span></button>`
              : `<button onclick="event.stopPropagation(); MatesApp.joinMatch('${m.id}')" class="flex-1 btn-neon py-2.5 text-xs" ${full ? "disabled" : ""}><span>${full ? "Complet" : "Rejoindre"}</span>${full ? "" : `<i data-lucide="arrow-right" class="w-4 h-4"></i>`}</button>`}
            <button onclick="event.stopPropagation(); MatesApp.shareMatch('${m.id}', 'whatsapp')" title="Partager sur WhatsApp" aria-label="Partager sur WhatsApp" class="w-11 rounded-xl border border-mates-border hover:border-mates-green text-slate-300 hover:text-mates-green flex items-center justify-center">
              <i data-lucide="share-2" class="w-4 h-4"></i>
            </button>
          </div>
        </article>
      `;
    }).join("");

    lucide.createIcons();
    loadWeather();
  }

  function openMatchDetail(matchId, fromRoute) {
    const match = getMatch(matchId);
    if (!match) return;
    state.openMatchId = match.id;
    renderMatchDetail(match.id);
    const modal = document.getElementById("match-detail-modal");
    if (modal) modal.classList.remove("hidden");
    setTitle(`${sportMeta(match.sportId).name} à ${match.city}`);
    // URL partageable (#match/xxx) sans recharger la page
    if (!fromRoute && window.location.hash !== `#match/${match.id}`) {
      history.replaceState(null, "", `#match/${match.id}`);
      state.currentRoute = "match";
    }
    loadWeather();
  }

  function renderMatchDetail(matchId) {
    const body = document.getElementById("match-detail-body");
    const match = getMatch(matchId);
    if (!body || !match) return;
    const sport = sportMeta(match.sportId);
    const start = new Date(match.startsAt);
    const end = new Date(start.getTime() + (match.durationMin || 60) * 60000);
    const joined = isJoined(match);
    const remaining = remainingSlots(match);
    const links = mapsLinks(match);
    const weather = weatherFor(match);
    const players = matchPlayers(match);
    body.innerHTML = `
      <div class="flex items-start gap-4 pr-10">
        <span class="text-5xl">${sport.icon}</span>
        <div class="min-w-0">
          <div class="text-xs font-bold text-mates-green uppercase tracking-wider">${sport.name} • ${escapeHtml(match.city)}</div>
          <h3 class="font-display text-3xl sm:text-4xl text-white">${escapeHtml(match.title)}</h3>
          <div class="flex flex-wrap gap-2 mt-2">${statusBadgeHtml(match)} ${spotsBadgeHtml(match)}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div class="p-4 rounded-2xl bg-mates-off border border-slate-800 space-y-1">
          <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400">Quand</div>
          <div class="text-white font-bold">${formatMatchDay(start)}</div>
          <div class="text-slate-300">${formatHour(start)} – ${formatHour(end)} (${match.durationMin} min)</div>
          ${weather ? `<div class="flex items-center gap-1.5 text-slate-300 pt-1"><i data-lucide="${weather.icon}" class="w-4 h-4 text-mates-green"></i>${weather.temp}°C • ${weather.label}</div>` : match.outdoor ? `<div class="text-[11px] text-slate-500 pt-1">Terrain extérieur</div>` : `<div class="text-[11px] text-slate-500 pt-1">Terrain intérieur</div>`}
        </div>
        <div class="p-4 rounded-2xl bg-mates-off border border-slate-800 space-y-1">
          <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400">Où</div>
          <div class="text-white font-bold">${escapeHtml(match.clubName)}</div>
          <div class="text-slate-300">${escapeHtml(match.courtName || "")}${match.courtName ? " · " : ""}${escapeHtml(match.city)}</div>
          <div class="flex gap-3 pt-1 text-xs font-semibold">
            <a href="${links.google}" target="_blank" rel="noopener" class="text-mates-green hover:underline inline-flex items-center gap-1"><i data-lucide="map" class="w-3.5 h-3.5"></i>Google Maps</a>
            <a href="${links.waze}" target="_blank" rel="noopener" class="text-mates-green hover:underline inline-flex items-center gap-1"><i data-lucide="navigation" class="w-3.5 h-3.5"></i>Waze</a>
          </div>
        </div>
        <div class="p-4 rounded-2xl bg-mates-off border border-slate-800 space-y-1">
          <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400">Prix & paiement</div>
          <div class="text-white font-bold">${priceLabel(match)}</div>
          <div class="text-slate-300 text-xs">${escapeHtml(match.payment)}</div>
        </div>
        <div class="p-4 rounded-2xl bg-mates-off border border-slate-800 space-y-1">
          <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400">Niveau attendu</div>
          <div class="text-white font-bold">${escapeHtml(match.levelRequired)}</div>
          <div class="text-slate-300 text-xs">${match.courtBooked ? "Le terrain est déjà payé et bloqué." : "Le terrain sera réservé quand l'équipe sera complète."}</div>
        </div>
      </div>

      ${(match.amenities || []).length ? `
      <div>
        <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Sur place</div>
        <div class="flex flex-wrap gap-2">
          ${match.amenities.map(a => AMENITIES[a]).filter(Boolean).map(a => `<span class="trust-chip"><i data-lucide="${a.icon}" class="w-3.5 h-3.5 text-mates-green"></i>${a.label}</span>`).join("")}
        </div>
      </div>` : ""}

      <div>
        <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Joueurs (${players.length}/${match.totalSlots})</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          ${players.map(p => `
            <${p.mateId ? `a href="#mate/${p.mateId}"` : "div"} class="flex items-center gap-2 p-2 rounded-xl bg-mates-off border ${p.me ? "border-mates-green/60" : "border-slate-800"} hover:border-mates-green/60 min-w-0">
              ${p.avatar ? `<img src="${p.avatar}" alt="" loading="lazy" class="w-8 h-8 rounded-full object-cover flex-shrink-0">` : `<span class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">${escapeHtml(p.name.substring(0, 2))}</span>`}
              <span class="text-xs font-semibold text-white truncate">${escapeHtml(p.me ? "Toi" : p.name)}</span>
            </${p.mateId ? "a" : "div"}>`).join("")}
          ${Array(remaining).fill(0).map(() => `
            <div class="flex items-center gap-2 p-2 rounded-xl border-2 border-dashed border-mates-green/40 text-mates-green">
              <span class="w-8 h-8 rounded-full bg-mates-green/10 flex items-center justify-center font-bold">+</span>
              <span class="text-xs font-semibold">Place libre</span>
            </div>`).join("")}
        </div>
      </div>

      ${chatPreviewHtml(match)}

      <div class="flex flex-col sm:flex-row gap-2">
        <button onclick="MatesApp.shareMatch('${match.id}', 'copy')" class="flex-1 btn-outline-neon py-2.5 text-sm"><i data-lucide="link" class="w-4 h-4"></i><span>Copier le lien du match</span></button>
        <button onclick="MatesApp.shareMatch('${match.id}', 'whatsapp')" class="flex-1 btn-outline-neon py-2.5 text-sm"><i data-lucide="message-circle" class="w-4 h-4"></i><span>Partager sur WhatsApp</span></button>
      </div>

      <div class="pt-2 border-t border-mates-border">
        ${match.mine
          ? `<div class="text-center text-sm text-slate-300 py-2">Tu organises ce match. Partage le lien pour le compléter plus vite !</div>`
          : joined
            ? `<button onclick="MatesApp.leaveMatch('${match.id}')" class="w-full py-3 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 font-semibold text-sm">Se désinscrire du match</button>`
            : `<button onclick="MatesApp.joinMatch('${match.id}')" class="w-full btn-neon py-3 text-base" ${remaining === 0 ? "disabled" : ""}>${remaining === 0 ? "Match complet" : `Rejoindre la partie · ${priceLabel(match)}`}</button>`}
      </div>
    `;
    lucide.createIcons();
  }

  // Compatibilité : anciens boutons « Rejoindre » (carte de l'accueil)
  function openJoinModal(matchId) {
    openMatchDetail(matchId);
  }

  function joinMatch(matchId) {
    const match = getMatch(matchId);
    if (!match) return;
    if (!requireAuth("Connecte-toi pour rejoindre un match.")) return;
    if (isJoined(match)) {
      openMatchDetail(match.id);
      return;
    }
    if (remainingSlots(match) === 0) {
      showToast("Ce match est complet. Active une alerte pour ne pas rater le prochain !", "warning");
      return;
    }
    state.matchState.joined[match.id] = new Date().toISOString();
    addLocalChatMessage(match.id, { system: true, text: `${myPlayerEntry().name} a rejoint le match 👋` });
    saveMatchState();
    renderOpenMatches();
    if (state.openMatchId === match.id) renderMatchDetail(match.id);
    const start = new Date(match.startsAt);
    showToast(`C'est validé ! Ta place est réservée : ${sportMeta(match.sportId).name}, ${formatMatchDay(start).toLowerCase()} à ${formatHour(start)}. Les autres joueurs sont prévenus.`, "success");
  }

  function leaveMatch(matchId) {
    const match = getMatch(matchId);
    if (!match) return;
    delete state.matchState.joined[match.id];
    saveMatchState();
    renderOpenMatches();
    renderMatchDetail(match.id);
    if (state.currentRoute === "dashboard") renderDashboard();
    showToast("Tu t'es désinscrit. Ta place est de nouveau libre pour un autre mate.", "info");
  }

  /* ==========================================================================
     CHAT DU MATCH
     - Mode démo : messages enregistrés dans le navigateur + réponses simulées des joueurs
     - Comptes réels : table Supabase « match_messages » en temps réel
     ========================================================================== */
  const QUICK_REPLIES = ["J'arrive 🏃", "5 min de retard ⏱️", "Je suis au terrain 📍", "Qui ramène les balles ?", "Je peux prêter une raquette 🎾", "Bien joué tout le monde 👏"];
  let chatChannel = null;
  let botTimers = [];

  function addLocalChatMessage(matchId, msg) {
    if (!state.matchState.chat[matchId]) state.matchState.chat[matchId] = [];
    state.matchState.chat[matchId].push(Object.assign({ at: new Date().toISOString() }, msg));
    state.matchState.chat[matchId] = state.matchState.chat[matchId].slice(-80);
  }

  function chatMessages(match) {
    return matchChat(match)
      .concat(state.remoteChat[match.id] || [])
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }

  function unreadCount(match) {
    if (!isJoined(match)) return 0;
    const since = new Date(state.matchState.read[match.id] || 0).getTime();
    return chatMessages(match).filter(m => !m.mine && !m.system && new Date(m.at).getTime() > since).length;
  }

  function markChatRead(matchId) {
    state.matchState.read[matchId] = new Date().toISOString();
    saveMatchState();
  }

  function chatPreviewHtml(match) {
    const msgs = chatMessages(match).filter(m => !m.system);
    const last = msgs.slice(-2);
    const joined = isJoined(match);
    const unread = unreadCount(match);
    return `
      <div class="rounded-2xl border border-mates-border overflow-hidden">
        <div class="px-4 py-3 bg-mates-off border-b border-mates-border flex items-center justify-between">
          <div class="text-sm font-bold text-white flex items-center gap-2"><i data-lucide="messages-square" class="w-4 h-4 text-mates-green"></i>Discussion du match</div>
          <span class="text-[11px] text-slate-500">${msgs.length} message${msgs.length > 1 ? "s" : ""}</span>
        </div>
        <div class="p-4 space-y-2 ${joined ? "" : "blur-[3px] select-none pointer-events-none"}" aria-hidden="${joined ? "false" : "true"}">
          ${last.length ? last.map(c => `
            <div class="flex items-start gap-2 text-xs">
              <img src="${escapeHtml(c.avatar || DEFAULT_AVATAR)}" alt="" class="w-6 h-6 rounded-full object-cover flex-shrink-0">
              <div class="min-w-0"><span class="font-bold ${c.mine ? "text-mates-green" : "text-slate-200"}">${escapeHtml(c.mine ? "Toi" : c.author)}</span> <span class="text-slate-300">${escapeHtml(c.text)}</span></div>
            </div>`).join("") : `<p class="text-xs text-slate-500">Aucun message pour l'instant.</p>`}
        </div>
        <div class="p-3 border-t border-mates-border bg-mates-off">
          ${joined
            ? `<a href="#chat/${match.id}" class="w-full btn-neon py-2.5 text-sm"><i data-lucide="message-circle" class="w-4 h-4"></i><span>Ouvrir la discussion</span>${unread ? `<span class="ml-1 px-2 py-0.5 rounded-full bg-mates-dark text-mates-green text-[11px] font-extrabold">${unread}</span>` : ""}</a>`
            : `<div class="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5"><i data-lucide="lock" class="w-3.5 h-3.5"></i>Rejoins le match pour discuter avec les joueurs.</div>`}
        </div>
      </div>`;
  }

  function openChat(match) {
    closeChat();
    state.chatMatchId = match.id;
    const sport = sportMeta(match.sportId);
    const start = new Date(match.startsAt);
    const players = matchPlayers(match);
    const remaining = remainingSlots(match);
    const links = mapsLinks(match);

    const header = document.getElementById("chat-header");
    if (header) header.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <span class="text-3xl flex-shrink-0">${sport.icon}</span>
        <div class="min-w-0">
          <div class="font-bold text-white truncate">${escapeHtml(match.title)}</div>
          <div class="text-[11px] text-slate-400 truncate">${players.length}/${match.totalSlots} joueurs · ${escapeHtml(players.map(p => p.me ? "toi" : p.name.split(" ")[0]).join(", "))}</div>
        </div>
      </div>`;

    const pinned = document.getElementById("chat-pinned");
    if (pinned) pinned.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
        <span class="flex items-center gap-1.5 text-slate-200"><i data-lucide="pin" class="w-3.5 h-3.5 text-mates-green"></i><strong>${formatMatchDay(start)} · ${formatHour(start)}</strong> · ${escapeHtml(match.clubName)}</span>
        <span class="flex items-center gap-3 font-semibold">
          <a href="${links.google}" target="_blank" rel="noopener" class="text-mates-green hover:underline">Itinéraire</a>
          ${remaining > 0
            ? `<button type="button" onclick="MatesApp.shareMatch('${match.id}', 'whatsapp')" class="text-amber-300 hover:underline">Il manque ${remaining} joueur${remaining > 1 ? "s" : ""} · Inviter</button>`
            : `<span class="text-mates-green">Équipe complète ✅</span>`}
        </span>
      </div>`;

    const info = document.getElementById("chat-info-btn");
    if (info) info.onclick = () => { window.location.hash = `#match/${match.id}`; };

    const quick = document.getElementById("chat-quick");
    if (quick) quick.innerHTML = QUICK_REPLIES.map((q, i) =>
      `<button type="button" class="pill whitespace-nowrap flex-shrink-0" onclick="MatesApp.sendQuickReply(${i})">${escapeHtml(q)}</button>`).join("");

    const form = document.getElementById("chat-form");
    if (form) form.onsubmit = (e) => sendChatMessage(e, match.id);

    renderChatMessages(true);
    markChatRead(match.id);
    if (SB) subscribeRemoteChat(match.id);
    const input = document.getElementById("chat-input");
    if (input && window.matchMedia("(min-width: 768px)").matches) setTimeout(() => input.focus(), 100);
  }

  function closeChat() {
    botTimers.forEach(clearTimeout);
    botTimers = [];
    const typing = document.getElementById("chat-typing");
    if (typing) typing.classList.add("hidden");
    if (chatChannel && SB) SB.removeChannel(chatChannel);
    chatChannel = null;
    state.chatMatchId = null;
  }

  function dayLabel(date) {
    const d = startOfDay(date).getTime();
    const today = startOfDay(new Date()).getTime();
    if (d === today) return "Aujourd'hui";
    if (d === today - 86400000) return "Hier";
    return date.toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" });
  }

  function renderChatMessages(forceScroll) {
    const box = document.getElementById("chat-messages");
    const match = state.chatMatchId && getMatch(state.chatMatchId);
    if (!box || !match) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    const msgs = chatMessages(match);

    let html = "";
    let lastDay = null;
    let prev = null;
    msgs.forEach(m => {
      const at = new Date(m.at);
      const day = startOfDay(at).getTime();
      if (day !== lastDay) {
        html += `<div class="flex justify-center py-2"><span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-mates-off border border-mates-border rounded-full px-3 py-1">${dayLabel(at)}</span></div>`;
        lastDay = day;
        prev = null;
      }
      if (m.system) {
        html += `<div class="flex justify-center py-1"><span class="text-[11px] text-slate-400 bg-mates-cardElevated rounded-full px-3 py-1">${escapeHtml(m.text)}</span></div>`;
        prev = null;
        return;
      }
      const grouped = prev && prev.author === m.author && prev.mine === m.mine && at - new Date(prev.at) < 5 * 60000;
      html += `
        <div class="flex items-end gap-2 ${m.mine ? "flex-row-reverse" : ""} ${grouped ? "" : "pt-2"}">
          ${m.mine ? "" : grouped
            ? `<span class="w-7 flex-shrink-0"></span>`
            : `<${m.mateId ? `a href="#mate/${m.mateId}"` : "span"} class="flex-shrink-0"><img src="${escapeHtml(m.avatar || DEFAULT_AVATAR)}" alt="" class="w-7 h-7 rounded-full object-cover"></${m.mateId ? "a" : "span"}>`}
          <div class="chat-bubble ${m.mine ? "mine" : ""} text-sm">
            ${!m.mine && !grouped ? `<div class="text-[11px] font-bold text-mates-green mb-0.5">${escapeHtml(m.author)}</div>` : ""}
            <span class="text-slate-100 whitespace-pre-wrap">${escapeHtml(m.text)}</span>
            <span class="text-[10px] text-slate-500 ml-2 float-right mt-1.5">${formatHour(at)}</span>
          </div>
        </div>`;
      prev = m;
    });
    if (!msgs.length) {
      html = `<div class="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-400">
        <div class="text-4xl">💬</div>
        <p class="text-sm">Lance la discussion : qui ramène les balles ?</p></div>`;
    }
    box.innerHTML = html;
    if (forceScroll || nearBottom) box.scrollTop = box.scrollHeight;
  }

  async function sendChatMessage(event, matchId, presetText) {
    if (event) event.preventDefault();
    const match = getMatch(matchId || state.chatMatchId);
    const input = document.getElementById("chat-input");
    if (!match) return;
    const text = String(presetText != null ? presetText : (input ? input.value : "")).trim().slice(0, 280);
    if (!text) return;
    if (!requireAuth("Connecte-toi pour écrire aux joueurs.")) return;
    if (!isJoined(match)) {
      showToast("Rejoins d'abord le match pour discuter avec les joueurs.", "info");
      return;
    }
    const me = myPlayerEntry();

    if (SB && state.userProfile && state.userProfile.userId) {
      const row = {
        match_id: match.id,
        user_id: state.userProfile.userId,
        author: cleanText(me.name, 60),
        avatar: cleanAvatar(me.avatar) === DEFAULT_AVATAR ? null : me.avatar,
        body: text
      };
      const { data, error } = await SB.from("match_messages").insert(row).select().single();
      if (error) {
        console.warn("Message non envoyé :", error.message);
        showToast("Message non envoyé, réessaie.", "warning");
        return;
      }
      addRemoteMessage(match.id, data);
    } else {
      addLocalChatMessage(match.id, { author: me.name, avatar: me.avatar, text, mine: true });
      saveMatchState();
      scheduleBotReply(match, text);
    }

    if (input && presetText == null) input.value = "";
    markChatRead(match.id);
    renderChatMessages(true);
    if (input && presetText == null) input.focus();
  }

  function sendQuickReply(index) {
    if (QUICK_REPLIES[index]) sendChatMessage(null, state.chatMatchId, QUICK_REPLIES[index]);
  }

  // ---- Comptes réels : messages Supabase + temps réel
  function rowToMessage(row) {
    const myId = state.userProfile && state.userProfile.userId;
    return {
      id: "r" + row.id,
      author: cleanText(row.author, 60) || "Joueur",
      avatar: cleanAvatar(row.avatar),
      text: String(row.body || "").slice(0, 280),
      at: row.created_at,
      mine: row.user_id === myId,
      mateId: row.user_id === myId ? "my-profile" : "user-" + row.user_id
    };
  }

  function addRemoteMessage(matchId, row) {
    if (!row) return;
    const list = state.remoteChat[matchId] || (state.remoteChat[matchId] = []);
    const msg = rowToMessage(row);
    if (list.some(m => m.id === msg.id)) return;
    list.push(msg);
    if (state.chatMatchId === matchId) {
      renderChatMessages(msg.mine);
      markChatRead(matchId);
    }
  }

  async function subscribeRemoteChat(matchId) {
    const { data, error } = await SB.from("match_messages")
      .select("*").eq("match_id", matchId)
      .order("created_at", { ascending: true }).limit(200);
    if (error) {
      console.warn("Chat indisponible :", error.message);
      return;
    }
    state.remoteChat[matchId] = (data || []).map(rowToMessage);
    if (state.chatMatchId !== matchId) return;
    renderChatMessages(true);
    chatChannel = SB.channel("match-chat-" + matchId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_messages", filter: `match_id=eq.${matchId}` },
        payload => addRemoteMessage(matchId, payload.new))
      .subscribe();
  }

  // ---- Mode démo : un autre joueur répond (pour voir le chat vivre)
  function botAnswer(text) {
    const t = text.toLowerCase();
    if (/retard|⏱/.test(t)) return "Pas de souci, on t'attend 👍";
    if (/balle/.test(t)) return "J'ai un tube neuf dans mon sac, je les prends !";
    if (/arrive|🏃/.test(t)) return "Top, à tout de suite !";
    if (/terrain|📍|suis là/.test(t)) return "J'arrive dans 2 min, je me gare 🚗";
    if (/raquette|prêter/.test(t)) return "Merci, je t'en emprunte peut-être une 🙏";
    if (/bien joué|👏|gg|merci/.test(t)) return "Merci à toi ! On remet ça la semaine prochaine ? 🔥";
    if (/\?\s*$/.test(t)) return "Bonne question, je regarde et je te redis !";
    const generic = ["Ça marche 👌", "Carrément !", "Hâte d'y être 💪", "Noté !", "Parfait, à tout à l'heure"];
    return generic[Math.floor(Math.random() * generic.length)];
  }

  function scheduleBotReply(match, text) {
    const others = match.players.filter(p => p.avatar && !p.me);
    if (!others.length) return;
    botTimers.forEach(clearTimeout);
    const who = others[Math.floor(Math.random() * others.length)];
    const typing = document.getElementById("chat-typing");
    botTimers = [
      setTimeout(() => {
        if (state.chatMatchId !== match.id || !typing) return;
        typing.textContent = `${who.name} est en train d'écrire…`;
        typing.classList.remove("hidden");
      }, 900),
      setTimeout(() => {
        if (typing) typing.classList.add("hidden");
        addLocalChatMessage(match.id, { author: who.name, avatar: who.avatar, mateId: who.mateId, text: botAnswer(text) });
        saveMatchState();
        if (state.chatMatchId === match.id) {
          markChatRead(match.id);
          renderChatMessages();
        }
      }, 2600 + Math.random() * 1400)
    ];
  }

  // ---- Mon espace : liste des discussions
  function renderDashChats() {
    const box = document.getElementById("dash-chats");
    if (!box) return;
    const list = myUpcomingMatches();
    if (!list.length) {
      box.innerHTML = `<p class="text-sm text-slate-400">Rejoins un match pour discuter avec les autres joueurs.</p>`;
      return;
    }
    box.innerHTML = list.map(m => {
      const sport = sportMeta(m.sportId);
      const msgs = chatMessages(m);
      const last = msgs[msgs.length - 1];
      const unread = unreadCount(m);
      return `
        <a href="#chat/${m.id}" class="flex items-center gap-3 p-3 rounded-2xl bg-mates-off border ${unread ? "border-mates-green/50" : "border-slate-800"} hover:border-mates-green/60 transition-all">
          <span class="text-3xl flex-shrink-0">${sport.icon}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-white truncate">${escapeHtml(m.title)}</span>
              <span class="text-[10px] text-slate-500 flex-shrink-0">${last ? formatAgo(last.at) : ""}</span>
            </div>
            <div class="text-xs ${unread ? "text-white font-semibold" : "text-slate-400"} truncate">
              ${last ? `${last.system ? "" : escapeHtml(last.mine ? "Toi" : last.author.split(" ")[0]) + " : "}${escapeHtml(last.text)}` : "Aucun message"}
            </div>
          </div>
          ${unread ? `<span class="min-w-[1.5rem] h-6 px-1.5 rounded-full bg-mates-green text-mates-dark text-xs font-extrabold flex items-center justify-center">${unread}</span>` : ""}
        </a>`;
    }).join("");
  }

  async function shareMatch(matchId, mode) {
    const match = getMatch(matchId);
    if (!match) return;
    const start = new Date(match.startsAt);
    const remaining = remainingSlots(match);
    const url = matchShareUrl(match);
    const text = `${sportMeta(match.sportId).icon} ${match.title} – ${formatMatchDay(start)} à ${formatHour(start)}, ${match.clubName} (${match.city}). ` +
      (remaining > 0 ? `Il manque ${remaining} joueur${remaining > 1 ? "s" : ""} ! ` : "") + `Rejoins-nous sur Mates : ${url}`;

    if (mode === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      const tmp = document.createElement("textarea");
      tmp.value = url;
      tmp.setAttribute("readonly", "");
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      document.body.appendChild(tmp);
      tmp.select();
      try { document.execCommand("copy"); } catch (err) { /* ignore */ }
      tmp.remove();
    }
    showToast("Lien du match copié ! Colle-le dans ton groupe pour trouver le dernier joueur.", "success");
  }

  function openProposeMatchModal(mateId) {
    if (!requireAuth("Connecte-toi pour proposer une partie.")) return;
    const mate = getAllMates().find(m => m.id === mateId);
    if (!mate) return;

    state.pendingProposeMateId = mate.id;
    const modal = document.getElementById("propose-match-modal");
    const title = document.getElementById("propose-modal-title");

    if (title) title.textContent = `Proposer une partie à ${mate.firstName}`;

    // Mettre les sports de ce mate en suggestion
    const sportSelect = document.getElementById("propose-sport-select");
    if (sportSelect) {
      const sportsForMatch = mate.sports.length ? mate.sports : INITIAL_SPORTS.map(sp => ({ id: sp.id, name: sp.name, level: "Tous niveaux" }));
      sportSelect.innerHTML = sportsForMatch.map(s => {
        const meta = sportMeta(s.id);
        return `<option value="${s.id}">${meta.icon} ${s.name} (${s.level})</option>`;
      }).join("");
    }

    if (modal) modal.classList.remove("hidden");
    lucide.createIcons();
  }

  function sendMatchInvitation() {
    const mate = getAllMates().find(m => m.id === state.pendingProposeMateId);
    closeModals();
    showToast(`Demande envoyée à ${mate ? mate.firstName : "ce mate"} ! Tu recevras une notification dès sa réponse.`, "success");
  }

  function openBookingModal(sportId) {
    const sport = sportMeta(sportId);
    const hasMatch = state.matches.some(m => m.sportId === sport.id);
    window.location.hash = "#matches";
    if (!hasMatch) {
      setTimeout(() => showToast(`Pas encore de match de ${sport.name}. Crée le premier !`, "info"), 300);
    }
  }

  function openCreateMatchModal(sportId) {
    if (!requireAuth("Connecte-toi pour organiser un match.")) return;
    populateSportDropdowns();
    populateCityDropdown();
    const form = document.getElementById("create-match-form");
    if (form) form.reset();
    const sportSel = document.getElementById("cm-sport");
    if (sportSel && typeof sportId === "string" && sportId) sportSel.value = sportId;
    const citySel = document.getElementById("cm-city");
    if (citySel && state.userProfile && state.userProfile.city) {
      const c = findCityOption(state.userProfile.city);
      if (c) citySel.value = c;
    }
    const date = document.getElementById("cm-date");
    if (date) {
      const t = addDays(new Date(), 1);
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      date.min = iso(new Date());
      date.value = iso(t);
    }
    const modal = document.getElementById("create-match-modal");
    if (modal) modal.classList.remove("hidden");
    lucide.createIcons();
    const place = document.getElementById("cm-place");
    if (place) setTimeout(() => place.focus(), 50);
  }

  function submitCreateMatch(event) {
    if (event) event.preventDefault();
    if (!requireAuth("Connecte-toi pour organiser un match.")) return;
    const val = id => (document.getElementById(id) || {}).value || "";
    const sport = sportMeta(val("cm-sport"));
    const city = findCityOption(val("cm-city")) || "Liège";
    const place = cleanText(val("cm-place"), 60);
    const missing = Math.min(21, Math.max(1, parseInt(val("cm-missing"), 10) || 1));
    const price = Math.min(100, Math.max(0, parseFloat(val("cm-price")) || 0));
    const [h, m] = (val("cm-time") || "20:00").split(":").map(Number);
    const startsAt = new Date(`${val("cm-date")}T00:00:00`);
    if (!place || isNaN(startsAt.getTime())) {
      showToast("Indique un lieu et une date valides.", "warning");
      return;
    }
    startsAt.setHours(h || 0, m || 0, 0, 0);
    if (startsAt.getTime() < Date.now()) {
      showToast("Choisis une date et une heure à venir.", "warning");
      return;
    }
    const amenities = [...document.querySelectorAll("#cm-amenities input:checked")].map(i => i.value).filter(a => AMENITIES[a]);
    const me = myPlayerEntry();
    const match = {
      id: "match-u-" + Date.now().toString(36),
      sportId: sport.id,
      title: `${sport.name} : ${missing} joueur${missing > 1 ? "s" : ""} recherché${missing > 1 ? "s" : ""}`,
      clubName: place,
      courtName: "",
      city,
      startsAt: startsAt.toISOString(),
      durationMin: 90,
      levelRequired: val("cm-level") || "Tous niveaux",
      price,
      payment: price > 0 ? "Paiement sur place ou via l'app" : "Gratuit",
      courtBooked: !!(document.getElementById("cm-booked") || {}).checked,
      totalSlots: missing + 1,
      outdoor: OUTDOOR_SPORTS.includes(sport.id),
      amenities,
      players: [me],
      mine: true
    };
    state.matchState.created.push(match);
    state.matchState.created = state.matchState.created.slice(-30);
    saveMatchState();
    state.matches = buildMatches();
    closeModals();
    state.matchesWhen = null;
    window.location.hash = `#match/${match.id}`;
    showToast(`Ton match est publié ! Partage-le pour trouver ${missing > 1 ? `tes ${missing} joueurs` : "ton dernier joueur"} plus vite.`, "success");
  }

  function closeModals(silent) {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.add("hidden"));
    const wasOpen = state.openMatchId;
    state.openMatchId = null;
    // Ferme la fiche match -> on revient sur la liste (#matches)
    if (!silent && wasOpen && window.location.hash.startsWith("#match/")) {
      history.replaceState(null, "", "#matches");
      state.currentRoute = "matches";
      setTitle("Matchs ouverts");
    }
  }

  /* ==========================================================================
     MON ESPACE (tableau de bord)
     ========================================================================== */
  function myUpcomingMatches() {
    const now = Date.now();
    return state.matches
      .filter(m => isJoined(m) && new Date(m.startsAt).getTime() + (m.durationMin || 60) * 60000 > now)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }

  function countdownText(date) {
    const diff = new Date(date).getTime() - Date.now();
    if (diff <= 0) return "C'est parti, bon match !";
    const minutes = Math.floor(diff / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days > 0) return `${days} j ${hours} h`;
    if (hours > 0) return `${hours} h ${String(mins).padStart(2, "0")} min`;
    return `${mins} min`;
  }

  function renderDashboard() {
    const p = state.userProfile;
    if (!p) return;
    const avatar = document.getElementById("dash-avatar");
    if (avatar) { avatar.src = p.avatar || DEFAULT_AVATAR; avatar.alt = p.firstName; avatar.classList.toggle("live-halo", isMeLive()); }
    const fn = document.getElementById("dash-firstname");
    if (fn) fn.textContent = p.firstName || "toi";
    syncLiveToggles();

    const upcoming = myUpcomingMatches();
    const next = upcoming[0];

    // Prochain match
    const nextEl = document.getElementById("dash-next-match");
    if (nextEl) {
      if (!next) {
        nextEl.innerHTML = `
          <h2 class="text-2xl text-white flex items-center gap-2 mb-4"><i data-lucide="timer" class="w-5 h-5 text-mates-green"></i>Prochain match</h2>
          <div class="text-center py-8 space-y-3">
            <div class="text-4xl">📅</div>
            <p class="text-sm text-slate-300">Aucun match prévu pour l'instant.</p>
            <div class="flex flex-wrap justify-center gap-2">
              <a href="#matches" class="btn-neon text-sm py-2.5 px-5">Trouver un match</a>
              <button onclick="MatesApp.openCreateMatchModal()" class="btn-outline-neon text-sm py-2.5 px-5">Créer un match</button>
            </div>
          </div>`;
      } else {
        const sport = sportMeta(next.sportId);
        const start = new Date(next.startsAt);
        const links = mapsLinks(next);
        const mates = matchPlayers(next).filter(x => !x.me);
        nextEl.innerHTML = `
          <div class="flex items-center justify-between gap-3 mb-4">
            <h2 class="text-2xl text-white flex items-center gap-2"><i data-lucide="timer" class="w-5 h-5 text-mates-green"></i>Prochain match</h2>
            ${statusBadgeHtml(next)}
          </div>
          <div class="flex items-center gap-4">
            <span class="text-5xl">${sport.icon}</span>
            <div class="min-w-0">
              <div class="text-white font-bold text-lg truncate">${escapeHtml(next.title)}</div>
              <div class="text-sm text-slate-400">${formatMatchDay(start)} à ${formatHour(start)} ${weatherChipHtml(next) ? "· " + weatherChipHtml(next) : ""}</div>
            </div>
          </div>
          <div class="mt-5 p-4 rounded-2xl bg-mates-off border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400">Coup d'envoi dans</div>
              <div id="dash-countdown" class="font-display text-4xl text-mates-green">${countdownText(start)}</div>
            </div>
            <div class="flex flex-col gap-2">
              <a href="#chat/${next.id}" class="btn-neon text-xs py-2 px-4"><i data-lucide="message-circle" class="w-4 h-4"></i><span>Chat${unreadCount(next) ? ` (${unreadCount(next)})` : ""}</span></a>
              <button onclick="MatesApp.openMatchDetail('${next.id}')" class="btn-outline-neon text-xs py-2 px-4">Détails</button>
            </div>
          </div>
          <div class="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="text-sm">
              <div class="text-white font-semibold">${escapeHtml(next.clubName)}</div>
              <div class="flex gap-3 text-xs font-semibold mt-1">
                <a href="${links.google}" target="_blank" rel="noopener" class="text-mates-green hover:underline inline-flex items-center gap-1"><i data-lucide="map" class="w-3.5 h-3.5"></i>Google Maps</a>
                <a href="${links.waze}" target="_blank" rel="noopener" class="text-mates-green hover:underline inline-flex items-center gap-1"><i data-lucide="navigation" class="w-3.5 h-3.5"></i>Waze</a>
              </div>
            </div>
            <div>
              <div class="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Coéquipiers</div>
              <div class="flex items-center gap-2">
                <div class="flex items-center pl-2">${playersAvatarsHtml(next, "w-8 h-8")}</div>
                <span class="text-xs text-slate-300">${mates.length ? escapeHtml(mates.slice(0, 3).map(x => x.name).join(", ")) + (mates.length > 3 ? "…" : "") : "Toi seul pour l'instant"}</span>
              </div>
            </div>
          </div>`;

        if (state.countdownTimer) clearInterval(state.countdownTimer);
        state.countdownTimer = setInterval(() => {
          const el = document.getElementById("dash-countdown");
          if (!el || state.currentRoute !== "dashboard") {
            clearInterval(state.countdownTimer);
            state.countdownTimer = null;
            return;
          }
          el.textContent = countdownText(start);
        }, 30000);
      }
    }

    // Statistiques
    const statsEl = document.getElementById("dash-stats");
    if (statsEl) {
      const now = new Date();
      const joinedThisMonth = state.matches.filter(m => isJoined(m) && new Date(m.startsAt).getMonth() === now.getMonth()).length;
      const monthCount = (p.matchesThisMonth || 0) + joinedThisMonth;
      const favorite = p.sports && p.sports[0] ? `${sportMeta(p.sports[0].id).icon} ${p.sports[0].name}` : "–";
      const winRate = p.winRate != null ? `${p.winRate} %` : "–";
      const hours = Math.round(p.hoursTotal || 0);
      const weekly = Array.isArray(p.weeklyMatches) ? p.weeklyMatches : [0, 0, 0, 0, 0, 0];
      const maxWeek = Math.max(1, ...weekly);
      const stat = (label, value, icon) => `
        <div class="p-3.5 rounded-2xl bg-mates-off border border-slate-800">
          <div class="text-[11px] text-slate-400 flex items-center gap-1"><i data-lucide="${icon}" class="w-3.5 h-3.5 text-mates-green"></i>${label}</div>
          <div class="font-display text-3xl text-white mt-1 truncate">${value}</div>
        </div>`;
      statsEl.innerHTML = stat("Matchs ce mois-ci", monthCount, "calendar") +
        stat("Sport favori", favorite, "heart") +
        stat("Taux de victoire", winRate, "trophy") +
        stat("Heures de sport", `${hours} h`, "clock") +
        `<div class="col-span-2 p-3.5 rounded-2xl bg-mates-off border border-slate-800">
          <div class="text-[11px] text-slate-400 mb-2">Matchs par semaine (6 dernières)</div>
          <div class="flex items-end gap-2 h-16" role="img" aria-label="Matchs par semaine : ${weekly.join(", ")}">
            ${weekly.map((w, i) => `<div class="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div class="w-full rounded-t-md ${i === weekly.length - 1 ? "bg-mates-green" : "bg-slate-600"}" style="height:${Math.max(6, (w / maxWeek) * 100)}%"></div>
              <span class="text-[10px] text-slate-500">${w}</span>
            </div>`).join("")}
          </div>
        </div>`;
    }

    // Matchs à venir
    const upEl = document.getElementById("dash-upcoming");
    if (upEl) {
      upEl.innerHTML = upcoming.length ? upcoming.map(m => {
        const start = new Date(m.startsAt);
        return `
          <button onclick="MatesApp.openMatchDetail('${m.id}')" class="w-full text-left flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-mates-off border border-slate-800 hover:border-mates-green/60">
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-2xl">${sportMeta(m.sportId).icon}</span>
              <div class="min-w-0">
                <div class="text-sm font-bold text-white truncate">${escapeHtml(m.title)}</div>
                <div class="text-xs text-slate-400 truncate">${formatMatchDay(start)} · ${formatHour(start)} · ${escapeHtml(m.clubName)}</div>
              </div>
            </div>
            <span class="text-xs font-semibold ${m.mine ? "text-mates-green" : "text-slate-300"} whitespace-nowrap">${m.mine ? "Organisateur" : "Inscrit"}</span>
          </button>`;
      }).join("") : `<p class="text-sm text-slate-400">Rejoins un match ou crée le tien : il apparaîtra ici.</p>`;
    }

    const progressEl = document.getElementById("dash-progress");
    if (progressEl) progressEl.innerHTML = progressHtml(p);
    const badgesEl = document.getElementById("dash-badges");
    if (badgesEl) badgesEl.innerHTML = badgesHtml(p);

    lucide.createIcons();
    loadWeather();
  }

  /**
   * Système de notifications Toast fluides
   */
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast-msg";

    let iconName = "info";
    if (type === "success") iconName = "check-circle";
    if (type === "warning") iconName = "alert-circle";

    toast.innerHTML = `
      <i data-lucide="${iconName}" class="w-5 h-5 text-mates-green flex-shrink-0"></i>
      <span class="text-xs font-semibold text-white">${message}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons({ root: toast });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.3s ease-out";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // API publique
  return {
    init,
    resetFilters,
    filterMatesForSport,
    saveProfile,
    viewMyPublicProfile,
    logout,
    toggleAuthMode,
    handleOAuth,
    handleGoogleAuth: () => handleOAuth("google"),
    showAuthPanel,
    pickAvatar,
    onAvatarFile,
    onboardingNext,
    onboardingBack,
    toggleObSport,
    setObLevel,
    presetAvailability,
    addBioTag,
    renderOnboardingPreview,
    handleAuthSubmit,
    handleForgotPassword,
    locateGps,
    triggerAvatarChange,
    addSportToProfile,
    removeSportFromProfile,
    updateSportLevel,
    toggleEditSlot,
    openJoinModal,
    openMatchDetail,
    joinMatch,
    leaveMatch,
    sendChatMessage,
    sendQuickReply,
    shareMatch,
    setMatchesWhen,
    openProposeMatchModal,
    sendMatchInvitation,
    openBookingModal,
    openCreateMatchModal,
    submitCreateMatch,
    closeModals,
    setMatesWhen,
    heroSearch,
    welcomeSearch,
    toggleLevelHelp,
    createSearchAlert,
    toggleLiveTonight,
    showToast
  };
})();

// Démarrage au chargement du DOM
document.addEventListener("DOMContentLoaded", () => {
  MatesApp.init();
});
