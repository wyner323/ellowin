/**
 * CSV para planilha em português (Excel/Google Planilhas no Brasil): separador ";", vírgula decimal, quebra de linha
 * CRLF e BOM no começo para o Excel abrir os acentos certos.
 *
 * Proteção contra injeção de fórmula: texto que começa com = + - @ (mesmo depois de espaços ou TAB) viraria fórmula ao abrir na planilha,
 * e o título de um anúncio ou o apelido de um comprador é texto de terceiros. Esses campos ganham um apóstrofo na frente.
 */

const FORMULA_START = /^\s*[=+\-@]/

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return Number.isFinite(value) ? String(value).replace(".", ",") : ""
  let text = value.replace(/\r\n|\r|\n/g, " ")
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[";]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(";"))
  return `﻿${lines.join("\r\n")}\r\n`
}

/** Centavos como número decimal de planilha ("1234,56"), sem símbolo de moeda. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`
}
