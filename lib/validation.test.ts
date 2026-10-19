import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cpfRegion,
  foldName,
  formatBirthDate,
  formatCpf,
  formatPhone,
  isValidBio,
  isValidBirthDate,
  isValidCpf,
  isValidDisplayName,
  isValidEmail,
  isValidFullName,
  isValidPassword,
  isReservedName,
  isValidPhone,
  onlyDigits,
  passwordScore,
} from "@/lib/validation"

describe("onlyDigits / formatCpf", () => {
  it("tira tudo que não é dígito, inclusive de entrada nula", () => {
    expect(onlyDigits("529.982.247-25")).toBe("52998224725")
    expect(onlyDigits("abc")).toBe("")
    expect(onlyDigits(undefined as unknown as string)).toBe("")
  })

  it("formata o CPF conforme se digita e corta em 11 dígitos", () => {
    expect(formatCpf("5")).toBe("5")
    expect(formatCpf("5299")).toBe("529.9")
    expect(formatCpf("5299822")).toBe("529.982.2")
    expect(formatCpf("52998224725")).toBe("529.982.247-25")
    expect(formatCpf("529982247259999")).toBe("529.982.247-25")
    expect(formatCpf("529.982.247-25")).toBe("529.982.247-25")
  })
})

describe("isValidCpf", () => {
  it("aceita CPFs com dígitos verificadores corretos, com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true)
    expect(isValidCpf("52998224725")).toBe(true)
    expect(isValidCpf("111.444.777-35")).toBe(true)
  })

  it("rejeita dígito verificador errado (cada um dos dois)", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false) // 2º dígito
    expect(isValidCpf("529.982.247-35")).toBe(false) // 1º dígito
    expect(isValidCpf("529.982.247-00")).toBe(false)
  })

  it("rejeita tamanho errado e sequências repetidas (passam na conta, mas não existem)", () => {
    expect(isValidCpf("")).toBe(false)
    expect(isValidCpf("5299822472")).toBe(false)
    expect(isValidCpf("529982247255")).toBe(false)
    for (let d = 0; d <= 9; d++) expect(isValidCpf(String(d).repeat(11))).toBe(false)
  })

  it("dígito verificador 10 vale 0 (casos de borda do módulo 11)", () => {
    expect(isValidCpf("000.000.001-91")).toBe(true)
    expect(isValidCpf("000.000.001-90")).toBe(false)
    // primeiro dígito verificador sai de resto 10 e vira 0 (…040-06); com 1 no lugar do 0 não vale
    expect(isValidCpf("000.000.040-06")).toBe(true)
    expect(isValidCpf("000.000.040-16")).toBe(false)
    // segundo dígito verificador sai de resto 10 e vira 0 (…028-10)
    expect(isValidCpf("100.000.028-10")).toBe(true)
    expect(isValidCpf("100.000.028-11")).toBe(false)
  })

  it("primeiro dígito errado é rejeitado mesmo que o segundo seja coerente com o errado", () => {
    // 529.982.247 pede 2 como 1º dígito; com 0 e o 2º recalculado (9) só o 1º dígito denuncia
    expect(isValidCpf("529.982.247-09")).toBe(false)
    expect(isValidCpf("529.982.247-25")).toBe(true)
  })
})

describe("cpfRegion", () => {
  it("região fiscal pelo 9º dígito; nulo se não tem 11 dígitos", () => {
    expect(cpfRegion("529.982.247-25")).toBe("ES ou RJ") // 9º dígito = 7
    expect(cpfRegion("111.444.777-35")).toBe("ES ou RJ")
    expect(cpfRegion("000.000.001-91")).toBe("DF, GO, MS, MT ou TO") // 9º dígito = 1
    expect(cpfRegion("123456780")).toBeNull()
    expect(cpfRegion("")).toBeNull()
  })
})

