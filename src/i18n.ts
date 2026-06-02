import type { CreditsLinkPart } from "./types.js";

const LANGUAGE_STORAGE_KEY = "gira-pointsmaxxer-language-v1";
const DEFAULT_LANGUAGE = "en";

function creditsLink(label: string, url: string): CreditsLinkPart {
  return {
    label,
    type: "link",
    url,
  };
}

export const SUPPORTED_LANGUAGES = [
  {
    code: "en",
    label: "English",
  },
  {
    code: "pt-PT",
    label: "Português (Portugal)",
  },
];

const translations = {
  en: {
    locale: "en-GB",
    pageTitle: "Gira Pointsmaxxer",
    creditsPageTitle: "Disclaimer & Credits · Gira Pointsmaxxer",
    language: {
      label: "Language",
    },
    hero: {
      eyebrow: "Lisbon Gira Route Optimizer",
      title: "Gira Pointsmaxxer",
      lede:
        "Maximise your points by chaining Gira rides between high-occupation starts and high-empty finishes.",
      whatIsThis: "What is this?",
    },
    creditsHero: {
      eyebrow: "Disclaimer & credits",
      title: "Disclaimer & credits",
      lede: "What this app is, where its data comes from, and how to use it responsibly.",
    },
    auth: {
      step: "Step 1",
      title: "Connect your account",
      emailLabel: "Gira email",
      passwordLabel: "Gira password",
      signIn: "Sign in to Gira",
      signingIn: "Signing in...",
      logout: "Log out",
      useDemoSnapshot: "Use demo snapshot",
      summarySignedOut:
        "Live mode uses your own Gira account and can remember your sign-in in this browser between refreshes until you log out.",
      summarySignedIn:
        "Signed in as {{name}}. Live snapshots stay server-side for this app, and the saved sign-in stays in this browser until you log out.",
      sessionSignedIn: "Signed in",
      sessionSignedOut: "Signed out",
    },
    snapshot: {
      disclosure: "Snapshot details",
      snapshot: "Snapshot",
      stations: "Stations",
      session: "Session",
      noneLoaded: "None loaded",
      live: "Live Gira",
      demo: "Demo",
      refreshLiveStations: "Refresh live stations",
      refreshing: "Refreshing...",
      loadedLiveStations: "Loaded {{count}} live stations.",
      loadedDemoSnapshot: "Loaded the bundled demo snapshot.",
    },
    controls: {
      step: "Step 2",
      title: "Set the challenge",
      startStation: "Start station",
      finishStation: "Finish station",
      finishTime: "Finish time",
      speed: "Average cycling speed (km/h)",
      detourFactor: "Street detour factor",
      overhead: "Per-ride overhead (minutes)",
      currentLocationButtonLabel: "Use current location",
      currentLocation: "Current location",
      currentLocationNearest: "Current location · nearest {{label}}",
      connectAccountFirst: "Connect your account first",
      refreshLiveStationsFirst: "Refresh live stations first",
      chooseStation: "Choose a station",
      findBestStrategy: "Find best strategy",
      plannerNote:
        "The optimizer uses the live snapshot, a 30-second time grid, and the minutes remaining until your chosen finish time.",
    },
    finishTime: {
      chooseToday: "Choose a finish time for today.",
      passedToday: "{{time}} has already passed today. Choose a later finish time.",
      tooSoon:
        "Only {{remaining}} remain until {{time}}. Choose at least {{minimum}} minutes from now.",
      remainingUntil: "{{remaining}} remaining until {{time}}.",
    },
    summary: {
      step: "Step 3",
      title: "Best plan",
      points: "Points",
      rides: "Rides",
      rideTime: "Ride time",
      distance: "Distance",
      placeholder:
        "Connect your account, refresh live stations, choose a start and finish station, then run the planner.",
      plannedAt: "Planned at",
      finishBy: "Finish by",
      minutesRemaining: "Minutes remaining",
      start: "Start",
      finish: "Finish",
      nearestStation: "Nearest station",
      bikePickupStation: "Bike pickup station",
      initialWalking: "Initial walking",
      bufferAfterRoute: "Buffer after route",
      startBonusPoints: "Start bonus points",
      finishBonusPoints: "Finish bonus points",
      liveBonusReadyStarts: "Live bonus-ready starts",
      liveBonusReadyFinishes: "Live bonus-ready finishes",
    },
    network: {
      eyebrow: "Network view",
      title: "Spatial route sketch",
      legendOccupied: "Start bonus now",
      legendEmpty: "Finish bonus after docking",
      legendRoute: "Planned path",
      ariaLabel: "Projected station network map",
      attribution: "© OpenStreetMap contributors",
      zoomedLabel: "Zoomed to the planned route corridor · north is up",
      projectedLabel: "Projected station layout · north is up",
      tooltipOccupied: "{{bikes}}/{{docks}} bikes occupied",
      tooltipStartBonus: "Start bonus now: {{value}}",
      tooltipFinishBonus: "Finish bonus after docking: {{value}}",
      yes: "Yes",
      no: "No",
      you: "You",
    },
    route: {
      eyebrow: "Ride sequence",
      title: "Leg-by-leg breakdown",
      walkPrefix: "Walk:",
      walkLeg: "Walk leg",
      walkingEstimate: "Walking estimate",
      travelEstimate: "Travel estimate",
      distance: "Distance",
      legType: "Leg type",
      bonusSplit: "Bonus split",
      bonusText: "start +{{startBonus}} · finish +{{finishBonus}}",
      manualTransfer: "manual transfer · 0 pts",
    },
    credits: {
      panelEyebrow: "Independent project",
      panelTitle: "What to know before you use it",
      backToPlanner: "Back to planner",
      footerLink: "Disclaimer & credits",
      sections: [
        {
          title: "About this app",
          paragraphs: [
            "Gira Pointsmaxxer is an independent project. It is not an official app of EMEL or Gira, and it has no association with them.",
            "This app was developed with Codex.",
          ],
        },
        {
          title: "What is Gira?",
          richParagraphs: [
            [
              "Gira is Lisbon's public bike-sharing system. If you want the official service, maps, and account information, visit the ",
              creditsLink("official Gira website", "https://www.gira-bicicletasdelisboa.pt/"),
              ".",
            ],
          ],
        },
        {
          title: "Credits & inspiration",
          richParagraphs: [
            [
              "Codex used ",
              creditsLink("gira-mais", "https://github.com/rt-evil-inc/gira-mais"),
              " and ",
              creditsLink("mGira", "https://github.com/afonsosousah/mgira"),
              " as references during development, and the work of those projects helped inspire this app.",
            ],
            [
              "This app was also inspired by the ",
              creditsLink(
                "Gira Grand Prix organised as part of Semana da Bicicleta 2026",
                "https://semanadabicicleta.pt/#event-gira"
              ),
              ".",
            ],
          ],
        },
        {
          title: "Privacy",
          paragraphs: [
            "We do not store your Gira password or other user-entered login details, and we do not intentionally record personally identifying details about how you use this app.",
          ],
          note:
            "If you choose to sign in, the app may keep secure session state in your browser so it can stay signed in between refreshes.",
        },
        {
          title: "Safety",
          list: [
            "Take reasonable precautions when cycling.",
            "Ride safely and responsibly.",
            "Follow the rules of the road and any local traffic guidance.",
          ],
        },
        {
          title: "Accuracy & responsibility",
          paragraphs: [
            "The routes generated by this app may or may not be correct. Please use your own judgment, and do not rely on the app as your only source of guidance.",
            "We take no responsibility for the accuracy of the information presented.",
            "System-capacity and availability data come from the Gira system and may or may not be reliable.",
          ],
        },
        {
          title: "Hosting",
          richParagraphs: [
            [
              "This app is hosted for free on ",
              creditsLink("Render", "https://render.com/"),
              ", and the current deployment is hosted in the EU.",
            ],
          ],
        },
        {
          title: "Source",
          richParagraphs: [
            [
              "The source code for this app is available on ",
              creditsLink("GitHub", "https://github.com/skhg/gira-pointsmaxxer"),
              ".",
            ],
          ],
        },
      ],
    },
    toasts: {
      signInAndLoad: "Signed in. Loading the latest Gira snapshot...",
      signOutCleared: "Signed out and cleared the saved sign-in.",
      checkingCurrentLocation: "Checking your current location...",
      currentLocationResolved: "Current location resolved to {{label}}.",
      noFeasiblePath: "No feasible path was found before the chosen finish time.",
      bestRouteFound: "Best route found: {{points}} points across {{rides}} rides.",
    },
    errors: {
      genericRequest: "Request failed.",
      genericServer: "Unexpected server error.",
      session_expired: "Your Gira session expired. Please sign in again.",
      auth_rate_limited:
        "The Gira authentication service is temporarily rate limiting requests.",
      invalid_credentials: "The Gira email or password was not accepted.",
      invalid_planner_inputs:
        "The speed, detour factor, and remaining time must all be positive.",
      invalid_station_selection: "Pick both a valid start and finish station.",
      insufficient_planner_budget: "Not enough time remains for the current planner resolution.",
      no_bikes_available_at_start:
        "The selected start station has no bikes, and no other active station currently has an available bike.",
      public_station_catalog_unavailable: "The EMEL public station catalog is unavailable.",
      live_station_snapshot_unavailable:
        "The Gira live station API did not return a usable snapshot.",
      login_attempts_rate_limited:
        "Too many sign-in attempts from this network. Please wait 10 minutes and try again.",
      missing_credentials: "Email and password are required.",
      login_required: "You need to log in with your Gira account first.",
      chooseBothStations: "Choose both the start and finish station from the dropdowns.",
      locationPermissionDenied: "Location permission was denied for this app.",
      locationUnavailable: "The device could not determine the current location.",
      locationTimeout: "Timed out while requesting the current GPS position.",
      currentLocationUnavailable: "Could not determine the current location.",
      geolocationUnsupported: "This browser or device does not expose GPS location.",
      loadSnapshotFirst: "Load a station snapshot before using Current Location.",
      noActiveStationsNearLocation:
        "No active Gira stations are available near the current location.",
    },
    units: {
      minuteOne: "min",
      minuteOther: "mins",
      hour: "h",
      kilometer: "km",
      points: "pts",
    },
  },
  "pt-PT": {
    locale: "pt-PT",
    pageTitle: "Gira Pointsmaxxer",
    creditsPageTitle: "Avisos e créditos · Gira Pointsmaxxer",
    language: {
      label: "Idioma",
    },
    hero: {
      eyebrow: "Otimizador de rotas Gira em Lisboa",
      title: "Gira Pointsmaxxer",
      lede:
        "Maximiza os teus pontos ao encadear viagens Gira entre estações com muita ocupação à partida e muita disponibilidade à chegada.",
      whatIsThis: "O que é isto?",
    },
    creditsHero: {
      eyebrow: "Avisos e créditos",
      title: "Avisos e créditos",
      lede: "O que é esta app, de onde vêm os dados e como utilizá-la de forma responsável.",
    },
    auth: {
      step: "Passo 1",
      title: "Liga a tua conta",
      emailLabel: "Email Gira",
      passwordLabel: "Palavra-passe Gira",
      signIn: "Entrar na Gira",
      signingIn: "A entrar...",
      logout: "Terminar sessão",
      useDemoSnapshot: "Usar snapshot de demonstração",
      summarySignedOut:
        "O modo em direto usa a tua própria conta Gira e pode manter a tua sessão neste navegador entre atualizações até terminares sessão.",
      summarySignedIn:
        "Sessão iniciada como {{name}}. Os snapshots em direto ficam no servidor desta app e a sessão guardada mantém-se neste navegador até terminares sessão.",
      sessionSignedIn: "Sessão iniciada",
      sessionSignedOut: "Sem sessão",
    },
    snapshot: {
      disclosure: "Detalhes do snapshot",
      snapshot: "Snapshot",
      stations: "Estações",
      session: "Sessão",
      noneLoaded: "Nada carregado",
      live: "Gira em direto",
      demo: "Demonstração",
      refreshLiveStations: "Atualizar estações em direto",
      refreshing: "A atualizar...",
      loadedLiveStations: "{{count}} estações em direto carregadas.",
      loadedDemoSnapshot: "Snapshot de demonstração carregado.",
    },
    controls: {
      step: "Passo 2",
      title: "Define o desafio",
      startStation: "Estação de partida",
      finishStation: "Estação de chegada",
      finishTime: "Hora de fim",
      speed: "Velocidade média de ciclismo (km/h)",
      detourFactor: "Fator de desvio por rua",
      overhead: "Tempo fixo por viagem (minutos)",
      currentLocationButtonLabel: "Usar localização atual",
      currentLocation: "Localização atual",
      currentLocationNearest: "Localização atual · mais próxima {{label}}",
      connectAccountFirst: "Liga primeiro a tua conta",
      refreshLiveStationsFirst: "Atualiza primeiro as estações em direto",
      chooseStation: "Escolhe uma estação",
      findBestStrategy: "Encontrar melhor estratégia",
      plannerNote:
        "O otimizador usa o snapshot em direto, uma grelha temporal de 30 segundos e os minutos restantes até à hora de fim escolhida.",
    },
    finishTime: {
      chooseToday: "Escolhe uma hora de fim para hoje.",
      passedToday: "{{time}} já passou hoje. Escolhe uma hora de fim mais tarde.",
      tooSoon:
        "Faltam apenas {{remaining}} até {{time}}. Escolhe pelo menos {{minimum}} minutos a partir de agora.",
      remainingUntil: "Faltam {{remaining}} até {{time}}.",
    },
    summary: {
      step: "Passo 3",
      title: "Melhor plano",
      points: "Pontos",
      rides: "Viagens",
      rideTime: "Tempo em viagem",
      distance: "Distância",
      placeholder:
        "Liga a tua conta, atualiza as estações em direto, escolhe uma estação de partida e outra de chegada, e depois corre o planeador.",
      plannedAt: "Planeado às",
      finishBy: "Terminar até",
      minutesRemaining: "Minutos restantes",
      start: "Partida",
      finish: "Chegada",
      nearestStation: "Estação mais próxima",
      bikePickupStation: "Estação de recolha da bicicleta",
      initialWalking: "Caminhada inicial",
      bufferAfterRoute: "Margem no fim da rota",
      startBonusPoints: "Pontos de bónus à partida",
      finishBonusPoints: "Pontos de bónus à chegada",
      liveBonusReadyStarts: "Partidas prontas para bónus",
      liveBonusReadyFinishes: "Chegadas prontas para bónus",
    },
    network: {
      eyebrow: "Vista da rede",
      title: "Esboço espacial da rota",
      legendOccupied: "Bónus de partida agora",
      legendEmpty: "Bónus de chegada após doca",
      legendRoute: "Percurso planeado",
      ariaLabel: "Mapa projetado da rede de estações",
      attribution: "© contribuidores do OpenStreetMap",
      zoomedLabel: "Zoom ao corredor da rota planeada · norte para cima",
      projectedLabel: "Disposição projetada das estações · norte para cima",
      tooltipOccupied: "{{bikes}}/{{docks}} bicicletas ocupadas",
      tooltipStartBonus: "Bónus de partida agora: {{value}}",
      tooltipFinishBonus: "Bónus de chegada após doca: {{value}}",
      yes: "Sim",
      no: "Não",
      you: "Tu",
    },
    route: {
      eyebrow: "Sequência de viagens",
      title: "Detalhe por etapa",
      walkPrefix: "A pé:",
      walkLeg: "Etapa a pé",
      walkingEstimate: "Estimativa a pé",
      travelEstimate: "Estimativa de percurso",
      distance: "Distância",
      legType: "Tipo de etapa",
      bonusSplit: "Divisão do bónus",
      bonusText: "partida +{{startBonus}} · chegada +{{finishBonus}}",
      manualTransfer: "transferência manual · 0 pts",
    },
    credits: {
      panelEyebrow: "Projeto independente",
      panelTitle: "O que deves saber antes de usar",
      backToPlanner: "Voltar ao planeador",
      footerLink: "Avisos e créditos",
      sections: [
        {
          title: "Sobre esta app",
          paragraphs: [
            "A Gira Pointsmaxxer é um projeto independente. Não é uma app oficial da EMEL nem da Gira, e não tem qualquer associação com essas entidades.",
            "Esta app foi desenvolvida com o Codex.",
          ],
        },
        {
          title: "O que é a Gira?",
          richParagraphs: [
            [
              "A Gira é o sistema público de bicicletas partilhadas de Lisboa. Se procuras o serviço oficial, os mapas e a informação da tua conta, visita o ",
              creditsLink("site oficial da Gira", "https://www.gira-bicicletasdelisboa.pt/"),
              ".",
            ],
          ],
        },
        {
          title: "Créditos e inspiração",
          richParagraphs: [
            [
              "O Codex usou ",
              creditsLink("gira-mais", "https://github.com/rt-evil-inc/gira-mais"),
              " e ",
              creditsLink("mGira", "https://github.com/afonsosousah/mgira"),
              " como referências durante o desenvolvimento, e o trabalho desses projetos ajudou a inspirar esta app.",
            ],
            [
              "Esta app também foi inspirada pelo ",
              creditsLink(
                "Gira Grand Prix organizado no âmbito da Semana da Bicicleta 2026",
                "https://semanadabicicleta.pt/#event-gira"
              ),
              ".",
            ],
          ],
        },
        {
          title: "Privacidade",
          paragraphs: [
            "Não armazenamos a tua palavra-passe da Gira nem outros dados de autenticação introduzidos por ti, e não registamos intencionalmente dados pessoalmente identificáveis sobre a forma como usas esta app.",
          ],
          note:
            "Se escolheres iniciar sessão, a app pode manter um estado de sessão seguro no teu navegador para que continues autenticado entre atualizações.",
        },
        {
          title: "Segurança",
          list: [
            "Toma precauções razoáveis ao pedalar.",
            "Circula de forma segura e responsável.",
            "Cumpre as regras da estrada e qualquer orientação local de trânsito.",
          ],
        },
        {
          title: "Exatidão e responsabilidade",
          paragraphs: [
            "As rotas geradas por esta app podem ou não estar corretas. Usa o teu próprio julgamento e não dependas desta app como única fonte de orientação.",
            "Não assumimos responsabilidade pela exatidão da informação apresentada.",
            "Os dados sobre capacidade e disponibilidade do sistema vêm do sistema Gira e podem ou não ser fiáveis.",
          ],
        },
        {
          title: "Alojamento",
          richParagraphs: [
            [
              "Esta app está alojada gratuitamente na ",
              creditsLink("Render", "https://render.com/"),
              ", e a implementação atual está alojada na UE.",
            ],
          ],
        },
        {
          title: "Código-fonte",
          richParagraphs: [
            [
              "O código-fonte desta app está disponível no ",
              creditsLink("GitHub", "https://github.com/skhg/gira-pointsmaxxer"),
              ".",
            ],
          ],
        },
      ],
    },
    toasts: {
      signInAndLoad: "Sessão iniciada. A carregar o snapshot mais recente da Gira...",
      signOutCleared: "Sessão terminada e início de sessão guardado removido.",
      checkingCurrentLocation: "A verificar a tua localização atual...",
      currentLocationResolved: "Localização atual resolvida para {{label}}.",
      noFeasiblePath: "Não foi encontrado um percurso viável antes da hora de fim escolhida.",
      bestRouteFound: "Melhor rota encontrada: {{points}} pontos em {{rides}} viagens.",
    },
    errors: {
      genericRequest: "Falha no pedido.",
      genericServer: "Erro inesperado do servidor.",
      session_expired: "A tua sessão Gira expirou. Inicia sessão novamente.",
      auth_rate_limited:
        "O serviço de autenticação da Gira está temporariamente a limitar pedidos.",
      invalid_credentials: "O email ou a palavra-passe da Gira não foram aceites.",
      invalid_planner_inputs:
        "A velocidade, o fator de desvio e o tempo restante têm de ser positivos.",
      invalid_station_selection: "Escolhe uma estação de partida e uma de chegada válidas.",
      insufficient_planner_budget:
        "Já não resta tempo suficiente para a resolução atual do planeador.",
      no_bikes_available_at_start:
        "A estação de partida escolhida não tem bicicletas e nenhuma outra estação ativa tem bicicletas disponíveis neste momento.",
      public_station_catalog_unavailable:
        "O catálogo público de estações da EMEL não está disponível.",
      live_station_snapshot_unavailable:
        "A API de estações em direto da Gira não devolveu um snapshot utilizável.",
      login_attempts_rate_limited:
        "Demasiadas tentativas de início de sessão a partir desta rede. Espera 10 minutos e tenta novamente.",
      missing_credentials: "O email e a palavra-passe são obrigatórios.",
      login_required: "Tens de iniciar sessão com a tua conta Gira primeiro.",
      chooseBothStations:
        "Escolhe tanto a estação de partida como a estação de chegada nas listas.",
      locationPermissionDenied: "A permissão de localização foi recusada para esta app.",
      locationUnavailable: "O dispositivo não conseguiu determinar a localização atual.",
      locationTimeout: "O pedido da posição GPS excedeu o tempo limite.",
      currentLocationUnavailable: "Não foi possível determinar a localização atual.",
      geolocationUnsupported: "Este navegador ou dispositivo não expõe a localização GPS.",
      loadSnapshotFirst: "Carrega primeiro um snapshot de estações antes de usar a Localização atual.",
      noActiveStationsNearLocation:
        "Não existem estações Gira ativas disponíveis perto da localização atual.",
    },
    units: {
      minuteOne: "min",
      minuteOther: "min",
      hour: "h",
      kilometer: "km",
      points: "pts",
    },
  },
};

