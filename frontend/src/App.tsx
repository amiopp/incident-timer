import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import RemoteActionBar from "./components/RemoteActionBar";
import PccLanding from "./components/PccLanding";
import {
  type RemoteMode,
  useRemoteNavigation,
} from "./hooks/useRemoteNavigation";
import {
  type IncidentActionState,
  type IncidentAuditEvent,
  type Severity,
  SEVERITY_LABELS,
  createDefaultActionState,
} from "./types";
import incidentChoicesData from "./data/incident_choices.json";

type IncidentLine = "T1" | "T2" | "T3" | "T4" | "BW1" | "BW2";
type IncidentTrack = 1 | 2;

type ApiIncident = {
  id: number;
  line: IncidentLine | null;
  track: IncidentTrack | null;
  station: string | null;
  interstation: string | null;
  message: string;
  status: "ACTIVE" | "RESOLVED";
  started_at: string;
  resolved_at: string | null;
  duration_seconds: number | null;
  start_level: Severity;
  max_level_reached: Severity;
};

type ApiIncidentActionState = {
  incident_id: number;
  passenger_announcement_done: boolean;
  passenger_announcement_done_at: string | null;
  passenger_announcement_done_by: string | null;
  on_call_contact_done: boolean;
  on_call_contact_done_at: string | null;
  on_call_contact_done_by: string | null;
};

type HistoryResponse = {
  items: ApiIncident[];
  total: number;
  limit: number;
  offset: number;
};

const DEFAULT_API_BASE_URL = "http://localhost:8001";
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");
const WS_URL =
  import.meta.env.VITE_WS_URL || `${API_BASE_URL.replace(/^http/, "ws")}/ws`;
const INCIDENT_CHOICES_STORAGE_KEY = "pcc_incident_choices_v1";
const INCIDENT_AUDIT_STORAGE_KEY = "pcc_incident_audit_v1";
const INCIDENT_LINES: IncidentLine[] = ["T1", "T2", "T3", "T4", "BW1", "BW2"];
const INCIDENT_LINE_VISUALS: Record<
  IncidentLine,
  { color: string; shape: "circle" | "diamond"; textColor?: string }
> = {
  T1: { color: "#E8621A", shape: "circle" },
  T2: { color: "#F5C200", shape: "circle", textColor: "#333333" },
  T3: { color: "#7B2D6E", shape: "circle" },
  T4: { color: "#4A7DB5", shape: "circle" },
  BW1: { color: "#1E6B45", shape: "diamond" },
  BW2: { color: "#5A9E35", shape: "diamond" },
};
const INCIDENT_LINE_PREFIX_PATTERN = /^\[(T1|T2|T3|T4|BW1|BW2)\]\s*/i;
const INCIDENT_LOCATION_PREFIX_PATTERN = /^\[LOC:([^\]]+)\]\s*/i;
const INCIDENT_TRACK_PREFIX_PATTERN = /^\[(?:TRK|TRACK|VOIE):([12])\]\s*/i;
const INCIDENT_TRACK_INLINE_PATTERN = /\bvoie\s*[:\-]?\s*([12])\b/i;
const TOP_EDGE_REVEAL_PX = 80;
const BOTTOM_EDGE_REVEAL_PX = 120;

const INCIDENT_CATEGORIES_DEFAULT: Record<string, string[]> =
  normalizeIncidentCategories(incidentChoicesData);

const INCIDENT_CHOICES = Object.values(INCIDENT_CATEGORIES_DEFAULT).flat();

// --- À REMPLACER (supprimer INCIDENT_STATIONS et INCIDENT_INTERSTATIONS) ---
// par ce qui suit :

