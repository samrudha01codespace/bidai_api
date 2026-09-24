CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  mobile        VARCHAR(10) NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  seller_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  brand        VARCHAR(100) NOT NULL DEFAULT '',
  product_type VARCHAR(100) NOT NULL DEFAULT '',
  location     VARCHAR(255) NOT NULL DEFAULT '',
  sell_as      VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (sell_as IN ('vendor', 'individual')),
  price        NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock        INTEGER NOT NULL DEFAULT 1 CHECK (stock >= 0),
  status       VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'deleted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        VARCHAR(500) NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

CREATE TABLE IF NOT EXISTS orders (
  id         SERIAL PRIMARY KEY,
  buyer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total      NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  status     VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

INSERT INTO categories (name, slug) VALUES
  ('Cars', 'cars'),
  ('Real Estate', 'real-estate'),
  ('Mobiles', 'mobiles'),
  ('Jobs', 'jobs'),
  ('Bikes', 'bikes'),
  ('Electronics', 'electronics'),
  ('Home & Garden', 'home-garden'),
  ('Beauty', 'beauty'),
  ('Clothing', 'clothing'),
  ('Books', 'books'),
  ('Arts and Crafts', 'arts-and-crafts'),
  ('Services', 'services'),
  ('General Service', 'general-service'),
  ('Yodha', 'yodha'),
  ('Agriculture', 'agriculture')
ON CONFLICT (slug) DO NOTHING;
