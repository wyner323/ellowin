import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Apelido escolhido pelo usuário, com o nome legal como fallback. SÓ para o usuário ver o
 * PRÓPRIO nome (menu, saudação). O que outras pessoas veem passa por lib/public-name.ts,
 * que nunca cai no nome legal.
 */
export function publicName(name: string, displayName?: string | null) {
  return displayName?.trim() || name
}

export function initialsOf(name: string) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return initials || 'E'
}
