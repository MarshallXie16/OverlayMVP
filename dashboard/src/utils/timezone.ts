/**
 * Timezone utilities for date formatting with user timezone preferences.
 * Uses native Intl.DateTimeFormat API - no external libraries required.
 */

/**
 * Common timezones organized by region for the dropdown selector.
 * Uses IANA timezone identifiers.
 */
export const TIMEZONE_OPTIONS = [
  // Americas
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Sao_Paulo", label: "Brasilia Time (Sao Paulo)" },

  // Europe
  { value: "Europe/London", label: "Greenwich Mean Time (London)" },
  { value: "Europe/Paris", label: "Central European Time (Paris)" },
  { value: "Europe/Berlin", label: "Central European Time (Berlin)" },
  { value: "Europe/Moscow", label: "Moscow Time" },

  // Asia
  { value: "Asia/Dubai", label: "Gulf Standard Time (Dubai)" },
  { value: "Asia/Kolkata", label: "India Standard Time (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore Time" },
  { value: "Asia/Shanghai", label: "China Standard Time (Shanghai)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (Tokyo)" },
  { value: "Asia/Seoul", label: "Korea Standard Time (Seoul)" },

  // Oceania
  { value: "Australia/Sydney", label: "Australian Eastern Time (Sydney)" },
  { value: "Australia/Perth", label: "Australian Western Time (Perth)" },
  { value: "Pacific/Auckland", label: "New Zealand Time (Auckland)" },

  // UTC
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
];

/**
 * Get the browser's detected timezone.
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * Format a date string in the user's timezone.
 *
 * @param dateString - ISO date string from the API
 * @param timezone - IANA timezone identifier (e.g., "America/Los_Angeles")
 * @param options - Intl.DateTimeFormat options
 */
export function formatInTimezone(
  dateString: string,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = new Date(dateString);
  const tz = timezone || getBrowserTimezone();

  try {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: tz,
    }).format(date);
  } catch {
    // Fallback to browser timezone if provided timezone is invalid
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }
}

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago") in user's timezone.
 * For relative time, we primarily care about the difference, but the
 * display of absolute dates (when > 30 days) uses the timezone.
 *
 * @param dateString - ISO date string from the API
 * @param timezone - IANA timezone identifier
 */
export function formatRelativeTimeInTimezone(
  dateString: string,
  timezone: string | null | undefined,
): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) {
    // For older dates, show the formatted date in user's timezone
    return formatInTimezone(dateString, timezone, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } else if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return "Just now";
  }
}

/**
 * Format a date for display with time in user's timezone.
 *
 * @param dateString - ISO date string from the API
 * @param timezone - IANA timezone identifier
 */
export function formatDateTimeInTimezone(
  dateString: string,
  timezone: string | null | undefined,
): string {
  return formatInTimezone(dateString, timezone, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format just the date (no time) in user's timezone.
 *
 * @param dateString - ISO date string from the API
 * @param timezone - IANA timezone identifier
 */
export function formatDateInTimezone(
  dateString: string,
  timezone: string | null | undefined,
): string {
  return formatInTimezone(dateString, timezone, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format just the time in user's timezone.
 *
 * @param dateString - ISO date string from the API
 * @param timezone - IANA timezone identifier
 */
export function formatTimeInTimezone(
  dateString: string,
  timezone: string | null | undefined,
): string {
  return formatInTimezone(dateString, timezone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Get the UTC offset string for a timezone (e.g., "UTC-08:00").
 *
 * @param timezone - IANA timezone identifier
 */
export function getTimezoneOffset(timezone: string | null | undefined): string {
  const tz = timezone || getBrowserTimezone();
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return offset;
  } catch {
    return "UTC";
  }
}

/**
 * Get a display label for the current timezone including offset.
 *
 * @param timezone - IANA timezone identifier
 */
export function getTimezoneDisplayLabel(
  timezone: string | null | undefined,
): string {
  const tz = timezone || getBrowserTimezone();
  const option = TIMEZONE_OPTIONS.find((opt) => opt.value === tz);
  const offset = getTimezoneOffset(tz);

  if (option) {
    return `${option.label} (${offset})`;
  }

  // For timezones not in our list, show the IANA name with offset
  return `${tz} (${offset})`;
}
