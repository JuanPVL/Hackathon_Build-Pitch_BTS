/** Fecha de la corrida en español, hora local (p. ej. "21 nov 2026, 10:42"). "—" si no es válida. */
export function formatRunDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const day = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(date).replace(/\./g, '')
  const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  return `${day}, ${time}`
}
