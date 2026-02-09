require('dotenv').config();
const { MantleClient } = require('@heymantle/client');

const appId = process.env.MANTLE_APP_ID;
const apiKey = process.env.MANTLE_API_KEY;

console.log('AppId:', appId ? 'Present' : 'Missing');
console.log('ApiKey:', apiKey ? 'Present' : 'Missing');

if (!appId || !apiKey) {
  console.error('❌ Mantle credentials not found in environment');
  process.exit(1);
}

const mantle = new MantleClient({ appId, apiKey });

mantle.plans.list()
  .then(plans => {
    console.log('\n✅ Mantle connection successful!');
    console.log('Number of plans:', plans.length);
    if (plans.length > 0) {
      console.log('\nPlans:');
      plans.forEach(plan => {
        console.log(`- ${plan.name}: $${plan.price}/${plan.interval || 'month'}`);
      });
    } else {
      console.log('\n⚠️  No plans found in Mantle. You need to create plans in your Mantle dashboard.');
    }
  })
  .catch(err => {
    console.error('\n❌ Mantle connection failed:', err.message);
    console.error(err);
  });
