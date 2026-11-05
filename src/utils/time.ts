/**
 * Time utility functions for prayer timing conversions.
 * ConnectMasjid stores times as integer minutes from midnight (0 to 1439).
 */

export interface FormattedTime {
  minutes: number;
  time12: string;
  time24: string;
}

/**
 * Converts integer minutes from midnight (0 - 1439) into human-readable 12-hour and 24-hour strings.
 */
export function minutesToFormattedTime(minutes: number): FormattedTime {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;

  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const period = hours24 < 12 ? "AM" : "PM";

  const pad = (n: number) => n.toString().padStart(2, "0");

  return {
    minutes: normalized,
    time12: `${pad(hours12)}:${pad(mins)} ${period}`,
    time24: `${pad(hours24)}:${pad(mins)}`,
  };
}

/**
 * Parses either a time string ("06:30 AM", "6:30", "18:45") or numeric minutes into minutes from midnight.
 */
export function parseTimeToMinutes(input: string | number): number {
  if (typeof input === "number") {
    if (isNaN(input) || input < 0 || input >= 1440) {
      throw new Error(`Invalid minute value ${input}. Must be between 0 and 1439.`);
    }
    return Math.floor(input);
  }

  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = parseInt(trimmed, 10);
    if (parsed < 0 || parsed >= 1440) {
      throw new Error(`Invalid minute value ${parsed}. Must be between 0 and 1439.`);
    }
    return parsed;
  }

  // Check 12-hour format with AM/PM: e.g. "06:30 AM", "6:30pm", "12:15 AM"
  const ampmMatch = trimmed.match(/^(\d{1,2})[:.](\d{2})\s*([AaPp][Mm])$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const meridiem = ampmMatch[3].toUpperCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      throw new Error(`Invalid 12-hour time format: "${input}". Hours must be 1-12, minutes 0-59.`);
    }

    if (meridiem === "AM" && hours === 12) {
      hours = 0;
    } else if (meridiem === "PM" && hours !== 12) {
      hours += 12;
    }

    return hours * 60 + minutes;
  }

  // Check 24-hour format: e.g. "18:30", "06:05", "6:05"
  const match24 = trimmed.match(/^(\d{1,2})[:.](\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error(`Invalid 24-hour time format: "${input}". Hours must be 0-23, minutes 0-59.`);
    }

    return hours * 60 + minutes;
  }

  throw new Error(
    `Unrecognized time format: "${input}". Accepted formats: "06:30 AM", "6:30 PM", "18:30", or integer minutes (0-1439).`
  );
}

/**
 * Standardizes common prayer names to the format expected by cmz-backend.
 */
export function normalizePrayerName(name: string): string {
  const lower = name.trim().toLowerCase();
  switch (lower) {
    case "fajr":
      return "Fajr";
    case "shourouq":
    case "shuruq":
    case "sunrise":
      return "Sunrise";
    case "dhuhr":
    case "dhur":
    case "zuhr":
      return "Dhur";
    case "asr":
    case "asar":
      return "Asar";
    case "maghrib":
    case "magrib":
      return "Maghrib";
    case "isha":
    case "ishaa":
      return "Isha";
    case "jummah":
    case "jumuah":
    case "juma":
      return "Jummah";
    default:
      // Capitalize first letter
      return name.charAt(0).toUpperCase() + name.slice(1);
  }
}
