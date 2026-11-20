/**
 * Données de base de l'application Mates
 * 14 Sports, Profils de Mates, Matchs ouverts et Données d'analyse
 */

const INITIAL_SPORTS = [
  {
    id: "padel",
    name: "Padel",
    icon: "🎾",
    slug: "padel",
    playersPerMatch: "4 joueurs (2 vs 2)",
    duration: "60 - 90 min",
    category: "Raquette",
    slogan: "Le sport de raquette le plus convivial. 4 joueurs, du rythme et du pur plaisir !",
    description: "Mélange détonant de tennis et de squash avec parois vitrées. Rapide à prendre en main, ultra convivial et parfait pour se dépenser entre potes.",
    venuesCount: 18,
    activeMatesCount: 420,
    popularIn: "Liège, Bruxelles, Namur, Wavre",
    accentColor: "#bef264"
  },
  {
    id: "football",
    name: "Football",
    icon: "⚽",
    slug: "football",
    playersPerMatch: "10 joueurs (Five) ou 14 (Seven)",
    duration: "60 min",
    category: "Collectif",
    slogan: "Trouve ton 5e ou rejoins une team sur terrain synthétique indoor ou outdoor.",
    description: "Foot à 5 (UrbanSoccer / Five) ou foot classique. Ne repousse plus jamais un match parce qu'il manque un gardien ou un attaquant !",
    venuesCount: 24,
    activeMatesCount: 780,
    popularIn: "Liège, Bruxelles, Charleroi, Liège-Angleur",
    accentColor: "#22c55e"
  },
  {
    id: "tennis",
    name: "Tennis",
    icon: "🎾",
    slug: "tennis",
    playersPerMatch: "2 ou 4 joueurs",
    duration: "60 - 90 min",
    category: "Raquette",
    slogan: "Simples ou doubles, trouve un joueur de ton classement sur terre ou résine.",
    description: "Sur surface rapide, terre battue ou synthétique. Affronte des partenaires réguliers calibrés exactement sur ton niveau technique.",
    venuesCount: 15,
    activeMatesCount: 310,
    popularIn: "Liège, Sart-Tilman, Louvain-la-Neuve",
    accentColor: "#84cc16"
  },
  {
    id: "basketball",
    name: "Basket-ball",
    icon: "🏀",
    slug: "basketball",
    playersPerMatch: "6 joueurs (3x3) ou 10 (5x5)",
    duration: "45 - 60 min",
    category: "Collectif",
    slogan: "Du playground urbain au parquet en salle, forme ton 3x3 n'importe quel jour.",
    description: "Ambiance streetball ou match officiel en salle. Rejoins des pick-up games locaux et enchaîne les paniers sans prise de tête.",
    venuesCount: 12,
    activeMatesCount: 290,
    popularIn: "Liège Centre, Bruxelles, Namur",
    accentColor: "#f97316"
  },
  {
    id: "badminton",
    name: "Badminton",
    icon: "🏸",
    slug: "badminton",
    playersPerMatch: "2 ou 4 joueurs",
    duration: "60 min",
    category: "Raquette",
    slogan: "Le sport le plus rapide du monde pour brûler des calories à toute allure.",
    description: "Réflexes éclair, cardio à bloc et amortis millimétrés. Idéal après le boulot ou les cours pour une séance intense et dynamique.",
    venuesCount: 11,
    activeMatesCount: 215,
    popularIn: "Liège, Rocourt, Bruxelles",
    accentColor: "#06b6d4"
  },
  {
    id: "volleyball",
    name: "Volley-ball",
    icon: "🏐",
    slug: "volleyball",
    playersPerMatch: "4 à 12 joueurs",
    duration: "60 - 90 min",
    category: "Collectif",
    slogan: "Salle ou beach-volley, partage de l'énergie et des smashs spectaculaires.",
    description: "Pour les adeptes du jeu en équipe, passes précises et contres au filet. Disponible en gymnase couvert ou sur sable l'été.",
    venuesCount: 8,
    activeMatesCount: 165,
    popularIn: "Liège, Bruxelles, Namur",
    accentColor: "#eab308"
  },
  {
    id: "running",
    name: "Running",
    icon: "🏃‍♂️",
    slug: "running",
    playersPerMatch: "Groupes de 2 à 15",
    duration: "45 - 75 min",
    category: "Endurance",
    slogan: "Ne cours plus jamais seul : sorties collectives, fractionné et prépa trail.",
    description: "De la simple boucle de 5 km pour reprendre en douceur jusqu'aux sorties longues le dimanche matin le long de la Meuse ou en forêt.",
    venuesCount: 9,
    activeMatesCount: 540,
    popularIn: "Liège (Bords de Meuse), Bruxelles (Bois de la Cambre)",
    accentColor: "#10b981"
  },
  {
    id: "escalade",
    name: "Escalade",
    icon: "🧗",
    slug: "escalade",
    playersPerMatch: "2 joueurs (voie) ou solo / groupe (bloc)",
    duration: "90 - 120 min",
    category: "Agilité",
    slogan: "Trouve ton assureur pour la voie ou partage des sessions bloc stimulantes.",
    description: "Salles de bloc ouvertes et murs de cordes. Trouve un assureur de confiance du même gabarit et dépasse tes plafonds de cotation.",
    venuesCount: 7,
    activeMatesCount: 195,
    popularIn: "Liège (Top Rock), Louvain-la-Neuve, Bruxelles",
    accentColor: "#f43f5e"
  },
  {
    id: "squash",
    name: "Squash",
    icon: "🎾",
    slug: "squash",
    playersPerMatch: "2 joueurs",
    duration: "45 min",
    category: "Raquette",
    slogan: "45 minutes non-stop d'intensité pure pour se vider la tête.",
    description: "Un court clos, une balle noire et un rythme effréné. Idéal pour ceux qui recherchent une dépense cardio maximale en un temps record.",
    venuesCount: 6,
    activeMatesCount: 140,
    popularIn: "Liège, Bruxelles, Wavre",
    accentColor: "#a855f7"
  },
  {
    id: "pingpong",
    name: "Tennis de table",
    icon: "🏓",
    slug: "pingpong",
    playersPerMatch: "2 ou 4 joueurs",
    duration: "45 - 60 min",
    category: "Précision",
    slogan: "Topspin, slice et batailles de réflexes à la table.",
    description: "Que ce soit sur des tables de club ou en extérieur dans un parc au soleil, défie des mates pour des parties fun et disputées.",
    venuesCount: 10,
    activeMatesCount: 180,
    popularIn: "Liège, Namur, Mons",
    accentColor: "#3b82f6"
  },
  {
    id: "rugby",
    name: "Rugby",
    icon: "🏉",
    slug: "rugby",
    playersPerMatch: "10 à 14 joueurs",
    duration: "60 - 80 min",
    category: "Collectif",
    slogan: "Touch rugby, rugby à 7 ou entraînement aux valeurs collectives fortes.",
    description: "Sans placage violent pour les sessions loisir (touch rugby) ou entraînement physique complet. Solidarité et 3e mi-temps garanties.",
    venuesCount: 5,
    activeMatesCount: 110,
    popularIn: "Liège, Bruxelles, Ottignies",
    accentColor: "#14b8a6"
  },
  {
    id: "handball",
    name: "Handball",
    icon: "🤾",
    slug: "handball",
    playersPerMatch: "12 à 14 joueurs",
    duration: "60 min",
    category: "Collectif",
    slogan: "Puissance, tactique et roucoulettes dans la zone des 9 mètres.",
    description: "Sport collectif spectaculaire nécessitant cohésion et esprit d'équipe. Rejoins des matchs organisés en salle par les clubs partenaires.",
    venuesCount: 6,
    activeMatesCount: 95,
    popularIn: "Liège, Herstal, Visé, Bruxelles",
    accentColor: "#ec4899"
  },
  {
    id: "fitness",
    name: "Fitness & Muscu",
    icon: "🏋️",
    slug: "fitness",
    playersPerMatch: "2 à 4 mates",
    duration: "60 - 90 min",
    category: "Force",
    slogan: "Un binôme pour se motiver à la salle, t'assurer au développé couché et progresser.",
    description: "Finis les entraînements en solo où l'on hésite à charger la barre. Trouve un partenaire régulier pour garder le cap et dépasser tes objectifs.",
    venuesCount: 22,
    activeMatesCount: 620,
    popularIn: "Liège, Bruxelles, Namur, Mons",
    accentColor: "#e11d48"
  },
  {
    id: "natation",
    name: "Natation",
    icon: "🏊‍♂️",
    slug: "natation",
    playersPerMatch: "2 à 6 nageurs",
    duration: "45 - 60 min",
    category: "Aquatique",
    slogan: "Longueurs en couloir dédié ou sessions eau libre en groupe.",
    description: "Nage sportive, travail technique ou récupération active. Motivez-vous mutuellement pour enchaîner les 50 mètres de bon matin.",
    venuesCount: 8,
    activeMatesCount: 150,
    popularIn: "Liège (Outremeuse, Sart-Tilman), Bruxelles",
    accentColor: "#0284c7"
  }
];

