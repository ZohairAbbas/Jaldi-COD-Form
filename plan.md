# Shopify COD Order Form - Implementation Plan

## Project Overview

Build a Shopify App that enables merchants to create customizable Cash on Delivery (COD) order forms with popup and embedded deployment options. The app will streamline the COD checkout process and allow extensive form customization.

---

## Tech Stack

- **Backend**: Shopify Remix
- **Frontend (Admin)**: React with Polaris Web Components
- **Frontend (Storefront)**: React (for consistency and component reusability)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Shopify OAuth
- **APIs**:
  - Shopify GraphQL Admin API (order creation, shop data)
  - Shopify Storefront API (cart data for customer-facing form)
- **Deployment**: App Blocks + App Embeds (Shopify 2.0)

---

## Database Schema (Prisma Models)

### 1. Shop
```prisma
model Shop {
  id                String   @id @default(cuid())
  shopifyDomain     String   @unique
  accessToken       String
  settings          Settings?
  formConfig        FormConfig?
  orders            Order[]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### 2. Settings
```prisma
model Settings {
  id                String   @id @default(cuid())
  shopId            String   @unique
  shop              Shop     @relation(fields: [shopId], references: [id])

  // Deployment settings
  formMode          String   @default("popup") // "popup" | "embedded" | "both"
  enablePopup       Boolean  @default(true)
  enableEmbedded    Boolean  @default(false)

  // Buy Button settings (MVP - basic)
  buttonText        String   @default("Buy with Cash on Delivery")
  buttonPosition    String   @default("bottom") // "bottom" | "top"
  buttonBgColor     String   @default("rgba(0,0,0,1)")
  buttonTextColor   String   @default("rgba(255,255,255,1)")

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### 3. FormConfig
```prisma
model FormConfig {
  id                String   @id @default(cuid())
  shopId            String   @unique
  shop              Shop     @relation(fields: [shopId], references: [id])

  // Form style settings
  formTitle         String   @default("CASH ON DELIVERY")
  textColor         String   @default("rgba(0,0,0,1)")
  backgroundColor   String   @default("rgba(255,255,255,1)")
  fontSize          Int      @default(14)
  borderRadius      Int      @default(8)
  borderWidth       Int      @default(1)
  borderColor       String   @default("rgba(0,0,0,0.1)")
  shadowIntensity   Int      @default(5)

  // Form sections (JSON array of section configs)
  sections          Json     @default("[]")
  // Structure: [{ id, type, visible, order, config }]

  // Form fields (JSON array of field configs)
  fields            Json     @default("[]")
  // Structure: [{ id, type, label, placeholder, required, visible, order }]

  // Validation settings
  requiredFieldErrorText String @default("This field is required.")
  invalidFieldErrorText  String @default("Enter a valid value.")

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### 4. Order
```prisma
model Order {
  id                String   @id @default(cuid())
  shopId            String
  shop              Shop     @relation(fields: [shopId], references: [id])

  shopifyOrderId    String?  @unique
  shopifyOrderNumber String?

  // Customer details
  firstName         String
  lastName          String
  email             String?
  phone             String

  // Address details
  address           String
  address2          String?
  city              String
  province          String
  postalCode        String?
  country           String   @default("Pakistan")

  // Order details
  subtotal          Float
  shipping          Float    @default(0)
  total             Float

  // Custom field responses (JSON)
  customFields      Json     @default("{}")

  // Cart items (JSON array)
  items             Json

  status            String   @default("pending") // "pending" | "confirmed" | "cancelled"

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

---

## MVP Features

### Admin Panel (Merchant-Facing)

#### 1. Form Designer Page
- **Section Management**:
  - Predefined sections: Order Summary, Totals Summary, Shipping Method, Shipping Address, Custom Fields
  - Toggle visibility (show/hide) for each section
  - Reorder sections using drag handles (simple up/down arrows)

- **Field Management**:
  - Predefined field types:
    - Text Input
    - Dropdown List
    - Checkbox
    - Date Selector
    - Quantity Selector
    - Title/Text (static text)
    - Image/GIF (decorative)
  - Add/remove fields from form
  - Reorder fields (drag handles with up/down arrows)
  - Configure field properties:
    - Label
    - Placeholder
    - Required (yes/no)
    - Default value (for dropdowns, checkboxes)

- **Live Preview**:
  - Right-side panel showing real-time preview of the form
  - Preview updates as merchant makes changes
  - Toggle between popup and embedded preview modes

#### 2. Settings Page
- **Form Mode Selection**:
  - Radio buttons: Popup, Embedded, Both
  - Info text explaining each mode

- **Buy Button Customization** (MVP - Basic):
  - Button text (input field)
  - Button position (dropdown: Bottom, Top)
  - Background color (color picker)
  - Text color (color picker)
  - Preview of sticky button

- **Form Style Customization**:
  - Form title (input field)
  - Text color (color picker)
  - Background color (color picker)
  - Font size (slider: 12-24px)
  - Border radius (slider: 0-20px)
  - Border width (slider: 0-10px)
  - Border color (color picker)
  - Shadow intensity (slider: 0-10)
  - "Reset to default" button

#### 3. Orders List Page
- **Order Table**:
  - Columns: Order #, Customer Name, Phone, Address, Total, Status, Date
  - Click row to view order details in modal
  - Filter by status (pending, confirmed, cancelled)
  - Search by customer name or phone
  - Pagination (20 orders per page)

- **Order Details Modal**:
  - Customer information
  - Shipping address
  - Order items (product image, name, quantity, price)
  - Custom field responses
  - Shopify order link (if synced)
  - Status update buttons

### Storefront (Customer-Facing)

#### 1. Popup Mode
- **Sticky Buy Button**:
  - Fixed position (bottom or top based on settings)
  - Customized text, colors from merchant settings
  - Shopping cart icon
  - Click to open popup modal

- **Popup Modal**:
  - Overlay background (dimmed)
  - Close button (X in top-right)
  - Responsive design (mobile-friendly)
  - Form content based on merchant configuration

#### 2. Embedded Mode
- **App Block**:
  - Merchants can add to any page via theme editor
  - Renders form directly on page (no popup)
  - Same styling as popup form

#### 3. Form Sections (Customer View)

**Order Summary Section**:
- Product image, name, price for each item
- Subtotal calculation
- Free shipping label
- Total calculation

**Shipping Method Section**:
- Radio button: "Free shipping - Free"
- (Future: multiple shipping rate options)

**Shipping Address Section**:
- First name (required, text input with person icon)
- Last name (required, text input with person icon)
- Phone number (required, text input with phone icon)
- Address (required, text input with location icon)
- Address 2 (optional, text input)
- Province (required, dropdown with location icon)
- City (required, text input with location icon)
- Postal code (optional, text input)

**Custom Fields Section** (if merchant added any):
- Renders fields based on merchant configuration
- All custom field types supported

**Submit Button**:
- "COMPLETE ORDER - Rs.XXX" button
- Black background, white text
- Full width
- Loading state during submission

#### 4. Form Behavior

**Validation**:
- Client-side HTML5 validation
- Required field checks
- Display error messages below fields
- Use merchant-configured error text

**Submission Flow**:
1. Validate all fields
2. Show loading state on button
3. Create order in database
4. Create Shopify order via Admin API
5. Link Shopify order ID to database order
6. Show success message in modal
7. Success message: "Thank you! Your order has been placed. We'll contact you shortly to confirm."

**Error Handling**:
- Show error message if submission fails
- Keep form data intact
- Allow retry

---

## Advanced Features (Future Implementation)

### Phase 2 - Enhanced Customization
- Buy Button advanced settings:
  - Button subtitle
  - Button animation (none, pulse, shake)
  - Button icon upload
  - Border radius, border width, border color
  - Shadow customization
  - Mobile-only toggle

- Form style enhancements:
  - Hide close button option
  - Hide field labels option
  - RTL support for Arabic languages
  - Full-screen form on mobile devices

- Field validation:
  - Phone number format validation
  - Postal code format validation per country
  - Custom regex validation for text fields

### Phase 3 - Multi-Country Support
- Country selector dropdown
- Different address formats per country
- Postal code validation per country
- Multi-country toggle in settings

### Phase 4 - Google Autocomplete Integration
- Google Maps API integration
- Address autocomplete in address fields
- Merchant configurable (API key in settings)

### Phase 5 - Additional Payment Methods
- "Buy on WhatsApp" button
  - Pre-filled WhatsApp message with order details
  - Merchant WhatsApp number configuration

- "Pay with Card" button
  - Redirect to standard Shopify checkout
  - Option to add card payment alongside COD

### Phase 6 - Shipping Rates
- Multiple shipping methods
- Merchant-configured shipping rates
- Conditional shipping (based on location, order value)
- Shipping calculator in form

### Phase 7 - Advanced Order Management
- Order status workflow (pending → confirmed → shipped → delivered)
- Bulk actions (export orders, bulk status update)
- Email notifications to customers
- SMS notifications integration
- Order analytics dashboard

### Phase 8 - Discount Codes
- Discount code section in form
- Apply discount to total
- Validate against Shopify discount codes

### Phase 9 - Marketing Features
- Newsletter subscription checkbox
- Marketing consent checkboxes
- Abandoned form recovery
- Form analytics (views, submissions, conversion rate)

---

## Implementation Phases

### Phase 1: Project Setup & Authentication (Week 1)
1. Initialize Shopify Remix app
2. Set up PostgreSQL database
3. Configure Prisma schema
4. Implement Shopify OAuth flow
5. Set up app installation flow
6. Create base admin layout with Polaris

### Phase 2: Admin - Form Designer (Week 2-3)
1. Build form designer UI
2. Implement section management (show/hide, reorder)
3. Implement field management (add/remove, reorder, configure)
4. Build live preview component
5. Create API routes for saving form config
6. Add default form configuration on app install

### Phase 3: Admin - Settings Page (Week 3-4)
1. Build settings page UI
2. Form mode selection
3. Buy button basic customization
4. Form style customization
5. Color picker components
6. Slider components
7. API routes for saving settings

### Phase 4: Storefront - Form Rendering (Week 4-6)
1. Create App Block for embedded mode
2. Create App Embed for popup mode
3. Build form component (React)
4. Fetch and render merchant configuration
5. Implement all field types
6. Build section components
7. Responsive design (mobile/desktop)
8. Sticky buy button component

### Phase 5: Order Submission & Processing (Week 6-7)
1. Build form submission handler
2. Client-side validation
3. API route for order creation
4. Save order to database
5. Create Shopify order via GraphQL Admin API
6. Link database order to Shopify order
7. Error handling and retry logic
8. Success message display

### Phase 6: Admin - Orders List (Week 7-8)
1. Build orders list page
2. Fetch orders from database
3. Table component with sorting/filtering
4. Search functionality
5. Pagination
6. Order details modal
7. Status update functionality
8. Shopify order link integration

### Phase 7: Testing & Refinement (Week 8-9)
1. End-to-end testing
2. Cross-browser testing
3. Mobile responsiveness testing
4. Performance optimization
5. Bug fixes
6. Documentation

### Phase 8: Deployment (Week 9-10)
1. Set up production database
2. Configure environment variables
3. Deploy to hosting (e.g., Railway, Fly.io)
4. SSL configuration
5. Shopify app submission preparation
6. Beta testing with test merchants

---

## Technical Implementation Details

### App Architecture

```
jaldi-cod-form/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx              # Dashboard redirect
│   │   ├── app.form-designer.tsx       # Form designer page
│   │   ├── app.settings.tsx            # Settings page
│   │   ├── app.orders._index.tsx       # Orders list page
│   │   ├── app.orders.$id.tsx          # Order details
│   │   ├── api.form-config.ts          # API: Get/save form config
│   │   ├── api.settings.ts             # API: Get/save settings
│   │   ├── api.orders.ts               # API: Get orders list
│   │   ├── api.order.submit.ts         # API: Submit order
│   │   └── api.webhooks.tsx            # Shopify webhooks
│   ├── components/
│   │   ├── admin/
│   │   │   ├── FormDesigner/
│   │   │   │   ├── SectionManager.tsx
│   │   │   │   ├── FieldManager.tsx
│   │   │   │   ├── FieldConfig.tsx
│   │   │   │   └── LivePreview.tsx
│   │   │   ├── Settings/
│   │   │   │   ├── FormModeSelector.tsx
│   │   │   │   ├── ButtonCustomizer.tsx
│   │   │   │   └── StyleCustomizer.tsx
│   │   │   └── Orders/
│   │   │       ├── OrdersTable.tsx
│   │   │       ├── OrderDetails.tsx
│   │   │       └── OrderFilters.tsx
│   │   └── storefront/
│   │       ├── CODForm/
│   │       │   ├── Form.tsx
│   │       │   ├── OrderSummary.tsx
│   │       │   ├── ShippingAddress.tsx
│   │       │   ├── CustomFields.tsx
│   │       │   └── SubmitButton.tsx
│   │       ├── BuyButton.tsx
│   │       └── Modal.tsx
│   ├── lib/
│   │   ├── shopify.server.ts           # Shopify API client
│   │   ├── db.server.ts                # Prisma client
│   │   └── order.server.ts             # Order creation logic
│   └── styles/
│       └── storefront.css              # Storefront form styles
├── extensions/
│   ├── cod-form-popup/                 # App Embed extension
│   │   ├── blocks/
│   │   └── snippets/
│   └── cod-form-embedded/              # App Block extension
│       └── blocks/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
│   └── storefront-bundle.js            # Compiled storefront JS
└── package.json
```

### Key Technical Decisions

**1. Form Configuration Storage**:
- Store sections and fields as JSON in database
- Allows flexible configuration without schema changes
- Easy to version and migrate

**2. Storefront Bundle**:
- Compile React components to standalone JS bundle
- Load via CDN or app proxy
- Lightweight and fast loading

**3. Order Creation Flow**:
```
Customer submits form
    ↓
Validate data (client-side)
    ↓
POST to /api/order/submit
    ↓
Save to database (Order model)
    ↓
Create Shopify Draft Order (GraphQL)
    ↓
Convert Draft Order to Order
    ↓
Update database with Shopify order ID
    ↓
Return success response
    ↓
Show success message to customer
```

**4. Real-time Preview**:
- Form designer updates preview via React state
- No server round-trips for preview
- Debounced auto-save to database

**5. Styling Strategy**:
- Admin: Polaris components (consistent with Shopify)
- Storefront: Custom CSS with merchant color/style overrides
- Inline styles for merchant-customized colors
- CSS variables for theming

---

## API Endpoints

### Admin API

**GET /api/form-config**
- Returns current form configuration
- Response: `{ sections: [], fields: [], styles: {} }`

**POST /api/form-config**
- Saves form configuration
- Body: `{ sections: [], fields: [], styles: {} }`
- Response: `{ success: true }`

**GET /api/settings**
- Returns app settings
- Response: `{ formMode, buttonConfig, styleConfig }`

**POST /api/settings**
- Saves app settings
- Body: `{ formMode, buttonConfig, styleConfig }`
- Response: `{ success: true }`

**GET /api/orders**
- Returns paginated orders list
- Query params: `page`, `limit`, `status`, `search`
- Response: `{ orders: [], total, page, pages }`

**GET /api/orders/:id**
- Returns single order details
- Response: `{ order: {} }`

**PATCH /api/orders/:id**
- Updates order status
- Body: `{ status: "confirmed" }`
- Response: `{ success: true }`

### Storefront API

**GET /api/storefront/config**
- Returns form configuration for storefront
- Query param: `shop` (shop domain)
- Response: `{ formConfig, settings, shopInfo }`

**POST /api/order/submit**
- Creates new COD order
- Body: `{ customerInfo, address, items, customFields, shop }`
- Response: `{ success: true, orderId, orderNumber }`

---

## Default Form Configuration

On app installation, create default configuration:

```javascript
{
  sections: [
    { id: 'order-summary', type: 'orderSummary', visible: true, order: 0 },
    { id: 'totals', type: 'totals', visible: true, order: 1 },
    { id: 'shipping-method', type: 'shippingMethod', visible: true, order: 2 },
    { id: 'shipping-address', type: 'shippingAddress', visible: true, order: 3 },
  ],
  fields: [
    { id: 'first-name', type: 'text', label: 'First name', required: true, visible: true, order: 0, section: 'shipping-address' },
    { id: 'last-name', type: 'text', label: 'Last name', required: true, visible: true, order: 1, section: 'shipping-address' },
    { id: 'phone', type: 'text', label: 'Phone number', required: true, visible: true, order: 2, section: 'shipping-address' },
    { id: 'address', type: 'text', label: 'Address', required: true, visible: true, order: 3, section: 'shipping-address' },
    { id: 'address2', type: 'text', label: 'Address 2', required: false, visible: true, order: 4, section: 'shipping-address' },
    { id: 'province', type: 'dropdown', label: 'Province', required: true, visible: true, order: 5, section: 'shipping-address', options: ['Punjab', 'Sindh', 'KPK', 'Balochistan', 'Islamabad'] },
    { id: 'city', type: 'text', label: 'City', required: true, visible: true, order: 6, section: 'shipping-address' },
    { id: 'postal-code', type: 'text', label: 'Postal code', required: false, visible: true, order: 7, section: 'shipping-address' },
  ],
  styles: {
    formTitle: 'CASH ON DELIVERY',
    textColor: 'rgba(0,0,0,1)',
    backgroundColor: 'rgba(255,255,255,1)',
    fontSize: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowIntensity: 5,
  }
}
```

---

## Success Metrics

### MVP Success Criteria:
1. Merchants can install app and authenticate successfully
2. Merchants can customize form (add/remove/reorder fields and sections)
3. Merchants can customize form styles (colors, borders, shadows)
4. Merchants can toggle popup/embedded modes
5. Customers can view form with merchant's configuration
6. Customers can submit COD orders successfully
7. Orders are created in both database and Shopify
8. Merchants can view submitted orders in admin panel

### Performance Targets:
- Form loads in < 2 seconds
- Order submission completes in < 3 seconds
- Admin pages load in < 1 second
- Mobile-responsive (works on all screen sizes)

---

## Next Steps After MVP

1. Gather merchant feedback
2. Implement Phase 2 advanced customization features
3. Add multi-country support
4. Integrate Google Autocomplete
5. Add WhatsApp and card payment options
6. Build shipping rate configuration
7. Enhance order management workflow
8. Add analytics and reporting

---

## Notes & Considerations

- **Security**: Validate all inputs, sanitize data, use Shopify's HMAC verification for webhooks
- **Performance**: Use database indexes on frequently queried fields (shopifyDomain, orderId)
- **Scalability**: Consider caching form configurations (Redis) for high-traffic stores
- **Error Logging**: Implement error tracking (Sentry or similar)
- **GDPR Compliance**: Add data deletion webhook handler for Shopify GDPR requirements
- **App Billing**: Plan for Shopify app billing integration (monthly subscription)
- **Testing**: Write unit tests for critical functions (order creation, validation)
- **Documentation**: Create merchant help docs and setup guide

---

## Estimated Timeline

- **MVP Development**: 8-10 weeks
- **Testing & Refinement**: 2 weeks
- **Deployment & Beta**: 1-2 weeks
- **Total**: ~12 weeks to production-ready MVP

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Shopify API rate limits | High | Implement request queuing, caching |
| Complex form rendering | Medium | Use proven React patterns, component library |
| Order creation failures | High | Robust error handling, retry logic, logging |
| Mobile performance | Medium | Lazy loading, code splitting, optimization |
| Merchant confusion | Medium | Clear UI/UX, help tooltips, documentation |

---

*This plan is a living document and will be updated as development progresses.*
