# ER Diagram — bidai_api

Entity-relationship diagram for the PostgreSQL schema (`db/schema.sql`).

## Diagram

```mermaid
erDiagram
    USERS ||--o{ PRODUCTS : "sells (seller_id)"
    USERS ||--o{ ORDERS : "buys (buyer_id)"
    CATEGORIES ||--o{ PRODUCTS : "contains"
    PRODUCTS ||--o{ PRODUCT_IMAGES : "has"
    ORDERS ||--o{ ORDER_ITEMS : "includes"
    PRODUCTS ||--o{ ORDER_ITEMS : "purchased in"

    USERS {
        int id PK
        varchar name
        varchar mobile UK
        varchar email UK
        varchar password_hash
        timestamptz created_at
    }

    CATEGORIES {
        int id PK
        varchar name UK
        varchar slug UK
    }

    PRODUCTS {
        int id PK
        int seller_id FK
        int category_id FK
        varchar title
        text description
        varchar brand
        varchar product_type
        varchar location
        varchar sell_as
        numeric price
        int stock
        varchar status
        timestamptz created_at
    }

    PRODUCT_IMAGES {
        int id PK
        int product_id FK
        varchar url
        int position
    }

    ORDERS {
        int id PK
        int buyer_id FK
        numeric total
        varchar status
        timestamptz created_at
    }

    ORDER_ITEMS {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
        numeric unit_price
    }
```

---

## Tables & keys

| Table | PK | FK | Unique | Notes |
|-------|----|----|--------|-------|
| **users** | `id` | — | `mobile`, `email` | `password_hash` = bcrypt |
| **categories** | `id` | — | `name`, `slug` | 15 rows seeded |
| **products** | `id` | `seller_id` → users, `category_id` → categories | — | `sell_as`: vendor/individual · `status`: approved/deleted |
| **product_images** | `id` | `product_id` → products | — | 2–5 rows per product |
| **orders** | `id` | `buyer_id` → users | — | `status`: pending/paid/cancelled |
| **order_items** | `id` | `order_id` → orders, `product_id` → products | — | price snapshotted as `unit_price` |

---

## Relationships

| Relationship | Cardinality | On delete |
|--------------|-------------|-----------|
| users → products | 1 : N (`seller_id`) | CASCADE |
| users → orders | 1 : N (`buyer_id`) | CASCADE |
| categories → products | 1 : N (`category_id`) | SET NULL |
| products → product_images | 1 : N | CASCADE |
| orders → order_items | 1 : N | CASCADE |
| products → order_items | 1 : N | RESTRICT (keep order history) |

---

## Enums / check constraints

| Column | Allowed values |
|--------|----------------|
| `products.sell_as` | `vendor`, `individual` |
| `products.status` | `approved`, `deleted` |
| `orders.status` | `pending`, `paid`, `cancelled` |
| `products.price` | ≥ 0 |
| `products.stock` | ≥ 0 |
| `order_items.quantity` | > 0 |

---

## Textual ER

```
users 1 ──N products N ──1 categories
users 1 ──N products 1 ──N product_images
users 1 ──N orders 1 ──N order_items N ──1 products
```