// Matrice des jours et créneaux (pour le wireframe 5 & 6)
const DAYS_OF_WEEK = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const TIME_SLOTS = [
  { id: "matin", label: "Matin (08h - 12h)" },
  { id: "midi", label: "Midi (12h - 14h)" },
  { id: "apresmidi", label: "Après-midi (14h - 18h)" },
  { id: "soir", label: "Soir (18h - 22h)" }
];

// 12 Profils de Mates réalistes avec villes locales (Liège / Belgique / environs)
const INITIAL_MATES = [
  {
    id: "mate-1",
    firstName: "Thomas",
    lastName: "Lambert",
    age: 23,
    city: "Liège",
    distanceKm: 1.8,
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80",
    bio: "Étudiant à HELMo, passionné de sports de raquette ! Je joue au padel 2x par semaine et je cherche un 4e joueur pour des parties intenses le soir.",
    sports: [
      { id: "padel", name: "Padel", level: "Confirmé", rating: 4 },
      { id: "football", name: "Football", level: "Intermédiaire", rating: 3 },
      { id: "running", name: "Running", level: "Débutant", rating: 2 }
    ],
    matchesPlayed: 48,
    reliability: "99%",
    fairPlayScore: 4.9,
    // Matrice [jour][créneau]: true si dispo
    availability: {
      "Lundi": ["soir"],
      "Mardi": ["midi", "soir"],
      "Mercredi": ["apresmidi", "soir"],
      "Jeudi": ["soir"],
      "Vendredi": ["soir"],
      "Samedi": ["matin", "apresmidi"],
      "Dimanche": ["matin", "midi"]
    }
  },
  {
    id: "mate-2",
    firstName: "Camille",
    lastName: "Dubois",
    age: 25,
    city: "Bruxelles",
    distanceKm: 8.4,
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
    bio: "Grande adepte de tennis et de running. J'adore les sorties rythmées au Bois de la Cambre et les matchs accrochés le week-end.",
    sports: [
      { id: "tennis", name: "Tennis", level: "Expert", rating: 5 },
      { id: "running", name: "Running", level: "Confirmé", rating: 4 },
      { id: "padel", name: "Padel", level: "Intermédiaire", rating: 3 }
    ],
    matchesPlayed: 62,
    reliability: "100%",
    fairPlayScore: 5.0,
    availability: {
      "Lundi": ["matin"],
      "Mardi": ["soir"],
      "Mercredi": ["matin", "soir"],
      "Jeudi": ["midi"],
      "Vendredi": ["soir"],
      "Samedi": ["matin", "midi", "apresmidi"],
      "Dimanche": ["matin", "soir"]
    }
  },
  {
    id: "mate-3",
    firstName: "Julien",
    lastName: "Renard",
    age: 27,
    city: "Liège",
    distanceKm: 2.3,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
    bio: "Gardien ou joueur de champ en Foot Five. Toujours chaud pour un match le mardi ou jeudi soir à Angleur ou Rocourt !",
    sports: [
      { id: "football", name: "Football", level: "Confirmé", rating: 4 },
      { id: "badminton", name: "Badminton", level: "Intermédiaire", rating: 3 },
      { id: "fitness", name: "Fitness & Muscu", level: "Confirmé", rating: 4 }
    ],
    matchesPlayed: 74,
    reliability: "98%",
    fairPlayScore: 4.8,
    availability: {
      "Lundi": ["soir"],
      "Mardi": ["soir"],
      "Mercredi": ["soir"],
      "Jeudi": ["soir"],
      "Vendredi": ["midi", "soir"],
      "Samedi": ["apresmidi", "soir"],
      "Dimanche": ["soir"]
    }
  },
  {
    id: "mate-4",
    firstName: "Sarah",
    lastName: "Vandamme",
    age: 22,
    city: "Namur",
    distanceKm: 14.0,
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
    bio: "Grimpeuse passionnée de bloc et falaise. En recherche d'un mate motivé pour progresser dans le 6b/6c et partager de bonnes sessions.",
    sports: [
      { id: "escalade", name: "Escalade", level: "Confirmé", rating: 4 },
      { id: "natation", name: "Natation", level: "Intermédiaire", rating: 3 },
      { id: "running", name: "Running", level: "Intermédiaire", rating: 3 }
    ],
    matchesPlayed: 39,
    reliability: "100%",
    fairPlayScore: 4.9,
    availability: {
      "Lundi": ["apresmidi"],
      "Mardi": ["soir"],
      "Mercredi": ["midi", "soir"],
      "Jeudi": ["soir"],
      "Vendredi": ["apresmidi", "soir"],
      "Samedi": ["matin", "apresmidi", "soir"],
      "Dimanche": ["apresmidi"]
    }
  },
  {
    id: "mate-5",
    firstName: "Maxime",
    lastName: "Clément",
    age: 29,
    city: "Liège",
    distanceKm: 3.1,
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
    bio: "Joueur de basket 3x3 et squash. Ambiance dynamique, zéro prise de tête, que du beau jeu et de l'énergie à revendre.",
    sports: [
      { id: "basketball", name: "Basket-ball", level: "Expert", rating: 5 },
      { id: "squash", name: "Squash", level: "Confirmé", rating: 4 },
      { id: "padel", name: "Padel", level: "Débutant", rating: 2 }
    ],
    matchesPlayed: 53,
    reliability: "96%",
    fairPlayScore: 4.9,
    availability: {
      "Lundi": ["midi", "soir"],
      "Mardi": ["matin"],
      "Mercredi": ["soir"],
      "Jeudi": ["midi", "soir"],
      "Vendredi": ["soir"],
      "Samedi": ["apresmidi"],
      "Dimanche": ["matin", "apresmidi"]
    }
  },
  {
    id: "mate-6",
    firstName: "Elena",
    lastName: "Moreau",
    age: 24,
    city: "Bruxelles",
    distanceKm: 6.7,
    avatar: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=400&q=80",
    bio: "Padel addict ! Niveau 4 en compétition. Je cherche des partenaires pour des matchs réguliers en semaine sur Bruxelles ou Brabant Wallon.",
    sports: [
      { id: "padel", name: "Padel", level: "Expert", rating: 5 },
      { id: "tennis", name: "Tennis", level: "Confirmé", rating: 4 },
      { id: "fitness", name: "Fitness & Muscu", level: "Intermédiaire", rating: 3 }
    ],
    matchesPlayed: 88,
    reliability: "100%",
    fairPlayScore: 5.0,
    availability: {
      "Lundi": ["soir"],
      "Mardi": ["soir"],
      "Mercredi": ["soir"],
      "Jeudi": ["soir"],
      "Vendredi": ["midi", "soir"],
      "Samedi": ["matin", "midi"],
      "Dimanche": ["soir"]
    }
  },
  {
    id: "mate-7",
    firstName: "Antoine",
    lastName: "Dupont",
    age: 26,
    city: "Charleroi",
    distanceKm: 18.2,
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80",
    bio: "Volleyeur de club en recherche de tournois et matchs amicaux le weekend. Chaud aussi pour du beach-volley dès les premiers rayons de soleil.",
    sports: [
      { id: "volleyball", name: "Volley-ball", level: "Confirmé", rating: 4 },
      { id: "rugby", name: "Rugby", level: "Intermédiaire", rating: 3 },
      { id: "fitness", name: "Fitness & Muscu", level: "Confirmé", rating: 4 }
    ],
    matchesPlayed: 41,
    reliability: "97%",
    fairPlayScore: 4.8,
    availability: {
      "Lundi": ["soir"],
      "Mardi": ["apresmidi"],
      "Mercredi": ["soir"],
      "Jeudi": ["soir"],
      "Vendredi": ["soir"],
      "Samedi": ["matin", "apresmidi", "soir"],
      "Dimanche": ["apresmidi", "soir"]
    }
  },
  {
    id: "mate-8",
    firstName: "Chloé",
    lastName: "Martin",
    age: 21,
    city: "Liège",
    distanceKm: 0.9,
    avatar: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
    bio: "Reprise du sport en douceur ! Débutante motivée en badminton et natation. Je cherche une personne sympa pour progresser ensemble.",
    sports: [
      { id: "badminton", name: "Badminton", level: "Débutant", rating: 1 },
      { id: "natation", name: "Natation", level: "Débutant", rating: 2 },
      { id: "running", name: "Running", level: "Débutant", rating: 1 }
    ],
    matchesPlayed: 12,
    reliability: "100%",
    fairPlayScore: 4.9,
    availability: {
      "Lundi": ["matin", "midi"],
      "Mardi": ["midi"],
      "Mercredi": ["matin", "apresmidi"],
      "Jeudi": ["midi"],
      "Vendredi": ["matin"],
      "Samedi": ["matin"],
      "Dimanche": ["matin", "midi"]
    }
  },
  {
    id: "mate-9",
    firstName: "Lucas",
    lastName: "Simon",
    age: 28,
    city: "Liège",
    distanceKm: 3.4,
    avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80",
    bio: "Passionné de ping-pong et de squash. Matchs rapides entre midi et deux ou en fin de journée pour décompresser.",
    sports: [
      { id: "pingpong", name: "Tennis de table", level: "Expert", rating: 5 },
      { id: "squash", name: "Squash", level: "Confirmé", rating: 4 },
      { id: "football", name: "Football", level: "Intermédiaire", rating: 3 }
    ],
    matchesPlayed: 57,
    reliability: "99%",
    fairPlayScore: 4.9,
    availability: {
      "Lundi": ["midi"],
      "Mardi": ["midi", "soir"],
      "Mercredi": ["midi"],
      "Jeudi": ["midi", "soir"],
      "Vendredi": ["midi"],
      "Samedi": ["apresmidi"],
      "Dimanche": ["soir"]
    }
  },
  {
    id: "mate-10",
    firstName: "Inès",
    lastName: "Belhadj",
    age: 24,
    city: "Bruxelles",
    distanceKm: 5.2,
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    bio: "Joueuse de hand et fitness girl. Toujours partante pour une grosse session de fractionné ou un match d'équipe avec bonne humeur.",
    sports: [
      { id: "handball", name: "Handball", level: "Confirmé", rating: 4 },
      { id: "fitness", name: "Fitness & Muscu", level: "Expert", rating: 5 },
      { id: "running", name: "Running", level: "Confirmé", rating: 4 }
    ],
    matchesPlayed: 46,
    reliability: "100%",
    fairPlayScore: 5.0,
    availability: {
      "Lundi": ["matin", "soir"],
      "Mardi": ["soir"],
      "Mercredi": ["soir"],
      "Jeudi": ["matin", "soir"],
      "Vendredi": ["soir"],
      "Samedi": ["matin", "apresmidi"],
      "Dimanche": ["matin"]
    }
  },
  {
    id: "mate-11",
    firstName: "Nathan",
    lastName: "Lefebvre",
    age: 22,
    city: "Namur",
    distanceKm: 11.5,
    avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80",
    bio: "Padel & Foot à 5. J'adore l'ambiance des tournois du dimanche et rencontrer de nouveaux mates motivés.",
    sports: [
      { id: "padel", name: "Padel", level: "Intermédiaire", rating: 3 },
      { id: "football", name: "Football", level: "Confirmé", rating: 4 },
      { id: "tennis", name: "Tennis", level: "Intermédiaire", rating: 3 }
    ],
    matchesPlayed: 35,
    reliability: "98%",
    fairPlayScore: 4.8,
    availability: {
      "Lundi": ["soir"],
      "Mardi": ["soir"],
      "Mercredi": ["apresmidi"],
      "Jeudi": ["soir"],
      "Vendredi": ["soir"],
      "Samedi": ["matin", "apresmidi", "soir"],
      "Dimanche": ["apresmidi", "soir"]
    }
  },
  {
    id: "mate-12",
    firstName: "Romain",
    lastName: "Wouters",
    age: 31,
    city: "Liège",
    distanceKm: 2.7,
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80",
    bio: "Adepte de cross-training, rugby et padel. Je privilégie le fair-play et les belles rencontres sportives.",
    sports: [
      { id: "rugby", name: "Rugby", level: "Expert", rating: 5 },
      { id: "padel", name: "Padel", level: "Intermédiaire", rating: 3 },
      { id: "fitness", name: "Fitness & Muscu", level: "Confirmé", rating: 4 }
    ],
    matchesPlayed: 79,
    reliability: "100%",
    fairPlayScore: 5.0,
    availability: {
      "Lundi": ["midi"],
      "Mardi": ["soir"],
      "Mercredi": ["midi", "soir"],
      "Jeudi": ["soir"],
      "Vendredi": ["soir"],
      "Samedi": ["matin", "apresmidi"],
      "Dimanche": ["matin", "midi"]
    }
  }
];

