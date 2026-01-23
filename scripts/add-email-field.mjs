import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addEmailField() {
  try {
    // Get all shops
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

      // Check if email field already exists
      const emailFieldExists = fields.some(f => f.id === 'email');

      if (emailFieldExists) {
        console.log(`Shop ${shop.shopifyDomain} already has email field`);
        continue;
      }

      // Add email field after phone field (order 3)
      const emailField = {
        id: "email",
        type: "text",
        label: "Email",
        placeholder: "Email (optional)",
        required: false,
        visible: true,
        order: 3,
        section: "shipping-address",
      };

      // Update orders for fields after email
      const updatedFields = fields.map(field => {
        if (field.order >= 3) {
          return { ...field, order: field.order + 1 };
        }
        return field;
      });

      // Add email field
      updatedFields.push(emailField);

      // Sort by order
      updatedFields.sort((a, b) => a.order - b.order);

      // Update database
      await prisma.formConfig.update({
        where: { shopId: shop.id },
        data: { fields: JSON.stringify(updatedFields) }
      });

      console.log(`✅ Added email field to shop ${shop.shopifyDomain}`);
    }

    console.log('✅ Migration complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addEmailField();
