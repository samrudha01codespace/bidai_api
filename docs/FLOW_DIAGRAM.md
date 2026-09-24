# Flow Diagrams — bidai_api

Sequence flows for auth, selling (with images), and buying.

---

## 1. Auth flow (signup / login)

```mermaid
sequenceDiagram
    autonumber
    actor C as Client (App / Postman)
    participant API as bidai_api
    participant DB as PostgreSQL

    Note over C,DB: SIGNUP
    C->>API: POST /api/auth/signup<br/>{name, mobile, email, password}
    API->>API: Validate fields (mobile 6-9..., password ≥ 6)
    API->>DB: SELECT email/mobile exists?
    alt already exists
        API-->>C: 409 Email or Mobile already registered
    else new user
        API->>API: bcrypt.hash(password, 10)
        API->>DB: INSERT users
        API->>API: jwt.sign({sub, email}, 24h)
        API-->>C: 201 { token, user }
    end

    Note over C,DB: LOGIN
    C->>API: POST /api/auth/login {email, password}
    API->>DB: SELECT user by email
    API->>API: bcrypt.compare
    alt invalid
        API-->>C: 401 Invalid email or password
    else ok
        API-->>C: 200 { token, user }
    end

    Note over C,DB: PROTECTED CALL
    C->>API: GET /api/auth/me<br/>Authorization: Bearer <token>
    API->>API: jwt.verify
    alt bad/missing token
        API-->>C: 401
    else valid
        API->>DB: SELECT user by id
        API-->>C: 200 { user }
    end
```

---

## 2. Sell flow (categories → upload images → create product → feed)

```mermaid
sequenceDiagram
    autonumber
    actor S as Seller App
    participant API as bidai_api
    participant FS as uploads/ (disk)
    participant DB as PostgreSQL

    Note over S,DB: Pick category
    S->>API: GET /api/categories
    API->>DB: SELECT categories
    API-->>S: 200 [15 categories]

    Note over S,DB: Upload photos (min 2, max 5)
    S->>API: POST /api/uploads<br/>Bearer + multipart images[]
    API->>API: Validate count (2–5), type, size ≤ 5MB
    API->>FS: Save files
    API-->>S: 201 { urls: ["/uploads/a.png", ...] }

    Note over S,DB: Create listing (auto-approved)
    S->>API: POST /api/products<br/>{title, price, category_id, image_urls, brand, ...}
    API->>API: Validate title, price, image_urls (2–5 /uploads/...)
    API->>DB: BEGIN
    API->>DB: INSERT products (status='approved')
    API->>DB: INSERT product_images (positions)
    API->>DB: COMMIT
    API-->>S: 201 { product: { ..., images: [...] } }

    Note over S,DB: Appears in home feed
    S->>API: GET /api/products?category=bikes
    API->>DB: SELECT products + images WHERE status=approved
    API-->>S: 200 { products: [...], pagination }
```

### Sell form field mapping (mobile screens)

| Screen field | API field |
|--------------|-----------|
| Select Categories | `category_id` |
| Select or Take Photo | `POST /api/uploads` → `image_urls[]` |
| Sell as (vendor / Individual) | `sell_as` |
| Brands | `brand` |
| Select Product Type | `product_type` |
| Ad Title | `title` |
| Description | `description` |
| Price | `price` |
| Location | `location` |
| Upload | `POST /api/products` |

---

## 3. Buy / order flow (transactional stock)

```mermaid
sequenceDiagram
    autonumber
    actor B as Buyer App
    participant API as bidai_api
    participant DB as PostgreSQL

    B->>API: GET /api/products?search=&category=
    API-->>B: 200 feed with images[]

    B->>API: POST /api/orders<br/>Bearer + {items:[{product_id, quantity}]}
    API->>DB: BEGIN
    loop each item
        API->>DB: SELECT product FOR UPDATE
        alt product missing
            API->>DB: ROLLBACK
            API-->>B: 404 Product not found
        else insufficient stock
            API->>DB: ROLLBACK
            API-->>B: 409 Insufficient stock
        else seller = buyer
            API->>DB: ROLLBACK
            API-->>B: 400 Cannot buy own product
        else ok
            API->>DB: UPDATE stock = stock - qty
        end
    end
    API->>DB: INSERT orders (total)
    API->>DB: INSERT order_items
    API->>DB: COMMIT
    API-->>B: 201 { order: { items, total, status: "pending" } }

    B->>API: GET /api/orders
    API-->>B: 200 { orders: [...] }

    B->>API: GET /api/orders/:id
    API-->>B: 200 { order: { items: [...] } }
```

---

## 4. Delete product (soft delete)

```mermaid
sequenceDiagram
    autonumber
    actor S as Seller
    participant API as bidai_api
    participant DB as PostgreSQL

    S->>API: DELETE /api/products/:id (Bearer)
    API->>DB: SELECT product WHERE status=approved
    alt not found
        API-->>S: 404
    else not owner
        API-->>S: 403 You can only delete your own products
    else owner
        API->>DB: UPDATE status='deleted'
        API-->>S: 200 { ok: true, id }
        Note over DB: Hidden from public feed
    end
```

---

## High-level system flow

```mermaid
flowchart LR
    subgraph Client
        M[Mobile App]
        P[Postman]
    end

    subgraph Server
        E[Express routes]
        A[JWT auth]
        U[Uploads multer]
        Q[Orders txn]
    end

    subgraph Storage
        PG[(PostgreSQL)]
        FS[(uploads/)]
    end

    N[ngrok public URL] --> E
    M --> E
    P --> E
    E --> A
    E --> U --> FS
    E --> Q --> PG
    E --> PG
    FS -->|/uploads/*| E
```
