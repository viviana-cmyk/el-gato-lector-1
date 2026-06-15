const BOGOTA_TZ = "America/Bogota";

export function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
}

export function formatUSD(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function trendArrow(trend: string | undefined): string {
  if (trend === "up") return "▲";
  if (trend === "down") return "▼";
  return "=";
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatLongDate(iso: string): string {
  const formatted = new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
  return formatted;
}