const STATIONS_DATA: Record<IncidentLine, { stations: string[]; interstations: string[] }> = {
  "T1": {
    "stations": ["Sidi Moumen Terminus", "Ennassim", "Mohammed Zefzaf", "Centre de maintenance", "Hôpital Sidi Momen", "Attacharouk", "Okba Ibn Nafii", "Forces Auxiliaires", "Hay Raja", "Ibn Tachfine", "Hay Mohammadi", "Echouhada", "Ali Yaata", "Grande Ceinture", "Les anciens Abattoirs", "Boulevard Bahmad", "Casa Voyageurs", "Place Al Yassir", "La résistance", "Mohammed Diouri", "Marché Central", "Place Nations Unies", "Place Mohammed V", "Avenue Hassan II", "Facultés", "Facultés de medecine", "Abdelmoumen", "Bachkou", "Mekka", "Gare Oasis", "Panoramique", "Technopark", "Zenith", "Gare Casa Sud", "Facultés", "Laymoune", "Terminus Lissasfa"],
    "interstations": ["Les anciens Abattoirs/Boulevard Bahmad", "Abdelmoumen/Bachkou", "Abdelmoumen/Derb Ghallef", "Echouhada/Ali Yaata", "Ettacharouk/Okba Ibn Nafii", "Ali Yaata/Grande Ceinture", "Bachkou/Mekka", "Boulevard Bahmad/Casa Voyageurs", "Centre de maintenance/H?pital Sidi Momen", "Mohammed Diouri/Marché Central", "Ennassim/Mohammed Zefzaf", "Facultés/Laymoune", "Facultés de medecine/Abdelmoumen", "Forces Auxiliaires/Hay Raja", "Grande Ceinture/Les anciens Abattoirs", "Gare Casa Sud/Facultés", "Casa Voyageurs/Place Al Yassir", "Gare Oasis/Panoramique", "Avenue Hassan II/Wafasalaf", "Hay Raja/Ibn Tachfine", "Hôpital Sidi Moumen/Ettacharouk", "Laymoune/Lissasfa Terminus", "Lissasfa Terminus/Zone de retournement 2", "Marché Central/Place Nations Unies", "Mekka/Gare Oasis", "Hay Mohammadi/Echouhada", "Mohammed Zefzaf/Centre de maintenance", "Okba Ibn Nafii/Forces Auxiliaires", "Panoramique/Technopark", "Place Mohammed V/Avenue Hassan II", "Place Nations Unies/Place Mohammed V", "La résistance/Mohammed Diouri", "Sidi Moumenn/Ennassim", "Ibn Tachfine/Hay Mohammadi", "Technopark/Zenith", "Wafasalaf/Facultés de medecine", "Place Al Yassir/La r?sistance", "Zenith/Gare Casa Sud", "Zone de retournement 1/Sidi Moumen"]
  },
  "T2": {
    "stations": ["Ain Diab Plage Terminus", "Littoral", "Hay Hassani", "Sidi Abderrahmane", "Cite de l'air", "Abdellah Ben Cherif", "Place financière", "Anfa Park", "Anfa Club", "Beauséjour", "Ghandi", "Riviera", "Derb Ghallef", "Anoual", "Hermitage", "02 Mars", "El fida", "Place Sraghna", "Derb Sultan", "Hay El Farah", "Derb Milan", "Hay Adil", "Mdakra", "Qayssariat Hay Mohammadi", "Carrieres centrales", "Dar laman", "Wifaq", "Alamane", "Prefecture Ain Sebaa", "Gare de Ain Sebaa", "Abi Der El Ghafari", "Sidi Bernoussi Terminus"],
    "interstations": ["2 Mars/Hermitage", "Sidi Abderrahmane/Hay Hassani", "Abi Der El Ghafari/Gare de Ain Sebaa", "Ain Diab/Zone de retournement 2", "Alamane/Wifaq", "Anoual/Derb Ghalef", "Ben Cherif/Cité de l'air", "Beauséjour/Anfa Club", "Cimetiere Achouhada/Derb Milan", "Carrieres centrales/Qayssariat Hay Mohammadi", "Cité de l'air/Sidi Abderrahmane", "Anfa Club/Anfa Park", "Derb Ghallef/Riviera", "Dar laman/Carrieres centrales", "Derb Milan/Hay El Farah", "Derb Sultan/Place Sraghna", "El fida/2 Mars", "Gare de Ain Sebaa/Prefecture Ain Sebaa", "Ghandi/Beauséjour", "Hay Adil/Cimetiere Achouhada", "Hermitage/Anoual", "Hay El Farah/Derb Sultan", "Hay Hassani/Littoral", "Littoral/Ain Diab", "Mdakra/Hay Adil", "Anfa Park/Place financière", "Prefecture Ain Sebaa/Alamane", "Place financière/Ben Cherif", "Place Sraghna/El fida", "Qayssariat Hay Mohammadi/Mdakra", "Riviera/Ghandi", "Sidi Bernoussi Terminus/Abi Der El Ghafari", "Wifaq/Dar laman", "Zone de retournement 1/Sidi Bernoussi Terminus"]
  },
  "T3": {
    "stations": ["Casa Port Terminus", "Mohammed Smiha", "Place de la Victoire", "Mohammed Zerktouni", "Habous", "Garage Allal", "Derb Tolba", "Derb Chorfa", "Abou Chouaib Doukali", "Afriquia", "Dar Attouzani", "Bd Mohammed VI", "6 Novembre", "Abdessalam Ennaciri", "Jardin Alesco", "Hay Lalla Meriem", "Idriss El Allam", "Abdelkader Essahraoui", "10-Mars-1982", "Hay Al Warda Terminus"],
    "interstations": ["10-Mars-1982 /Hay Al Wahda Terminus", "6 novembre/Abdessalam Ennacir", "Abou Choua?b Doukali/Afriquia", "Abdessalam Ennacir/Jardin Alesco", "Abdelkader Essahraoui /10-Mars-1982", "Afriquia/Dar Attouzani", "Bd Mohammed VI /6 novembre", "Casa Port terminus/Mohammed Smiha 1", "Dar Attouzani/Bd Mohammed VI", "Derb Chorfa /Abou Choua?b Doukali", "Derb Tolba /Derb Chorfa", "Garage Allal/Derb Tolba", "HABOUS /Garage Allal", "Hay Lalla Meriem/Idriss El Allam", "Hay Al Wahda Terminus /Zone de retournement 2", "Idriss El Allam/Abdelkader Essahraoui", "Jardin Alesco /Hay Lalla Meriem", "Mohammed Smiha 1/Place de la Victoire", "Mohammed Zerktouni  /HABOUS", "Place de la Victoire /Mohammed Zerktouni", "Zone de retournement 1/Casa Port terminus"]
  },
  "T4": {
    "stations": ["Parc de la ligue arabe", "Mers Sultan", "Jaber Ibn Hayane", "La Gironde", "Ifni", "Ain Borja", "Gare Oulad Ziane", "Hay Tissir", "Chtaiba", "Boulevard du Nil", "Hay Assalama", "Mohammed Bouziane", "Idriss El Harti", "Hay El Falah", "Faculte Ben Msik", "Mohammed Jaudar", "Moulay Rachid", "Zone Industrielle", "Mohammed Erradi"],
    "interstations": ["Ain Borjal/Gare Oulad Ziane", "Boulevard du Nil /Hay Assalama", "Chtaiba /Boulevard du Nil", "Faculte Ben Msik/Mohammed Jaudar", "La Gironde/Ifni", "Gare Oulad Ziane /Hay Tissir", "Hay El Falah/Faculte Ben Msik", "Hay Tissir /Chtaiba", "Hay Assalama /Mohammed Bouziane", "Idriss El Harti/Hay El Falah", "Ifni /Ain Borja", "Jaber Ibn Hayane /La Gironde", "Mohammed Bouziane/Idriss El Harti", "Mohammed Jaudar/Moulay Rachid", "Moulay Rachid /Zone Industrielle", "Mohammed Erradi /Zone de retournement 2", "Mers Sultan /Jaber Ibn Hayane", "Parc de la ligue arabe/Mers Sultan", "Zone Industrielle  /Mohammed Erradi", "Zone de retournement 1/Parc de la ligue arabe"]
  },
  "BW1": {
    "stations": ["Salmia 2", "Sbata", "stde Tessema", "Al Joulane", "Lahrizi", "Jardin Sunday", "Amgala", "Al Qods", "Sefrou", "Taza", "Al Inara", "Old. Haddou", "Hay Chrifa", "Taddart", "Azzohour", "Californie", "Casa Nearshore", "Al Mostakbal", "SdMrf", "Omar Al Khayam"],
    "interstations": ["Amgala/AlQods", "Azzohour/Californie", "Californie/CNS", "CNS/AlMostakbal", "Hay Chrifa/Taddart", "AlInara/Old.Haddou", "Al joulane/Lahrizi", "Jardin Sunday/Amgala", "Lahrizi/JardinSunday", "Al Mostakbal/SdMrf", "Old. Haddou/Hay chrifa", "AlQods/Sefrou", "Samlia 2/Sbata", "Sbata/stdeTessema", "SdMrf/Omar AlKhayam", "Sefrou/Taza", "stdeTessema/Joulane", "Taddart/Azzohour", "Taza/AlInara"]
  },
  "BW2": {
    "stations": ["Abouab Oulfa", "Aeropostale", "CIL", "Les Ecoles", "Errahma", "Essafa", "La Ferme", "Haj Fateh", "Jrds. Errahma", "Mly.Thami", "Moulouya", "Les musees", "Old.Azzouz Ter.", "Old. Ahmed", "Oulmes Ter.", "OOR", "Oued Beht", "Oued Laou", "Oued Sbou", "La Perception", "La Rocade", "Ycb. AlMnsr."],
    "interstations": ["Abouab Oulfa/La Rocade", "Aeropostale/Les musees", "CIL/Aeropostale", "Les Ecoles/Old.Ahmed", "Errahma/Oued Sbou", "Essafa/Mly.Thami", "La Ferme/Old.Azzouz Ter.", "Haj Fateh/Essafa", "Jrds. Errahma/ Errahma", "Mly.Thami/Abouab Oulfa", "Moulouya/Haj Fateh", "Les musees/OOR", "Old.Ahmed/La Ferme", "Oulmes Ter./Ycb. AlMnsr.", "OOR/Oued Laou", "Oued Beht/Moulouya", "Oued Laou/Oued Beht", "Oued Sbou/Les Ecoles", "La Perception/Jrds. Errahma", "La Rocade/La Perception", "Ycb. AlMnsr./CIL"]
  }
};

// Variables globales générées à partir du JSON pour la recherche dans TOUT l'historique
const ALL_STATIONS = Array.from(new Set(Object.values(STATIONS_DATA).flatMap(d => d.stations))).sort();
const ALL_INTERSTATIONS = Array.from(new Set(Object.values(STATIONS_DATA).flatMap(d => d.interstations))).sort();


function formatHHMMSS(total: number) {
  const hh = Math.floor(total / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function elapsedSeconds(startedAt: string) {
  if (!startedAt) return 0;

  // 1. On nettoie la chaîne (on enlève le Z s'il y en a un et les microsecondes)
  const cleanString = startedAt.replace("Z", "").split(".")[0];
  const [datePart, timePart] = cleanString.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);

  // 2. new Date(année, mois, jour, heure, minute, seconde) force la lecture en heure locale
  // Attention : le mois commence à 0 en Javascript, d'où le (month - 1)
  const localTime = new Date(year, month - 1, day, hour, minute, second).getTime();

  // 3. On calcule la différence
  return Math.max(0, Math.floor((Date.now() - localTime) / 1000));
}

function getCurrentLevel(incident: ApiIncident, elapsed: number): Severity {
  if (incident.start_level === "RED") return "RED";
  if (incident.start_level === "ORANGE") {
    return elapsed >= 15 * 60 ? "RED" : "ORANGE";
  }
  if (elapsed >= 30 * 60) return "RED";
  if (elapsed >= 15 * 60) return "ORANGE";
  return "GREEN";
}

function getSeverityLabel(level: Severity) {
  return SEVERITY_LABELS[level];
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  // Afficher directement la date telle qu'elle est en base de données
  const cleanString = value.replace("Z", "").split(".")[0];
  const [datePart, timePart] = cleanString.split("T");
  const [year, month, day] = datePart.split("-");
  const [hour, minute, second] = timePart.split(":");

  // Format: DD/MM/YYYY HH:MM:SS
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  const hh = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeCsv(value: string) {
  const normalized = value.replace(/"/g, '""');
  return `"${normalized}"`;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function splitTextIntoTwoLines(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstLine: "", secondLine: "" };
  }

  const words = normalized.split(" ");
  if (words.length <= 1) {
    return { firstLine: normalized, secondLine: "" };
  }

  let bestIndex = 1;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let idx = 1; idx < words.length; idx += 1) {
    const first = words.slice(0, idx).join(" ");
    const second = words.slice(idx).join(" ");
    const diff = Math.abs(first.length - second.length);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = idx;
    }
  }

  return {
    firstLine: words.slice(0, bestIndex).join(" "),
    secondLine: words.slice(bestIndex).join(" "),
  };
}

function normalizeIncidentChoices(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[];

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;

    const normalized = item.trim().replace(/\s+/g, " ");
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;

    seen.add(key);
    cleaned.push(normalized);
  }

  return cleaned;
}

