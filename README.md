# Jaldi COD Form - Shopify App

A powerful Shopify app for managing Cash on Delivery (COD) orders with customizable forms, popup/embedded modes, and seamless Shopify integration.

## Features

- **Customizable COD Order Forms**: Design forms that match your brand
- **Popup & Embedded Modes**: Flexible deployment options for your storefront
- **Automatic Order Creation**: Orders are automatically created in Shopify
- **Order Management Dashboard**: View and manage all COD orders in one place
- **Custom Fields Support**: Add custom fields to collect additional information
- **Fully Styled**: Customize colors, fonts, borders, and more

## Tech Stack

- **Backend**: Shopify Remix (React Router)
- **Frontend**: React with Polaris Web Components
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Shopify OAuth
- **APIs**: Shopify GraphQL Admin API & Storefront API

## Prerequisites

- Node.js >= 20.19 < 22 || >= 22.12
- PostgreSQL database
- Shopify Partner account
- Shopify development store
- Shopify CLI

```bash
npm install -g @shopify/cli@latest
```

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd jaldi-cod-form
npm install
```

### 2. Set Up Database

Create a PostgreSQL database for the app:

```bash
createdb jaldi_cod_form
```

Or using a PostgreSQL client, create a database named `jaldi_cod_form`.

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_APP_URL=https://your-app-url.com
SCOPES=write_draft_orders,write_orders,read_products,read_price_rules,read_discounts
DATABASE_URL=postgresql://user:password@localhost:5432/jaldi_cod_form
```

### 4. Run Database Migrations

```bash
npx prisma migrate dev
```

This will:
- Create all database tables (Shop, Settings, FormConfig, Order, Session)
- Generate the Prisma client

### 5. Start Development Server

```bash
npm run dev
```

This will:
- Start the Shopify CLI development server
- Tunnel your local app to a public URL
- Open the Shopify Partners dashboard

### 6. Install the App

1. When prompted, select your development store
2. Click "Install app" in the Shopify admin
3. Grant the requested permissions

## Project Structure

```
jaldi-cod-form/
├── app/
│   ├── routes/
│   │   ├── app._index.jsx           # Dashboard
│   │   ├── app.form-designer.jsx    # Form Designer page
│   │   ├── app.settings.jsx         # Settings page
│   │   ├── app.orders.jsx           # Orders list page
│   │   ├── app.jsx                  # Admin layout
│   │   └── auth.login/              # OAuth login
│   ├── lib/
│   │   ├── db.server.js             # Database utilities
│   │   └── order.server.js          # Order creation logic
│   ├── db.server.js                 # Prisma client
│   └── shopify.server.js            # Shopify API client
├── prisma/
│   ├── schema.prisma                # Database schema
│   └── migrations/                  # Database migrations
├── extensions/                       # Shopify app extensions (future)
├── package.json
├── shopify.app.toml                 # Shopify app config
└── vite.config.js
```

## Database Schema

### Shop
Stores shop information and access tokens. Created automatically when merchant installs the app.

### Settings
App settings including:
- Form mode (popup/embedded/both)
- Buy button customization
- Button colors and position

### FormConfig
Form configuration including:
- Sections (order summary, shipping address, totals, etc.)
- Fields (text, dropdown, checkbox, date, quantity, etc.)
- Styling (colors, fonts, borders, shadow)
- Validation text

### Order
COD orders with:
- Customer information (name, phone, email)
- Shipping address
- Order items
- Custom field responses
- Shopify order linkage (order ID and number)
- Status (pending, confirmed, cancelled)

## Development

### Running Migrations

When you make changes to the schema:

```bash
npx prisma migrate dev --name description_of_changes
```

### Viewing Database

Use Prisma Studio to view/edit database records:

```bash
npx prisma studio
```

### Generating Prisma Client

After schema changes:

```bash
npx prisma generate
```

