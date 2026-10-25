import { pool } from "@/lib/db"
import { GOOD_LISTING_SCORE, type ChecklistInputs } from "@/lib/seller-checklist"
import { listingQuality } from "@/lib/listing-quality"
import { getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { countUnansweredReviews } from "@/lib/review-replies"

/** Quantos anúncios ativos entram na conta da nota (os mais novos): o painel não varre um catálogo inteiro. */
const MAX_LISTINGS_SCORED = 100

/** A meta do mês existe? `available` falso quando a tabela (migração 0010) ainda não foi criada. */
async function readGoal(sellerId: string): Promise<{ available: boolean; hasGoal: boolean }> {
  try {
    const { rows } = await pool.query(`SELECT 1 FROM "seller_goal" WHERE "userId" = $1`, [sellerId])
    return { available: true, hasGoal: rows.length > 0 }
  } catch {
    return { available: false, hasGoal: false }
  }
}

/**
 * O que o checklist do vendedor novo precisa saber. As contagens de perguntas e avaliações pendentes e a meta tratam a
 * migração faltando como "não há", sem quebrar o painel.
 */
export async function getChecklistInputs(sellerId: string): Promise<ChecklistInputs> {
  const [profile, listings, sales, pendingQuestions, pendingReviews, goal] = await Promise.all([
    pool.query<{ emailVerified: boolean; image: string | null; bio: string | null }>(`SELECT "emailVerified", "image", "bio" FROM "user" WHERE "id" = $1`, [sellerId]),
    pool.query<{ title: string; description: string; game: string | null; categorySlug: string; attributes: Record<string, string>; images: number }>(
      `SELECT p."title", p."description", p."game", p."categorySlug", p."attributes",
              (SELECT count(*)::int FROM "product_image" i WHERE i."productId" = p."id") AS images
         FROM "product" p
        WHERE p."sellerId" = $1 AND p."status" = 'ativo'
        ORDER BY p."createdAt" DESC, p."id" DESC
        LIMIT ${MAX_LISTINGS_SCORED}`,
      [sellerId],
    ),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "order" WHERE "sellerId" = $1 AND "status" = 'concluido'`, [sellerId]),
    getSellerUnansweredQuestionsCount(sellerId),
    countUnansweredReviews(sellerId),
    readGoal(sellerId),
  ])

  const me = profile.rows[0]
  const scored = listings.rows.map((l) =>
    listingQuality({ title: l.title, description: l.description, game: l.game, categorySlug: l.categorySlug, attributes: l.attributes ?? {}, imageCount: l.images }),
  )

  return {
    emailVerified: me?.emailVerified === true,
    profileComplete: Boolean(me?.image) && Boolean(me?.bio?.trim()),
    activeListings: listings.rows.length,
    listingsWithoutPhoto: listings.rows.filter((l) => l.images === 0).length,
    listingsBelowGood: scored.filter((q) => q.score < GOOD_LISTING_SCORE).length,
    goalAvailable: goal.available,
    hasGoal: goal.hasGoal,
    completedSales: sales.rows[0]?.n ?? 0,
    pendingQuestions,
    pendingReviews,
  }
}