// Matchs ouverts. Les dates sont calculées au chargement (« day » relatif à aujourd'hui),
// pour que la démo reste toujours à jour.
//   day : 0 = aujourd'hui, 1 = demain, "sat" / "sun" = samedi / dimanche qui vient
const AVATAR = {
  thomas: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80",
  elena: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80",
  romain: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80",
  julien: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
  camille: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80",
  maxime: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  nathan: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80",
  ines: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80",
  sarah: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80",
  chloe: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80",
  lucas: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=200&q=80"
};

const INITIAL_OPEN_MATCHES = [
  {
    id: "match-1",
    sportId: "padel",
    title: "Padel 2 vs 2",
    clubName: "Padel Club Liège Belle-Île",
    courtName: "Terrain 2 (panoramique)",
    city: "Liège",
    day: 0, start: "19:00", durationMin: 90,
    levelRequired: "Intermédiaire (Nv. 3 - 4)",
    price: 10,
    payment: "Paiement sur place ou via l'app",
    courtBooked: true,
    totalSlots: 4,
    outdoor: false,
    amenities: ["balls", "racket", "showers", "parking"],
    players: [
      { name: "Thomas L.", avatar: AVATAR.thomas, mateId: "mate-1" },
      { name: "Elena M.", avatar: AVATAR.elena, mateId: "mate-6" },
      { name: "Romain W.", avatar: AVATAR.romain, mateId: "mate-12" }
    ],
    chat: [
      { author: "Thomas L.", avatar: AVATAR.thomas, text: "J'ai pris des balles neuves, rendez-vous 10 min avant à l'accueil !", ago: 95 },
      { author: "Elena M.", avatar: AVATAR.elena, text: "Top ! Je prends une raquette en prêt sur place 🎾", ago: 40 }
    ]
  },
  {
    id: "match-2",
    sportId: "football",
    title: "Foot à 5 entre potes",
    clubName: "Five Arena Rocourt",
    courtName: "Terrain synthétique 1",
    city: "Liège",
    day: 1, start: "20:00", durationMin: 60,
    levelRequired: "Tous niveaux",
    price: 8,
    payment: "Paiement sur place ou via l'app",
    courtBooked: true,
    totalSlots: 10,
    outdoor: true,
    amenities: ["balls", "showers", "parking"],
    players: [
      { name: "Julien R.", avatar: AVATAR.julien, mateId: "mate-3" },
      { name: "Nathan L.", avatar: AVATAR.nathan, mateId: "mate-11" },
      { name: "Maxime C.", avatar: AVATAR.maxime, mateId: "mate-5" },
      { name: "Sami B." }, { name: "Arnaud K." }, { name: "Mehdi T." },
      { name: "Alex V." }, { name: "Cédric D." }
    ],
    chat: [
      { author: "Julien R.", avatar: AVATAR.julien, text: "On joue chasubles orange contre noires. Il nous manque encore 2 joueurs !", ago: 300 }
    ]
  },
  {
    id: "match-3",
    sportId: "tennis",
    title: "Simple en terre battue",
    clubName: "Royal Tennis Club de Liège",
    courtName: "Court terre battue n°4",
    city: "Liège",
    day: "sat", start: "10:30", durationMin: 90,
    levelRequired: "Confirmé (Nv. 4)",
    price: 12,
    payment: "Paiement via l'app à la confirmation",
    courtBooked: false,
    totalSlots: 2,
    outdoor: true,
    amenities: ["showers", "parking"],
    players: [
      { name: "Camille D.", avatar: AVATAR.camille, mateId: "mate-2" }
    ],
    chat: []
  },
  {
    id: "match-4",
    sportId: "basketball",
    title: "3x3 sur le playground",
    clubName: "Playground de la Boverie",
    courtName: "Terrain public extérieur",
    city: "Liège",
    day: 0, start: "18:30", durationMin: 75,
    levelRequired: "Tous niveaux",
    price: 0,
    payment: "Terrain public gratuit",
    courtBooked: true,
    totalSlots: 6,
    outdoor: true,
    amenities: ["balls"],
    players: [
      { name: "Maxime C.", avatar: AVATAR.maxime, mateId: "mate-5" },
      { name: "Lucas S.", avatar: AVATAR.lucas, mateId: "mate-9" },
      { name: "Yanis O." }, { name: "Hugo P." }
    ],
    chat: [
      { author: "Maxime C.", avatar: AVATAR.maxime, text: "J'amène le ballon, on fait des équipes sur place 🏀", ago: 60 }
    ]
  },
  {
    id: "match-5",
    sportId: "running",
    title: "Sortie 10 km tranquille",
    clubName: "Bois de la Cambre",
    courtName: "Départ : entrée avenue Louise",
    city: "Bruxelles",
    day: "sun", start: "08:30", durationMin: 60,
    levelRequired: "Débutant à intermédiaire",
    price: 0,
    payment: "Gratuit",
    courtBooked: true,
    totalSlots: 8,
    outdoor: true,
    amenities: ["parking"],
    players: [
      { name: "Inès B.", avatar: AVATAR.ines, mateId: "mate-10" },
      { name: "Camille D.", avatar: AVATAR.camille, mateId: "mate-2" },
      { name: "Sofia R." }
    ],
    chat: [
      { author: "Inès B.", avatar: AVATAR.ines, text: "Allure 6:00/km, personne n'est laissé derrière !", ago: 720 }
    ]
  },
  {
    id: "match-6",
    sportId: "badminton",
    title: "Double mixte",
    clubName: "Hall omnisports de Jambes",
    courtName: "Terrain 3",
    city: "Namur",
    day: 1, start: "19:00", durationMin: 60,
    levelRequired: "Débutant (Nv. 1 - 2)",
    price: 6,
    payment: "Paiement sur place",
    courtBooked: false,
    totalSlots: 4,
    outdoor: false,
    amenities: ["racket", "showers", "parking"],
    players: [
      { name: "Sarah V.", avatar: AVATAR.sarah, mateId: "mate-4" },
      { name: "Nathan L.", avatar: AVATAR.nathan, mateId: "mate-11" }
    ],
    chat: []
  }
];