function getNestedValue(source, key) {
  return key.split(".").reduce((value, part) => value?.[part], source);
}

function interpolate(template, values = {}) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/gu, (_, name) => {
    return name in values ? String(values[name]) : "";
  });
}

export function resolveLanguage(candidate) {
  const normalized = String(candidate || "").trim().toLowerCase();
  if (!normalized) return DEFAULT_LANGUAGE;

  if (normalized === "pt" || normalized.startsWith("pt-")) {
    return "pt-PT";
  }

  return DEFAULT_LANGUAGE;
}

export function detectInitialLanguage() {
  const storage = typeof localStorage !== "undefined" ? localStorage : null;
  const storedLanguage = storage?.getItem(LANGUAGE_STORAGE_KEY);
  if (storedLanguage) return resolveLanguage(storedLanguage);

  const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];

  for (const language of browserLanguages) {
    const resolved = resolveLanguage(language);
    if (resolved !== DEFAULT_LANGUAGE || String(language || "").toLowerCase().startsWith("en")) {
      return resolved;
    }
  }

  return DEFAULT_LANGUAGE;
}

export function storeLanguage(language) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, resolveLanguage(language));
}

export function getMessages(language) {
  const resolvedLanguage = resolveLanguage(language);
  return translations[resolvedLanguage] || translations[DEFAULT_LANGUAGE];
}

export function hasTranslation(language, key) {
  return getNestedValue(translations[resolveLanguage(language)] || {}, key) != null;
}

export function translate(language, key, values = {}) {
  const resolvedLanguage = resolveLanguage(language);
  const value =
    getNestedValue(translations[resolvedLanguage], key) ??
    getNestedValue(translations[DEFAULT_LANGUAGE], key);

  if (value == null) {
    return key;
  }

  if (typeof value !== "string") {
    return value;
  }

  return interpolate(value, values);
}
