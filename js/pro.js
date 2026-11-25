/**
 * MATES. — Clubs, réservation de terrains et administration
 *
 *  #clubs            liste des clubs partenaires
 *  #club/<id>        fiche d'un club + réservation d'un créneau
 *  #devenir-club     demande d'inscription d'un club (validée par un admin)
 *  #mon-club/<onglet> espace du club : planning, terrains & tarifs, réservations, fiche
 *  #mes-reservations réservations du joueur connecté
 *  #admin/<onglet>   administration : utilisateurs, clubs, matchs, réservations, sports
 *
 * Utilise la base Supabase (voir supabase/schema.sql, sections 6 à 12).
 */
const MatesPro = (() => {
  const C = () => MatesApp.core;
  const esc = v => C().escapeHtml(v == null ? "" : v);
  const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // affichage lundi -> dimanche
  const STATUS_LABEL = {
    pending: { text: "En attente de validation", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    approved: { text: "Validé", cls: "bg-mates-green/15 text-mates-green border-mates-green/30" },
    rejected: { text: "Refusé", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
    suspended: { text: "Suspendu", cls: "bg-slate-500/20 text-slate-300 border-slate-500/30" }
  };

  // État propre à ces pages
  const ui = {
    clubCache: {},        // id -> club (+ courts)
    selectedDate: null,   // jour affiché (Date à 00:00)
    selectedSport: null,  // filtre sport sur la fiche club
    myClub: null,         // club géré par l'utilisateur
    adminUsers: null,     // cache de la liste des comptes
    adminFilter: "pending"
  };

  /* ==========================================================================
     OUTILS
     ========================================================================== */
  function root() {
    return document.getElementById("pro-root");
  }

  function show(title, html) {
    C().setTitle(title);
    C().showView("view-pro");
    const r = root();
    if (r) r.innerHTML = html;
    refreshIcons();
  }

  function refreshIcons() {
    if (window.lucide) lucide.createIcons();
  }

  function loading(title) {
    show(title, `<div class="py-24 flex flex-col items-center gap-3 text-slate-400">
      <div class="w-8 h-8 border-2 border-mates-green border-t-transparent rounded-full animate-spin"></div>
      <span class="text-sm">Chargement…</span></div>`);
  }

  function needDatabase(title) {
    show(title, `<div class="max-w-xl mx-auto text-center py-20 space-y-3">
      <div class="text-5xl">🔌</div>
      <h1 class="text-3xl text-white">Bientôt disponible</h1>
      <p class="text-slate-400 text-sm">Cette page a besoin des comptes en ligne (Supabase). Elle n'est pas disponible en mode démo.</p>
      <a href="#home" class="btn-neon inline-flex">Retour à l'accueil</a></div>`);
  }

  function me() {
    const s = C().state;
    return s.isAuthenticated && s.userProfile && s.userProfile.userId ? s.userProfile : null;
  }

  function isAdmin() {
    const p = me();
    return !!(p && p.role === "admin");
  }

  function money(n) {
    const v = Number(n) || 0;
    return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")) + " €";
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function hhmm(d) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function dayLong(d) {
    return d.toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" });
  }

  function fmtDateTime(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" })} · ${hhmm(d)}`;
  }

  function errText(error, fallback) {
    const m = String((error && error.message) || "");
    console.warn(fallback, m);
    if (m.includes("court_bookings_no_overlap")) return "Ce créneau vient d'être réservé par quelqu'un d'autre.";
    if (m.includes("passé")) return "Ce créneau est déjà passé.";
    if (m.includes("réservable")) return "Ce terrain n'est pas réservable pour le moment.";
    if (m.includes("row-level security") || m.includes("permission")) return "Tu n'as pas le droit de faire ça.";
    if (m.includes("fetch") || m.includes("network")) return "Serveur injoignable. Vérifie ta connexion.";
    return fallback;
  }

  function sportsOptions(selected) {
    return INITIAL_SPORTS.map(s => `<option value="${esc(s.id)}" ${s.id === selected ? "selected" : ""}>${esc(s.icon)} ${esc(s.name)}</option>`).join("");
  }

  function statusBadge(status) {
    const s = STATUS_LABEL[status] || STATUS_LABEL.pending;
    return `<span class="inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold ${s.cls}">${s.text}</span>`;
  }

  function inputCls() {
    return "w-full bg-mates-cardElevated border border-mates-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-mates-green";
  }

  function label(text, forId) {
    return `<label ${forId ? `for="${forId}"` : ""} class="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">${text}</label>`;
  }

  // Petite fenêtre de confirmation (évite confirm() / prompt() du navigateur)
  function dialog({ title, html = "", confirmText = "Confirmer", danger = false, input = null }) {
    return new Promise(resolve => {
      const wrap = document.createElement("div");
      wrap.className = "fixed inset-0 z-[60] modal-overlay flex items-end sm:items-center justify-center sm:p-4";
      wrap.innerHTML = `
        <div class="bg-mates-card border border-mates-border w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl" role="dialog" aria-modal="true">
          <h3 class="text-xl font-bold text-white">${title}</h3>
          ${html ? `<div class="text-sm text-slate-300 space-y-2">${html}</div>` : ""}
          ${input ? `<div>${label(input.label, "pro-dialog-input")}
            <input id="pro-dialog-input" maxlength="${input.max || 200}" class="${inputCls()}" placeholder="${esc(input.placeholder || "")}" value="${esc(input.value || "")}"></div>` : ""}
          <div class="flex gap-2 pt-2">
            <button type="button" data-act="cancel" class="flex-1 btn-outline-neon py-2.5 text-sm">Annuler</button>
            <button type="button" data-act="ok" class="flex-1 py-2.5 text-sm rounded-xl font-bold ${danger ? "bg-rose-500 hover:bg-rose-400 text-white" : "btn-neon"}">${confirmText}</button>
          </div>
        </div>`;
      const done = value => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(value); };
      const onKey = e => { if (e.key === "Escape") done(null); };
      wrap.addEventListener("click", e => {
        if (e.target === wrap) return done(null);
        const act = e.target.closest("[data-act]");
        if (!act) return;
        if (act.dataset.act === "cancel") return done(null);
        const field = wrap.querySelector("#pro-dialog-input");
        done(field ? field.value.trim() : true);
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(wrap);
      const field = wrap.querySelector("#pro-dialog-input");
      if (field) setTimeout(() => field.focus(), 50);
    });
  }

  /* ==========================================================================
     CRÉNEAUX : horaires d'ouverture -> créneaux d'un jour
     ========================================================================== */
  function openingFor(court, day) {
    const o = court.opening || {};
    const v = o[String(day.getDay())];
    return Array.isArray(v) && v.length === 2 && v[1] > v[0] ? v : null;
  }

  function slotsFor(court, day) {
    const hours = openingFor(court, day);
    if (!hours) return [];
    const step = court.slot_minutes || 60;
    const out = [];
    const base = startOfDay(day);
    for (let m = hours[0] * 60; m + step <= hours[1] * 60; m += step) {
      const start = new Date(base.getTime() + m * 60000);
      out.push({ start, end: new Date(start.getTime() + step * 60000) });
    }
    return out;
  }

  function overlapping(list, courtId, start, end) {
    return list.find(b => b.court_id === courtId && new Date(b.starts_at) < end && new Date(b.ends_at) > start);
  }

  function dateChips(selected, handler) {
    const today = startOfDay(new Date());
    let html = "";
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      const on = d.getTime() === selected.getTime();
      const top = i === 0 ? "Auj." : i === 1 ? "Dem." : DAY_NAMES[d.getDay()].slice(0, 3) + ".";
      html += `<button type="button" onclick="MatesPro.${handler}('${isoDate(d)}')" aria-pressed="${on}"
        class="flex-shrink-0 w-16 py-2.5 rounded-2xl border text-center transition-all ${on ? "bg-mates-green text-mates-dark border-mates-green" : "bg-mates-card border-mates-border text-slate-300 hover:border-slate-500"}">
        <div class="text-[11px] font-bold uppercase">${top}</div>
        <div class="text-lg font-extrabold leading-tight">${d.getDate()}</div>
        <div class="text-[10px] opacity-80">${d.toLocaleDateString("fr-BE", { month: "short" })}</div>
      </button>`;
    }
    return `<div class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">${html}</div>`;
  }

  function parseDay(iso) {
    const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
    return isNaN(d.getTime()) ? startOfDay(new Date()) : startOfDay(d);
  }

  /* ==========================================================================
     DONNÉES
     ========================================================================== */
  async function fetchClub(id) {
    const { data, error } = await C().SB.from("clubs")
      .select("*, courts(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) console.warn("Club indisponible :", error.message);
    if (data) {
      data.courts = (data.courts || []).sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
      ui.clubCache[id] = data;
    }
    return data;
  }

  async function fetchMyClub() {
    const p = me();
    if (!p) return null;
    const { data, error } = await C().SB.from("clubs")
      .select("*, courts(*)")
      .eq("owner_id", p.userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) console.warn("Mon club indisponible :", error.message);
    const club = data && data[0] ? data[0] : null;
    if (club) club.courts = (club.courts || []).sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
    ui.myClub = club;
    return club;
  }

  /* ==========================================================================
     ROUTEUR
     ========================================================================== */
  function route(view, param) {
    const known = ["clubs", "club", "devenir-club", "mon-club", "mes-reservations", "admin"];
    if (!known.includes(view)) return false;
    if (!C().SB) {
      needDatabase("Clubs");
      return true;
    }
    if (view === "clubs") renderClubsList(param);
    if (view === "club") renderClubPage(param);
    if (view === "devenir-club") renderClubRequest();
    if (view === "mon-club") renderMyClub(param || "planning");
    if (view === "mes-reservations") renderMyBookings();
    if (view === "admin") renderAdmin(param || "apercu");
    return true;
  }

  /* ==========================================================================
     1. LISTE DES CLUBS (#clubs/<ville>)
     ========================================================================== */
  async function renderClubsList(cityParam) {
    loading("Clubs partenaires");
    const { data, error } = await C().SB.from("clubs")
      .select("id, name, city, address, description, photo, sports, amenities, courts(price_per_hour, sport_id, active)")
      .eq("status", "approved")
      .order("name");
    if (error) console.warn(error.message);
    const clubs = data || [];
    const city = cityParam ? decodeURIComponent(cityParam) : "";
    const cities = [...new Set(clubs.map(c => c.city))].sort((a, b) => a.localeCompare(b, "fr"));
    const list = city ? clubs.filter(c => c.city === city) : clubs;

    show("Clubs partenaires", `
      <div class="space-y-8">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-mates-border pb-6">
          <div>
            <div class="text-xs font-bold text-mates-green uppercase tracking-widest mb-1">Réserve ton terrain</div>
            <h1 class="text-4xl sm:text-5xl text-white">Clubs <span class="hl-e">partenaires</span></h1>
            <p class="text-slate-400 mt-2 text-sm">Créneaux libres en temps réel, prix affiché, paiement sur place.</p>
          </div>
          <a href="#devenir-club" class="btn-outline-neon text-sm whitespace-nowrap"><i data-lucide="building-2" class="w-4 h-4"></i><span>Inscrire mon club</span></a>
        </div>
        ${cities.length > 1 ? `<div class="flex flex-wrap gap-2">
          <a href="#clubs" class="pill ${!city ? "active" : ""}">Toutes les villes</a>
          ${cities.map(c => `<a href="#clubs/${encodeURIComponent(c)}" class="pill ${c === city ? "active" : ""}">${esc(c)}</a>`).join("")}
        </div>` : ""}
        ${list.length ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${list.map(clubCard).join("")}</div>`
          : `<div class="text-center py-16 bg-mates-card border border-dashed border-mates-border rounded-3xl space-y-3">
              <div class="text-4xl">🏟️</div>
              <p class="text-slate-300">Aucun club partenaire ${city ? `à ${esc(city)} ` : ""}pour l'instant.</p>
              <a href="#devenir-club" class="btn-neon inline-flex text-sm">Tu gères un club ? Inscris-le</a>
            </div>`}
      </div>`);
  }

  function clubCard(club, sportId) {
    const courts = (club.courts || []).filter(c => c.active !== false && (!sportId || c.sport_id === sportId));
    const prices = courts.map(c => Number(c.price_per_hour)).filter(p => p > 0);
    const from = prices.length ? Math.min(...prices) : null;
    const sports = (club.sports || []).map(id => INITIAL_SPORTS.find(s => s.id === id)).filter(Boolean);
    return `
      <a href="#club/${club.id}${sportId ? "/" + sportId : ""}" class="group bg-mates-card border border-mates-border hover:border-mates-green/60 rounded-3xl overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-xl">
        <div class="h-32 bg-gradient-to-br from-mates-cardElevated to-mates-dark relative">
          ${club.photo ? `<img src="${esc(club.photo)}" alt="" loading="lazy" class="w-full h-full object-cover">` : `<div class="absolute inset-0 flex items-center justify-center text-5xl opacity-80">${sports[0] ? esc(sports[0].icon) : "🏟️"}</div>`}
        </div>
        <div class="p-5 flex-1 flex flex-col gap-2">
          <div class="text-[11px] font-bold text-mates-green uppercase tracking-wider flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i>${esc(club.city)}</div>
          <h3 class="text-lg font-bold text-white group-hover:text-mates-green transition-colors">${esc(club.name)}</h3>
          <p class="text-xs text-slate-400 line-clamp-2">${esc(club.description || club.address || "")}</p>
          <div class="flex flex-wrap gap-1 mt-1">${sports.slice(0, 5).map(s => `<span class="text-lg" title="${esc(s.name)}">${esc(s.icon)}</span>`).join("")}</div>
          <div class="mt-auto pt-3 flex items-center justify-between text-xs">
            <span class="text-slate-300 font-bold">${from != null ? `À partir de ${money(from)} / h` : `${courts.length} terrain${courts.length > 1 ? "s" : ""}`}</span>
            <span class="text-mates-green font-bold">Voir les créneaux →</span>
          </div>
        </div>
      </a>`;
  }

  // Bloc « Terrains & clubs partenaires » de la page d'un sport
  async function renderSportClubs(sport, container) {
    container.innerHTML = `<div class="col-span-full text-sm text-slate-500">Chargement des clubs…</div>`;
    const { data, error } = await C().SB.from("clubs")
      .select("id, name, city, address, description, photo, sports, courts(price_per_hour, sport_id, active)")
      .eq("status", "approved")
      .contains("sports", [sport.id])
      .limit(9);
    if (error) console.warn(error.message);
    const clubs = data || [];
    container.innerHTML = clubs.map(c => clubCard(c, sport.id)).join("") + `
      <a href="#devenir-club" class="bg-mates-card border border-dashed border-mates-border hover:border-mates-green/60 rounded-3xl p-6 flex flex-col justify-center items-center text-center gap-2 transition-all">
        <i data-lucide="building-2" class="w-8 h-8 text-mates-green"></i>
        <div class="font-bold text-white">${clubs.length ? "Ton club n'est pas listé ?" : `Pas encore de club de ${esc(sport.name)} sur Mates`}</div>
        <div class="text-xs text-slate-400">Inscris ton club : tes terrains, tes horaires et tes tarifs, réservables en ligne.</div>
        <span class="btn-neon text-xs py-2 px-4 mt-2">Inscrire mon club</span>
      </a>`;
    refreshIcons();
  }

  /* ==========================================================================
     2. FICHE CLUB + RÉSERVATION (#club/<id>/<sport>)
     ========================================================================== */
  async function renderClubPage(id) {
    if (!id) { location.hash = "#clubs"; return; }
    loading("Club");
    const parts = location.hash.split("/");
    if (parts[2]) ui.selectedSport = decodeURIComponent(parts[2]);
    const club = await fetchClub(id);
    if (!club) {
      show("Club introuvable", `<div class="text-center py-20 space-y-3"><div class="text-4xl">🔎</div>
        <p class="text-slate-300">Ce club n'existe pas ou n'est pas encore validé.</p>
        <a href="#clubs" class="btn-neon inline-flex text-sm">Voir les clubs</a></div>`);
      return;
    }
    if (!ui.selectedDate || ui.selectedDate < startOfDay(new Date())) ui.selectedDate = startOfDay(new Date());
    await drawClubPage(club);
  }

  async function drawClubPage(club) {
    const courts = (club.courts || []).filter(c => c.active !== false);
    const sportIds = [...new Set(courts.map(c => c.sport_id))];
    if (!sportIds.includes(ui.selectedSport)) ui.selectedSport = sportIds[0] || null;
    const shown = courts.filter(c => c.sport_id === ui.selectedSport);
    const day = ui.selectedDate;
    const { data: busy, error } = await C().SB.rpc("club_busy_slots", {
      p_club: club.id, p_from: day.toISOString(), p_to: addDays(day, 1).toISOString()
    });
    if (error) console.warn(error.message);
    const busyList = busy || [];
    const now = new Date();
    const amenities = (club.amenities || []).map(a => AMENITIES[a]).filter(Boolean);
    const pending = club.status !== "approved";

    const courtsHtml = shown.map(court => {
      const slots = slotsFor(court, day).filter(s => s.end > now);
      const hours = openingFor(court, day);
      const sport = C().sportMeta(court.sport_id);
      return `
        <div class="bg-mates-card border border-mates-border rounded-3xl p-5 space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="text-3xl">${esc(sport.icon)}</span>
              <div>
                <div class="font-bold text-white">${esc(court.name)}</div>
                <div class="text-xs text-slate-400">${court.indoor ? "Intérieur" : "Extérieur"} · créneaux de ${court.slot_minutes} min</div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-lg font-extrabold text-mates-green">${money(court.price_per_hour)}<span class="text-xs text-slate-400 font-semibold"> / h</span></div>
              <div class="text-[11px] text-slate-500">${hours ? `Ouvert ${hours[0]}h – ${hours[1]}h` : "Fermé ce jour"}</div>
            </div>
          </div>
          ${slots.length ? `<div class="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
            ${slots.map(s => {
              const taken = overlapping(busyList, court.id, s.start, s.end);
              return taken
                ? `<span class="py-2 rounded-xl text-center text-xs font-bold bg-mates-off text-slate-600 line-through border border-slate-800" title="Déjà réservé">${hhmm(s.start)}</span>`
                : `<button type="button" ${pending ? "disabled" : ""} onclick="MatesPro.bookSlot('${court.id}', '${s.start.toISOString()}')"
                    class="py-2 rounded-xl text-center text-xs font-bold border border-mates-green/50 text-mates-green hover:bg-mates-green hover:text-mates-dark transition-all disabled:opacity-40">${hhmm(s.start)}</button>`;
            }).join("")}
          </div>` : `<p class="text-sm text-slate-500">${hours ? "Plus de créneau disponible ce jour." : "Le terrain est fermé ce jour-là."}</p>`}
        </div>`;
    }).join("");

    show(club.name, `
      <div class="space-y-8">
        <a href="#clubs" class="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white"><i data-lucide="arrow-left" class="w-4 h-4"></i>Tous les clubs</a>
        ${pending ? `<div class="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">Aperçu : ce club n'est pas encore validé, les joueurs ne le voient pas et ne peuvent pas réserver.</div>` : ""}
        <div class="bg-gradient-to-r from-mates-card via-mates-cardElevated to-mates-dark border border-mates-border rounded-3xl p-6 sm:p-8 grid md:grid-cols-3 gap-6">
          <div class="md:col-span-2 space-y-3">
            <div class="text-xs font-bold text-mates-green uppercase tracking-widest">Club partenaire · ${esc(club.city)}</div>
            <h1 class="text-4xl sm:text-5xl text-white">${esc(club.name)}</h1>
            ${club.description ? `<p class="text-slate-300 text-sm leading-relaxed">${esc(club.description)}</p>` : ""}
            <div class="flex flex-wrap gap-2 pt-1">${amenities.map(a => `<span class="trust-chip"><i data-lucide="${a.icon}" class="w-3.5 h-3.5 text-mates-green"></i>${a.label}</span>`).join("")}</div>
          </div>
          <div class="space-y-3 text-sm">
            ${club.address ? `<div class="flex gap-2 text-slate-300"><i data-lucide="map-pin" class="w-4 h-4 text-mates-green flex-shrink-0 mt-0.5"></i><span>${esc(club.address)}, ${esc(club.city)}</span></div>
              <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(club.name + " " + club.address + " " + club.city)}" class="text-mates-green font-semibold hover:underline inline-flex items-center gap-1"><i data-lucide="navigation" class="w-4 h-4"></i>Itinéraire</a>` : ""}
            ${club.phone ? `<div class="flex gap-2 text-slate-300"><i data-lucide="phone" class="w-4 h-4 text-mates-green"></i><a href="tel:${esc(club.phone.replace(/[^\d+]/g, ""))}" class="hover:text-white">${esc(club.phone)}</a></div>` : ""}
            <div class="text-xs text-slate-500">Paiement sur place, au club.</div>
          </div>
        </div>

        <div class="space-y-4">
          <h2 class="text-3xl text-white">Réserver un <span class="hl-e">terrain</span></h2>
          ${sportIds.length > 1 ? `<div class="flex flex-wrap gap-2">${sportIds.map(id => {
            const sp = C().sportMeta(id);
            return `<button type="button" onclick="MatesPro.pickClubSport('${esc(id)}')" class="pill ${id === ui.selectedSport ? "active" : ""}">${esc(sp.icon)} ${esc(sp.name)}</button>`;
          }).join("")}</div>` : ""}
          ${dateChips(day, "pickClubDay")}
          <div class="text-sm text-slate-400 capitalize">${dayLong(day)}</div>
          ${courts.length ? `<div class="space-y-4">${courtsHtml}</div>`
            : `<p class="text-slate-400 text-sm">Ce club n'a pas encore ajouté ses terrains.</p>`}
        </div>
      </div>`);
    ui.currentClub = club;
  }

  function pickClubDay(iso) {
    ui.selectedDate = parseDay(iso);
    if (ui.currentClub) drawClubPage(ui.currentClub);
  }

  function pickClubSport(id) {
    ui.selectedSport = id;
    if (ui.currentClub) drawClubPage(ui.currentClub);
  }

  async function bookSlot(courtId, startIso) {
    if (!C().requireAuth("Connecte-toi pour réserver un terrain.")) return;
    const club = ui.currentClub;
    const court = club && club.courts.find(c => c.id === courtId);
    if (!court) return;
    const start = new Date(startIso);
    const end = new Date(start.getTime() + court.slot_minutes * 60000);
    const price = Number(court.price_per_hour) * court.slot_minutes / 60;
    const sport = C().sportMeta(court.sport_id);
    const ok = await dialog({
      title: "Confirmer la réservation",
      html: `<div class="p-4 rounded-2xl bg-mates-off border border-slate-800 space-y-1.5">
          <div class="font-bold text-white">${esc(sport.icon)} ${esc(court.name)} · ${esc(club.name)}</div>
          <div class="capitalize">${dayLong(start)}</div>
          <div>${hhmm(start)} – ${hhmm(end)} (${court.slot_minutes} min)</div>
          <div class="text-mates-green font-extrabold text-lg pt-1">${money(price)} <span class="text-xs text-slate-400 font-semibold">à payer sur place</span></div>
        </div>
        <p class="text-xs text-slate-500">Tu pourras annuler depuis « Mes réservations ».</p>`,
      confirmText: "Réserver"
    });
    if (!ok) return;
    const { error } = await C().SB.from("court_bookings").insert({
      court_id: court.id, starts_at: start.toISOString(), ends_at: end.toISOString(),
      kind: "booking", user_id: me().userId
    });
    if (error) {
      C().showToast(errText(error, "Réservation impossible, réessaie."), "warning");
      return drawClubPage(club);
    }
    await drawClubPage(club);
    const again = await dialog({
      title: "Terrain réservé ! 🎉",
      html: `<p>${esc(court.name)}, ${dayLong(start)} à ${hhmm(start)}.</p>
        <p>Il te manque des joueurs ? Publie un <strong>match ouvert</strong> sur ce créneau : les mates de ton niveau pourront te rejoindre.</p>`,
      confirmText: "Créer un match ouvert"
    });
    if (again) {
      C().openCreateMatchModal(court.sport_id, {
        clubId: club.id, courtName: court.name, place: club.name, city: C().findCityOption(club.city) || club.city,
        date: isoDate(start), time: hhmm(start), booked: true, durationMin: court.slot_minutes
      });
    }
  }

  /* ==========================================================================
     3. MES RÉSERVATIONS (joueur)
     ========================================================================== */
  async function fetchMyBookings() {
    const p = me();
    if (!p) return [];
    const { data, error } = await C().SB.from("court_bookings")
      .select("id, starts_at, ends_at, price, status, courts(name, sport_id, clubs(id, name, city))")
      .eq("user_id", p.userId).eq("kind", "booking").eq("status", "confirmed")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at");
    if (error) console.warn(error.message);
    return data || [];
  }

  function bookingRow(b, actions) {
    const court = b.courts || {};
    const club = court.clubs || {};
    const sport = C().sportMeta(court.sport_id);
    return `
      <div class="flex items-center gap-3 p-3 rounded-2xl bg-mates-off border border-slate-800">
        <span class="text-2xl">${esc(sport.icon)}</span>
        <div class="min-w-0 flex-1">
          <a href="#club/${esc(club.id || "")}" class="font-bold text-white hover:text-mates-green truncate block">${esc(club.name || "Club")} · ${esc(court.name || "")}</a>
          <div class="text-xs text-slate-400">${fmtDateTime(b.starts_at)} – ${hhmm(new Date(b.ends_at))} · ${money(b.price)}</div>
        </div>
        ${actions}
      </div>`;
  }

  async function renderMyBookings() {
    if (!C().requireAuth("Connecte-toi pour voir tes réservations.")) return;
    loading("Mes réservations");
    const list = await fetchMyBookings();
    show("Mes réservations", `
      <div class="max-w-3xl mx-auto space-y-6">
        <h1 class="text-4xl text-white">Mes <span class="hl-e">réservations</span></h1>
        ${list.length ? `<div class="space-y-2">${list.map(b => bookingRow(b,
          `<button type="button" onclick="MatesPro.cancelMyBooking('${b.id}')" class="text-xs font-semibold text-rose-300 hover:text-rose-200 px-3 py-2">Annuler</button>`)).join("")}</div>`
          : `<div class="text-center py-12 bg-mates-card border border-dashed border-mates-border rounded-3xl space-y-3">
              <p class="text-slate-300">Aucune réservation à venir.</p><a href="#clubs" class="btn-neon inline-flex text-sm">Réserver un terrain</a></div>`}
      </div>`);
  }

  async function cancelMyBooking(id) {
    const ok = await dialog({ title: "Annuler cette réservation ?", html: "<p>Le créneau redeviendra libre pour les autres joueurs.</p>", confirmText: "Oui, annuler", danger: true });
    if (!ok) return;
    const { error } = await C().SB.from("court_bookings").update({ status: "cancelled" }).eq("id", id);
    if (error) return C().showToast(errText(error, "Annulation impossible, réessaie."), "warning");
    C().showToast("Réservation annulée.", "info");
    if (C().state.currentRoute === "dashboard") renderDashboardExtras();
    else renderMyBookings();
  }

  /* ==========================================================================
     4. DEMANDE D'INSCRIPTION D'UN CLUB (#devenir-club)
     ========================================================================== */
  function clubFormHtml(club = {}) {
    const cities = C().getCityOptions();
    const sports = club.sports || [];
    const amenities = club.amenities || [];
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2">${label("Nom du club *", "cf-name")}<input id="cf-name" required maxlength="80" class="${inputCls()}" value="${esc(club.name || "")}" placeholder="Padel Club Liège"></div>
        <div>${label("Ville *", "cf-city")}<input id="cf-city" required maxlength="60" list="cf-city-list" class="${inputCls()}" value="${esc(club.city || "")}" placeholder="Liège">
          <datalist id="cf-city-list">${cities.map(c => `<option value="${esc(c)}"></option>`).join("")}</datalist></div>
        <div>${label("Téléphone", "cf-phone")}<input id="cf-phone" maxlength="30" inputmode="tel" class="${inputCls()}" value="${esc(club.phone || "")}" placeholder="04 123 45 67"></div>
        <div class="sm:col-span-2">${label("Adresse *", "cf-address")}<input id="cf-address" required maxlength="160" class="${inputCls()}" value="${esc(club.address || "")}" placeholder="Rue du Sport 12, 4000"></div>
        <div class="sm:col-span-2">${label("Présentation", "cf-desc")}<textarea id="cf-desc" rows="3" maxlength="600" class="${inputCls()}" placeholder="Nos terrains, l'ambiance, le club-house…">${esc(club.description || "")}</textarea></div>
        <div class="sm:col-span-2">${label("Photo du club (lien https, optionnel)", "cf-photo")}<input id="cf-photo" type="url" maxlength="400" class="${inputCls()}" value="${esc(club.photo || "")}" placeholder="https://…"></div>
      </div>
      <div>
        ${label("Sports proposés *")}
        <div id="cf-sports" class="flex flex-wrap gap-2">${INITIAL_SPORTS.map(s => `
          <label class="cursor-pointer"><input type="checkbox" value="${esc(s.id)}" class="peer sr-only" ${sports.includes(s.id) ? "checked" : ""}>
            <span class="pill peer-checked:bg-mates-green peer-checked:text-mates-dark peer-checked:border-mates-green">${esc(s.icon)} ${esc(s.name)}</span></label>`).join("")}</div>
      </div>
      <div>
        ${label("Sur place")}
        <div id="cf-amenities" class="flex flex-wrap gap-2">${Object.keys(AMENITIES).map(k => `
          <label class="cursor-pointer"><input type="checkbox" value="${k}" class="peer sr-only" ${amenities.includes(k) ? "checked" : ""}>
            <span class="pill peer-checked:bg-mates-green peer-checked:text-mates-dark peer-checked:border-mates-green">${AMENITIES[k].label}</span></label>`).join("")}</div>
      </div>`;
  }

  function readClubForm() {
    const v = id => (document.getElementById(id) || {}).value || "";
    const clean = C().cleanText;
    const photo = v("cf-photo").trim();
    return {
      name: clean(v("cf-name"), 80),
      city: clean(C().findCityOption(v("cf-city")) || v("cf-city"), 60),
      phone: clean(v("cf-phone"), 30),
      address: clean(v("cf-address"), 160),
      description: clean(v("cf-desc"), 600),
      photo: /^https:\/\/[^\s"'<>`]+$/.test(photo) ? photo : null,
      sports: [...document.querySelectorAll("#cf-sports input:checked")].map(i => i.value),
      amenities: [...document.querySelectorAll("#cf-amenities input:checked")].map(i => i.value)
    };
  }

  function validClub(c) {
    if (c.name.length < 2) return "Indique le nom du club.";
    if (c.city.length < 2) return "Indique la ville du club.";
    if (c.address.length < 3) return "Indique l'adresse du club.";
    if (!c.sports.length) return "Choisis au moins un sport.";
    return null;
  }

  async function renderClubRequest() {
    if (!C().requireAuth("Connecte-toi (ou crée ton compte) pour inscrire ton club.")) return;
    loading("Inscrire mon club");
    const existing = await fetchMyClub();
    if (existing) { location.hash = "#mon-club"; return; }
    show("Inscrire mon club", `
      <div class="max-w-3xl mx-auto space-y-6">
        <div>
          <div class="text-xs font-bold text-mates-green uppercase tracking-widest mb-1">Espace clubs</div>
          <h1 class="text-4xl sm:text-5xl text-white">Inscris ton <span class="hl-e">club</span></h1>
          <p class="text-slate-400 text-sm mt-2">Ajoute tes terrains, tes horaires et tes tarifs : les joueurs réservent tes créneaux libres en ligne et paient sur place.
            Ta demande est vérifiée par l'équipe Mates avant d'être visible.</p>
        </div>
        <div class="grid sm:grid-cols-3 gap-3 text-sm">
          ${[["clipboard-list", "1. Ta demande", "Les infos de ton club."], ["shield-check", "2. Validation", "L'équipe Mates vérifie (24-48 h)."], ["calendar-check", "3. En ligne", "Tes créneaux sont réservables."]]
            .map(([i, t, d]) => `<div class="p-4 rounded-2xl bg-mates-card border border-mates-border"><i data-lucide="${i}" class="w-5 h-5 text-mates-green mb-2"></i><div class="font-bold text-white">${t}</div><div class="text-xs text-slate-400">${d}</div></div>`).join("")}
        </div>
        <form onsubmit="MatesPro.submitClubRequest(event)" class="bg-mates-card border border-mates-border rounded-3xl p-6 sm:p-8 space-y-6">
          ${clubFormHtml()}
          <p class="text-xs text-slate-500">En envoyant, tu confirmes gérer ce club ou être autorisé·e à le représenter.</p>
          <button type="submit" id="cf-submit" class="w-full btn-neon py-3"><span>Envoyer ma demande</span><i data-lucide="send" class="w-4 h-4"></i></button>
        </form>
      </div>`);
  }

  async function submitClubRequest(e) {
    if (e) e.preventDefault();
    const club = readClubForm();
    const problem = validClub(club);
    if (problem) return C().showToast(problem, "warning");
    const btn = document.getElementById("cf-submit");
    if (btn) btn.disabled = true;
    const { error } = await C().SB.from("clubs").insert(Object.assign(club, { owner_id: me().userId }));
    if (btn) btn.disabled = false;
    if (error) return C().showToast(errText(error, "Envoi impossible, réessaie."), "warning");
    C().showToast("Demande envoyée ! En attendant la validation, ajoute tes terrains et tes horaires.", "success");
    location.hash = "#mon-club/terrains";
  }

  /* ==========================================================================
     5. ESPACE CLUB (#mon-club/<onglet>)
     ========================================================================== */
  const CLUB_TABS = [
    ["planning", "calendar-days", "Planning"],
    ["terrains", "layout-grid", "Terrains & tarifs"],
    ["reservations", "list-checks", "Réservations"],
    ["fiche", "store", "Fiche du club"]
  ];

  async function renderMyClub(tab) {
    if (!C().requireAuth("Connecte-toi pour gérer ton club.")) return;
    loading("Mon club");
    const club = await fetchMyClub();
    if (!club) { location.hash = "#devenir-club"; return; }
    if (!CLUB_TABS.some(t => t[0] === tab)) tab = "planning";
    if (!ui.selectedDate || ui.selectedDate < startOfDay(new Date())) ui.selectedDate = startOfDay(new Date());

    const banner = {
      pending: `<div class="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm flex gap-3"><i data-lucide="hourglass" class="w-5 h-5 flex-shrink-0"></i>
        <div><strong>Demande en cours de validation.</strong> Ton club n'est pas encore visible. Prépare déjà tes terrains, horaires et tarifs.</div></div>`,
      rejected: `<div class="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-200 text-sm"><strong>Demande refusée.</strong> ${esc(club.admin_note || "Corrige ta fiche et contacte l'équipe Mates.")}</div>`,
      suspended: `<div class="p-4 rounded-2xl border border-slate-500/30 bg-slate-500/10 text-slate-200 text-sm"><strong>Club suspendu.</strong> ${esc(club.admin_note || "Il n'est plus visible ni réservable. Contacte l'équipe Mates.")}</div>`
    }[club.status] || "";

    show("Mon club", `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-mates-border pb-6">
          <div>
            <div class="text-xs font-bold text-mates-green uppercase tracking-widest mb-1">Espace club</div>
            <h1 class="text-4xl sm:text-5xl text-white">${esc(club.name)}</h1>
            <div class="flex items-center gap-2 mt-2">${statusBadge(club.status)}<span class="text-xs text-slate-400">${esc(club.city)}</span></div>
          </div>
          <a href="#club/${club.id}" class="btn-outline-neon text-xs py-2 px-4"><i data-lucide="eye" class="w-4 h-4"></i><span>Voir la page publique</span></a>
        </div>
        ${banner}
        <div class="flex gap-2 overflow-x-auto pb-1">${CLUB_TABS.map(([id, icon, text]) =>
          `<a href="#mon-club/${id}" class="pill whitespace-nowrap ${id === tab ? "active" : ""}"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${text}</a>`).join("")}</div>
        <div id="club-tab"></div>
      </div>`);

    if (tab === "planning") await drawPlanning(club);
    if (tab === "terrains") drawCourts(club);
    if (tab === "reservations") await drawClubBookings(club);
    if (tab === "fiche") drawClubInfo(club);
    refreshIcons();
  }

  function tabEl() {
    return document.getElementById("club-tab");
  }

  // ---- Planning du jour : réservé / bloqué / libre
  async function fetchClubBookings(club, from, to) {
    const ids = (club.courts || []).map(c => c.id);
    if (!ids.length) return [];
    const { data, error } = await C().SB.from("court_bookings")
      .select("*, profiles(first_name, last_name)")
      .in("court_id", ids).eq("status", "confirmed")
      .lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString())
      .order("starts_at");
    if (error) console.warn(error.message);
    return data || [];
  }

  function who(b) {
    const p = b.profiles || {};
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Joueur";
  }

  async function drawPlanning(club) {
    const el = tabEl();
    const courts = (club.courts || []).filter(c => c.active !== false);
    if (!courts.length) {
      el.innerHTML = `<div class="text-center py-12 bg-mates-card border border-dashed border-mates-border rounded-3xl space-y-3">
        <p class="text-slate-300">Ajoute d'abord tes terrains, leurs horaires et leurs tarifs.</p>
        <a href="#mon-club/terrains" class="btn-neon inline-flex text-sm">Ajouter un terrain</a></div>`;
      return;
    }
    const day = ui.selectedDate;
    const bookings = await fetchClubBookings(club, day, addDays(day, 1));
    const now = new Date();
    const count = bookings.filter(b => b.kind === "booking").length;
    const revenue = bookings.filter(b => b.kind === "booking").reduce((s, b) => s + Number(b.price || 0), 0);
    el.innerHTML = `
      <div class="space-y-4">
        ${dateChips(day, "pickPlanningDay")}
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-sm text-slate-300 capitalize">${dayLong(day)} · <strong class="text-white">${count}</strong> réservation${count > 1 ? "s" : ""} · <strong class="text-mates-green">${money(revenue)}</strong></div>
          <div class="flex gap-3 text-[11px] text-slate-400">
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded border border-mates-green/60"></span>Libre</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-mates-green"></span>Réservé</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-slate-600"></span>Bloqué</span>
          </div>
        </div>
        ${courts.map(court => {
          const sport = C().sportMeta(court.sport_id);
          const slots = slotsFor(court, day);
          return `<div class="bg-mates-card border border-mates-border rounded-3xl p-5 space-y-3">
            <div class="font-bold text-white">${esc(sport.icon)} ${esc(court.name)} <span class="text-xs text-slate-400 font-normal">· ${money(court.price_per_hour)} / h</span></div>
            ${slots.length ? `<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">${slots.map(s => {
              const b = overlapping(bookings, court.id, s.start, s.end);
              const past = s.end <= now;
              if (b && b.kind === "booking") {
                return `<button type="button" onclick="MatesPro.slotAction('${b.id}')" class="p-2 rounded-xl text-left bg-mates-green text-mates-dark ${past ? "opacity-50" : ""}">
                  <div class="text-xs font-extrabold">${hhmm(s.start)}</div><div class="text-[10px] font-semibold truncate">${esc(who(b))}</div></button>`;
              }
              if (b) {
                return `<button type="button" onclick="MatesPro.slotAction('${b.id}')" class="p-2 rounded-xl text-left bg-slate-700 text-slate-200 ${past ? "opacity-50" : ""}">
                  <div class="text-xs font-extrabold">${hhmm(s.start)}</div><div class="text-[10px] truncate">${esc(b.note || "Bloqué")}</div></button>`;
              }
              return past
                ? `<div class="p-2 rounded-xl text-xs text-slate-600 border border-slate-800">${hhmm(s.start)}</div>`
                : `<button type="button" onclick="MatesPro.blockSlot('${court.id}', '${s.start.toISOString()}')" class="p-2 rounded-xl text-left border border-mates-green/40 text-mates-green hover:bg-mates-green/10">
                    <div class="text-xs font-extrabold">${hhmm(s.start)}</div><div class="text-[10px] text-slate-400">Libre</div></button>`;
            }).join("")}</div>` : `<p class="text-sm text-slate-500">Fermé ce jour-là.</p>`}
          </div>`;
        }).join("")}
      </div>`;
    ui.planningBookings = bookings;
    refreshIcons();
  }

  function pickPlanningDay(iso) {
    ui.selectedDate = parseDay(iso);
    if (ui.myClub) drawPlanning(ui.myClub);
  }

  async function blockSlot(courtId, startIso) {
    const club = ui.myClub;
    const court = club && club.courts.find(c => c.id === courtId);
    if (!court) return;
    const start = new Date(startIso);
    const end = new Date(start.getTime() + court.slot_minutes * 60000);
    const note = await dialog({
      title: `Bloquer ${hhmm(start)} – ${hhmm(end)}`,
      html: `<p>${esc(court.name)}, <span class="capitalize">${dayLong(start)}</span>. Le créneau ne sera plus réservable sur Mates.</p>`,
      input: { label: "Raison (visible par toi seulement)", placeholder: "Réservé par téléphone, entretien…", max: 200 },
      confirmText: "Bloquer"
    });
    if (note === null) return;
    const { error } = await C().SB.from("court_bookings").insert({
      court_id: court.id, starts_at: start.toISOString(), ends_at: end.toISOString(),
      kind: "block", note: C().cleanText(note || "Réservé hors Mates", 200)
    });
    if (error) C().showToast(errText(error, "Impossible de bloquer ce créneau."), "warning");
    drawPlanning(club);
  }

  async function slotAction(bookingId) {
    const b = (ui.planningBookings || []).find(x => x.id === bookingId);
    if (!b) return;
    const isBlock = b.kind === "block";
    const ok = await dialog({
      title: isBlock ? "Créneau bloqué" : "Réservation",
      html: `<p><strong>${fmtDateTime(b.starts_at)} – ${hhmm(new Date(b.ends_at))}</strong></p>
        ${isBlock ? `<p>${esc(b.note || "Bloqué")}</p>` : `<p>Réservé par <strong>${esc(who(b))}</strong> · ${money(b.price)} à encaisser sur place.</p>`}`,
      confirmText: isBlock ? "Débloquer" : "Annuler la réservation",
      danger: !isBlock
    });
    if (!ok) return;
    const req = isBlock
      ? C().SB.from("court_bookings").delete().eq("id", b.id)
      : C().SB.from("court_bookings").update({ status: "cancelled" }).eq("id", b.id);
    const { error } = await req;
    if (error) C().showToast(errText(error, "Action impossible, réessaie."), "warning");
    else C().showToast(isBlock ? "Créneau débloqué." : "Réservation annulée.", "info");
    drawPlanning(ui.myClub);
  }

  // ---- Terrains, horaires et tarifs
  function drawCourts(club) {
    const el = tabEl();
    const courts = club.courts || [];
    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-sm text-slate-400">${courts.length} terrain${courts.length > 1 ? "s" : ""}. Les joueurs réservent les créneaux pendant tes heures d'ouverture.</p>
          <button type="button" onclick="MatesPro.editCourt()" class="btn-neon text-xs py-2 px-4"><i data-lucide="plus" class="w-4 h-4"></i><span>Ajouter un terrain</span></button>
        </div>
        <div id="court-form"></div>
        <div class="grid md:grid-cols-2 gap-4">${courts.map(court => {
          const sport = C().sportMeta(court.sport_id);
          const days = DAY_ORDER.map(d => {
            const h = (court.opening || {})[String(d)];
            return `<div class="flex justify-between"><span>${DAY_NAMES[d].slice(0, 3)}.</span><span class="${h ? "text-white" : "text-slate-600"}">${h ? `${h[0]}h – ${h[1]}h` : "Fermé"}</span></div>`;
          }).join("");
          return `<div class="bg-mates-card border border-mates-border rounded-3xl p-5 space-y-3 ${court.active === false ? "opacity-60" : ""}">
            <div class="flex items-start justify-between gap-3">
              <div><div class="font-bold text-white">${esc(sport.icon)} ${esc(court.name)}</div>
                <div class="text-xs text-slate-400">${esc(sport.name)} · ${court.indoor ? "Intérieur" : "Extérieur"} · créneaux de ${court.slot_minutes} min${court.active === false ? " · <strong>désactivé</strong>" : ""}</div></div>
              <div class="text-lg font-extrabold text-mates-green whitespace-nowrap">${money(court.price_per_hour)}<span class="text-xs text-slate-400"> / h</span></div>
            </div>
            <div class="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-slate-400">${days}</div>
            <div class="flex gap-2 pt-1">
              <button type="button" onclick="MatesPro.editCourt('${court.id}')" class="btn-outline-neon text-xs py-1.5 px-3"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>Modifier</button>
              <button type="button" onclick="MatesPro.deleteCourt('${court.id}')" class="text-xs font-semibold text-rose-300 hover:text-rose-200 px-3">Supprimer</button>
            </div>
          </div>`;
        }).join("")}</div>
      </div>`;
    if (!courts.length) editCourt();
    refreshIcons();
  }

  function hourOptions(selected, from, to) {
    let html = "";
    for (let h = from; h <= to; h++) html += `<option value="${h}" ${h === selected ? "selected" : ""}>${h}h</option>`;
    return html;
  }

  function editCourt(id) {
    const club = ui.myClub;
    const court = id ? club.courts.find(c => c.id === id) : null;
    const c = court || {
      name: `Terrain ${(club.courts || []).length + 1}`, sport_id: (club.sports || [])[0] || "padel", indoor: true,
      price_per_hour: 32, slot_minutes: 90, active: true,
      opening: { 0: [9, 22], 1: [9, 23], 2: [9, 23], 3: [9, 23], 4: [9, 23], 5: [9, 23], 6: [9, 22] }
    };
    const sports = INITIAL_SPORTS.filter(s => (club.sports || []).includes(s.id) || s.id === c.sport_id);
    const box = document.getElementById("court-form");
    box.innerHTML = `
      <form onsubmit="MatesPro.saveCourt(event, '${court ? court.id : ""}')" class="bg-mates-card border border-mates-green/40 rounded-3xl p-6 space-y-5">
        <h3 class="text-xl font-bold text-white">${court ? "Modifier le terrain" : "Nouveau terrain"}</h3>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>${label("Nom", "ct-name")}<input id="ct-name" required maxlength="60" class="${inputCls()}" value="${esc(c.name)}"></div>
          <div>${label("Sport", "ct-sport")}<select id="ct-sport" class="${inputCls()}">${(sports.length ? sports : INITIAL_SPORTS).map(s => `<option value="${esc(s.id)}" ${s.id === c.sport_id ? "selected" : ""}>${esc(s.icon)} ${esc(s.name)}</option>`).join("")}</select></div>
          <div>${label("Prix par heure (€)", "ct-price")}<input id="ct-price" type="number" min="0" max="1000" step="0.5" required class="${inputCls()}" value="${Number(c.price_per_hour)}"></div>
          <div>${label("Durée d'un créneau", "ct-slot")}<select id="ct-slot" class="${inputCls()}">${[30, 45, 60, 90, 120].map(m => `<option value="${m}" ${m === c.slot_minutes ? "selected" : ""}>${m} min</option>`).join("")}</select></div>
        </div>
        <div class="flex flex-wrap gap-6">
          <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input id="ct-indoor" type="checkbox" class="accent-[#A6E20E] w-4 h-4" ${c.indoor ? "checked" : ""}>Terrain intérieur</label>
          <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input id="ct-active" type="checkbox" class="accent-[#A6E20E] w-4 h-4" ${c.active !== false ? "checked" : ""}>Réservable en ligne</label>
        </div>
        <div>
          ${label("Horaires d'ouverture")}
          <div class="grid sm:grid-cols-2 gap-2">${DAY_ORDER.map(d => {
            const h = (c.opening || {})[String(d)];
            return `<div class="flex items-center gap-2 p-2 rounded-xl bg-mates-off border border-slate-800">
              <label class="flex items-center gap-2 w-28 text-sm text-white cursor-pointer"><input type="checkbox" data-day="${d}" class="ct-open accent-[#A6E20E] w-4 h-4" ${h ? "checked" : ""}>${DAY_NAMES[d]}</label>
              <select data-from="${d}" class="bg-mates-card border border-mates-border rounded-lg px-2 py-1 text-xs text-white">${hourOptions(h ? h[0] : 9, 0, 23)}</select>
              <span class="text-slate-500 text-xs">à</span>
              <select data-to="${d}" class="bg-mates-card border border-mates-border rounded-lg px-2 py-1 text-xs text-white">${hourOptions(h ? h[1] : 23, 1, 24)}</select>
            </div>`;
          }).join("")}</div>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn-neon text-sm py-2.5 px-5"><i data-lucide="check" class="w-4 h-4"></i><span>Enregistrer</span></button>
          <button type="button" onclick="document.getElementById('court-form').innerHTML=''" class="btn-outline-neon text-sm py-2.5 px-5">Annuler</button>
        </div>
      </form>`;
    refreshIcons();
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveCourt(e, id) {
    if (e) e.preventDefault();
    const v = sel => (document.getElementById(sel) || {}).value || "";
    const opening = {};
    let bad = false;
    document.querySelectorAll(".ct-open").forEach(cb => {
      const d = cb.dataset.day;
      if (!cb.checked) { opening[d] = null; return; }
      const from = parseInt(document.querySelector(`[data-from="${d}"]`).value, 10);
      const to = parseInt(document.querySelector(`[data-to="${d}"]`).value, 10);
      if (!(to > from)) bad = true;
      opening[d] = [from, to];
    });
    if (bad) return C().showToast("L'heure de fermeture doit être après l'heure d'ouverture.", "warning");
    const row = {
      club_id: ui.myClub.id,
      name: C().cleanText(v("ct-name"), 60) || "Terrain",
      sport_id: v("ct-sport"),
      price_per_hour: Math.min(1000, Math.max(0, parseFloat(v("ct-price")) || 0)),
      slot_minutes: parseInt(v("ct-slot"), 10) || 60,
      indoor: document.getElementById("ct-indoor").checked,
      active: document.getElementById("ct-active").checked,
      opening
    };
    const req = id ? C().SB.from("courts").update(row).eq("id", id) : C().SB.from("courts").insert(row);
    const { error } = await req;
    if (error) return C().showToast(errText(error, "Enregistrement impossible, réessaie."), "warning");
    // Le sport du terrain fait partie des sports du club
    if (!(ui.myClub.sports || []).includes(row.sport_id)) {
      await C().SB.from("clubs").update({ sports: (ui.myClub.sports || []).concat(row.sport_id) }).eq("id", ui.myClub.id);
    }
    C().showToast(id ? "Terrain mis à jour." : "Terrain ajouté !", "success");
    renderMyClub("terrains");
  }

  async function deleteCourt(id) {
    const court = ui.myClub.courts.find(c => c.id === id);
    const ok = await dialog({
      title: `Supprimer « ${esc(court ? court.name : "")} » ?`,
      html: "<p>Ses réservations seront aussi supprimées. Pour le fermer temporairement, décoche plutôt « Réservable en ligne ».</p>",
      confirmText: "Supprimer", danger: true
    });
    if (!ok) return;
    const { error } = await C().SB.from("courts").delete().eq("id", id);
    if (error) return C().showToast(errText(error, "Suppression impossible."), "warning");
    C().showToast("Terrain supprimé.", "info");
    renderMyClub("terrains");
  }

  // ---- Réservations à venir
  async function drawClubBookings(club) {
    const el = tabEl();
    const from = startOfDay(new Date());
    const list = (await fetchClubBookings(club, from, addDays(from, 60))).filter(b => b.kind === "booking");
    const courts = {};
    (club.courts || []).forEach(c => { courts[c.id] = c; });
    ui.planningBookings = list;
    el.innerHTML = list.length ? `<div class="space-y-2">${list.map(b => {
      const court = courts[b.court_id] || {};
      const sport = C().sportMeta(court.sport_id);
      return `<div class="flex items-center gap-3 p-3 rounded-2xl bg-mates-card border border-mates-border">
        <span class="text-2xl">${esc(sport.icon)}</span>
        <div class="min-w-0 flex-1"><div class="font-bold text-white">${esc(who(b))} · ${esc(court.name || "")}</div>
          <div class="text-xs text-slate-400">${fmtDateTime(b.starts_at)} – ${hhmm(new Date(b.ends_at))} · ${money(b.price)}</div></div>
        <button type="button" onclick="MatesPro.slotAction('${b.id}')" class="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2">Détails</button>
      </div>`;
    }).join("")}</div>` : `<div class="text-center py-12 bg-mates-card border border-dashed border-mates-border rounded-3xl text-slate-400">Aucune réservation à venir pour l'instant.</div>`;
    refreshIcons();
  }

  // ---- Fiche du club
  function drawClubInfo(club) {
    tabEl().innerHTML = `
      <form onsubmit="MatesPro.saveClubInfo(event)" class="bg-mates-card border border-mates-border rounded-3xl p-6 sm:p-8 space-y-6">
        ${clubFormHtml(club)}
        <button type="submit" class="btn-neon py-3 px-6"><i data-lucide="check" class="w-4 h-4"></i><span>Enregistrer la fiche</span></button>
      </form>`;
    refreshIcons();
  }

  async function saveClubInfo(e) {
    if (e) e.preventDefault();
    const club = readClubForm();
    const problem = validClub(club);
    if (problem) return C().showToast(problem, "warning");
    const { error } = await C().SB.from("clubs").update(club).eq("id", ui.myClub.id);
    if (error) return C().showToast(errText(error, "Enregistrement impossible."), "warning");
    C().showToast("Fiche du club enregistrée.", "success");
    renderMyClub("fiche");
  }

  /* ==========================================================================
     6. MON ESPACE : réservations + liens club / admin
     ========================================================================== */
  async function renderDashboardExtras() {
    if (!C().SB || !me()) return;
    let box = document.getElementById("dash-pro");
    if (!box) {
      const anchor = document.getElementById("dash-next-match");
      if (!anchor) return;
      box = document.createElement("div");
      box.id = "dash-pro";
      box.className = "grid grid-cols-1 lg:grid-cols-12 gap-6";
      anchor.parentElement.insertAdjacentElement("afterend", box);
    }
    const [bookings, club] = await Promise.all([fetchMyBookings(), fetchMyClub()]);
    box.innerHTML = `
      <div class="lg:col-span-7 bg-mates-card border border-mates-border rounded-3xl p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl text-white flex items-center gap-2"><i data-lucide="calendar-clock" class="w-5 h-5 text-mates-green"></i>Mes réservations de terrain</h2>
          <a href="#clubs" class="text-xs font-semibold text-mates-green hover:underline">Réserver</a>
        </div>
        ${bookings.length ? `<div class="space-y-2">${bookings.slice(0, 4).map(b => bookingRow(b,
          `<button type="button" onclick="MatesPro.cancelMyBooking('${b.id}')" class="text-xs font-semibold text-rose-300 hover:text-rose-200 px-2 py-2">Annuler</button>`)).join("")}</div>`
          : `<p class="text-sm text-slate-400">Aucune réservation. Réserve un terrain dans un club partenaire, puis publie un match pour trouver tes joueurs.</p>`}
      </div>
      <div class="lg:col-span-5 space-y-4">
        <a href="${club ? "#mon-club" : "#devenir-club"}" class="block bg-mates-card border border-mates-border hover:border-mates-green/60 rounded-3xl p-6 transition-all">
          <div class="flex items-center gap-3"><i data-lucide="building-2" class="w-6 h-6 text-mates-green"></i>
            <div><div class="font-bold text-white">${club ? esc(club.name) : "Tu gères un club ?"}</div>
              <div class="text-xs text-slate-400">${club ? `Espace club · ${STATUS_LABEL[club.status] ? STATUS_LABEL[club.status].text : ""}` : "Inscris-le : terrains, horaires et tarifs réservables en ligne."}</div></div></div>
        </a>
        ${isAdmin() ? `<a href="#admin" class="block bg-mates-green/10 border border-mates-green/40 hover:border-mates-green rounded-3xl p-6 transition-all">
          <div class="flex items-center gap-3"><i data-lucide="shield-check" class="w-6 h-6 text-mates-green"></i>
            <div><div class="font-bold text-white">Administration</div><div class="text-xs text-slate-400">Utilisateurs, clubs, matchs, réservations et sports.</div></div></div>
        </a>` : ""}
      </div>`;
    refreshIcons();
  }

  // Lien « Admin » dans l'en-tête pour les administrateurs
  function decorateHeader() {
    const box = document.getElementById("header-user-section");
    if (!box || !isAdmin() || box.querySelector("[data-admin-link]")) return;
    box.insertAdjacentHTML("afterbegin", `<a href="#admin" data-admin-link title="Administration" aria-label="Administration"
      class="w-10 h-10 rounded-full border border-mates-green/40 text-mates-green hover:bg-mates-green hover:text-mates-dark flex items-center justify-center transition-all"><i data-lucide="shield-check" class="w-5 h-5"></i></a>`);
  }

  /* ==========================================================================
     7. ADMINISTRATION (#admin/<onglet>)
     ========================================================================== */
  const ADMIN_TABS = [
    ["apercu", "layout-dashboard", "Aperçu"],
    ["utilisateurs", "users", "Utilisateurs"],
    ["clubs", "building-2", "Clubs"],
    ["matchs", "swords", "Matchs"],
    ["reservations", "calendar-check", "Réservations"],
    ["sports", "trophy", "Sports"]
  ];

  async function renderAdmin(tab) {
    if (!C().requireAuth("Connecte-toi avec un compte administrateur.")) return;
    if (!isAdmin()) {
      show("Administration", `<div class="max-w-xl mx-auto text-center py-20 space-y-3"><div class="text-5xl">🔒</div>
        <h1 class="text-3xl text-white">Accès réservé</h1><p class="text-slate-400 text-sm">Cette page est réservée aux administrateurs de Mates.</p>
        <a href="#home" class="btn-neon inline-flex">Retour à l'accueil</a></div>`);
      return;
    }
    if (!ADMIN_TABS.some(t => t[0] === tab)) tab = "apercu";
    show("Administration", `
      <div class="space-y-6">
        <div class="border-b border-mates-border pb-6">
          <div class="text-xs font-bold text-mates-green uppercase tracking-widest mb-1 flex items-center gap-1"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i>Administration</div>
          <h1 class="text-4xl sm:text-5xl text-white">Gérer <span class="hl-e">Mates</span></h1>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">${ADMIN_TABS.map(([id, icon, text]) =>
          `<a href="#admin/${id}" class="pill whitespace-nowrap ${id === tab ? "active" : ""}"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${text}</a>`).join("")}</div>
        <div id="admin-tab"><div class="py-16 text-center text-slate-400 text-sm">Chargement…</div></div>
      </div>`);
    const draw = { apercu: adminOverview, utilisateurs: adminUsers, clubs: adminClubs, matchs: adminMatches, reservations: adminBookings, sports: adminSports }[tab];
    await draw();
    refreshIcons();
  }

  function adminEl() {
    return document.getElementById("admin-tab");
  }

  async function loadUsers(force) {
    if (ui.adminUsers && !force) return ui.adminUsers;
    const { data, error } = await C().SB.rpc("admin_list_users");
    if (error) console.warn(error.message);
    ui.adminUsers = data || [];
    return ui.adminUsers;
  }

  function userName(u) {
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || "(profil incomplet)";
  }

  function table(head, rows, empty) {
    if (!rows.length) return `<div class="text-center py-12 bg-mates-card border border-dashed border-mates-border rounded-3xl text-slate-400 text-sm">${empty}</div>`;
    return `<div class="bg-mates-card border border-mates-border rounded-3xl overflow-x-auto">
      <table class="w-full text-sm"><thead><tr class="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-mates-border">
        ${head.map(h => `<th class="px-4 py-3 font-bold whitespace-nowrap">${h}</th>`).join("")}</tr></thead>
        <tbody class="divide-y divide-mates-border">${rows.join("")}</tbody></table></div>`;
  }

  // ---- Aperçu
  async function adminOverview() {
    const sb = C().SB;
    const nowIso = new Date().toISOString();
    const [users, clubs, matches, bookings] = await Promise.all([
      loadUsers(true),
      sb.from("clubs").select("id, name, city, status, created_at, owner_id").order("created_at", { ascending: false }),
      sb.from("matches").select("id", { count: "exact", head: true }).eq("status", "open").gte("starts_at", nowIso),
      sb.from("court_bookings").select("id, price", { count: "exact" }).eq("kind", "booking").eq("status", "confirmed").gte("starts_at", nowIso)
    ]);
    const clubList = clubs.data || [];
    const pending = clubList.filter(c => c.status === "pending");
    const revenue = (bookings.data || []).reduce((s, b) => s + Number(b.price || 0), 0);
    const stat = (icon, value, text, href) => `<a href="${href}" class="bg-mates-card border border-mates-border hover:border-mates-green/60 rounded-3xl p-5 transition-all">
      <i data-lucide="${icon}" class="w-5 h-5 text-mates-green mb-3"></i><div class="font-display text-4xl text-white">${value}</div><div class="text-xs text-slate-400 font-semibold">${text}</div></a>`;
    const owners = {};
    users.forEach(u => { owners[u.id] = u; });
    adminEl().innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${stat("users", users.length, "comptes inscrits", "#admin/utilisateurs")}
          ${stat("building-2", clubList.filter(c => c.status === "approved").length, `clubs validés · ${pending.length} en attente`, "#admin/clubs")}
          ${stat("swords", matches.count || 0, "matchs ouverts à venir", "#admin/matchs")}
          ${stat("calendar-check", bookings.count || 0, `réservations à venir · ${money(revenue)}`, "#admin/reservations")}
        </div>
        <div class="bg-mates-card border ${pending.length ? "border-amber-500/40" : "border-mates-border"} rounded-3xl p-6 space-y-3">
          <h2 class="text-2xl text-white">Clubs à valider</h2>
          ${pending.length ? pending.map(c => `<div class="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-mates-off border border-slate-800">
              <div class="flex-1 min-w-0"><a href="#club/${c.id}" class="font-bold text-white hover:text-mates-green">${esc(c.name)}</a>
                <div class="text-xs text-slate-400">${esc(c.city)} · demandé par ${esc(owners[c.owner_id] ? userName(owners[c.owner_id]) : "?")} · ${fmtDateTime(c.created_at)}</div></div>
              <button type="button" onclick="MatesPro.setClubStatus('${c.id}', 'approved')" class="btn-neon text-xs py-1.5 px-3">Valider</button>
              <button type="button" onclick="MatesPro.setClubStatus('${c.id}', 'rejected')" class="text-xs font-semibold text-rose-300 px-2">Refuser</button>
            </div>`).join("") : `<p class="text-sm text-slate-400">Aucune demande en attente. 👌</p>`}
        </div>
      </div>`;
    refreshIcons();
  }

  // ---- Utilisateurs
  async function adminUsers() {
    await loadUsers(true);
    drawUsers("");
  }

  function drawUsers(query) {
    const q = (query || "").toLowerCase();
    const myId = me().userId;
    const list = (ui.adminUsers || []).filter(u => !q || `${userName(u)} ${u.email} ${u.city}`.toLowerCase().includes(q));
    adminEl().innerHTML = `
      <div class="space-y-4">
        <div class="relative max-w-md"><i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-3"></i>
          <input id="admin-user-search" oninput="MatesPro.searchUsers(this.value)" value="${esc(query || "")}" placeholder="Rechercher un nom, un email, une ville…" class="${inputCls()} pl-9"></div>
        ${table(["Utilisateur", "Email", "Ville", "Inscrit le", "Rôle", ""], list.map(u => `
          <tr class="${u.banned ? "opacity-60" : ""}">
            <td class="px-4 py-3"><div class="flex items-center gap-2"><img src="${esc(C().cleanAvatar(u.avatar))}" alt="" class="w-8 h-8 rounded-full object-cover">
              <a href="#mate/${u.id === myId ? "my-profile" : "user-" + u.id}" class="font-semibold text-white hover:text-mates-green">${esc(userName(u))}</a></div></td>
            <td class="px-4 py-3 text-slate-300">${esc(u.email || "")}</td>
            <td class="px-4 py-3 text-slate-400">${esc(u.city || "")}</td>
            <td class="px-4 py-3 text-slate-400 whitespace-nowrap">${new Date(u.created_at).toLocaleDateString("fr-BE")}</td>
            <td class="px-4 py-3">${u.role === "admin" ? `<span class="text-mates-green font-bold text-xs">Admin</span>` : `<span class="text-slate-400 text-xs">Joueur</span>`}${u.banned ? ` <span class="text-rose-300 font-bold text-xs">· Bloqué</span>` : ""}</td>
            <td class="px-4 py-3 whitespace-nowrap text-right">${u.id === myId ? `<span class="text-xs text-slate-500">C'est toi</span>` : `
              <button type="button" onclick="MatesPro.toggleAdmin('${u.id}')" class="text-xs font-semibold text-slate-300 hover:text-white px-2">${u.role === "admin" ? "Retirer admin" : "Rendre admin"}</button>
              <button type="button" onclick="MatesPro.toggleBan('${u.id}')" class="text-xs font-semibold ${u.banned ? "text-mates-green" : "text-rose-300"} px-2">${u.banned ? "Débloquer" : "Bloquer"}</button>`}</td>
          </tr>`), "Aucun utilisateur trouvé.")}
      </div>`;
    refreshIcons();
    const input = document.getElementById("admin-user-search");
    if (input && query) { input.focus(); input.setSelectionRange(query.length, query.length); }
  }

  let searchTimer = null;
  function searchUsers(value) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => drawUsers(value), 150);
  }

  async function toggleAdmin(id) {
    const u = (ui.adminUsers || []).find(x => x.id === id);
    if (!u) return;
    const makeAdmin = u.role !== "admin";
    const ok = await dialog({
      title: makeAdmin ? `Rendre ${esc(userName(u))} administrateur ?` : `Retirer le rôle admin à ${esc(userName(u))} ?`,
      html: makeAdmin ? "<p>Cette personne pourra tout gérer : utilisateurs, clubs, matchs, réservations et sports.</p>" : "",
      confirmText: makeAdmin ? "Rendre admin" : "Retirer", danger: !makeAdmin
    });
    if (!ok) return;
    const { error } = await C().SB.from("profiles").update({ role: makeAdmin ? "admin" : "user" }).eq("id", id);
    if (error) return C().showToast(errText(error, "Modification impossible."), "warning");
    C().showToast("Rôle mis à jour.", "success");
    adminUsers();
  }

  async function toggleBan(id) {
    const u = (ui.adminUsers || []).find(x => x.id === id);
    if (!u) return;
    const ban = !u.banned;
    const ok = await dialog({
      title: ban ? `Bloquer ${esc(userName(u))} ?` : `Débloquer ${esc(userName(u))} ?`,
      html: ban ? "<p>Le compte ne pourra plus créer de match, réserver, rejoindre un match ni écrire dans les chats. Son profil reste visible.</p>" : "<p>Le compte retrouve toutes ses possibilités.</p>",
      confirmText: ban ? "Bloquer" : "Débloquer", danger: ban
    });
    if (!ok) return;
    const { error } = await C().SB.from("profiles").update({ banned: ban }).eq("id", id);
    if (error) return C().showToast(errText(error, "Modification impossible."), "warning");
    C().showToast(ban ? "Compte bloqué." : "Compte débloqué.", "info");
    adminUsers();
  }

  // ---- Clubs
  async function adminClubs() {
    const [users, res] = await Promise.all([loadUsers(), C().SB.from("clubs").select("*, courts(id)").order("created_at", { ascending: false })]);
    if (res.error) console.warn(res.error.message);
    const owners = {};
    users.forEach(u => { owners[u.id] = u; });
    const all = res.data || [];
    const filter = ui.adminFilter;
    const list = filter === "all" ? all : all.filter(c => c.status === filter);
    const count = s => all.filter(c => c.status === s).length;
    adminEl().innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap gap-2">${[["pending", "En attente"], ["approved", "Validés"], ["rejected", "Refusés"], ["suspended", "Suspendus"], ["all", "Tous"]].map(([s, t]) =>
          `<button type="button" onclick="MatesPro.filterClubs('${s}')" class="pill ${s === filter ? "active" : ""}">${t} (${s === "all" ? all.length : count(s)})</button>`).join("")}</div>
        ${table(["Club", "Responsable", "Sports", "Terrains", "Statut", ""], list.map(c => {
          const o = owners[c.owner_id];
          const acts = [];
          if (c.status !== "approved") acts.push(`<button type="button" onclick="MatesPro.setClubStatus('${c.id}', 'approved')" class="btn-neon text-xs py-1.5 px-3">Valider</button>`);
          if (c.status === "pending") acts.push(`<button type="button" onclick="MatesPro.setClubStatus('${c.id}', 'rejected')" class="text-xs font-semibold text-rose-300 px-2">Refuser</button>`);
          if (c.status === "approved") acts.push(`<button type="button" onclick="MatesPro.setClubStatus('${c.id}', 'suspended')" class="text-xs font-semibold text-amber-300 px-2">Suspendre</button>`);
          acts.push(`<button type="button" onclick="MatesPro.deleteClub('${c.id}')" class="text-xs font-semibold text-slate-400 hover:text-rose-300 px-2">Supprimer</button>`);
          return `<tr>
            <td class="px-4 py-3"><a href="#club/${c.id}" class="font-semibold text-white hover:text-mates-green">${esc(c.name)}</a>
              <div class="text-xs text-slate-400">${esc(c.address)}, ${esc(c.city)}${c.phone ? " · " + esc(c.phone) : ""}</div></td>
            <td class="px-4 py-3 text-slate-300">${o ? `${esc(userName(o))}<div class="text-xs text-slate-500">${esc(o.email || "")}</div>` : "?"}</td>
            <td class="px-4 py-3">${(c.sports || []).map(id => esc(C().sportMeta(id).icon)).join(" ")}</td>
            <td class="px-4 py-3 text-slate-300">${(c.courts || []).length}</td>
            <td class="px-4 py-3">${statusBadge(c.status)}${c.admin_note ? `<div class="text-[11px] text-slate-500 mt-1 max-w-[12rem]">${esc(c.admin_note)}</div>` : ""}</td>
            <td class="px-4 py-3 whitespace-nowrap text-right">${acts.join(" ")}</td>
          </tr>`;
        }), "Aucun club dans cette catégorie.")}
      </div>`;
    refreshIcons();
  }

  function filterClubs(status) {
    ui.adminFilter = status;
    adminClubs();
  }

  async function setClubStatus(id, status) {
    let note = "";
    if (status === "rejected" || status === "suspended") {
      note = await dialog({
        title: status === "rejected" ? "Refuser ce club ?" : "Suspendre ce club ?",
        html: status === "suspended" ? "<p>Le club ne sera plus visible ni réservable.</p>" : "",
        input: { label: "Message pour le club (optionnel)", placeholder: "Ex : adresse introuvable, merci de corriger…", max: 300 },
        confirmText: status === "rejected" ? "Refuser" : "Suspendre", danger: true
      });
      if (note === null) return;
    }
    const { error } = await C().SB.from("clubs").update({ status, admin_note: C().cleanText(note, 300) }).eq("id", id);
    if (error) return C().showToast(errText(error, "Modification impossible."), "warning");
    C().showToast({ approved: "Club validé : il est maintenant visible et réservable !", rejected: "Demande refusée.", suspended: "Club suspendu." }[status], status === "approved" ? "success" : "info");
    if (C().state.currentRoute === "admin" && location.hash.includes("clubs")) adminClubs(); else adminOverview();
  }

  async function deleteClub(id) {
    const ok = await dialog({ title: "Supprimer définitivement ce club ?", html: "<p>Ses terrains et toutes ses réservations seront supprimés. Cette action est irréversible.</p>", confirmText: "Supprimer", danger: true });
    if (!ok) return;
    const { error } = await C().SB.from("clubs").delete().eq("id", id);
    if (error) return C().showToast(errText(error, "Suppression impossible."), "warning");
    C().showToast("Club supprimé.", "info");
    adminClubs();
  }

  // ---- Matchs
  async function adminMatches() {
    const since = addDays(new Date(), -30).toISOString();
    const { data, error } = await C().SB.from("matches")
      .select("*, match_players(user_id), profiles!matches_created_by_fkey(first_name, last_name)")
      .gte("starts_at", since).order("starts_at", { ascending: false }).limit(300);
    if (error) console.warn(error.message);
    const list = data || [];
    const now = new Date();
    adminEl().innerHTML = `
      <div class="space-y-4">
        <p class="text-sm text-slate-400">Matchs créés par les joueurs (30 derniers jours et à venir). Les matchs d'exemple du site ne sont pas listés.</p>
        ${table(["Match", "Quand", "Organisateur", "Joueurs", "Statut", ""], list.map(m => {
          const past = new Date(m.starts_at) < now;
          const sport = C().sportMeta(m.sport_id);
          const org = m.profiles || {};
          return `<tr class="${m.status === "cancelled" || past ? "opacity-60" : ""}">
            <td class="px-4 py-3"><a href="#match/${m.id}" class="font-semibold text-white hover:text-mates-green">${esc(sport.icon)} ${esc(m.title)}</a>
              <div class="text-xs text-slate-400">${esc(m.club_name)} · ${esc(m.city)}</div></td>
            <td class="px-4 py-3 text-slate-300 whitespace-nowrap">${fmtDateTime(m.starts_at)}</td>
            <td class="px-4 py-3 text-slate-300">${esc([org.first_name, org.last_name].filter(Boolean).join(" ") || "?")}</td>
            <td class="px-4 py-3 text-slate-300">${(m.match_players || []).length}/${m.total_slots}</td>
            <td class="px-4 py-3 text-xs font-bold ${m.status === "cancelled" ? "text-rose-300" : past ? "text-slate-500" : "text-mates-green"}">${m.status === "cancelled" ? "Annulé" : past ? "Terminé" : "Ouvert"}</td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
              ${m.status === "open" && !past ? `<button type="button" onclick="MatesPro.cancelMatch('${m.id}')" class="text-xs font-semibold text-amber-300 px-2">Annuler</button>` : ""}
              <button type="button" onclick="MatesPro.deleteMatch('${m.id}')" class="text-xs font-semibold text-slate-400 hover:text-rose-300 px-2">Supprimer</button></td>
          </tr>`;
        }), "Aucun match créé par les joueurs pour l'instant.")}
      </div>`;
    refreshIcons();
  }

  async function cancelMatch(id) {
    const ok = await dialog({ title: "Annuler ce match ?", html: "<p>Il disparaîtra de la liste des matchs ouverts.</p>", confirmText: "Annuler le match", danger: true });
    if (!ok) return;
    const { error } = await C().SB.from("matches").update({ status: "cancelled" }).eq("id", id);
    if (error) return C().showToast(errText(error, "Action impossible."), "warning");
    C().showToast("Match annulé.", "info");
    C().loadRemoteMatches();
    adminMatches();
  }

  async function deleteMatch(id) {
    const ok = await dialog({ title: "Supprimer définitivement ce match ?", html: "<p>Les inscriptions seront aussi supprimées.</p>", confirmText: "Supprimer", danger: true });
    if (!ok) return;
    const { error } = await C().SB.from("matches").delete().eq("id", id);
    if (error) return C().showToast(errText(error, "Suppression impossible."), "warning");
    C().showToast("Match supprimé.", "info");
    C().loadRemoteMatches();
    adminMatches();
  }

  // ---- Réservations
  async function adminBookings() {
    const since = startOfDay(addDays(new Date(), -7)).toISOString();
    const { data, error } = await C().SB.from("court_bookings")
      .select("*, profiles(first_name, last_name), courts(name, sport_id, clubs(id, name, city))")
      .eq("kind", "booking").gte("starts_at", since).order("starts_at").limit(300);
    if (error) console.warn(error.message);
    const list = data || [];
    adminEl().innerHTML = table(["Créneau", "Club · terrain", "Joueur", "Prix", "Statut", ""], list.map(b => {
      const court = b.courts || {};
      const club = court.clubs || {};
      const cancelled = b.status === "cancelled";
      return `<tr class="${cancelled ? "opacity-60" : ""}">
        <td class="px-4 py-3 text-slate-300 whitespace-nowrap">${fmtDateTime(b.starts_at)} – ${hhmm(new Date(b.ends_at))}</td>
        <td class="px-4 py-3"><a href="#club/${esc(club.id || "")}" class="font-semibold text-white hover:text-mates-green">${esc(club.name || "?")}</a><div class="text-xs text-slate-400">${esc(C().sportMeta(court.sport_id).icon)} ${esc(court.name || "")}</div></td>
        <td class="px-4 py-3 text-slate-300">${esc(who(b))}</td>
        <td class="px-4 py-3 text-slate-300">${money(b.price)}</td>
        <td class="px-4 py-3 text-xs font-bold ${cancelled ? "text-rose-300" : "text-mates-green"}">${cancelled ? "Annulée" : "Confirmée"}</td>
        <td class="px-4 py-3 text-right">${cancelled ? "" : `<button type="button" onclick="MatesPro.adminCancelBooking('${b.id}')" class="text-xs font-semibold text-rose-300 px-2">Annuler</button>`}</td>
      </tr>`;
    }), "Aucune réservation sur les 7 derniers jours ni à venir.");
    refreshIcons();
  }

  async function adminCancelBooking(id) {
    const ok = await dialog({ title: "Annuler cette réservation ?", html: "<p>Le créneau redevient libre.</p>", confirmText: "Annuler la réservation", danger: true });
    if (!ok) return;
    const { error } = await C().SB.from("court_bookings").update({ status: "cancelled" }).eq("id", id);
    if (error) return C().showToast(errText(error, "Action impossible."), "warning");
    C().showToast("Réservation annulée.", "info");
    adminBookings();
  }

  // ---- Sports
  async function adminSports() {
    const { data, error } = await C().SB.from("sports").select("*").order("sort");
    if (error) console.warn(error.message);
    ui.adminSports = data || [];
    adminEl().innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-slate-400">${ui.adminSports.filter(s => s.active).length} sports affichés sur le site. Un sport masqué disparaît des listes, sans supprimer les matchs existants.</p>
          <button type="button" onclick="MatesPro.editSport()" class="btn-neon text-xs py-2 px-4 whitespace-nowrap"><i data-lucide="plus" class="w-4 h-4"></i><span>Ajouter un sport</span></button>
        </div>
        <div id="sport-form"></div>
        ${table(["Sport", "Catégorie", "Format", "Ordre", "Visible", ""], ui.adminSports.map(s => `
          <tr class="${s.active ? "" : "opacity-60"}">
            <td class="px-4 py-3 font-semibold text-white">${esc(s.icon)} ${esc(s.name)} <span class="text-xs text-slate-500 font-normal">(${esc(s.id)})</span></td>
            <td class="px-4 py-3 text-slate-300">${esc(s.category)}</td>
            <td class="px-4 py-3 text-slate-400 text-xs">${esc(s.players_per_match)}</td>
            <td class="px-4 py-3 text-slate-400">${s.sort}</td>
            <td class="px-4 py-3"><button type="button" onclick="MatesPro.toggleSport('${esc(s.id)}')" class="switch ${s.active ? "on" : ""}" role="switch" aria-checked="${s.active}" aria-label="Afficher ${esc(s.name)}"></button></td>
            <td class="px-4 py-3 text-right"><button type="button" onclick="MatesPro.editSport('${esc(s.id)}')" class="text-xs font-semibold text-slate-300 hover:text-white px-2">Modifier</button></td>
          </tr>`), "Aucun sport.")}
      </div>`;
    refreshIcons();
  }

  function editSport(id) {
    const s = (ui.adminSports || []).find(x => x.id === id) || { id: "", name: "", icon: "🏅", category: "", players_per_match: "", duration: "", slogan: "", description: "", popular_in: "", sort: ((ui.adminSports || []).length + 1) * 10 };
    const f = (key, text, opts = {}) => `<div class="${opts.wide ? "sm:col-span-2" : ""}">${label(text, "sp-" + key)}
      ${opts.area ? `<textarea id="sp-${key}" rows="2" maxlength="${opts.max}" class="${inputCls()}">${esc(s[key])}</textarea>`
        : `<input id="sp-${key}" maxlength="${opts.max || 60}" ${opts.type ? `type="${opts.type}"` : ""} ${opts.readonly ? "readonly" : ""} class="${inputCls()} ${opts.readonly ? "opacity-60" : ""}" value="${esc(s[key])}" placeholder="${esc(opts.ph || "")}">`}</div>`;
    const box = document.getElementById("sport-form");
    box.innerHTML = `
      <form onsubmit="MatesPro.saveSport(event, ${id ? `'${esc(id)}'` : "null"})" class="bg-mates-card border border-mates-green/40 rounded-3xl p-6 space-y-4">
        <h3 class="text-xl font-bold text-white">${id ? `Modifier ${esc(s.name)}` : "Nouveau sport"}</h3>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${f("name", "Nom *", { max: 40, ph: "Pickleball" })}
          ${f("id", "Identifiant *", { max: 30, readonly: !!id, ph: "pickleball" })}
          ${f("icon", "Emoji", { max: 8, ph: "🏓" })}
          ${f("category", "Catégorie", { max: 30, ph: "Raquette" })}
          ${f("players_per_match", "Format", { max: 60, ph: "4 joueurs (2 vs 2)" })}
          ${f("duration", "Durée", { max: 30, ph: "60 min" })}
          ${f("popular_in", "Villes actives", { max: 120, ph: "Liège, Namur" })}
          ${f("sort", "Ordre d'affichage", { type: "number" })}
          ${f("slogan", "Slogan", { max: 200, wide: true })}
          ${f("description", "Description", { max: 600, wide: true, area: true })}
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn-neon text-sm py-2.5 px-5"><i data-lucide="check" class="w-4 h-4"></i><span>Enregistrer</span></button>
          <button type="button" onclick="document.getElementById('sport-form').innerHTML=''" class="btn-outline-neon text-sm py-2.5 px-5">Annuler</button>
        </div>
      </form>`;
    refreshIcons();
    const name = document.getElementById("sp-name");
    const slug = document.getElementById("sp-id");
    if (!id && name && slug) {
      name.addEventListener("input", () => {
        slug.value = name.value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
      });
    }
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveSport(e, id) {
    if (e) e.preventDefault();
    const v = k => ((document.getElementById("sp-" + k) || {}).value || "").trim();
    const clean = C().cleanText;
    const row = {
      id: id || v("id").toLowerCase(),
      name: clean(v("name"), 40),
      icon: clean(v("icon"), 8) || "🏅",
      category: clean(v("category"), 30) || "Autre",
      players_per_match: clean(v("players_per_match"), 60),
      duration: clean(v("duration"), 30),
      popular_in: clean(v("popular_in"), 120),
      slogan: clean(v("slogan"), 200),
      description: clean(v("description"), 600),
      sort: parseInt(v("sort"), 10) || 100
    };
    if (row.name.length < 2) return C().showToast("Indique le nom du sport.", "warning");
    if (!/^[a-z0-9-]{2,30}$/.test(row.id)) return C().showToast("Identifiant : lettres minuscules, chiffres et tirets (ex : pickleball).", "warning");
    const req = id ? C().SB.from("sports").update(row).eq("id", id) : C().SB.from("sports").insert(row);
    const { error } = await req;
    if (error) return C().showToast(errText(error, String(error.message || "").includes("duplicate") ? "Cet identifiant existe déjà." : "Enregistrement impossible."), "warning");
    C().showToast(id ? "Sport mis à jour." : "Sport ajouté !", "success");
    await C().loadRemoteSports();
    adminSports();
  }

  async function toggleSport(id) {
    const s = (ui.adminSports || []).find(x => x.id === id);
    if (!s) return;
    const { error } = await C().SB.from("sports").update({ active: !s.active }).eq("id", id);
    if (error) return C().showToast(errText(error, "Modification impossible."), "warning");
    C().showToast(s.active ? `${s.name} est masqué du site.` : `${s.name} est de nouveau visible.`, "info");
    await C().loadRemoteSports();
    adminSports();
  }

  return {
    route, renderSportClubs, renderDashboardExtras, decorateHeader,
    pickClubDay, pickClubSport, bookSlot, cancelMyBooking,
    submitClubRequest, pickPlanningDay, blockSlot, slotAction, editCourt, saveCourt, deleteCourt, saveClubInfo,
    searchUsers, toggleAdmin, toggleBan, filterClubs, setClubStatus, deleteClub,
    cancelMatch, deleteMatch, adminCancelBooking, editSport, saveSport, toggleSport
  };
})();
window.MatesPro = MatesPro;