// Équipements / services sur place
const AMENITIES = {
  balls: { icon: "circle-dot", label: "Balles / ballon fournis" },
  racket: { icon: "swords", label: "Prêt de raquette possible" },
  showers: { icon: "shower-head", label: "Douches & vestiaires" },
  parking: { icon: "car", label: "Parking gratuit" }
};

// Coordonnées pour la météo (Open-Meteo, sans clé)
const CITY_COORDS = {
  "liege": { lat: 50.6326, lon: 5.5797 },
  "bruxelles": { lat: 50.8503, lon: 4.3517 },
  "namur": { lat: 50.4674, lon: 4.8718 },
  "charleroi": { lat: 50.4108, lon: 4.4446 }
};

// Profil de l'utilisateur connecté par défaut (éditable dans l'écran 6)
const DEFAULT_MY_PROFILE = {
  id: "my-profile",
  isLoggedIn: true,
  firstName: "Alexandre",
  lastName: "Deville",
  email: "alex.deville@etudiant.helmo.be",
  age: 23,
  city: "Liège",
  avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80",
  bio: "Étudiant passionné de sport. Je cherche des mates motivés pour des sessions de padel, de Five ou de badminton en région liégeoise !",
  sports: [
    { id: "padel", name: "Padel", level: "Intermédiaire", rating: 3 },
    { id: "football", name: "Football", level: "Confirmé", rating: 4 },
    { id: "badminton", name: "Badminton", level: "Débutant", rating: 2 }
  ],
  matchesPlayed: 19,
  reliability: "100%",
  fairPlayScore: 5.0,
  availability: {
    "Lundi": ["soir"],
    "Mardi": ["midi", "soir"],
    "Mercredi": ["soir"],
    "Jeudi": ["soir"],
    "Vendredi": ["apresmidi", "soir"],
    "Samedi": ["matin", "apresmidi"],
    "Dimanche": ["matin"]
  }
};

