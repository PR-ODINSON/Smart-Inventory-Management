import { addDays, differenceInCalendarDays } from 'date-fns'

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function todayIso(): string {
  return utcStartOfDay(new Date()).toISOString()
}

export function addDaysToIso(isoDate: string, days: number): string {
  const base = utcStartOfDay(new Date(isoDate))
  return addDays(base, days).toISOString()
}

export function parseIsoDay(iso: string): Date {
  return utcStartOfDay(new Date(iso))
}

export function daysBetween(fromIso: string, toIso: string): number {
  return differenceInCalendarDays(parseIsoDay(toIso), parseIsoDay(fromIso))
}

export function isPastDate(iso: string): boolean {
  return daysBetween(todayIso(), iso) < 0
}
