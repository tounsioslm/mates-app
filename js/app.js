/**
 * MATES. — Logique Applicative & Routeur SPA
 * Gestion des 7 écrans du wireframe, des filtres, du profil, des disponibilités et de l'auth.
 */

const MatesApp = (() => {
  // Clés de stockage LocalStorage
  const STORAGE_KEY_PROFILE = "mates_user_profile";
  const STORAGE_KEY_AUTH = "mates_is_authenticated";
  const STORAGE_KEY_MATCHES = "mates_open_matches";

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
      city: ""
    },
    // Données temporaires d'édition du profil
    editingProfile: null,
    pendingJoinMatchId: null,
    pendingProposeMateId: null
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
    state.isAuthenticated = savedAuth !== null ? savedAuth === "true" : true;

    // Matchs ouverts
    const savedMatches = localStorage.getItem(STORAGE_KEY_MATCHES);
    if (savedMatches) {
      try {
        state.matches = JSON.parse(savedMatches);
      } catch (e) {
        state.matches = JSON.parse(JSON.stringify(INITIAL_OPEN_MATCHES));
      }
    } else {
      state.matches = JSON.parse(JSON.stringify(INITIAL_OPEN_MATCHES));
      localStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(state.matches));
    }
  }

  /**
   * Configuration du routeur par hash (#home, #mates, #sports, #sport/padel, #mate/mate-1, etc.)
   */
  function setupRouting() {
    window.addEventListener("hashchange", handleHashChange);
  }

  function handleHashChange() {
    const rawHash = window.location.hash.replace("#", "") || "home";
    const parts = rawHash.split("/");
    const mainView = parts[0];
    const param = parts[1] || null;

    state.currentRoute = mainView;

    // Cacher toutes les vues
    document.querySelectorAll(".page-view").forEach(el => {
      el.classList.add("hidden");
      el.classList.remove("fade-in");
    });

    // Mettre à jour l'état de la navbar
    updateNavLinks(mainView);

    // Routage vers la vue demandée
    switch (mainView) {
      case "home":
        showView("view-home");
        break;

      case "mates":
        showView("view-mates");
        renderMatesGrid();
        break;

      case "sports":
        showView("view-sports");
        renderSportsCatalog();
        break;

      case "sport":
        state.selectedSportId = param || "padel";
        showView("view-single-sport");
        renderSingleSportPage(state.selectedSportId);
        break;

      case "mate":
        state.selectedMateId = param || "mate-1";
        showView("view-public-profile");
        renderPublicProfile(state.selectedMateId);
        break;

      case "edit-profile":
        if (!state.isAuthenticated) {
          window.location.hash = "#auth";
          showToast("Veuillez vous connecter pour modifier votre profil.", "info");
          return;
        }
        showView("view-edit-profile");
        initEditProfileForm();
        break;

      case "auth":
        showView("view-auth");
        updateAuthCard();
        break;

      case "matches":
        showView("view-matches");
        renderOpenMatches();
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
      if (href === `#${activeHash}` || (activeHash === "sport" && href === "#sports") || (activeHash === "mate" && href === "#mates")) {
        link.className = "nav-link px-5 py-2 rounded-full text-sm font-bold bg-mates-green text-black shadow-md transition-all";
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
        <a href="#edit-profile" class="flex items-center gap-2.5 bg-mates-card hover:bg-mates-cardElevated border border-mates-border hover:border-mates-green/60 p-1.5 pr-3.5 rounded-full transition-all group">
          <img src="${state.userProfile.avatar}" alt="${state.userProfile.firstName}" class="w-8 h-8 rounded-full object-cover ring-2 ring-mates-green">
          <div class="text-left hidden sm:block leading-tight">
            <div class="text-xs font-bold text-white group-hover:text-mates-green transition-colors">${state.userProfile.firstName}</div>
            <div class="text-[10px] text-slate-400">Mon profil</div>
          </div>
        </a>
      `;
    } else {
      container.innerHTML = `
        <a href="#auth" class="btn-neon text-xs py-2 px-4 shadow-sm">
          <i data-lucide="log-in" class="w-4 h-4"></i>
          <span>Connexion</span>
        </a>
      `;
    }
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
      document.querySelectorAll(".mobile-nav-link").forEach(link => {
        link.addEventListener("click", () => mobileDrawer.classList.add("hidden"));
      });
    }

    // Filtres sur la recherche de Mates
    const sportSelect = document.getElementById("filter-sport");
    const levelSelect = document.getElementById("filter-level");
    const cityInput = document.getElementById("filter-city");
    const resetBtn = document.getElementById("filter-reset-btn");

    if (sportSelect) {
      sportSelect.addEventListener("change", (e) => {
        state.filters.sport = e.target.value;
        renderMatesGrid();
      });
    }

    if (levelSelect) {
      levelSelect.addEventListener("change", (e) => {
        state.filters.level = e.target.value;
        renderMatesGrid();
      });
    }

    if (cityInput) {
      cityInput.addEventListener("input", (e) => {
        state.filters.city = e.target.value.trim().toLowerCase();
        renderMatesGrid();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", resetFilters);
    }

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
    renderMatesGrid();
    renderSportsCatalog();
    renderOpenMatches();
  }
  /**
   * Remplissage des sélecteurs de sports
   */
  function populateSportDropdowns() {
    const filterSportSelect = document.getElementById("filter-sport");
    const addSportSelect = document.getElementById("add-new-sport-select");
    const proposeSportSelect = document.getElementById("propose-sport-select");

    const optionsHtml = INITIAL_SPORTS.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join("");

    if (filterSportSelect) {
      filterSportSelect.innerHTML = `<option value="all">Tous les 14 sports</option>` + optionsHtml;
    }
    if (addSportSelect) {
      addSportSelect.innerHTML = `<option value="">Choisir un sport à ajouter...</option>` + optionsHtml;
    }
    if (proposeSportSelect) {
      proposeSportSelect.innerHTML = optionsHtml;
    }
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
    const filtered = INITIAL_MATES.filter(mate => {
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
      if (state.filters.city) {
        if (!mate.city.toLowerCase().includes(state.filters.city)) {
          return false;
        }
      }
      return true;
    });

    if (countBadge) {
      countBadge.textContent = filtered.length;
    }

    if (filtered.length === 0) {
      container.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
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

      return `
        <div class="bg-mates-card border border-mates-border hover:border-mates-green/60 rounded-3xl p-6 flex flex-col justify-between transition-all hover:-translate-y-1 hover:shadow-xl group">
          <div>
            <!-- En-tête de la carte : photo, prénom/âge, ville -->
            <div class="flex items-center gap-4 mb-4">
              <a href="#mate/${mate.id}" class="relative flex-shrink-0">
                <img src="${mate.avatar}" alt="${mate.firstName}" class="w-16 h-16 rounded-full object-cover ring-2 ring-mates-border group-hover:ring-mates-green transition-all">
                <span class="absolute bottom-0 right-0 w-4 h-4 bg-mates-green rounded-full border-2 border-mates-card" title="Disponible pour jouer"></span>
              </a>
              <div class="overflow-hidden">
                <a href="#mate/${mate.id}" class="text-lg font-bold text-white group-hover:text-mates-green transition-colors flex items-center gap-1.5">
                  <span>${mate.firstName}, ${mate.age} ans</span>
                  <i data-lucide="badge-check" class="w-4 h-4 text-mates-green flex-shrink-0"></i>
                </a>
                <div class="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <i data-lucide="map-pin" class="w-3.5 h-3.5 text-mates-green"></i>
                  <span>${mate.city} • à ${mate.distanceKm} km</span>
                </div>
              </div>
            </div>

            <!-- Bio -->
            <p class="text-xs text-slate-300 leading-relaxed mb-4 line-clamp-2">
              "${mate.bio}"
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

  function resetFilters() {
    state.filters = { sport: "all", level: "all", city: "" };
    const s = document.getElementById("filter-sport");
    const l = document.getElementById("filter-level");
    const c = document.getElementById("filter-city");
    if (s) s.value = "all";
    if (l) l.value = "all";
    if (c) c.value = "";
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
            <button onclick="MatesApp.filterMatesForSport('${sport.id}')" class="btn-neon text-sm py-3 px-5 shadow-lg">
              <i data-lucide="users" class="w-4 h-4"></i>
              <span>Filtrer les mates</span>
            </button>
            <button onclick="MatesApp.openBookingModal('${sport.name}')" class="btn-outline-neon text-sm py-3 px-5">
              <i data-lucide="calendar" class="w-4 h-4"></i>
              <span>Réserver un terrain</span>
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

    // Action filter button
    const actionBtn = document.getElementById("sport-filter-action-btn");
    if (actionBtn) {
      actionBtn.onclick = () => filterMatesForSport(sport.id);
    }

    // Grille de cartes mates filtrées sur ce sport (Wireframe 4)
    const matesGrid = document.getElementById("sport-mates-grid");
    if (matesGrid) {
      const sportMates = INITIAL_MATES.filter(m => m.sports.some(s => s.id === sport.id));
      
      if (sportMates.length === 0) {
        matesGrid.innerHTML = `
          <div class="col-span-3 text-center py-10 bg-mates-card rounded-2xl border border-dashed border-mates-border">
            <p class="text-sm text-slate-400">Aucun mate n'est encore enregistré pour ce sport.</p>
          </div>
        `;
      } else {
        matesGrid.innerHTML = sportMates.map(mate => {
          const sportInfo = mate.sports.find(s => s.id === sport.id);
          return `
            <div class="bg-mates-card border border-mates-border rounded-2xl p-5 hover:border-mates-green/60 transition-all flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-3.5 mb-3">
                  <a href="#mate/${mate.id}">
                    <img src="${mate.avatar}" alt="${mate.firstName}" class="w-14 h-14 rounded-full object-cover ring-2 ring-mates-border hover:ring-mates-green transition-all">
                  </a>
                  <div>
                    <a href="#mate/${mate.id}" class="font-bold text-white hover:text-mates-green transition-colors">
                      ${mate.firstName}, ${mate.age} ans
                    </a>
                    <div class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <i data-lucide="map-pin" class="w-3 h-3 text-mates-green"></i>
                      <span>${mate.city} • à ${mate.distanceKm} km</span>
                    </div>
                  </div>
                </div>

                <div class="p-2.5 bg-mates-cardElevated rounded-xl border border-mates-border mb-3 text-xs flex justify-between items-center">
                  <span class="text-slate-300">Niveau ${sport.name} :</span>
                  <span class="font-bold text-mates-green">${sportInfo ? sportInfo.level : 'Intermédiaire'}</span>
                </div>

                <p class="text-xs text-slate-300 line-clamp-2 mb-4">"${mate.bio}"</p>
              </div>

              <div class="pt-3 border-t border-mates-border flex gap-2">
                <a href="#mate/${mate.id}" class="w-1/2 btn-outline-neon py-2 text-xs text-center">Profil</a>
                <button onclick="MatesApp.openProposeMatchModal('${mate.id}')" class="w-1/2 btn-neon py-2 text-xs">Inviter</button>
              </div>
            </div>
          `;
        }).join("");
      }
    }

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
            <button onclick="MatesApp.openBookingModal('${sport.name}')" class="btn-neon text-[11px] py-1.5 px-3">Réserver</button>
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
            <button onclick="MatesApp.openBookingModal('${sport.name}')" class="btn-neon text-[11px] py-1.5 px-3">Réserver</button>
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
            <button onclick="MatesApp.openBookingModal('${sport.name}')" class="btn-neon text-[11px] py-1.5 px-3">Réserver</button>
          </div>
        </div>
      `;
    }

    lucide.createIcons();
  }

  function filterMatesForSport(sportId) {
    state.filters.sport = sportId;
    const select = document.getElementById("filter-sport");
    if (select) select.value = sportId;
    window.location.hash = "#mates";
  }

  /* ==========================================================================
     5. ÉCRAN PROFIL PUBLIC (Wireframe 5)
     ========================================================================== */
  function renderPublicProfile(mateId) {
    let mate = INITIAL_MATES.find(m => m.id === mateId);

    // Si on regarde notre propre profil public
    if (mateId === "my-profile" || mateId === "me") {
      mate = state.userProfile;
    }

    if (!mate) {
      mate = INITIAL_MATES[0];
    }

    state.selectedMateId = mate.id;

    // CARTE IDENTITÉ : photo, nom, âge, ville, bio (Wireframe 5)
    const identityCard = document.getElementById("public-identity-card");
    if (identityCard) {
      identityCard.innerHTML = `
        <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div class="relative flex-shrink-0">
            <img src="${mate.avatar}" alt="${mate.firstName}" class="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl object-cover ring-4 ring-mates-border shadow-2xl">
            <span class="absolute -bottom-2 -right-2 px-3 py-1 bg-mates-green text-black font-extrabold text-xs rounded-full shadow-lg">
              ${mate.reliability || '100%'} Fiable
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
                  <span>${mate.age} ans</span>
                  <span>•</span>
                  <i data-lucide="map-pin" class="w-4 h-4 text-mates-green"></i>
                  <span>${mate.city} ${mate.distanceKm ? `(à ${mate.distanceKm} km)` : ''}</span>
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
              "${mate.bio}"
            </p>

            <!-- Stats -->
            <div class="flex flex-wrap items-center justify-center sm:justify-start gap-6 pt-2 text-xs text-slate-400">
              <div><strong class="text-white text-sm">${mate.matchesPlayed || 12}</strong> matchs joués</div>
              <div><strong class="text-mates-green text-sm">★ ${mate.fairPlayScore || 5.0}</strong> note fair-play</div>
              <div><strong class="text-white text-sm">${mate.sports.length}</strong> sports pratiqués</div>
            </div>
          </div>
        </div>
      `;
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
    if (age) age.value = p.age || 20;
    if (city) city.value = p.city || "Liège";
    if (bio) bio.value = p.bio || "";
    if (avatarPreview) avatarPreview.src = p.avatar || DEFAULT_MY_PROFILE.avatar;
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

  function locateGps() {
    const cityInput = document.getElementById("edit-city");
    showToast("Recherche de la position GPS...", "info");

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Simulation précise pour la région liégeoise / belge
          cityInput.value = "Liège (Centre)";
          showToast("Position GPS détectée : Liège (Centre) !", "success");
        },
        (err) => {
          // Fallback en cas de refus ou sandbox
          cityInput.value = "Liège";
          showToast("Position définie sur : Liège", "success");
        },
        { timeout: 5000 }
      );
    } else {
      cityInput.value = "Liège";
      showToast("Position par défaut : Liège", "info");
    }
  }

  function triggerAvatarChange() {
    const newUrl = prompt("Saisissez l'URL de votre photo de profil :", state.editingProfile.avatar);
    if (newUrl && newUrl.trim()) {
      state.editingProfile.avatar = newUrl.trim();
      const preview = document.getElementById("edit-avatar-preview");
      if (preview) preview.src = newUrl.trim();
      showToast("Photo mise à jour !", "success");
    }
  }

  function saveProfile(event) {
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

    // Enregistrement dans le state et LocalStorage
    state.userProfile = JSON.parse(JSON.stringify(state.editingProfile));
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(state.userProfile));

    renderHeaderUserSection();
    showToast("Profil enregistré avec succès !", "success");

    // Redirection vers le profil public
    setTimeout(() => {
      window.location.hash = "#mate/my-profile";
    }, 800);
  }

  function viewMyPublicProfile() {
    window.location.hash = "#mate/my-profile";
  }

  function logout() {
    state.isAuthenticated = false;
    localStorage.setItem(STORAGE_KEY_AUTH, "false");
    renderHeaderUserSection();
    showToast("Vous avez été déconnecté.", "info");
    window.location.hash = "#home";
  }

  /* ==========================================================================
     7. ÉCRAN CONNEXION / INSCRIPTION (Wireframe 7)
     ========================================================================== */
  function toggleAuthMode() {
    state.authMode = state.authMode === "login" ? "register" : "login";
    updateAuthCard();
  }

  function updateAuthCard() {
    const title = document.getElementById("auth-title");
    const subtitle = document.getElementById("auth-subtitle");
    const nameFields = document.getElementById("auth-name-fields");
    const submitBtn = document.getElementById("auth-submit-btn");
    const toggleQuestion = document.getElementById("auth-toggle-question");
    const toggleBtn = document.getElementById("auth-toggle-btn");

    if (state.authMode === "register") {
      if (title) title.textContent = "Inscription sur Mates";
      if (subtitle) subtitle.textContent = "Crée ton compte et rejoins des matchs en quelques clics.";
      if (nameFields) nameFields.classList.remove("hidden");
      if (submitBtn) submitBtn.innerHTML = `<span>Créer mon compte</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      if (toggleQuestion) toggleQuestion.textContent = "Déjà un compte ?";
      if (toggleBtn) toggleBtn.textContent = "Se connecter";
    } else {
      if (title) title.textContent = "Connexion à Mates";
      if (subtitle) subtitle.textContent = "Rejoins des milliers de sportifs passionnés près de chez toi.";
      if (nameFields) nameFields.classList.add("hidden");
      if (submitBtn) submitBtn.innerHTML = `<span>Se connecter</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      if (toggleQuestion) toggleQuestion.textContent = "Pas encore de compte ?";
      if (toggleBtn) toggleBtn.textContent = "S'inscrire";
    }
    lucide.createIcons();
  }

  function handleGoogleAuth() {
    showToast("Connexion Google simulée...", "info");
    setTimeout(() => {
      loginSuccess("Alexandre", "Deville", "alex.deville@etudiant.helmo.be");
    }, 600);
  }

  function handleAuthSubmit(e) {
    if (e) e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const fn = state.authMode === "register" ? (document.getElementById("auth-firstname").value.trim() || "Nouveau") : "Alexandre";
    const ln = state.authMode === "register" ? (document.getElementById("auth-lastname").value.trim() || "Joueur") : "Deville";

    if (!email) {
      showToast("Veuillez saisir votre email.", "warning");
      return;
    }

    loginSuccess(fn, ln, email);
  }

  function fillDemoAccount() {
    const email = document.getElementById("auth-email");
    const pwd = document.getElementById("auth-password");
    if (email) email.value = "alex.deville@etudiant.helmo.be";
    if (pwd) pwd.value = "••••••••";
    showToast("Coordonnées de test pré-remplies !", "info");
  }

  function loginSuccess(firstName, lastName, email) {
    state.isAuthenticated = true;
    localStorage.setItem(STORAGE_KEY_AUTH, "true");

    if (!state.userProfile) {
      state.userProfile = JSON.parse(JSON.stringify(DEFAULT_MY_PROFILE));
    }
    state.userProfile.firstName = firstName;
    state.userProfile.lastName = lastName;
    state.userProfile.email = email;
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(state.userProfile));

    renderHeaderUserSection();
    showToast(`Bienvenue sur Mates, ${firstName} !`, "success");

    setTimeout(() => {
      window.location.hash = "#edit-profile";
    }, 600);
  }

  /* ==========================================================================
     MATCHS OUVERTS & MODALES (Expérience Playtomic)
     ========================================================================== */
  function renderOpenMatches() {
    const container = document.getElementById("open-matches-list");
    if (!container) return;

    container.innerHTML = state.matches.map(m => {
      const remaining = m.totalSlots - m.bookedSlots;
      const badgeColor = remaining === 1 ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";

      return `
        <div class="bg-mates-card border border-mates-border rounded-3xl p-6 flex flex-col justify-between hover:border-mates-green/60 transition-all hover:shadow-xl">
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <span class="text-3xl">${m.sportIcon}</span>
                <div>
                  <h4 class="font-bold text-white text-base">${m.clubName}</h4>
                  <div class="text-xs text-slate-400">${m.courtName}</div>
                </div>
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-bold border ${badgeColor}">
                Reste ${remaining} place${remaining > 1 ? 's' : ''}
              </span>
            </div>

            <div class="p-3.5 bg-mates-cardElevated rounded-2xl border border-mates-border space-y-2 text-xs">
              <div class="flex justify-between text-slate-300">
                <span>Date & Heure :</span>
                <strong class="text-white">${m.date} • ${m.time}</strong>
              </div>
              <div class="flex justify-between text-slate-300">
                <span>Niveau attendu :</span>
                <strong class="text-mates-green">${m.levelRequired}</strong>
              </div>
              <div class="flex justify-between text-slate-300">
                <span>Prix :</span>
                <strong class="text-white">${m.pricePerPerson}</strong>
              </div>
            </div>

            <div>
              <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Joueurs (${m.bookedSlots}/${m.totalSlots}) :</div>
              <div class="flex items-center gap-2">
                ${m.players.map(p => `
                  <div class="w-8 h-8 rounded-full bg-slate-700 border border-mates-green flex items-center justify-center text-[10px] font-bold text-white overflow-hidden" title="${p.name}">
                    ${p.avatar ? `<img src="${p.avatar}" class="w-full h-full object-cover">` : p.name.substring(0, 2)}
                  </div>
                `).join("")}
                ${Array(remaining).fill(0).map(() => `
                  <div class="w-8 h-8 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center text-xs text-slate-500 font-bold">
                    +
                  </div>
                `).join("")}
              </div>
            </div>
          </div>

          <div class="pt-5 border-t border-mates-border mt-4">
            <button onclick="MatesApp.openJoinModal('${m.id}')" class="w-full btn-neon py-2.5 text-xs">
              <span>Rejoindre le match</span>
              <i data-lucide="check" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");

    lucide.createIcons();
  }

  function openJoinModal(matchId) {
    const match = state.matches.find(m => m.id === matchId) || state.matches[0];
    state.pendingJoinMatchId = match.id;

    const modal = document.getElementById("join-match-modal");
    const title = document.getElementById("modal-match-title");
    const details = document.getElementById("modal-match-details");
    const time = document.getElementById("modal-match-time");
    const price = document.getElementById("modal-match-price");

    if (title) title.textContent = `Match de ${match.sportName} • ${match.clubName}`;
    if (details) details.textContent = `${match.courtName} • Niveau ${match.levelRequired}`;
    if (time) time.textContent = `${match.date} • ${match.time}`;
    if (price) price.textContent = match.pricePerPerson;

    if (modal) modal.classList.remove("hidden");
    lucide.createIcons();
  }

  function confirmJoinMatch() {
    const match = state.matches.find(m => m.id === state.pendingJoinMatchId);
    if (match) {
      if (match.bookedSlots < match.totalSlots) {
        match.bookedSlots += 1;
        match.players.push({
          name: state.userProfile ? state.userProfile.firstName : "Moi",
          avatar: state.userProfile ? state.userProfile.avatar : null
        });
        localStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(state.matches));
        renderOpenMatches();
      }
    }
    closeModals();
    showToast("Votre place est réservée ! À vos baskets.", "success");
  }

  function openProposeMatchModal(mateId) {
    const mate = INITIAL_MATES.find(m => m.id === mateId);
    if (!mate) return;

    state.pendingProposeMateId = mate.id;
    const modal = document.getElementById("propose-match-modal");
    const title = document.getElementById("propose-modal-title");

    if (title) title.textContent = `Proposer une partie à ${mate.firstName}`;

    // Mettre les sports de ce mate en suggestion
    const sportSelect = document.getElementById("propose-sport-select");
    if (sportSelect) {
      sportSelect.innerHTML = mate.sports.map(s => `<option value="${s.id}">🎾 ${s.name} (${s.level})</option>`).join("");
    }

    if (modal) modal.classList.remove("hidden");
    lucide.createIcons();
  }

  function sendMatchInvitation() {
    closeModals();
    showToast("Invitation envoyée au mate avec succès !", "success");
  }

  function openBookingModal(sportName) {
    showToast(`Ouverture des créneaux disponibles pour ${sportName}...`, "info");
    setTimeout(() => {
      window.location.hash = "#matches";
    }, 400);
  }

  function openCreateMatchModal() {
    showToast("Fonctionnalité : Création d'un match ouvert", "info");
    const sport = prompt("Quel sport souhaitez-vous organiser ? (ex: Padel, Football Five, Tennis)", "Padel");
    if (!sport) return;

    const newMatch = {
      id: "match-" + (state.matches.length + 1),
      sportId: sport.toLowerCase(),
      sportName: sport,
      sportIcon: "🎾",
      clubName: "Complexe Liège Centre",
      courtName: "Court Principal",
      date: "Ce week-end",
      time: "18:00 - 19:30",
      levelRequired: "Tous niveaux",
      pricePerPerson: "9 €",
      totalSlots: 4,
      bookedSlots: 1,
      host: { name: state.userProfile.firstName, avatar: state.userProfile.avatar },
      players: [{ name: state.userProfile.firstName, avatar: state.userProfile.avatar }]
    };

    state.matches.unshift(newMatch);
    localStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(state.matches));
    renderOpenMatches();
    showToast("Votre match ouvert a été publié !", "success");
  }

  function closeModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.add("hidden"));
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
    handleGoogleAuth,
    handleAuthSubmit,
    fillDemoAccount,
    locateGps,
    triggerAvatarChange,
    addSportToProfile,
    removeSportFromProfile,
    updateSportLevel,
    toggleEditSlot,
    openJoinModal,
    confirmJoinMatch,
    openProposeMatchModal,
    sendMatchInvitation,
    openBookingModal,
    openCreateMatchModal,
    closeModals,
    showToast
  };
})();

// Démarrage au chargement du DOM
document.addEventListener("DOMContentLoaded", () => {
  MatesApp.init();
});
