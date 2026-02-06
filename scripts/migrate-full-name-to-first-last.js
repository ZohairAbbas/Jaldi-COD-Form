/**
 * Migration Script: Remove full-name field and update field structure
 *
 * This script migrates existing stores from the old full-name field structure
 * to the new first-name + last-name structure with field categories.
 *
 * Changes:
 * - Removes "full-name" field
 * - Makes "first-name" visible and required (order: 0)
 * - Ensures "last-name" exists but hidden by default (order: 1)
 * - Adds new field properties: fieldCategory, isCore, isDeletable, shopifyProperty
 * - Updates all existing fields with new properties
 *
 * Run: node scripts/migrate-full-name-to-first-last.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Core field IDs that cannot be deleted
const CORE_FIELD_IDS = ["first-name", "phone", "address", "city", "email"];

async function migrateFields() {
  console.log('Starting field migration...');
  console.log('==================================\n');

  try {
    // Get all shops with form configs
    const shops = await prisma.shop.findMany({
      include: { formConfig: true }
    });

    console.log(`Found ${shops.length} shops to migrate\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const shop of shops) {
      try {
        if (!shop.formConfig) {
          console.log(`⊘ Skipped ${shop.shopifyDomain} - no form config`);
          skippedCount++;
          continue;
        }

        const fields = JSON.parse(shop.formConfig.fields);

        // Check if full-name exists
        const hasFullName = fields.some(f => f.id === 'full-name');

        if (!hasFullName) {
          console.log(`⊘ Skipped ${shop.shopifyDomain} - already migrated (no full-name field)`);
          skippedCount++;
          continue;
        }

        console.log(`\nMigrating ${shop.shopifyDomain}...`);

        // Remove full-name field
        let updatedFields = fields.filter(f => f.id !== 'full-name');

        // Ensure first-name exists and is visible
        let firstNameField = updatedFields.find(f => f.id === 'first-name');
        if (firstNameField) {
          firstNameField.visible = true;
          firstNameField.required = true;
          firstNameField.order = 0;
          firstNameField.fieldCategory = 'shopify';
          firstNameField.isCore = true;
          firstNameField.isDeletable = false;
          firstNameField.shopifyProperty = 'shipping_address.first_name';
          console.log('  ✓ Updated existing first-name field');
        } else {
          // Add first-name if doesn't exist
          updatedFields.unshift({
            id: "first-name",
            type: "text",
            label: "First Name",
            placeholder: "First Name",
            required: true,
            visible: true,
            order: 0,
            section: "shipping-address",
            fieldCategory: "shopify",
            isCore: true,
            isDeletable: false,
            shopifyProperty: "shipping_address.first_name"
          });
          console.log('  ✓ Added first-name field');
        }

        // Ensure last-name exists (hidden by default)
        let lastNameField = updatedFields.find(f => f.id === 'last-name');
        if (lastNameField) {
          lastNameField.fieldCategory = 'shopify';
          lastNameField.isCore = false;
          lastNameField.isDeletable = true;
          lastNameField.shopifyProperty = 'shipping_address.last_name';
          lastNameField.visible = false;
          lastNameField.required = false;
          lastNameField.order = 1;
          console.log('  ✓ Updated existing last-name field');
        } else {
          updatedFields.splice(1, 0, {
            id: "last-name",
            type: "text",
            label: "Last Name",
            placeholder: "Last Name",
            required: false,
            visible: false,
            order: 1,
            section: "shipping-address",
            fieldCategory: "shopify",
            isCore: false,
            isDeletable: true,
            shopifyProperty: "shipping_address.last_name"
          });
          console.log('  ✓ Added last-name field');
        }

        // Add new properties to all fields
        updatedFields.forEach((field, idx) => {
          field.order = idx;

          // Set fieldCategory if not present
          if (!field.fieldCategory) {
            // Check if it's a known Shopify field based on ID
            const shopifyFieldIds = [
              'first-name', 'last-name', 'email', 'phone', 'address',
              'address2', 'city', 'province', 'postal-code', 'country',
              'discount-code', 'quantity'
            ];
            field.fieldCategory = shopifyFieldIds.includes(field.id) ? 'shopify' : 'custom';
          }

          // Set isCore if not present
          if (field.isCore === undefined) {
            field.isCore = CORE_FIELD_IDS.includes(field.id);
          }

          // Set isDeletable if not present
          if (field.isDeletable === undefined) {
            field.isDeletable = !field.isCore;
          }

          // Set shopifyProperty for known Shopify fields
          if (field.fieldCategory === 'shopify' && !field.shopifyProperty) {
            const shopifyPropertyMap = {
              'first-name': 'shipping_address.first_name',
              'last-name': 'shipping_address.last_name',
              'email': 'order.email',
              'phone': 'shipping_address.phone',
              'address': 'shipping_address.address1',
              'address2': 'shipping_address.address2',
              'city': 'shipping_address.city',
              'province': 'shipping_address.province',
              'postal-code': 'shipping_address.zip',
              'country': 'shipping_address.country',
              'discount-code': 'discount_code',
              'quantity': 'line_items.quantity'
            };
            field.shopifyProperty = shopifyPropertyMap[field.id] || null;
          }
        });

        // Update database
        await prisma.formConfig.update({
          where: { id: shop.formConfig.id },
          data: {
            fields: JSON.stringify(updatedFields)
          }
        });

        console.log(`  ✓ Updated database`);
        console.log(`  ✓ Total fields after migration: ${updatedFields.length}`);
        console.log(`✓ Successfully migrated ${shop.shopifyDomain}`);
        migratedCount++;

      } catch (shopError) {
        console.error(`✗ Error migrating ${shop.shopifyDomain}:`, shopError.message);
        errorCount++;
      }
    }

    console.log('\n==================================');
    console.log('Migration Summary:');
    console.log(`  ✓ Successfully migrated: ${migratedCount}`);
    console.log(`  ⊘ Skipped (already migrated): ${skippedCount}`);
    if (errorCount > 0) {
      console.log(`  ✗ Errors: ${errorCount}`);
    }
    console.log('==================================');
    console.log('\nMigration complete!');

  } catch (error) {
    console.error('\n✗ Migration failed with error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateFields().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
