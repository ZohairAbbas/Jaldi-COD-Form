/**
 * Migration Script: Add "Full Name" field and hide "First Name" / "Last Name" fields
 *
 * Run with: node scripts/migrate-full-name-field.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateFullNameField() {
  console.log('Starting migration: Add Full Name field to form configs...\n');

  try {
    // Get all form configs
    const formConfigs = await prisma.formConfig.findMany();
    console.log(`Found ${formConfigs.length} form config(s) to process.\n`);

    let updated = 0;
    let skipped = 0;

    for (const config of formConfigs) {
      // Parse the fields JSON
      let fields;
      try {
        fields = typeof config.fields === 'string'
          ? JSON.parse(config.fields)
          : config.fields;
      } catch (e) {
        console.log(`  Skipping config ${config.id} - invalid JSON`);
        skipped++;
        continue;
      }

      if (!Array.isArray(fields)) {
        console.log(`  Skipping config ${config.id} - fields is not an array`);
        skipped++;
        continue;
      }

      // Check if full-name field already exists
      const hasFullName = fields.some(f => f.id === 'full-name');
      if (hasFullName) {
        console.log(`  Skipping config ${config.id} - already has full-name field`);
        skipped++;
        continue;
      }

      // Create the new full-name field
      const fullNameField = {
        id: 'full-name',
        type: 'text',
        label: 'Full Name',
        placeholder: 'Full Name',
        required: true,
        visible: true,
        order: 0,
        section: 'shipping-address',
      };

      // Update existing fields:
      // 1. Hide first-name and last-name, make them not required
      // 2. Increment order of all fields by 1
      const updatedFields = fields.map(field => {
        const newField = { ...field };

        // Increment order
        if (typeof newField.order === 'number') {
          newField.order = newField.order + 1;
        }

        // Hide first-name and last-name
        if (field.id === 'first-name' || field.id === 'last-name') {
          newField.visible = false;
          newField.required = false;
        }

        return newField;
      });

      // Add full-name at the beginning
      const newFields = [fullNameField, ...updatedFields];

      // Sort by order
      newFields.sort((a, b) => (a.order || 0) - (b.order || 0));

      // Update the database
      await prisma.formConfig.update({
        where: { id: config.id },
        data: { fields: JSON.stringify(newFields) },
      });

      console.log(`  Updated config ${config.id}`);
      updated++;
    }

    console.log(`\nMigration complete!`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateFullNameField();
