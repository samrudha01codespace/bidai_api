# bidai_api

Node.js + Express + PostgreSQL backend for the **BID.ai** marketplace mobile app — auth, categories, product listing with image upload, and order/purchase flow.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js ≥ 18 (tested on v26) |
| Framework | Express 4 |
| Database | PostgreSQL 16 (Docker Compose) |
| DB driver | `pg` (node-postgres), parameterized SQL |
| Auth | JWT (`jsonwebtoken`, HS256, 24h) + `bcryptjs` (cost 10) |
| File upload | `multer` (disk storage → `uploads/`) |
| Other | `cors`, `dotenv`, `nodemon` (dev) |
| Public URL | ngrok (optional, for mobile/Postman remote testing) |

---

## Quick start

```bash
cd bidai_api
cp .env.example .env          # set JWT_SECRET
docker compose up -d          # Postgres 16 + auto schema + categories seed
npm install
npm run dev                   # http://localhost:3000
```

Optional public URL:

```bash
ngrok http 3000
```

**Postman:** Import [`postman_collection.json`](./postman_collection.json).

---

## Project structure

```
bidai_api/
├── docker-compose.yml          # Postgres 16 + schema init
├── postman_collection.json     # Full API test collection
├── db/schema.sql               # Tables + 15 categories seed
├── docs/
│   ├── ER_DIAGRAM.md           # Entity-relationship (Mermaid)
│   └── FLOW_DIAGRAM.md         # Auth / Sell / Buy flows (Mermaid)
├── uploads/                    # Product images (local, gitignored)
└── src/
    ├── index.js                # App entry, routes, static /uploads
    ├── db.js                   # pg Pool
    ├── middleware/auth.js      # JWT Bearer verify
    └── routes/
        ├── auth.js             # signup, login, me
        ├── categories.js
        ├── uploads.js          # 2–5 images multipart
        ├── products.js         # CRUD + feed with images
        └── orders.js           # transactional purchase
```

---

## API endpoints

Base URL (local): `http://localhost:3000`  
Auth header (protected): `Authorization: Bearer <token>`

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Liveness check |

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | — | Register |
| POST | `/api/auth/login` | — | Login → JWT |
| GET | `/api/auth/me` | Bearer | Current user |

**Signup** body:

```json
{
  "name": "Samrudha",
  "mobile": "9876543210",
  "email": "you@mail.com",
  "password": "123456789"
}
```

| Rule | Detail |
|------|--------|
| mobile | 10-digit Indian, starts 6–9, unique |
| email | unique, lowercased |
| password | min 6 chars |

**Responses:** `201 { token, user }` · `400` validation · `409` email/mobile exists · `401` bad login

**Login** body: `{ "email", "password" }` → `200 { token, user }`

**User object:** `{ id, name, mobile, email, created_at }`

---

### Categories

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/categories` | — | 15 seeded categories |

**Response:**

```json
{
  "categories": [
    { "id": 1, "name": "Cars", "slug": "cars" }
  ]
}
```

Slugs: `cars`, `real-estate`, `mobiles`, `jobs`, `bikes`, `electronics`, `home-garden`, `beauty`, `clothing`, `books`, `arts-and-crafts`, `services`, `general-service`, `yodha`, `agriculture`

---

### Uploads (product images)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/uploads` | Bearer | Upload **2–5** images |

| Rule | Detail |
|------|--------|
| Field name | `images` (multipart, repeated) |
| Count | min 2, max 5 |
| Types | `image/jpeg`, `image/png`, `image/webp` |
| Size | ≤ 5 MB each |

**Response `201`:**

```json
{ "urls": ["/uploads/1790....png", "/uploads/1790....png"] }
```

Use these paths in `image_urls` when creating a product.  
Files served at `GET /uploads/<filename>`.

**Errors:** `400` min/max/size/type · `401` no token

---