describe("telefone", () => {
  it("formata celular e fixo conforme se digita", () => {
    expect(formatPhone("11")).toBe("11")
    expect(formatPhone("119")).toBe("(11) 9")
    expect(formatPhone("1194567")).toBe("(11) 9456-7")
    expect(formatPhone("11945678901")).toBe("(11) 94567-8901")
    expect(formatPhone("1134567890")).toBe("(11) 3456-7890")
    expect(formatPhone("119456789019999")).toBe("(11) 94567-8901")
  })

  it("celular válido: 11 dígitos, DDD 11–99, começa com 9", () => {
    expect(isValidPhone("(11) 94567-8901")).toBe(true)
    expect(isValidPhone("11945678901")).toBe(true)
    expect(isValidPhone("99945678901")).toBe(true)
    expect(isValidPhone("10945678901")).toBe(false) // DDD 10
    expect(isValidPhone("11845678901")).toBe(false) // não começa com 9
    expect(isValidPhone("1134567890")).toBe(false) // fixo (10 dígitos)
    expect(isValidPhone("119456789012")).toBe(false)
    expect(isValidPhone("")).toBe(false)
  })
})

describe("email, nome e apelido", () => {
  it("email: precisa de @, domínio e TLD de 2+ letras; espaços nas pontas são ignorados", () => {
    expect(isValidEmail("ana@teste.dev")).toBe(true)
    expect(isValidEmail("  ana@teste.com.br  ")).toBe(true)
    expect(isValidEmail("ana@teste")).toBe(false)
    expect(isValidEmail("ana@.com")).toBe(false)
    expect(isValidEmail("ana teste@x.com")).toBe(false)
    expect(isValidEmail("@x.com")).toBe(false)
    expect(isValidEmail("ana@x.c")).toBe(false)
    expect(isValidEmail("")).toBe(false)
  })

  it("nome completo: 2+ partes de 2+ letras, só letras, espaço, apóstrofo, ponto e hífen", () => {
    expect(isValidFullName("Ana Silva")).toBe(true)
    expect(isValidFullName("José D'Ávila-Neto")).toBe(true)
    expect(isValidFullName("Ana")).toBe(false)
    expect(isValidFullName("Ana S")).toBe(false)
    expect(isValidFullName("Ana Silva 2")).toBe(false)
    expect(isValidFullName("Ana <b>Silva</b>")).toBe(false)
    expect(isValidFullName("")).toBe(false)
  })

  it("apelido: 2 a 20 caracteres, com pelo menos uma letra ou número, sem caracteres estranhos", () => {
    expect(isValidDisplayName("AnaGames")).toBe(true)
    expect(isValidDisplayName("Ana_Games-01.x")).toBe(true)
    expect(isValidDisplayName("  Zé  ")).toBe(true)
    expect(isValidDisplayName("A")).toBe(false)
    expect(isValidDisplayName("a".repeat(20))).toBe(true)
    expect(isValidDisplayName("a".repeat(21))).toBe(false)
    expect(isValidDisplayName("..")).toBe(false) // só pontuação
    expect(isValidDisplayName("__--")).toBe(false)
    expect(isValidDisplayName("Ana<script>")).toBe(false)
    expect(isValidDisplayName("Ana 😀")).toBe(false)
  })

  it("bio: até 160 caracteres (vazia vale)", () => {
    expect(isValidBio("")).toBe(true)
    expect(isValidBio("a".repeat(160))).toBe(true)
    expect(isValidBio("a".repeat(161))).toBe(false)
    expect(isValidBio("  " + "a".repeat(160) + "  ")).toBe(true) // espaços nas pontas não contam
  })
})

describe("nomes reservados e e-mail", () => {
  it("foldName ignora acento, caixa, separadores e letras de largura total", () => {
    expect(foldName("Ｅllowin")).toBe("ellowin")
    expect(foldName("E.l-l_o w i n")).toBe("ellowin")
    expect(foldName("Moderação")).toBe("moderacao")
  })

  it("isReservedName pega o que se passa pela plataforma e deixa nomes comuns passarem", () => {
    for (const bad of ["Ellowin", "ellowin games", "Suporte", "SUPORTE_ANA", "Admin", "Moderação", "Ｓupport", "Loja do Ellowin"])
      expect(isReservedName(bad), bad).toBe(true)
    for (const ok of ["Ana Pro", "Loja do Beto", "Pedro_Gamer", "Rainha do Valorant"])
      expect(isReservedName(ok), ok).toBe(false)
  })

  it("e-mail acima de 254 caracteres é recusado", () => {
    expect(isValidEmail(`${"a".repeat(64)}@${"b".repeat(180)}.com`)).toBe(true)
    expect(isValidEmail(`${"a".repeat(64)}@${"b".repeat(200)}.com`)).toBe(false)
  })
})

