#!/bin/bash

echo "🚀 Setting up Mantle Billing & Mixpanel Analytics"
echo "=================================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
fi

# Check for required environment variables
echo "Checking environment variables..."
if ! grep -q "MANTLE_APP_ID" .env || ! grep -q "MIXPANEL_TOKEN" .env; then
    echo "⚠️  Required environment variables not found in .env"
    echo ""
    echo "Please add the following to your .env file:"
    echo ""
    echo "MANTLE_APP_ID=your_mantle_app_id_here"
    echo "MANTLE_API_KEY=your_mantle_api_key_here"
    echo "MIXPANEL_TOKEN=your_mixpanel_project_token_here"
    echo ""
    echo "Get your credentials from:"
    echo "  - Mantle: https://heymantle.com"
    echo "  - Mixpanel: https://mixpanel.com"
    echo ""
else
    echo "✅ Environment variables found"
    echo ""
fi

# Run database migration
echo "Running database migration..."
if npm run prisma migrate dev --name add_subscription_model; then
    echo "✅ Database migration completed"
else
    echo "⚠️  Migration may have already been applied or failed"
fi
echo ""

# Generate Prisma client
echo "Generating Prisma client..."
npm run prisma generate
echo "✅ Prisma client generated"
echo ""

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your Mantle and Mixpanel credentials to .env"
echo "2. Follow the integration guide in INTEGRATION_GUIDE.md"
echo "3. Configure Mantle webhook at: https://your-app-url.com/webhooks/mantle"
echo "4. Test the billing flow at: /app/billing"
echo "5. Verify events in Mixpanel dashboard"
echo ""
echo "📚 Documentation:"
echo "  - SETUP_SUMMARY.md - Quick overview"
echo "  - INTEGRATION_GUIDE.md - Detailed integration steps"
echo ""
