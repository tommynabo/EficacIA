/**
 * Create EficacIA Stripe Products & Prices
 *
 * Creates 3 products (Pro, Growth, Agency), each with a monthly and annual
 * recurring price. After running, copy the printed Price IDs into your .env:
 *
 *   VITE_STRIPE_PRO_MONTHLY=price_xxx      # frontend (Vite)
 *   VITE_STRIPE_PRO_ANNUAL=price_xxx
 *   VITE_STRIPE_GROWTH_MONTHLY=price_xxx
 *   VITE_STRIPE_GROWTH_ANNUAL=price_xxx
 *   VITE_STRIPE_AGENCY_MONTHLY=price_xxx
 *   VITE_STRIPE_AGENCY_ANNUAL=price_xxx
 *
 *   STRIPE_PRO_MONTHLY=price_xxx           # backend (Vercel env)
 *   ...
 *
 * Run with:  npx tsx create-stripe-products.ts
 */

import Stripe from 'stripe'
import dotenv from 'dotenv'

dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10',
})

// ─── Plan matrix ───────────────────────────────────────────────────────────────

const PLAN_CONFIGS = [
  {
    key: 'pro',
    name: 'EficacIA Pro',
    description: 'Automatización de LinkedIn para equipos pequeños y freelancers.',
    monthlyAmount: 4200,   // €42,00
    annualAmount:  42000,  // €420,00 (2 meses gratis)
  },
  {
    key: 'growth',
    name: 'EficacIA Growth',
    description: 'Escala tus campañas de outreach sin límites de leads.',
    monthlyAmount: 7900,   // €79,00
    annualAmount:  79000,  // €790,00
  },
  {
    key: 'agency',
    name: 'EficacIA Agency',
    description: 'Solución multi-cuenta para agencias y equipos enterprise.',
    monthlyAmount: 19900,  // €199,00
    annualAmount:  199000, // €1.990,00
  },
] as const

// ─── Script ────────────────────────────────────────────────────────────────────

async function createProductsAndPrices() {
  console.log('🔄 Creando productos y precios en Stripe…\n')

  const results: Record<string, { monthly: string; annual: string }> = {}

  for (const plan of PLAN_CONFIGS) {
    console.log(`📦 Creando producto: ${plan.name}`)

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { plan_id: plan.key },
    })

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyAmount,
      currency: 'eur',
      recurring: { interval: 'month', interval_count: 1 },
      metadata: { plan_id: plan.key, billing: 'monthly' },
    })

    const annualPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.annualAmount,
      currency: 'eur',
      recurring: { interval: 'year', interval_count: 1 },
      metadata: { plan_id: plan.key, billing: 'annual' },
    })

    results[plan.key] = { monthly: monthlyPrice.id, annual: annualPrice.id }

    const monthlyCost = (plan.monthlyAmount / 100).toFixed(2)
    const annualCost  = (plan.annualAmount  / 100).toFixed(2)
    const savingsPerYear = ((plan.monthlyAmount * 12 - plan.annualAmount) / 100).toFixed(2)

    console.log(`  ✓ Product ID:      ${product.id}`)
    console.log(`  ✓ Monthly price:   ${monthlyPrice.id}  (€${monthlyCost}/mes)`)
    console.log(`  ✓ Annual price:    ${annualPrice.id}   (€${annualCost}/año — ahorra €${savingsPerYear})\n`)
  }

  // ─── Print env config ──────────────────────────────────────────────────────
  const sep = '='.repeat(64)
  console.log(sep)
  console.log('✅  PRODUCTOS CREADOS — copia estos IDs en tus variables de entorno')
  console.log(sep)

  console.log('\n# .env (frontend — Vite)')
  for (const [key, ids] of Object.entries(results)) {
    const K = key.toUpperCase()
    console.log(`VITE_STRIPE_${K}_MONTHLY=${ids.monthly}`)
    console.log(`VITE_STRIPE_${K}_ANNUAL=${ids.annual}`)
  }

  console.log('\n# Vercel Environment Variables (backend — serverless functions)')
  for (const [key, ids] of Object.entries(results)) {
    const K = key.toUpperCase()
    console.log(`STRIPE_${K}_MONTHLY=${ids.monthly}`)
    console.log(`STRIPE_${K}_ANNUAL=${ids.annual}`)
  }

  console.log()
}

createProductsAndPrices().catch((err) => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})

async function createProductsAndPrices() {
  try {
    console.log('🔄 Creating Stripe products and prices...\n')

    // 1. Create Starter Product
    console.log('📦 Creating Starter product...')
    const starterProduct = await stripe.products.create({
      name: 'EficacIA Starter',
      description: 'Acceso a herramientas básicas de LinkedIn',
      metadata: {
        plan_id: 'starter',
      },
    })

    const starterPrice = await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 4999, // €49.99 en centavos
      currency: 'eur',
      recurring: {
        interval: 'month',
        interval_count: 1,
      },
      metadata: {
        plan_id: 'starter',
      },
    })

    console.log(`✓ Starter product created`)
    console.log(`  Product ID: ${starterProduct.id}`)
    console.log(`  Price ID: ${starterPrice.id}`)
    console.log(`  Price: €${(starterPrice.unit_amount! / 100).toFixed(2)}/mes\n`)

    // 2. Create Pro Product
    console.log('📦 Creating Pro product...')
    const proProduct = await stripe.products.create({
      name: 'EficacIA Pro',
      description: 'Acceso completo con LinkedIn automation',
      metadata: {
        plan_id: 'pro',
      },
    })

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 8499, // €84.99 en centavos
      currency: 'eur',
      recurring: {
        interval: 'month',
        interval_count: 1,
      },
      metadata: {
        plan_id: 'pro',
      },
    })

    console.log(`✓ Pro product created`)
    console.log(`  Product ID: ${proProduct.id}`)
    console.log(`  Price ID: ${proPrice.id}`)
    console.log(`  Price: €${(proPrice.unit_amount! / 100).toFixed(2)}/mes\n`)

    // Output configuration
    console.log('\n' + '='.repeat(60))
    console.log('✅ PRODUCTS CREATED SUCCESSFULLY')
    console.log('='.repeat(60) + '\n')

    console.log('📝 Update your backend config with these IDs:\n')

    console.log('```typescript')
    console.log('const STRIPE_PRICES = {')
    console.log(`  starter: '${starterPrice.id}',`)
    console.log(`  pro: '${proPrice.id}',`)
    console.log('}')
    console.log('```\n')

    console.log('📋 Full product details:\n')
    console.log('STARTER:')
    console.log(`  Product: ${starterProduct.id}`)
    console.log(`  Price: ${starterPrice.id}`)
    console.log(`  Amount: €49.99/mes\n`)

    console.log('PRO:')
    console.log(`  Product: ${proProduct.id}`)
    console.log(`  Price: ${proPrice.id}`)
    console.log(`  Amount: €84.99/mes\n`)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

createProductsAndPrices()