// ---------------------------------------------------------------------------
// Confiance, progression et succès des profils de démonstration
// (bios locales, ponctualité, niveau Mates sur 5, 3 derniers matchs…)
// ---------------------------------------------------------------------------
const MATE_EXTRAS = {
  "mate-1": {
    bio: "Joue au padel à Belle-Île 2x/semaine, dispo après 18h. Je cherche un 4e régulier pour des parties rythmées, niveau 3-4.",
    punctuality: 100, levelScore: 3.8, levelTrend: 0.2, matchesOrganized: 14, earlyMatches: 1, liveTonight: true,
    recent: [
      { sport: "Padel", result: "V", score: "6-4 6-3", when: "Mardi" },
      { sport: "Padel", result: "V", score: "7-5 6-4", when: "Samedi" },
      { sport: "Football", result: "D", score: "4-6", when: "Jeudi dernier" }
    ]
  },
  "mate-2": {
    bio: "Tennis au Royal Léopold et running au Bois de la Cambre. Je cherche une partenaire de simple niveau 4 pour le samedi matin.",
    punctuality: 100, levelScore: 4.6, levelTrend: 0.1, matchesOrganized: 21, earlyMatches: 18, liveTonight: false,
    recent: [
      { sport: "Tennis", result: "V", score: "6-2 6-4", when: "Samedi" },
      { sport: "Tennis", result: "V", score: "7-6 6-3", when: "Mercredi" },
      { sport: "Tennis", result: "D", score: "4-6 6-7", when: "Dimanche dernier" }
    ]
  },
  "mate-3": {
    bio: "Gardien ou joueur de champ en foot à 5. Toujours chaud pour un match le mardi ou jeudi soir à Rocourt ou Angleur !",
    punctuality: 98, levelScore: 3.9, levelTrend: -0.1, matchesOrganized: 32, earlyMatches: 0, liveTonight: true,
    recent: [
      { sport: "Football", result: "D", score: "7-9", when: "Jeudi" },
      { sport: "Football", result: "V", score: "10-6", when: "Mardi" },
      { sport: "Badminton", result: "V", score: "21-17 21-15", when: "Dimanche" }
    ]
  },
  "mate-4": {
    bio: "Grimpeuse au Grimpodrome de Namur, bloc et voie. Cherche un mate assureur pour progresser dans le 6b/6c le mercredi soir.",
    punctuality: 100, levelScore: 4.0, levelTrend: 0.3, matchesOrganized: 6, earlyMatches: 3, liveTonight: false,
    recent: [
      { sport: "Escalade", result: "V", score: "6c enchaîné", when: "Mercredi" },
      { sport: "Natation", result: "V", score: "1,5 km", when: "Lundi" },
      { sport: "Escalade", result: "D", score: "6c+ tenté", when: "Samedi dernier" }
    ]
  },
  "mate-5": {
    bio: "Basket 3x3 au playground de la Boverie et squash à Cointe. Ambiance dynamique, zéro prise de tête, que du beau jeu.",
    punctuality: 96, levelScore: 4.7, levelTrend: 0.0, matchesOrganized: 11, earlyMatches: 2, liveTonight: true,
    recent: [
      { sport: "Basket-ball", result: "V", score: "21-15", when: "Hier" },
      { sport: "Squash", result: "V", score: "3-1", when: "Mardi" },
      { sport: "Basket-ball", result: "D", score: "18-21", when: "Dimanche" }
    ]
  },
  "mate-6": {
    bio: "Padel niveau 4 en compétition au Country Hall et à Uccle. Je cherche des partenaires réguliers en semaine après 19h.",
    punctuality: 100, levelScore: 4.4, levelTrend: 0.2, matchesOrganized: 9, earlyMatches: 0, liveTonight: false,
    recent: [
      { sport: "Padel", result: "V", score: "6-3 6-2", when: "Lundi" },
      { sport: "Padel", result: "V", score: "6-4 7-5", when: "Vendredi" },
      { sport: "Tennis", result: "V", score: "6-4 6-4", when: "Mercredi dernier" }
    ]
  },
  "mate-7": {
    bio: "Volley en club à Charleroi, beach-volley dès les premiers rayons à Marcinelle. Tournois amicaux le week-end bienvenus.",
    punctuality: 97, levelScore: 4.1, levelTrend: -0.2, matchesOrganized: 4, earlyMatches: 1, liveTonight: false,
    recent: [
      { sport: "Volley-ball", result: "D", score: "1-3", when: "Samedi" },
      { sport: "Volley-ball", result: "V", score: "3-2", when: "Mercredi" },
      { sport: "Rugby", result: "D", score: "12-19", when: "Dimanche dernier" }
    ]
  },
  "mate-8": {
    bio: "Je reprends le sport en douceur : badminton au hall de Fléron et piscine de Jonfosse. Débutante motivée, on progresse ensemble ?",
    punctuality: 100, levelScore: 1.8, levelTrend: 0.3, matchesOrganized: 1, earlyMatches: 6, liveTonight: false,
    recent: [
      { sport: "Badminton", result: "V", score: "21-18", when: "Mardi" },
      { sport: "Badminton", result: "D", score: "15-21", when: "Samedi" },
      { sport: "Running", result: "V", score: "5 km", when: "Jeudi dernier" }
    ]
  },
  "mate-9": {
    bio: "Ping-pong au club de Liège-Sud et squash à midi. Matchs rapides entre 12h et 14h ou après le boulot pour décompresser.",
    punctuality: 99, levelScore: 4.8, levelTrend: 0.1, matchesOrganized: 7, earlyMatches: 0, liveTonight: false,
    recent: [
      { sport: "Tennis de table", result: "V", score: "3-0", when: "Hier" },
      { sport: "Squash", result: "D", score: "2-3", when: "Lundi" },
      { sport: "Tennis de table", result: "V", score: "3-1", when: "Jeudi dernier" }
    ]
  },
  "mate-10": {
    bio: "Handball en D2 à Schaerbeek, fractionné au parc du Cinquantenaire. Toujours partante pour une grosse session de groupe.",
    punctuality: 100, levelScore: 4.3, levelTrend: 0.2, matchesOrganized: 16, earlyMatches: 9, liveTonight: true,
    recent: [
      { sport: "Handball", result: "V", score: "28-24", when: "Samedi" },
      { sport: "Running", result: "V", score: "10 km", when: "Mercredi" },
      { sport: "Handball", result: "D", score: "22-25", when: "Samedi dernier" }
    ]
  },
  "mate-11": {
    bio: "Padel au Namur Padel Center et foot à 5 à Jambes. J'adore les tournois du dimanche et rencontrer de nouveaux mates.",
    punctuality: 98, levelScore: 3.4, levelTrend: 0.2, matchesOrganized: 5, earlyMatches: 2, liveTonight: false,
    recent: [
      { sport: "Padel", result: "V", score: "6-4 3-6 7-5", when: "Dimanche" },
      { sport: "Football", result: "D", score: "5-7", when: "Jeudi" },
      { sport: "Padel", result: "V", score: "6-2 6-4", when: "Mardi dernier" }
    ]
  },
  "mate-12": {
    bio: "Rugby au RFC Liège et padel le samedi matin à Belle-Île. Je privilégie le fair-play et les troisièmes mi-temps sympas.",
    punctuality: 100, levelScore: 3.6, levelTrend: 0.1, matchesOrganized: 12, earlyMatches: 7, liveTonight: false,
    recent: [
      { sport: "Padel", result: "D", score: "4-6 5-7", when: "Samedi" },
      { sport: "Rugby", result: "V", score: "24-17", when: "Dimanche" },
      { sport: "Padel", result: "V", score: "6-3 6-4", when: "Samedi dernier" }
    ]
  }
};
INITIAL_MATES.forEach(mate => Object.assign(mate, MATE_EXTRAS[mate.id] || {}));

// Statistiques du profil de démonstration (mode démo uniquement)
Object.assign(DEFAULT_MY_PROFILE, {
  punctuality: 100, levelScore: 3.5, levelTrend: 0.2, matchesOrganized: 4, earlyMatches: 5,
  matchesThisMonth: 6, winRate: 64, hoursTotal: 38, weeklyMatches: [1, 2, 1, 3, 2, 2],
  recent: [
    { sport: "Football", result: "V", score: "8-5", when: "Mardi" },
    { sport: "Padel", result: "D", score: "3-6 4-6", when: "Samedi" },
    { sport: "Badminton", result: "V", score: "21-16 21-19", when: "Jeudi dernier" }
  ]
});
