import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateEmailToOptional() {
  console.log('Starting migration: Making email field optional for all stores...\n');

  try {
    // Get all shops with their form configs
    const shops = await prisma.shop.findMany({
      include: { formConfig: true }
    });

    console.log(`Found ${shops.length} shops to process\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let noEmailCount = 0;

    for (const shop of shops) {
      if (!shop.formConfig) {
        console.log(`⚠️  Skipped ${shop.shopifyDomain}: No form config found`);
        skippedCount++;
        continue;
      }

      const fields = JSON.parse(shop.formConfig.fields);
      const emailFieldIndex = fields.findIndex(f => f.id === 'email');

      if (emailFieldIndex === -1) {
        console.log(`ℹ️  Skipped ${shop.shopifyDomain}: No email field found`);
        noEmailCount++;
        continue;
      }

      // Check if email field already has the new properties
      const emailField = fields[emailFieldIndex];
      if (
        emailField.required === false &&
        emailField.isCore === false &&
        emailField.isDeletable === true
      ) {
        console.log(`✓ Skipped ${shop.shopifyDomain}: Email field already optional`);
        skippedCount++;
        continue;
      }

      // Update email field properties
      fields[emailFieldIndex] = {
        ...emailField,
        required: false,
        isCore: false,
        isDeletable: true
      };

      // Save updated fields
      await prisma.formConfig.update({
        where: { id: shop.formConfig.id },
        data: { fields: JSON.stringify(fields) }
      });

      console.log(`✓ Updated ${shop.shopifyDomain}: Email field is now optional`);
      updatedCount++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration completed successfully!');
    console.log('='.repeat(60));
    console.log(`Total shops processed: ${shops.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already optional): ${skippedCount}`);
    console.log(`Skipped (no email field): ${noEmailCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateEmailToOptional()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