### Code Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run typecheck
```

## Current Status

### Phase 1: Basic Setup ✅ COMPLETED
- [x] Database schema with PostgreSQL
- [x] Admin navigation (Dashboard, Form Designer, Settings, Orders)
- [x] Dashboard page with stats
- [x] Placeholder pages for all main features
- [x] Database utilities and helpers
- [x] Order creation utilities
- [x] Default configuration setup

### Phase 2: Form Designer (Next)
- [ ] Section management UI (show/hide, reorder)
- [ ] Field management UI (add/remove, configure)
- [ ] Live preview component
- [ ] Save/update functionality
- [ ] API routes for form config

### Phase 3: Settings Page (Next)
- [ ] Form mode selector (popup/embedded/both)
- [ ] Buy button customization UI
- [ ] Style customization UI
- [ ] Color pickers and sliders
- [ ] API routes for settings

### Phase 4: Storefront Integration
- [ ] App Block extension (embedded mode)
- [ ] App Embed extension (popup mode)
- [ ] Form rendering component
- [ ] Buy button component
- [ ] Storefront API integration

### Phase 5: Order Submission
- [ ] Form validation (client-side)
- [ ] Order submission API
- [ ] Shopify order creation via GraphQL
- [ ] Success/error handling
- [ ] Order confirmation display

### Phase 6: Order Management
- [ ] Orders table with sorting
- [ ] Filtering by status
- [ ] Search functionality
- [ ] Order details modal
- [ ] Status update functionality
- [ ] Pagination

### Phase 7: Advanced Features (Future)
- [ ] Additional custom field types
- [ ] Advanced button styling
- [ ] Multi-language support
- [ ] Shipping rate configuration
- [ ] Discount codes integration
- [ ] WhatsApp integration
- [ ] Analytics dashboard

## API Endpoints (To Be Implemented)

### Admin API
- `GET /api/form-config` - Get form configuration
- `POST /api/form-config` - Save form configuration
- `GET /api/settings` - Get app settings
- `POST /api/settings` - Save app settings
- `GET /api/orders` - Get orders list (with pagination)
- `GET /api/orders/:id` - Get single order
- `PATCH /api/orders/:id` - Update order status

### Storefront API
- `GET /api/storefront/config` - Get form config for storefront
- `POST /api/order/submit` - Submit COD order

## Deployment

### 1. Set Up Production Database

Create a production PostgreSQL database using a hosting provider:
- [Railway](https://railway.app/)
- [Heroku Postgres](https://www.heroku.com/postgres)
- [Digital Ocean](https://www.digitalocean.com/products/managed-databases-postgresql)
- [AWS RDS](https://aws.amazon.com/rds/postgresql/)

### 2. Configure Environment Variables

Set production environment variables in your hosting platform:

```env
SHOPIFY_API_KEY=your_production_api_key
SHOPIFY_API_SECRET=your_production_api_secret
SHOPIFY_APP_URL=https://your-production-url.com
SCOPES=write_draft_orders,write_orders,read_products,read_price_rules,read_discounts
DATABASE_URL=postgresql://user:password@host:5432/database
NODE_ENV=production
```

### 3. Run Migrations

```bash
npm run setup
```

This runs:
- `prisma generate` - Generate Prisma client
- `prisma migrate deploy` - Run migrations

### 4. Build and Deploy

```bash
npm run build
npm run deploy
```

Follow the [Shopify deployment guide](https://shopify.dev/docs/apps/launch/deployment) for your chosen hosting platform.

## Troubleshooting

### Database Connection Issues

Make sure PostgreSQL is running and the `DATABASE_URL` is correct:

```bash
# Test connection
psql $DATABASE_URL

# Or check with Prisma
npx prisma db push
```

### Shopify OAuth Issues

Ensure your app URL matches the one configured in Shopify Partners:

```bash
shopify app config link
```

### Migration Issues

If migrations fail, check the database connection and try:

```bash
# View migration status
npx prisma migrate status

# Reset database (development only - deletes all data!)
npx prisma migrate reset
```

### "Table does not exist" Error

Run the setup script:

```bash
npm run setup
```

### Windows ARM64 Prisma Issues

If you get errors about `query_engine-windows.dll.node`:

```bash
# Set environment variable
set PRISMA_CLIENT_ENGINE_TYPE=binary

# Then run setup again
npm run setup
```

## Default Configuration

When a merchant installs the app, the following default configuration is automatically created:

**Form Sections:**
- Order Summary
- Totals Summary
- Shipping Method (Free shipping)
- Shipping Address

**Form Fields:**
- First Name (required)
- Last Name (required)
- Phone Number (required)
- Address (required)
- Address 2 (optional)
- Province (required dropdown: Punjab, Sindh, KPK, Balochistan, Islamabad)
- City (required)
- Postal Code (optional)

**Settings:**
- Form Mode: Popup
- Button Text: "Buy with Cash on Delivery"
- Button Position: Bottom
- Button Colors: Black background, white text

## Resources

### Shopify
- [Shopify App Development](https://shopify.dev/docs/apps)
- [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql)
- [App Bridge](https://shopify.dev/docs/api/app-bridge-library)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)

### Frameworks
- [React Router](https://reactrouter.com/)
- [Prisma](https://www.prisma.io/docs)
- [PostgreSQL](https://www.postgresql.org/docs/)

## Support

For issues or questions:
1. Check existing documentation
2. Review the [plan.md](plan.md) file for implementation details
3. Check [Shopify dev forums](https://community.shopify.com/c/shopify-apis-and-sdks/bd-p/shopify-apis-and-technology)

## License

MIT

## Author

zohair.abbas