function normalizeIncidentCategories(raw: unknown) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {} as Record<string, string[]>;
  }

  const cleaned: Record<string, string[]> = {};
  for (const [category, items] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedCategory = category.trim().replace(/\s+/g, " ");
    if (!normalizedCategory) continue;

    const normalizedItems = normalizeIncidentChoices(items);
    if (normalizedItems.length === 0) continue;

    cleaned[normalizedCategory] = normalizedItems;
  }

  return cleaned;
}

function getLocationsForLine(line: IncidentLine) {
  const lineData = STATIONS_DATA[line];
  return Array.from(new Set([...lineData.stations, ...lineData.interstations]));
}

function classifyLocationForLine(line: IncidentLine, location: string) {
  const normalizedLocation = normalizeSearchText(location);
  const lineData = STATIONS_DATA[line];

  const station =
    lineData.stations.find(
      (item) => normalizeSearchText(item) === normalizedLocation,
    ) ?? null;
  if (station) {
    return { station, interstation: null as string | null };
  }

  const interstation =
    lineData.interstations.find(
      (item) => normalizeSearchText(item) === normalizedLocation,
    ) ?? null;
  if (interstation) {
    return { station: null as string | null, interstation };
  }

  // Fallback for inconsistent source labels.
  return {
    station: normalizedLocation.includes("/") ? null : location,
    interstation: normalizedLocation.includes("/") ? location : null,
  };
}

function getSmartLocationMatches(options: string[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return options;

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return options
    .map((option, index) => {
      const normalizedOption = normalizeSearchText(option);
      let score = 99;

      if (normalizedOption === normalizedQuery) {
        score = 0;
      } else if (normalizedOption.startsWith(normalizedQuery)) {
        score = 1;
      } else if (
        queryTokens.length > 0 &&
        queryTokens.every((token) => normalizedOption.includes(token))
      ) {
        score = 2;
      } else if (normalizedOption.includes(normalizedQuery)) {
        score = 3;
      } else if (queryTokens.some((token) => normalizedOption.includes(token))) {
        score = 4;
      }

      return { option, score, index };
    })
    .filter((item) => item.score < 99)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.option.length - b.option.length ||
        a.option.localeCompare(b.option, "fr"),
    )
    .map((item) => item.option);
}

function parseIncidentLine(message: string) {
  let remaining = message.trim();
  let line: IncidentLine | null = null;
  let location: string | null = null;
  let track: IncidentTrack | null = null;

  while (remaining.length > 0) {
    const lineMatch = remaining.match(INCIDENT_LINE_PREFIX_PATTERN);
    if (lineMatch) {
      line = lineMatch[1].toUpperCase() as IncidentLine;
      remaining = remaining.slice(lineMatch[0].length).trimStart();
      continue;
    }

    const locationMatch = remaining.match(INCIDENT_LOCATION_PREFIX_PATTERN);
    if (locationMatch) {
      location = locationMatch[1].trim();
      remaining = remaining.slice(locationMatch[0].length).trimStart();
      continue;
    }

    const trackMatch = remaining.match(INCIDENT_TRACK_PREFIX_PATTERN);
    if (trackMatch) {
      track = Number(trackMatch[1]) as IncidentTrack;
      remaining = remaining.slice(trackMatch[0].length).trimStart();
      continue;
    }

    break;
  }

  if (!track) {
    const inlineTrackMatch = remaining.match(INCIDENT_TRACK_INLINE_PATTERN);
    if (inlineTrackMatch) {
      track = Number(inlineTrackMatch[1]) as IncidentTrack;
      remaining = remaining
        .replace(INCIDENT_TRACK_INLINE_PATTERN, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
  }

  return {
    line,
    location,
    track,
    displayMessage: remaining.trim(),
  };
}

function normalizeIncidentLine(value: string | null | undefined): IncidentLine | null {
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (normalized in INCIDENT_LINE_VISUALS) {
    return normalized as IncidentLine;
  }
  return null;
}

function inferIncidentLineFromLocation(location: string | null): IncidentLine | null {
  if (!location) return null;

  const normalizedLocation = normalizeSearchText(location);
  for (const line of INCIDENT_LINES) {
    const lineData = STATIONS_DATA[line];

    const hasExactMatch =
      lineData.stations.some(
        (item) => normalizeSearchText(item) === normalizedLocation,
      ) ||
      lineData.interstations.some(
        (item) => normalizeSearchText(item) === normalizedLocation,
      );
    if (hasExactMatch) {
      return line;
    }
  }

  return null;
}

function getIncidentDisplay(incident: ApiIncident) {
  const parsed = parseIncidentLine(incident.message);
  const dbLocation = incident.station ?? incident.interstation;
  const location = dbLocation ?? parsed.location;
  const track = incident.track ?? parsed.track ?? null;

  const dbLine = normalizeIncidentLine(incident.line);
  const parsedLine = normalizeIncidentLine(parsed.line);
  const inferredLine = inferIncidentLineFromLocation(location);
  
  // Prefer explicit line from DB, then parsed token, then infer from location.
  const displayLine = dbLine ?? parsedLine ?? inferredLine;
  
  return {
    line: displayLine,
    track,
    location,
    displayMessage: parsed.displayMessage || incident.message,
  };
}

function getIncidentLineVisual(line: IncidentLine | null) {
  if (!line) {
    const fallback = INCIDENT_LINE_VISUALS.T1;
    return {
      code: "T1",
      color: fallback.color,
      shape: fallback.shape,
      textColor: fallback.textColor ?? "#ffffff",
    };
  }

  const visual = INCIDENT_LINE_VISUALS[line];
  return {
    code: line,
    color: visual.color,
    shape: visual.shape,
    textColor: visual.textColor ?? "#ffffff",
  };
}

function toIncidentActionState(
  payload: ApiIncidentActionState,
): IncidentActionState {
  return {
    passengerAnnouncement: {
      done: payload.passenger_announcement_done,
      doneAt: payload.passenger_announcement_done_at,
      doneBy: payload.passenger_announcement_done_by ?? undefined,
    },
    onCallContact: {
      done: payload.on_call_contact_done,
      doneAt: payload.on_call_contact_done_at,
      doneBy: payload.on_call_contact_done_by ?? undefined,
    },
  };
}

function playAlertSound(level: Severity) {
  try {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const audioCtx = new AudioContext();

    const playChime = (
      freqs: number[],
      type: OscillatorType,
      staggerMs: number,
    ) => {
      freqs.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = type;

        const startTime = audioCtx.currentTime + index * staggerMs;
        osc.frequency.setValueAtTime(freq, startTime);

        // Attack doux, sustain court, release long (comme un carillon/gong d'aéroport)
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.05); // Attack
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.6); // Fade-out

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.65);
      });
    };

    if (level === "ORANGE") {
      // 2 Carillons clairs et nets "Gong" d'annonce standard
      playChime([523.25, 440.0], "sine", 0.3); // Note Do(C5) puis La(A4)
    } else if (level === "RED") {
      // 3 Carillons plus intenses, percutants et clairs
      playChime([659.25, 659.25, 659.25], "triangle", 0.25); // 3x Mi(E5) répétés
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

// Sonnerie de rappel urgente toutes les 10 secondes - forte et percutante pour grande salle
// Sonnerie de rappel (palier 5 min) - douce et légère
function playPeriodicBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    // Créer une notification douce (style "pop" ou clochette légère)
    const playSoftTone = (startTime: number, frequency: number) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      // Utilisation d'une onde 'sine' (sinusoïdale) pour un son doux et rond
      osc.type = "sine"; 
      osc.frequency.setValueAtTime(frequency, startTime);

      // Enveloppe de volume douce
      gainNode.gain.setValueAtTime(0, startTime);
      // Volume maximum beaucoup plus bas (0.3 au lieu de 0.8)
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05); // Attaque douce
      // Extinction progressive et lente
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4); 

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.5); // Durée légèrement plus longue pour le fondu
    };

    const now = audioCtx.currentTime;
    
    // Pattern de notification discret : 2 notes douces (ex: Do aigu puis Sol aigu)
    playSoftTone(now, 1046.50);       // Note 1 (Do 6)
    playSoftTone(now + 0.15, 1567.98); // Note 2 (Sol 6) - très rapide après

  } catch (e) {
    console.error("Periodic beep failed", e);
  }
}

