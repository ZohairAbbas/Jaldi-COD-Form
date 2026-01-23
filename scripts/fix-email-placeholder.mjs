import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixEmailPlaceholder() {
  try {
    const shops = await prisma.shop.findMany({
      include: { formConfig: true }
    });

    console.log(`Found ${shops.length} shops`);

    for (const shop of shops) {
      if (!shop.formConfig) {
        console.log(`Shop ${shop.shopifyDomain} has no form config, skipping`);
        continue;
      }

      const fields = JSON.parse(shop.formConfig.fields);
      
      // Find email field and fix placeholder
      const updatedFields = fields.map(field => {
        if (field.id === 'email') {
          return { ...field, placeholder: 'Email' };
        }
        return field;
      });

      // Update database
      await prisma.formConfig.update({
        where: { shopId: shop.id },
        data: { fields: JSON.stringify(updatedFields) }
      });

      console.log(`✅ Fixed email placeholder for shop ${shop.shopifyDomain}`);
    }

    console.log('✅ Migration complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixEmailPlaceholder();