### Products

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/products` | — | Feed (approved only) |
| GET | `/api/products/:id` | — | Product detail + images |
| POST | `/api/products` | Bearer | Create (auto-approved) |
| PUT | `/api/products/:id` | Bearer | Update (owner only) |
| DELETE | `/api/products/:id` | Bearer | Soft-delete (owner only) |

**List query params:**

| Param | Example | Notes |
|-------|---------|-------|
| `search` | `?search=mt16` | title / description / brand ILIKE |
| `category` | `?category=bikes` | slug filter |
| `page` | `?page=1` | default 1 |
| `limit` | `?limit=10` | default 10, max 100 |

**List response:**

```json
{
  "products": [
    {
      "id": 1,
      "title": "MT 16 Bike",
      "description": "Nice",
      "brand": "Yamaha",
      "product_type": "Bike",
      "location": "Bengaluru",
      "sell_as": "individual",
      "price": "85000.00",
      "stock": 1,
      "status": "approved",
      "category_id": 5,
      "category_name": "Bikes",
      "category_slug": "bikes",
      "seller_id": 1,
      "seller_name": "Samrudha",
      "images": ["/uploads/....png", "/uploads/....png"],
      "created_at": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
}
```

**Create body:**

```json
{
  "category_id": 5,
  "title": "MT 16 Bike",
  "description": "Nice bike",
  "brand": "Yamaha",
  "product_type": "Bike",
  "location": "Bengaluru",
  "sell_as": "individual",
  "price": 85000,
  "stock": 1,
  "image_urls": ["/uploads/aaa.png", "/uploads/bbb.png"]
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `title` | yes | non-empty |
| `price` | yes | ≥ 0 |
| `image_urls` | yes | 2–5 paths from `/api/uploads` |
| `category_id` | no | must exist |
| `sell_as` | no | `vendor` \| `individual` (default individual) |
| `stock` | no | integer ≥ 0 (default 1) |
| `brand`, `product_type`, `location`, `description` | no | strings |

**Status:** created as `approved` (live immediately). Soft-delete → `deleted` (hidden from feed).

**Errors:** `400` validation · `401` no token · `403` not owner · `404` missing

---

### Orders (purchase flow)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/orders` | Bearer | Place order (stock locked in txn) |
| GET | `/api/orders` | Bearer | Buyer’s orders |
| GET | `/api/orders/:id` | Bearer | Order detail (own only) |

**Place order body:**

```json
{
  "items": [
    { "product_id": 1, "quantity": 1 }
  ]
}
```

**Behavior (DB transaction):**
1. `SELECT ... FOR UPDATE` each product  
2. Validate stock, not own product  
3. Decrease stock · insert `orders` + `order_items` · commit  

**Response `201`:**

```json
{
  "order": {
    "id": 1,
    "buyer_id": 2,
    "total": "85000.00",
    "status": "pending",
    "items": [
      { "product_id": 1, "title": "MT 16 Bike", "quantity": 1, "unit_price": 85000, "line_total": 85000 }
    ]
  }
}
```

**Errors:** `400` bad items / own product · `404` product missing · `409` insufficient stock · `401` no token

---

### Static files

| Method | Path | Description |
|--------|------|-------------|
| GET | `/uploads/<filename>` | Serve product image |

---

## Status codes (summary)

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Validation error |
| 401 | Missing/invalid JWT |
| 403 | Not owner |
| 404 | Not found |
| 409 | Conflict (email/mobile/stock) |
| 500 | Server error |

---

## Postman testing

1. Open Postman → **Import** → `postman_collection.json`
2. Collection variable `base_url` = `http://localhost:3000` (or ngrok URL)
3. Run order:
   - **Auth** → Signup Seller / Buyer (or Login)
   - **Categories** → List
   - **Uploads** → add 2+ image files → saves `image_urls`
   - **Products** → Create (paste/use `image_urls`) → List / Detail
   - **Orders** → Place Order → My Orders
4. Tests auto-save tokens, `product_id`, `order_id`, `image_urls`

---

## Diagrams

- [ER Diagram](./docs/ER_DIAGRAM.md) — 6 tables, keys & relations  
- [Flow Diagram](./docs/FLOW_DIAGRAM.md) — Auth, Sell, Buy sequences  

---

## Environment variables (`.env`)

| Key | Example |
|-----|---------|
| `PORT` | `3000` |
| `DATABASE_URL` | `postgres://bidai:bidai_secret@localhost:5432/bidai_db` |
| `JWT_SECRET` | long random hex |
| `JWT_EXPIRES_IN` | `24h` |

---

## Database reset

```bash
docker compose down -v && docker compose up -d
```

Wipes data and re-runs `db/schema.sql` (tables + 15 categories).
