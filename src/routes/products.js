const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PRODUCT_SELECT = `
  p.id, p.title, p.description, p.brand, p.product_type, p.location, p.sell_as,
  p.price, p.stock, p.status, p.seller_id, p.category_id,
  c.name AS category_name, c.slug AS category_slug,
  u.name AS seller_name, p.created_at
`;

async function attachImages(products) {
  if (products.length === 0) return products;
  const ids = products.map((p) => p.id);
  const { rows } = await db.query(
    'SELECT product_id, url, position FROM product_images WHERE product_id = ANY($1) ORDER BY position, id',
    [ids]
  );
  const byProduct = {};
  for (const row of rows) {
    (byProduct[row.product_id] = byProduct[row.product_id] || []).push(row.url);
  }
  for (const p of products) {
    p.images = byProduct[p.id] || [];
  }
  return products;
}

router.get('/', async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const category = (req.query.category || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const offset = (page - 1) * limit;

    const values = [];
    let where = `p.status = 'approved'`;
    if (search) {
      values.push(`%${search}%`);
      where += ` AND (p.title ILIKE $${values.length} OR p.description ILIKE $${values.length} OR p.brand ILIKE $${values.length})`;
    }
    if (category) {
      values.push(category);
      where += ` AND c.slug = $${values.length}`;
    }

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where}`,
      values
    );
    const total = countResult.rows[0].total;

    values.push(limit, offset);
    const result = await db.query(
      `SELECT ${PRODUCT_SELECT}
       FROM products p
       JOIN users u ON u.id = p.seller_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    const products = await attachImages(result.rows);
    return res.json({
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid product id' });

    const result = await db.query(
      `SELECT ${PRODUCT_SELECT}
       FROM products p
       JOIN users u ON u.id = p.seller_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.status = 'approved'`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });

    const [product] = await attachImages(result.rows);
    return res.json({ product });
  } catch (err) {
    return next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  const client = await db.getClient();
  try {
    const {
      title,
      description = '',
      brand = '',
      product_type = '',
      location = '',
      sell_as = 'individual',
      price,
      stock = 1,
      category_id,
      image_urls,
    } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: 'price must be a non-negative number' });
    }
    const stockNum = Number(stock);
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      return res.status(400).json({ error: 'stock must be a non-negative integer' });
    }
    if (sell_as !== 'vendor' && sell_as !== 'individual') {
      return res.status(400).json({ error: "sell_as must be 'vendor' or 'individual'" });
    }
    if (category_id !== undefined && category_id !== null) {
      const catId = Number(category_id);
      if (!Number.isInteger(catId)) return res.status(400).json({ error: 'category_id must be an integer' });
      const cat = await client.query('SELECT id FROM categories WHERE id = $1', [catId]);
      if (cat.rowCount === 0) return res.status(400).json({ error: 'Invalid category_id' });
    }
    if (!Array.isArray(image_urls) || image_urls.length < 2 || image_urls.length > 5) {
      return res.status(400).json({ error: 'image_urls must be an array with 2 to 5 urls (from /api/uploads)' });
    }
    for (const u of image_urls) {
      if (typeof u !== 'string' || !u.startsWith('/uploads/')) {
        return res.status(400).json({ error: 'image_urls must be paths returned by /api/uploads' });
      }
    }

    await client.query('BEGIN');

    const insert = await client.query(
      `INSERT INTO products (seller_id, category_id, title, description, brand, product_type, location, sell_as, price, stock, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'approved')
       RETURNING id, seller_id, category_id, title, description, brand, product_type, location, sell_as, price, stock, status, created_at`,
      [
        req.user.id,
        category_id || null,
        title.trim(),
        description,
        brand,
        product_type,
        location,
        sell_as,
        priceNum,
        stockNum,
      ]
    );
    const product = insert.rows[0];

    for (let i = 0; i < image_urls.length; i++) {
      await client.query(
        'INSERT INTO product_images (product_id, url, position) VALUES ($1, $2, $3)',
        [product.id, image_urls[i], i]
      );
    }

    await client.query('COMMIT');

    const imagesResult = await db.query(
      'SELECT url FROM product_images WHERE product_id = $1 ORDER BY position, id',
      [product.id]
    );

    return res.status(201).json({
      product: { ...product, images: imagesResult.rows.map((r) => r.url) },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
});

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid product id' });

    const existing = await db.query(
      `SELECT id, seller_id, title, description, brand, product_type, location, sell_as, price, stock, status
       FROM products WHERE id = $1 AND status = 'approved'`,
      [id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    if (existing.rows[0].seller_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own products' });
    }

    const body = req.body || {};
    const current = existing.rows[0];

    const nextTitle = body.title === undefined ? current.title : String(body.title).trim();
    if (!nextTitle) return res.status(400).json({ error: 'title cannot be empty' });

    let nextPrice = Number(current.price);
    if (body.price !== undefined) {
      nextPrice = Number(body.price);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        return res.status(400).json({ error: 'price must be a non-negative number' });
      }
    }

    let nextStock = current.stock;
    if (body.stock !== undefined) {
      nextStock = Number(body.stock);
      if (!Number.isInteger(nextStock) || nextStock < 0) {
        return res.status(400).json({ error: 'stock must be a non-negative integer' });
      }
    }

    let nextSellAs = current.sell_as;
    if (body.sell_as !== undefined) {
      if (body.sell_as !== 'vendor' && body.sell_as !== 'individual') {
        return res.status(400).json({ error: "sell_as must be 'vendor' or 'individual'" });
      }
      nextSellAs = body.sell_as;
    }

    const result = await db.query(
      `UPDATE products SET
         title = $1, description = $2, brand = $3, product_type = $4, location = $5,
         sell_as = $6, price = $7, stock = $8
       WHERE id = $9
       RETURNING id, seller_id, category_id, title, description, brand, product_type, location, sell_as, price, stock, status, created_at`,
      [
        nextTitle,
        body.description === undefined ? current.description : String(body.description),
        body.brand === undefined ? current.brand : String(body.brand),
        body.product_type === undefined ? current.product_type : String(body.product_type),
        body.location === undefined ? current.location : String(body.location),
        nextSellAs,
        nextPrice,
        nextStock,
        id,
      ]
    );

    const imagesResult = await db.query(
      'SELECT url FROM product_images WHERE product_id = $1 ORDER BY position, id',
      [id]
    );

    return res.json({
      product: { ...result.rows[0], images: imagesResult.rows.map((r) => r.url) },
    });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid product id' });

    const existing = await db.query(
      `SELECT id, seller_id FROM products WHERE id = $1 AND status = 'approved'`,
      [id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    if (existing.rows[0].seller_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own products' });
    }

    await db.query(`UPDATE products SET status = 'deleted' WHERE id = $1`, [id]);
    return res.json({ ok: true, id });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
