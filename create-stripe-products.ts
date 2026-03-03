/**
 * Create Stripe Products & Prices
 * Run with: npx tsx create-stripe-products.ts
 */

import Stripe from 'stripe'
import dotenv from 'dotenv'

dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10',
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
