"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { profile, sellerApplication } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { isValidCpf, onlyDigits } from "@/lib/validation"
import type { ActionResult } from "@/app/actions/auth"

async function upsertApplication(
  userId: string,
  values: Partial<typeof sellerApplication.$inferInsert>,
) {
  await db
    .insert(sellerApplication)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: sellerApplication.userId,
      set: { ...values, updatedAt: new Date() },
    })
}

/** Etapa 1 — dados da loja. */
export async function saveStoreStep(input: {
  storeName: string
  category: string
  description: string
}): Promise<ActionResult> {
  const userId = await getUserId()
  const storeName = input.storeName.trim()

  if (storeName.length < 3)
    return {
      ok: false,
      field: "storeName",
      error: "O nome da loja precisa ter ao menos 3 caracteres.",
    }
  if (!input.category)
    return {
      ok: false,
      field: "category",
      error: "Escolha a categoria principal da loja.",
    }
  if (input.description.trim().length < 30)
    return {
      ok: false,
      field: "description",
      error: "Descreva sua operação com pelo menos 30 caracteres.",
    }

  const slug = storeName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  await upsertApplication(userId, {
    storeName,
    storeSlug: slug,
    category: input.category,
    description: input.description.trim(),
    currentStep: 2,
    status: "em_andamento",
  })

  revalidatePath("/vender")
  return { ok: true, message: "Dados da loja salvos." }
}

/** Etapa 4 — documento de identidade (KYC). */
export async function saveKycStep(input: {
  documentType: string
  documentNumber: string
  documentFrontName: string
  selfieName: string
}): Promise<ActionResult> {
  const userId = await getUserId()

  if (!input.documentType)
    return { ok: false, field: "documentType", error: "Selecione o tipo de documento." }

  const number = onlyDigits(input.documentNumber)

  if (input.documentType === "cpf" && !isValidCpf(number))
    return {
      ok: false,
      field: "documentNumber",
      error: "CPF do documento inválido.",
    }
  if (input.documentType === "cnh" && number.length !== 11)
    return {
      ok: false,
      field: "documentNumber",
      error: "O número da CNH tem 11 dígitos.",
    }
  if (input.documentType === "rg" && number.length < 7)
    return {
      ok: false,
      field: "documentNumber",
      error: "Informe o número completo do RG.",
    }

  // Confere se o documento pertence à mesma pessoa do cadastro.
  const [p] = await db
    .select({ cpf: profile.cpf })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (input.documentType === "cpf" && p?.cpf && p.cpf !== number)
    return {
      ok: false,
      field: "documentNumber",
      error: "O CPF do documento não corresponde ao CPF da sua conta.",
    }

  if (!input.documentFrontName)
    return {
      ok: false,
      field: "documentFrontName",
      error: "Anexe a frente do documento.",
    }
  if (!input.selfieName)
    return { ok: false, field: "selfieName", error: "Anexe a selfie de validação." }

  await upsertApplication(userId, {
    documentType: input.documentType,
    documentNumber: number,
    documentFrontName: input.documentFrontName,
    selfieName: input.selfieName,
    currentStep: 5,
    level: 3,
  })

  revalidatePath("/vender")
  revalidatePath("/conta")
  return { ok: true, message: "Documentos enviados para análise." }
}

/** Etapa 5 — dados de saque (PIX). */
export async function savePayoutStep(input: {
  pixKeyType: string
  pixKey: string
  bankHolder: string
  acceptedTerms: boolean
}): Promise<ActionResult> {
  const userId = await getUserId()

  if (!input.pixKeyType)
    return { ok: false, field: "pixKeyType", error: "Escolha o tipo de chave PIX." }

  const key = input.pixKey.trim()

  if (input.pixKeyType === "cpf" && !isValidCpf(key))
    return { ok: false, field: "pixKey", error: "Chave PIX de CPF inválida." }
  if (input.pixKeyType === "email" && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(key))
    return { ok: false, field: "pixKey", error: "Chave PIX de email inválida." }
  if (input.pixKeyType === "telefone" && onlyDigits(key).length !== 11)
    return { ok: false, field: "pixKey", error: "Chave PIX de telefone inválida." }
  if (input.pixKeyType === "aleatoria" && key.length < 32)
    return {
      ok: false,
      field: "pixKey",
      error: "A chave aleatória tem 32 caracteres ou mais.",
    }

  if (input.bankHolder.trim().length < 3)
    return {
      ok: false,
      field: "bankHolder",
      error: "Informe o titular da conta bancária.",
    }
  if (!input.acceptedTerms)
    return {
      ok: false,
      field: "acceptedTerms",
      error: "Aceite os termos do programa de vendedores.",
    }

  await upsertApplication(userId, {
    pixKeyType: input.pixKeyType,
    pixKey: input.pixKeyType === "cpf" ? onlyDigits(key) : key,
    bankHolder: input.bankHolder.trim(),
    acceptedTerms: true,
    currentStep: 6,
    level: 4,
    status: "aprovado",
  })

  revalidatePath("/vender")
  revalidatePath("/conta")
  return { ok: true, message: "Cadastro de vendedor concluído." }
}

/** Marca o avanço de etapa quando a verificação de contato é concluída. */
export async function advanceContactStep(step: number): Promise<ActionResult> {
  const userId = await getUserId()
  await upsertApplication(userId, {
    currentStep: step,
    level: step >= 4 ? 2 : 1,
  })
  revalidatePath("/vender")
  return { ok: true }
}
