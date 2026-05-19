import { PrismaClient } from '@prisma/client';

// Seeds the dev database with a test user and sample orders.
// Run with: docker compose exec api npx prisma db seed

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { id: 'test-user-001' },
    update: {},
    create: {
      id: 'test-user-001',
      email: 'test@marketx.indicestech.com',
      name: 'Test User',
    },
  });

  await prisma.order.upsert({
    where: { id: 'test-order-001' },
    update: {},
    create: {
      id: 'test-order-001',
      userId: user.id,
      status: 'shipped',
      productName: 'Nike Air Max 90 (Size 42)',
      price: 85000,
      currency: 'NGN',
      trackingNumber: 'GIG-TEST-12345',
      carrier: 'GIG',
      shippingAddress: '14 Admiralty Way, Lekki Phase 1, Lagos',
      trackingEvents: {
        create: [
          { status: 'picked_up', description: 'Package picked up from seller', location: 'Ikeja, Lagos', occurredAt: new Date('2026-04-15T09:00:00Z') },
          { status: 'in_transit', description: 'In transit to delivery hub', location: 'Lagos Hub', occurredAt: new Date('2026-04-16T14:00:00Z') },
        ],
      },
    },
  });

  console.log('Seed complete');
}

main().finally(() => prisma.$disconnect());