export default function App() {
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [nowTick, setNowTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [selectedIncidentLine, setSelectedIncidentLine] = useState<
    "" | IncidentLine
  >("");
  const [selectedIncidentTrack, setSelectedIncidentTrack] = useState<
    "" | IncidentTrack
  >("");
  const [selectedIncidentLocation, setSelectedIncidentLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [incidentCategories, setIncidentCategories] = useState<Record<string, string[]>>(INCIDENT_CATEGORIES_DEFAULT);
  const [selectedStartLevel, setSelectedStartLevel] = useState<
    "GREEN" | "ORANGE" | "RED"
  >("GREEN");
  const [incidentChoices, setIncidentChoices] =
    useState<string[]>(INCIDENT_CHOICES);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<ApiIncident[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyIncident, setHistoryIncident] = useState("");
  const [historyType, setHistoryType] = useState("");
  const [historyLine, setHistoryLine] = useState<
    "" | (typeof INCIDENT_LINES)[number]
  >("");
  const [historyTrack, setHistoryTrack] = useState<"" | IncidentTrack>("");
  const [historyLocation, setHistoryLocation] = useState("");
  const [historySeverity, setHistorySeverity] = useState<
    "" | "GREEN" | "ORANGE" | "RED"
  >("");
  const [remoteMode, setRemoteMode] = useState<RemoteMode>("direct");
  const [selectedRemoteIncidentId, setSelectedRemoteIncidentId] = useState<
    number | null
  >(null);
  const [actionStateByIncident, setActionStateByIncident] = useState<
    Record<number, IncidentActionState>
  >({});
  const [auditHistory, setAuditHistory] = useState<IncidentAuditEvent[]>([]);
  const [headerVisible, setHeaderVisible] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const headerHoldRef = useRef(false);
  const footerHoldRef = useRef(false);
  const lastPointerYRef = useRef<number | null>(null);
  const severityRefByIncident = useRef<Record<number, Severity>>({});
  const actionStateRef = useRef<Record<number, IncidentActionState>>({});

  const visible = useMemo(() => incidents, [incidents]);
  const isLanding = visible.length === 0;
  const primaryIncident = visible[0] ?? null;
  const selectedRemoteIncident =
    visible.find((incident) => incident.id === selectedRemoteIncidentId) ??
    primaryIncident ??
    null;
  const selectedRemoteIncidentParsed = selectedRemoteIncident
    ? getIncidentDisplay(selectedRemoteIncident)
    : null;

  const selectableLocations = useMemo(() => {
    if (!selectedIncidentLine) return [] as string[];
    return getLocationsForLine(selectedIncidentLine);
  }, [selectedIncidentLine]);

  const suggestedLocations = useMemo(() => {
    return getSmartLocationMatches(selectableLocations, selectedIncidentLocation);
  }, [selectableLocations, selectedIncidentLocation]);

  const firstSuggestedLocation = suggestedLocations[0] ?? "";

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedRemoteIncidentId(null);
      return;
    }

    const hasSelected =
      selectedRemoteIncidentId !== null &&
      visible.some((item) => item.id === selectedRemoteIncidentId);
    if (!hasSelected) {
      setSelectedRemoteIncidentId(visible[0].id);
    }
  }, [visible, selectedRemoteIncidentId]);

  useEffect(() => {
    let cancelled = false;

    const applyChoices = (choices: string[] | Record<string, string[]>) => {
      if (cancelled) return;

      if (typeof choices === "object" && !Array.isArray(choices)) {
        const normalizedCategories = normalizeIncidentCategories(choices);
        if (Object.keys(normalizedCategories).length === 0) return;

        setIncidentCategories(normalizedCategories);
        setIncidentChoices(Object.values(normalizedCategories).flat());
      } else {
        setIncidentChoices(normalizeIncidentChoices(choices));
      }
    };

    const loadChoices = async () => {
      try {
        const remoteChoices = await fetchIncidentChoices();
        applyChoices(remoteChoices);
        return;
      } catch {
        // fallback to local storage if backend is unreachable
      }

      try {
        const raw = window.localStorage.getItem(INCIDENT_CHOICES_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;

        applyChoices(parsed as string[] | Record<string, string[]>);
      } catch {
        // ignore corrupted local storage
      }
    };

    void loadChoices();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      INCIDENT_CHOICES_STORAGE_KEY,
      JSON.stringify(incidentCategories),
    );
  }, [incidentCategories]);

  useEffect(() => {
    try {
      const rawAudit = window.localStorage.getItem(INCIDENT_AUDIT_STORAGE_KEY);
      if (rawAudit) {
        const parsedAudit = JSON.parse(rawAudit) as IncidentAuditEvent[];
        setAuditHistory(parsedAudit);
      }
    } catch {
      // ignore invalid persistence data
    }
  }, []);

  useEffect(() => {
    actionStateRef.current = actionStateByIncident;
  }, [actionStateByIncident]);

  useEffect(() => {
    window.localStorage.setItem(
      INCIDENT_AUDIT_STORAGE_KEY,
      JSON.stringify(auditHistory),
    );
  }, [auditHistory]);

  const syncEdgeUiVisibility = useCallback((pointerY: number | null) => {
    const nearTop = pointerY !== null && pointerY <= TOP_EDGE_REVEAL_PX;
    const nearBottom =
      pointerY !== null &&
      pointerY >= window.innerHeight - BOTTOM_EDGE_REVEAL_PX;

    setHeaderVisible(nearTop || headerHoldRef.current);
    setFooterVisible(nearBottom || footerHoldRef.current);
  }, []);

  const holdHeaderVisible = useCallback(() => {
    headerHoldRef.current = true;
    syncEdgeUiVisibility(lastPointerYRef.current);
  }, [syncEdgeUiVisibility]);

  const releaseHeaderVisible = useCallback(() => {
    headerHoldRef.current = false;
    syncEdgeUiVisibility(lastPointerYRef.current);
  }, [syncEdgeUiVisibility]);

  const holdFooterVisible = useCallback(() => {
    footerHoldRef.current = true;
    syncEdgeUiVisibility(lastPointerYRef.current);
  }, [syncEdgeUiVisibility]);

  const releaseFooterVisible = useCallback(() => {
    footerHoldRef.current = false;
    syncEdgeUiVisibility(lastPointerYRef.current);
  }, [syncEdgeUiVisibility]);

  // Edge reveal: show top/bottom bars only near the screen edges.
  useEffect(() => {
    setHeaderVisible(false);
    setFooterVisible(false);

    const handleMouseMove = (event: MouseEvent) => {
      lastPointerYRef.current = event.clientY;
      syncEdgeUiVisibility(event.clientY);
    };

    const handlePointerLeaveWindow = () => {
      lastPointerYRef.current = null;
      syncEdgeUiVisibility(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handlePointerLeaveWindow);
    window.addEventListener("blur", handlePointerLeaveWindow);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handlePointerLeaveWindow);
      window.removeEventListener("blur", handlePointerLeaveWindow);
    };
  }, [syncEdgeUiVisibility]);

  function pushAuditEvent(event: Omit<IncidentAuditEvent, "id">) {
    const id = `${event.incidentId}-${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAuditHistory((prev) => [{ id, ...event }, ...prev].slice(0, 2000));
  }

  function getActionState(incidentId: number): IncidentActionState {
    return actionStateByIncident[incidentId] ?? createDefaultActionState();
  }

  async function togglePassengerDone(incidentId: number) {
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/incidents/${incidentId}/actions/passenger-announcement/toggle`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("Failed to toggle passenger announcement");
      }

      const payload = (await response.json()) as ApiIncidentActionState;
      const nextState = toIncidentActionState(payload);

      setActionStateByIncident((prev) => ({
        ...prev,
        [incidentId]: nextState,
      }));

      pushAuditEvent({
        incidentId,
        timestamp: new Date().toISOString(),
        type: nextState.passengerAnnouncement.done
          ? "PASSENGER_ANNOUNCEMENT_DONE"
          : "PASSENGER_ANNOUNCEMENT_RESET",
        doneBy: "OPÉRATEUR PCC",
      });
    } catch {
      setError("Impossible de mettre à jour l'annonce voyageurs");
    } finally {
      setBusy(false);
    }
  }

  async function toggleOnCallDone(incidentId: number) {
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/incidents/${incidentId}/actions/on-call/toggle`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("Failed to toggle on-call contact");
      }

      const payload = (await response.json()) as ApiIncidentActionState;
      const nextState = toIncidentActionState(payload);

      setActionStateByIncident((prev) => ({
        ...prev,
        [incidentId]: nextState,
      }));

      pushAuditEvent({
        incidentId,
        timestamp: new Date().toISOString(),
        type: nextState.onCallContact.done
          ? "ON_CALL_CONTACT_DONE"
          : "ON_CALL_CONTACT_RESET",
        doneBy: "OPÉRATEUR PCC",
      });
    } catch {
      setError("Impossible de mettre à jour l'astreinte");
    } finally {
      setBusy(false);
    }
  }

  async function fetchActive() {
    const response = await fetch(`${API_BASE_URL}/api/incidents/active`);
    if (!response.ok) {
      throw new Error("Failed to load active incidents");
    }
    const data = (await response.json()) as ApiIncident[];
    setIncidents(data);
  }

  async function fetchIncidentActions() {
    const response = await fetch(`${API_BASE_URL}/api/incidents/actions`);
    if (!response.ok) {
      throw new Error("Failed to load incident actions");
    }

    const payload = (await response.json()) as ApiIncidentActionState[];
    const nextByIncident = payload.reduce<Record<number, IncidentActionState>>(
      (acc, item) => {
        acc[item.incident_id] = toIncidentActionState(item);
        return acc;
      },
      {},
    );

    setActionStateByIncident(nextByIncident);
  }

  async function fetchIncidentChoices() {
    const response = await fetch(`${API_BASE_URL}/api/incidents/choices`);
    if (!response.ok) {
      throw new Error("Failed to load incident choices");
    }

    const payload = (await response.json()) as unknown;

    const normalizedCategories = normalizeIncidentCategories(payload);
    if (Object.keys(normalizedCategories).length > 0) {
      return normalizedCategories;
    }

    // Fall back to flat list format
    return normalizeIncidentChoices(payload);
  }

  async function syncLiveData() {
    await fetchActive();
    try {
      await fetchIncidentActions();
    } catch {
      // Keep core flow working even if action-state endpoint is temporarily unavailable.
    }
  }

  async function fetchHistory(filters?: {
    from?: string;
    to?: string;
    incident?: string;
    incidentType?: string;
    line?: "" | (typeof INCIDENT_LINES)[number];
    track?: "" | IncidentTrack;
    location?: string;
    severity?: "" | "GREEN" | "ORANGE" | "RED";
  }) {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", "RESOLVED");
      params.set("limit", "200");
      params.set("offset", "0");

      if (filters?.from) {
        params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
      }
      if (filters?.to) {
        params.set("to", new Date(`${filters.to}T23:59:59`).toISOString());
      }
      if (filters?.incident && filters.incident.trim()) {
        params.set("incident", filters.incident.trim());
      }
      if (filters?.incidentType && filters.incidentType.trim()) {
        params.set("incident_type", filters.incidentType.trim());
      }
      if (filters?.line) {
        params.set("line", filters.line);
      }
      if (filters?.track) {
        params.set("track", String(filters.track));
      }
      if (filters?.location && filters.location.trim()) {
        params.set("location", filters.location.trim());
      }
      if (filters?.severity) {
        params.set("severity", filters.severity);
      }

      const response = await fetch(
        `${API_BASE_URL}/api/incidents/history?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load history");
      }
      const payload = (await response.json()) as HistoryResponse;
      const lineFilter = filters?.line ?? "";
      const locationFilter = (filters?.location ?? "").trim().toLowerCase();
      const filteredByLine = lineFilter
        ? payload.items.filter(
          (item) => getIncidentDisplay(item).line === lineFilter,
        )
        : payload.items;

      const filteredItems = locationFilter
        ? filteredByLine.filter((item) => {
          const itemLocation =
            getIncidentDisplay(item).location?.toLowerCase() ?? "";
          return itemLocation.includes(locationFilter);
        })
        : filteredByLine;
      setHistoryItems(filteredItems);
    } catch {
      setHistoryError("Impossible de charger l'historique");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistory() {
    setShowHistory(true);
    void fetchHistory({
      from: historyFrom,
      to: historyTo,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      track: historyTrack,
      location: historyLocation,
      severity: historySeverity,
    });
  }

  function applyHistoryFilters() {
    void fetchHistory({
      from: historyFrom,
      to: historyTo,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      track: historyTrack,
      location: historyLocation,
      severity: historySeverity,
    });
  }

  function submitHistoryFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyHistoryFilters();
  }

  function clearHistoryFilters() {
    setHistoryFrom("");
    setHistoryTo("");
    setHistoryIncident("");
    setHistoryType("");
    setHistoryLine("");
    setHistoryTrack("");
    setHistoryLocation("");
    setHistorySeverity("");
    void fetchHistory();
  }

  function applyTodayPreset() {
    const today = toDateInputValue(new Date());
    setHistoryFrom(today);
    setHistoryTo(today);
    void fetchHistory({
      from: today,
      to: today,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      track: historyTrack,
      location: historyLocation,
      severity: historySeverity,
    });
  }

  function applyYesterdayPreset() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const yesterday = toDateInputValue(date);
    setHistoryFrom(yesterday);
    setHistoryTo(yesterday);
    void fetchHistory({
      from: yesterday,
      to: yesterday,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      track: historyTrack,
      location: historyLocation,
      severity: historySeverity,
    });
  }

  function applyThisWeekPreset() {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const start = toDateInputValue(monday);
    const end = toDateInputValue(now);
    setHistoryFrom(start);
    setHistoryTo(end);
    void fetchHistory({
      from: start,
      to: end,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      track: historyTrack,
      location: historyLocation,
      severity: historySeverity,
    });
  }

  function exportHistoryCsv() {
    const headers = [
      "ligne",
      "voie",
      "localisation",
      "incident",
      "debut",
      "resolution",
      "duree",
      "statut",
      "niveau_max",
    ];
    const rows = historyItems.map((item) => {
      const parsed = getIncidentDisplay(item);
      return [
        parsed.line ?? "",
        parsed.track ?? "",
        parsed.location ?? "",
        parsed.displayMessage,
        item.started_at,
        item.resolved_at ?? "",
        formatDuration(item.duration_seconds),
        item.status,
        item.max_level_reached,
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsv(String(cell))).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `historique-incidents-${timestamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function startIncident(
    message: string,
    startLevel: "GREEN" | "ORANGE" | "RED",
    line: "" | IncidentLine = selectedIncidentLine,
    track: "" | IncidentTrack = selectedIncidentTrack,
    location: string = selectedIncidentLocation,
  ) {
    if (busy) return;
    const trimmedMessage = message.trim();
    const trimmedLocation = location.trim();
    if (!trimmedMessage) {
      setError("Le texte de l'incident est obligatoire");
      return;
    }
    if (!line) {
      setError("Veuillez sélectionner une ligne avant de démarrer l'incident");
      return;
    }
    if (!track) {
      setError("Veuillez sélectionner la voie (1 ou 2) avant de démarrer l'incident");
      return;
    }
    if (!trimmedLocation) {
      setError(
        "Veuillez sélectionner une station ou interstation avant de démarrer l'incident",
      );
      return;
    }

    const lineLocations = getLocationsForLine(line);
    const normalizedTypedLocation = normalizeSearchText(trimmedLocation);
    const exactLocationMatch = lineLocations.find(
      (candidate) => normalizeSearchText(candidate) === normalizedTypedLocation,
    );
    const resolvedLocation =
      exactLocationMatch ??
      getSmartLocationMatches(lineLocations, trimmedLocation)[0] ??
      "";

    if (!resolvedLocation) {
      setError(
        "Localisation introuvable pour cette ligne, veuillez choisir une suggestion",
      );
      return;
    }

    const classifiedLocation = classifyLocationForLine(line, resolvedLocation);

    setBusy(true);
    setError(null);
    try {
      const encodedMessage = `[TRK:${track}] ${trimmedMessage}`;

      const response = await fetch(`${API_BASE_URL}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: encodedMessage,
          start_level: startLevel,
          line,
          track,
          station: classifiedLocation.station,
          interstation: classifiedLocation.interstation,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to create incident");
      }
      const created = (await response.json()) as ApiIncident;
      pushAuditEvent({
        incidentId: created.id,
        timestamp: new Date().toISOString(),
        type: "INCIDENT_STARTED",
        severity: startLevel,
        note: created.message,
      });

      // Close chooser as soon as incident creation succeeds.
      setSelectedIncidentTrack("");
      setSelectedIncidentLocation("");
      setShowChooser(false);

      await syncLiveData();
    } catch {
      setError("Impossible de créer l'incident");
    } finally {
      setBusy(false);
    }
  }

  async function resolveIncident(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/incidents/${id}/resolve`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("Failed to resolve incident");
      }
      pushAuditEvent({
        incidentId: id,
        timestamp: new Date().toISOString(),
        type: "INCIDENT_RESOLVED",
        doneBy: "OPÉRATEUR PCC",
      });
      await syncLiveData();
    } catch {
      setError("Impossible de résoudre l'incident");
    } finally {
      setBusy(false);
    }
  }

  async function forceRedIncident(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/incidents/${id}/force-red`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("Failed to force red");
      }
      pushAuditEvent({
        incidentId: id,
        timestamp: new Date().toISOString(),
        type: "SEVERITY_CHANGED",
        severity: "RED",
        doneBy: "OPÉRATEUR PCC",
      });
      await syncLiveData();
    } catch {
      setError("Impossible de passer en rouge");
    } finally {
      setBusy(false);
    }
  }

  async function forceOrangeIncident(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/incidents/${id}/force-orange`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("Failed to force orange");
      }
      pushAuditEvent({
        incidentId: id,
        timestamp: new Date().toISOString(),
        type: "SEVERITY_CHANGED",
        severity: "ORANGE",
        doneBy: "OPÉRATEUR PCC",
      });
      await syncLiveData();
    } catch {
      setError("Impossible de passer en orange");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void syncLiveData().catch(() =>
      setError("Impossible de charger les incidents"),
    );
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick((v) => v + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Référence pour tracker le dernier palier de 5 minutes atteint par incident
  const lastBeepMinuteRef = useRef<Record<number, number>>({});

  // Sonnerie à chaque palier de 5 minutes du minuteur (5, 10, 15, 20, ...)
  useEffect(() => {
    if (incidents.length === 0) {
      lastBeepMinuteRef.current = {};
      return;
    }

    // Vérifier chaque seconde si on a atteint un nouveau palier de 5 minutes
    incidents.forEach((incident) => {
      const elapsed = elapsedSeconds(incident.started_at);
      const elapsedMinutes = Math.floor(elapsed / 60);
      const currentFiveMinMark = Math.floor(elapsedMinutes / 5) * 5;

      // Ne sonner que si on atteint un nouveau palier de 5 minutes (5, 10, 15, ...)
      if (currentFiveMinMark > 0) {
        const lastBeeped = lastBeepMinuteRef.current[incident.id] ?? 0;
        if (currentFiveMinMark > lastBeeped) {
          lastBeepMinuteRef.current[incident.id] = currentFiveMinMark;
          playPeriodicBeep();
        }
      }
    });
  }, [nowTick, incidents]);

  useEffect(() => {
    let pollingId: number | undefined;
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (pollingId !== undefined) {
        clearInterval(pollingId);
        pollingId = undefined;
      }
      ws.send("ping");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { event?: string };
        if (payload.event === "incident_choices_updated") {
          void fetchIncidentChoices()
            .then((choices) => {
              if (typeof choices === "object" && !Array.isArray(choices)) {
                setIncidentCategories(choices);
                setIncidentChoices(Object.values(choices).flat());
              } else {
                setIncidentChoices(choices);
              }
            })
            .catch(() => {
              // ignore transient choice-refresh errors
            });
        }
      } catch {
        // ignore malformed websocket payloads
      }

      void syncLiveData().catch(() =>
        setError("Impossible de charger les incidents"),
      );
    };

    ws.onerror = () => {
      if (pollingId === undefined) {
        pollingId = window.setInterval(() => {
          void syncLiveData().catch(() =>
            setError("Impossible de charger les incidents"),
          );
        }, 5000);
      }
    };

    ws.onclose = () => {
      if (pollingId === undefined) {
        pollingId = window.setInterval(() => {
          void syncLiveData().catch(() =>
            setError("Impossible de charger les incidents"),
          );
        }, 5000);
      }
    };

    return () => {
      ws.close();
      if (pollingId !== undefined) {
        clearInterval(pollingId);
      }
    };
  }, []);

  useEffect(() => {
    const nextByIncident: Record<number, Severity> = {};

    for (const incident of visible) {
      const severity = getCurrentLevel(
        incident,
        elapsedSeconds(incident.started_at),
      );
      nextByIncident[incident.id] = severity;

      const previousSeverity = severityRefByIncident.current[incident.id];
      if (previousSeverity && previousSeverity !== severity) {
        pushAuditEvent({
          incidentId: incident.id,
          timestamp: new Date().toISOString(),
          type: "SEVERITY_CHANGED",
          severity,
        });

        // Jouer un son d'alerte lors du changement de niveau
        playAlertSound(severity);
      }
    }

    severityRefByIncident.current = nextByIncident;
  }, [visible, nowTick]);

  function closeTransientPanels() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    if (showChooser) {
      setShowChooser(false);
      return;
    }
    setRemoteMode("direct");
  }

  function runPrimaryAction() {
    if (!selectedRemoteIncident) {
      setShowChooser(true);
      return;
    }

    const elapsed = elapsedSeconds(selectedRemoteIncident.started_at);
    const severity = getCurrentLevel(selectedRemoteIncident, elapsed);
    const actionState =
      actionStateRef.current[selectedRemoteIncident.id] ??
      createDefaultActionState();

    if (!actionState.passengerAnnouncement.done) {
      togglePassengerDone(selectedRemoteIncident.id);
      return;
    }

    if (severity === "RED" && !actionState.onCallContact.done) {
      toggleOnCallDone(selectedRemoteIncident.id);
    }
  }

  function runSecureResolveFromRemote() {
    if (!selectedRemoteIncident || busy) return;
    void resolveIncident(selectedRemoteIncident.id);
  }

  function selectPreviousIncident() {
    if (visible.length <= 1 || !selectedRemoteIncident) return;
    const currentIndex = visible.findIndex(
      (item) => item.id === selectedRemoteIncident.id,
    );
    const nextIndex = (currentIndex - 1 + visible.length) % visible.length;
    setSelectedRemoteIncidentId(visible[nextIndex].id);
  }

  function selectNextIncident() {
    if (visible.length <= 1 || !selectedRemoteIncident) return;
    const currentIndex = visible.findIndex(
      (item) => item.id === selectedRemoteIncident.id,
    );
    const nextIndex = (currentIndex + 1) % visible.length;
    setSelectedRemoteIncidentId(visible[nextIndex].id);
  }

  const remoteTargetIds = [
    "action-passenger",
    "action-oncall",
    "remote-target-prev",
    "remote-target-next",
    "remote-mode",
    "remote-passenger",
    "remote-oncall",
    "remote-resolve",
    "toolbar-add",
    "toolbar-history",
  ];

  useRemoteNavigation({
    enabled: !showChooser && !showHistory,
    mode: remoteMode,
    targetIds: remoteTargetIds,
    onPrimaryAction: runPrimaryAction,
    onSecureResolveAction: runSecureResolveFromRemote,
    onBackAction: closeTransientPanels,
  });

  return (
    <div
      className={`screen ${visible.length >= 2 ? "split" : "single-tv-fit"} ${visible.length === 0 ? "no-incident" : "with-incident"} ${headerVisible ? "ui-header-visible" : ""} ${visible.length > 0 && footerVisible ? "ui-footer-visible" : ""}`}
    >
      {(!isLanding || error) && (
        <div
          className={`toolbar ${headerVisible ? "is-visible" : "is-hidden"}`}
          onMouseEnter={holdHeaderVisible}
          onMouseLeave={releaseHeaderVisible}
          onFocusCapture={holdHeaderVisible}
          onBlurCapture={(event) => {
            const nextFocused = event.relatedTarget;
            if (
              !(nextFocused instanceof Node) ||
              !event.currentTarget.contains(nextFocused)
            ) {
              releaseHeaderVisible();
            }
          }}
        >
          {!isLanding && (
            <>
              <button
                data-remote-id="toolbar-add"
                className="add-btn"
                onClick={() => setShowChooser(true)}
                disabled={busy}
              >
                + Ajouter incident
              </button>
              <button
                data-remote-id="toolbar-history"
                className="history-btn"
                onClick={openHistory}
                disabled={busy}
              >
                Historique
              </button>
            </>
          )}
          {error && <div className="error-msg">{error}</div>}
        </div>
      )}

      {isLanding ? (
        <PccLanding
          busy={busy}
          onStartIncident={() => setShowChooser(true)}
          onOpenHistory={openHistory}
        />
      ) : (
        visible.map((incident) => {
          const isSingleIncidentView = visible.length === 1;
          const parsedIncident = getIncidentDisplay(incident);
          const incidentTitleLines = splitTextIntoTwoLines(
            parsedIncident.displayMessage,
          );
          const elapsed = elapsedSeconds(incident.started_at);
          const currentLevel = getCurrentLevel(incident, elapsed);
          const incidentActionState = getActionState(incident.id);
          const levelClass = currentLevel.toLowerCase();
          const isSelectedRemoteTarget =
            selectedRemoteIncident?.id === incident.id;
          const durationParts = formatHHMMSS(elapsed).split(":");
          const lineVisual = getIncidentLineVisual(parsedIncident.line);
          const displayLocation = parsedIncident.location?.trim() || null;
          const displayTrack = parsedIncident.track
            ? `Voie ${parsedIncident.track}`
            : "Voie a definir";
          // Traiter la date comme heure locale (pas UTC)
          const cleanDateString = incident.started_at.replace("Z", "").split(".")[0];
          const [datePart, timePart] = cleanDateString.split("T");
          const [year, month, day] = datePart.split("-").map(Number);
          const [hour, minute, second] = timePart.split(":").map(Number);
          const localStartedAt = new Date(year, month - 1, day, hour, minute, second);
          const startedAtClock = localStartedAt.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
          return (
            <section
              key={incident.id}
              className={`panel incident-v2 ${levelClass} ${isSelectedRemoteTarget ? "panel-selected" : ""}`}
            >
              <div className={`incident-v2-accent incident-v2-accent-${levelClass}`} />

              <div
                className="incident-v2-side-badges"
                aria-label={`Niveau ${getSeverityLabel(currentLevel)} - Ligne ${lineVisual.code}`}
              >
                <div className="panel-level-tag">
                  {getSeverityLabel(currentLevel)}
                </div>

                <div className={`incident-v2-ring incident-v2-ring-${levelClass}`}>
                  <div
                    className={`incident-v2-line-mark ${lineVisual.shape === "diamond" ? "is-diamond" : "is-circle"}`}
                    style={{ backgroundColor: lineVisual.color, color: lineVisual.textColor }}
                    aria-label={`Ligne ${lineVisual.code}`}
                  >
                    <span>{lineVisual.code}</span>
                  </div>
                </div>
              </div>

              <div className="incident-v2-topbar">
                <div
                  className={`panel-notifications ${currentLevel === "RED" ? "panel-notifications-critical" : ""}`}
                >
                  <button
                    type="button"
                    data-remote-id="action-passenger"
                    className={`panel-badge ${incidentActionState.passengerAnnouncement.done ? "is-done" : "is-blinking"}`}
                    onClick={() => togglePassengerDone(incident.id)}
                  >
                    {incidentActionState.passengerAnnouncement.done
                      ? "✅ ANNONCE FAITE"
                      : "⚠️ ANNONCE VOYAGEUR REQUISE"}
                  </button>
                  {currentLevel === "RED" && (
                    <button
                      type="button"
                      data-remote-id="action-oncall"
                      className={`panel-badge ${incidentActionState.onCallContact.done ? "is-done" : "is-critical is-blinking"}`}
                      onClick={() => toggleOnCallDone(incident.id)}
                    >
                      {incidentActionState.onCallContact.done
                        ? "✅ ASTREINTE EST CONTACTÉE"
                        : "🚨 ASTREINTE REQUISE CRITIQUE"}
                    </button>
                  )}
                </div>
              </div>

              <div className="incident-v2-main">
                {displayLocation ? (
                  <div className="incident-v2-station">{displayLocation}</div>
                ) : null}
                <div className={`incident-v2-line-track ${parsedIncident.track ? "" : "is-missing"}`}>
                  {displayTrack}
                </div>

                <div
                  className={`incident-v2-incident-name ${isSingleIncidentView ? "incident-v2-incident-name-two-lines" : ""}`}
                >
                  {isSingleIncidentView ? (
                    <>
                      <span className="incident-v2-name-line">{incidentTitleLines.firstLine}</span>
                      {incidentTitleLines.secondLine ? (
                        <span className="incident-v2-name-line">{incidentTitleLines.secondLine}</span>
                      ) : null}
                    </>
                  ) : (
                    parsedIncident.displayMessage
                  )}
                </div>

                <div className="incident-v2-started-time">
                  Déclenché à {startedAtClock}
                </div>

                <div className="incident-v2-duration-wrap">
                  <div className="incident-v2-duration-title">Durée incident</div>
                  <div className="incident-v2-time-grid">
                    <div className="incident-v2-time-block">
                      <span className="incident-v2-time-value">{durationParts[0]}</span>
                      <span className="incident-v2-time-label">Heures</span>
                    </div>
                    <span className="incident-v2-time-sep">:</span>
                    <div className="incident-v2-time-block">
                      <span className="incident-v2-time-value">{durationParts[1]}</span>
                      <span className="incident-v2-time-label">Minutes</span>
                    </div>
                    <span className="incident-v2-time-sep">:</span>
                    <div className="incident-v2-time-block">
                      <span className="incident-v2-time-value">{durationParts[2]}</span>
                      <span className="incident-v2-time-label">Secondes</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="incident-v2-actions">
                {currentLevel === "GREEN" && (
                  <button
                    className="force-orange-btn"
                    onClick={() => void forceOrangeIncident(incident.id)}
                    disabled={busy}
                  >
                    {busy ? "..." : "Passer en modéré"}
                  </button>
                )}
                {currentLevel !== "RED" && (
                  <button
                    className="force-red-btn"
                    onClick={() => void forceRedIncident(incident.id)}
                    disabled={busy}
                  >
                    {busy ? "..." : "Passer en critique"}
                  </button>
                )}
              </div>
            </section>
          );
        })
      )}

      {visible.length > 0 && (
        <footer
          className={`remote-footer-overlay ${footerVisible ? "is-visible" : "is-hidden"}`}
          aria-label="Footer télécommande"
          onMouseEnter={holdFooterVisible}
          onMouseLeave={releaseFooterVisible}
          onFocusCapture={holdFooterVisible}
          onBlurCapture={(event) => {
            const nextFocused = event.relatedTarget;
            if (
              !(nextFocused instanceof Node) ||
              !event.currentTarget.contains(nextFocused)
            ) {
              releaseFooterVisible();
            }
          }}
        >
          <RemoteActionBar
            mode={remoteMode}
            busy={busy}
            canResolve={Boolean(selectedRemoteIncident)}
            targetIncidentLabel={
              selectedRemoteIncident
                ? `#${selectedRemoteIncident.id} — Voie: ${selectedRemoteIncidentParsed?.track ?? selectedRemoteIncident.track ?? "-"} — ${selectedRemoteIncidentParsed?.displayMessage ?? selectedRemoteIncident.message}`
                : "Aucun incident"
            }
            onSelectPreviousIncident={selectPreviousIncident}
            onSelectNextIncident={selectNextIncident}
            onToggleMode={() =>
              setRemoteMode((prev) =>
                prev === "direct" ? "navigation" : "direct",
              )
            }
            onPassengerAction={() => {
              if (!selectedRemoteIncident) return;
              togglePassengerDone(selectedRemoteIncident.id);
            }}
            onOnCallAction={() => {
              if (!selectedRemoteIncident) return;
              toggleOnCallDone(selectedRemoteIncident.id);
            }}
            onResolveAction={runSecureResolveFromRemote}
          />
        </footer>
      )}

      {showChooser && (
        <div className="modal-overlay" onClick={() => setShowChooser(false)}>
          <div
            className="modal chooser-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Choisir un incident</h2>
            <div className="level-select">
              <button
                className={`level-btn ${selectedStartLevel === "GREEN" ? "active green" : ""}`}
                onClick={() => setSelectedStartLevel("GREEN")}
                disabled={busy}
              >
                Départ Mineur
              </button>
              <button
                className={`level-btn ${selectedStartLevel === "ORANGE" ? "active orange" : ""}`}
                onClick={() => setSelectedStartLevel("ORANGE")}
                disabled={busy}
              >
                Départ Modéré
              </button>
              <button
                className={`level-btn ${selectedStartLevel === "RED" ? "active red" : ""}`}
                onClick={() => setSelectedStartLevel("RED")}
                disabled={busy}
              >
                Départ Critique
              </button>
            </div>
            <label className="incident-line-field">
              <span>Ligne concernée</span>
              <select
                value={selectedIncidentLine}
                onChange={(event) => {
                  setSelectedIncidentLine(event.target.value as "" | IncidentLine);
                  setSelectedIncidentTrack("");
                  setSelectedIncidentLocation(""); // RÉINITIALISE LA STATION LORS DU CHANGEMENT
                }}
                disabled={busy}
              >
                <option value="">Choisir une ligne...</option>
                {INCIDENT_LINES.map((line) => (
                  <option key={line} value={line}>
                    {line}
                  </option>
                ))}
              </select>
            </label>

            <label className="incident-line-field">
              <span>Voie</span>
              <select
                value={selectedIncidentTrack === "" ? "" : String(selectedIncidentTrack)}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "") {
                    setSelectedIncidentTrack("");
                    return;
                  }
                  setSelectedIncidentTrack(Number(value) as IncidentTrack);
                }}
                disabled={busy || !selectedIncidentLine}
              >
                <option value="">Choisir une voie...</option>
                <option value="1">Voie 1</option>
                <option value="2">Voie 2</option>
              </select>
            </label>

            <label className="incident-line-field">
              <span>Station / Interstation</span>
              <input
                type="text"
                list="incident-location-suggestions"
                value={selectedIncidentLocation}
                onChange={(event) => setSelectedIncidentLocation(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (!firstSuggestedLocation) return;
                  setSelectedIncidentLocation(firstSuggestedLocation);
                }}
                placeholder="Tapez pour rechercher (ex: hassani, hay, oasis...)"
                autoComplete="off"
                disabled={busy || !selectedIncidentLine}
              />
              <datalist id="incident-location-suggestions">
                {suggestedLocations.slice(0, 80).map((location, index) => (
                  <option key={`location-suggest-${index}`} value={location} />
                ))}
              </datalist>
            </label>

            <label className="incident-line-field">
              <span>Catégorie d'incident</span>
              <select
                value={selectedCategory}
                onChange={(event) => {
                  setSelectedCategory(event.target.value);
                  setSelectedSubcategory("");
                }}
                disabled={busy}
              >
                <option value="">Choisir une catégorie...</option>
                {Object.keys(incidentCategories).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>

            {selectedCategory && (
              <label className="incident-line-field">
                <span>Type d'incident</span>
                <select
                  value={selectedSubcategory}
                  onChange={(event) => setSelectedSubcategory(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Choisir un incident...</option>
                  {incidentCategories[selectedCategory].map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              className="custom-launch-btn"
              style={{ marginTop: 20, width: "100%" }}
              onClick={() =>
                void startIncident(
                  selectedCategory
                    ? `${selectedCategory} - ${selectedSubcategory}`
                    : selectedSubcategory,
                  selectedStartLevel,
                  selectedIncidentLine,
                  selectedIncidentTrack,
                  selectedIncidentLocation,
                )
              }
              disabled={
                busy ||
                !selectedSubcategory ||
                !selectedIncidentLine ||
                !selectedIncidentTrack ||
                !selectedIncidentLocation
              }
            >
              Démarrer incident
            </button>
            <button
              className="close-btn"
              onClick={() => setShowChooser(false)}
              disabled={busy}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div
            className="modal history-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Historique des incidents</h2>
            <form className="history-controls" onSubmit={submitHistoryFilters}>
              <div className="history-filters-grid">
                <label className="history-field">
                  <span>Date début</span>
                  <input
                    type="date"
                    lang="fr-FR"
                    value={historyFrom}
                    onChange={(event) => setHistoryFrom(event.target.value)}
                  />
                </label>
                <label className="history-field">
                  <span>Date fin</span>
                  <input
                    type="date"
                    lang="fr-FR"
                    value={historyTo}
                    onChange={(event) => setHistoryTo(event.target.value)}
                  />
                </label>
                <label className="history-field">
                  <span>Gravité</span>
                  <select
                    value={historySeverity}
                    onChange={(event) =>
                      setHistorySeverity(
                        event.target.value as "" | "GREEN" | "ORANGE" | "RED",
                      )
                    }
                  >
                    <option value="">Toutes gravités</option>
                    <option value="GREEN">Mineur</option>
                    <option value="ORANGE">Modéré</option>
                    <option value="RED">Critique</option>
                  </select>
                </label>
                <label className="history-field">
                  <span>Type d'incident</span>
                  <select
                    value={historyType}
                    onChange={(event) => setHistoryType(event.target.value)}
                  >
                    <option value="">Tous types</option>
                    {incidentChoices.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                </label>




                <label className="history-field">
                  <span>Ligne</span>
                  <select
                    value={historyLine}
                    onChange={(event) => {
                      setHistoryLine(
                        event.target.value as "" | (typeof INCIDENT_LINES)[number],
                      );
                      setHistoryLocation(""); // RÉINITIALISE LA STATION QUAND ON CHANGE DE FILTRE LIGNE
                    }}
                  >
                    <option value="">Toutes lignes</option>
                    {INCIDENT_LINES.map((line) => (
                      <option key={line} value={line}>
                        {line}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="history-field">
                  <span>Voie</span>
                  <select
                    value={historyTrack === "" ? "" : String(historyTrack)}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "") {
                        setHistoryTrack("");
                        return;
                      }
                      setHistoryTrack(Number(value) as IncidentTrack);
                    }}
                  >
                    <option value="">Toutes voies</option>
                    <option value="1">Voie 1</option>
                    <option value="2">Voie 2</option>
                  </select>
                </label>

                <label className="history-field">
                  <span>Localisation</span>
                  <select
                    value={historyLocation}
                    onChange={(event) =>
                      setHistoryLocation(event.target.value)
                    }
                  >
                    <option value="">Toutes localisations</option>
                    <optgroup label="Stations">
                      {/* Si une ligne est choisie on filtre, sinon on montre toutes les stations */}
                      {(historyLine ? STATIONS_DATA[historyLine].stations : ALL_STATIONS).map((station, index) => (
                        <option key={`history-station-${index}`} value={station}>
                          {station}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Interstations">
                      {/* Si une ligne est choisie on filtre, sinon on montre toutes les interstations */}
                      {(historyLine ? STATIONS_DATA[historyLine].interstations : ALL_INTERSTATIONS).map((interstation, index) => (
                        <option
                          key={`history-interstation-${index}`}
                          value={interstation}
                        >
                          {interstation}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                
                <label className="history-field history-field-wide">
                  <span>Recherche incident</span>
                  <input
                    type="text"
                    className="history-incident-input"
                    value={historyIncident}
                    onChange={(event) => setHistoryIncident(event.target.value)}
                    placeholder="Texte incident..."
                  />
                </label>
              </div>

              <div className="history-filters-actions">
                <button
                  type="submit"
                  className="filter-btn"
                  disabled={historyLoading}
                >
                  Appliquer
                </button>
                <button
                  type="button"
                  className="filter-btn secondary"
                  onClick={clearHistoryFilters}
                  disabled={historyLoading}
                >
                  Réinitialiser
                </button>
                <button
                  type="button"
                  className="filter-btn success"
                  onClick={exportHistoryCsv}
                  disabled={historyLoading || historyItems.length === 0}
                >
                  Exporter CSV
                </button>
              </div>
            </form>
            <div className="history-presets">
              <button
                className="preset-btn"
                onClick={applyTodayPreset}
                disabled={historyLoading}
              >
                Aujourd'hui
              </button>
              <button
                className="preset-btn"
                onClick={applyYesterdayPreset}
                disabled={historyLoading}
              >
                Hier
              </button>
              <button
                className="preset-btn"
                onClick={applyThisWeekPreset}
                disabled={historyLoading}
              >
                Cette semaine
              </button>
            </div>
            {historyLoading && (
              <div className="history-state">Chargement...</div>
            )}
            {historyError && (
              <div className="history-state error-text">{historyError}</div>
            )}

            {!historyLoading && !historyError && (
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Voie</th>
                      <th>Localisation</th>
                      <th>Incident</th>
                      <th>Gravité max</th>
                      <th>Début</th>
                      <th>Résolution</th>
                      <th>Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.length === 0 ? (
                      <tr>
                        <td colSpan={8}>Aucun incident résolu</td>
                      </tr>
                    ) : (
                      historyItems.map((item) => {
                        const parsed = getIncidentDisplay(item);
                        return (
                          <tr key={item.id}>
                            <td>{item.line ?? parsed.line ?? "-"}</td>
                            <td>{parsed.track ?? item.track ?? "-"}</td>
                            <td>{parsed.location ?? "-"}</td>
                            <td>{parsed.displayMessage}</td>
                            <td>{getSeverityLabel(item.max_level_reached)}</td>
                            <td>{formatDateTime(item.started_at)}</td>
                            <td>{formatDateTime(item.resolved_at)}</td>
                            <td>{formatDuration(item.duration_seconds)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <button className="close-btn" onClick={() => setShowHistory(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      <span className="hidden-tick">{nowTick}</span>
    </div>
  );
}