describe("data de nascimento", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)) // 15/06/2026, horário local
  })
  afterEach(() => vi.useRealTimers())

  it("exige o formato dd/mm/aaaa e uma data que exista", () => {
    expect(isValidBirthDate("15/06/1990")).toBe(true)
    expect(isValidBirthDate("1990-06-15")).toBe(false)
    expect(isValidBirthDate("15/6/1990")).toBe(false)
    expect(isValidBirthDate("")).toBe(false)
    expect(isValidBirthDate("31/02/2000")).toBe(false)
    expect(isValidBirthDate("00/01/2000")).toBe(false)
    expect(isValidBirthDate("10/13/2000")).toBe(false)
    expect(isValidBirthDate("29/02/2000")).toBe(true) // bissexto
    expect(isValidBirthDate("29/02/2001")).toBe(false)
  })

  it("maioridade: 18 anos completos no dia, nem um dia antes", () => {
    expect(isValidBirthDate("15/06/2008")).toBe(true) // faz 18 hoje
    expect(isValidBirthDate("16/06/2008")).toBe(false) // faz 18 amanhã
    expect(isValidBirthDate("15/07/2008")).toBe(false)
    expect(isValidBirthDate("14/06/2008")).toBe(true)
  })

  it("limite de idade: até 110 anos", () => {
    expect(isValidBirthDate("15/06/1916")).toBe(true) // 110 hoje
    expect(isValidBirthDate("16/06/1915")).toBe(true) // ainda 110
    expect(isValidBirthDate("14/06/1915")).toBe(false) // 111
    expect(isValidBirthDate("01/01/1900")).toBe(false)
  })

  it("data no futuro não vale", () => {
    expect(isValidBirthDate("15/06/2030")).toBe(false)
  })

  it("formata conforme se digita", () => {
    expect(formatBirthDate("1")).toBe("1")
    expect(formatBirthDate("150")).toBe("15/0")
    expect(formatBirthDate("1506")).toBe("15/06")
    expect(formatBirthDate("15061990")).toBe("15/06/1990")
    expect(formatBirthDate("150619901234")).toBe("15/06/1990")
  })
})

describe("senha", () => {
  it("força de 0 a 4", () => {
    expect(passwordScore("")).toBe(0)
    expect(passwordScore("abc")).toBe(0)
    expect(passwordScore("abcdefgh")).toBe(1) // 8+
    expect(passwordScore("abcdefghijk")).toBe(1) // 11 caracteres
    expect(passwordScore("abcdefghijkl")).toBe(2) // 12+ ganha mais um ponto
    expect(passwordScore("Abcdefgh")).toBe(2) // + maiúscula e minúscula
    expect(passwordScore("Abcdefg1")).toBe(3) // + dígito
    expect(passwordScore("Abcdefg1!")).toBe(4) // + símbolo
    expect(passwordScore("Abcdefghij1234!")).toBe(4) // nunca passa de 4
    expect(passwordScore(undefined as unknown as string)).toBe(0)
  })

  it("válida: 8+ caracteres com pelo menos uma letra e um número", () => {
    expect(isValidPassword("abcdefg1")).toBe(true)
    expect(isValidPassword("abcdefg")).toBe(false)
    expect(isValidPassword("abcdefgh")).toBe(false) // sem número
    expect(isValidPassword("12345678")).toBe(false) // sem letra
    expect(isValidPassword("abc1")).toBe(false)
    expect(isValidPassword("abcdef1")).toBe(false) // 7 caracteres: falta um
    expect(isValidPassword("")).toBe(false)
  })
})
