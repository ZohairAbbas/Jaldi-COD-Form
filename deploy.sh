#!/bin/bash

# Jaldi COD Form - Deployment Script
# Run this script on your server after initial setup

set -e

echo "🚀 Starting deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as jaldicod user
if [ "$USER" != "jaldicod" ]; then
    echo -e "${RED}❌ Please run this script as the jaldicod user${NC}"
    echo "Run: su - jaldicod && cd ~/jaldi-cod-form && ./deploy.sh"
    exit 1
fi

# Navigate to app directory
cd ~/jaldi-cod-form

echo -e "${YELLOW}📦 Pulling latest changes...${NC}"
git pull origin main

echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
npx prisma generate
npx prisma migrate deploy

echo -e "${YELLOW}🔨 Building application...${NC}"
npm run build

echo -e "${YELLOW}🔄 Restarting PM2...${NC}"
pm2 restart jaldicod

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo "📊 Application Status:"
pm2 status jaldicod
echo ""
echo "📝 View logs with: pm2 logs jaldicod"
echo "🔍 Monitor app with: pm2 monit"
