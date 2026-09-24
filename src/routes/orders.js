const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array' });
    }

    for (const item of items) {
      if (!item || !Number.isInteger(item.product_id) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        return res.status(400).json({ error: 'each item needs product_id and quantity > 0' });
      }
    }

    await client.query('BEGIN');

    let total = 0;
    const orderLines = [];

    for (const item of items) {
      const { rows } = await client.query(
        `SELECT id, title, price, stock, seller_id FROM products
         WHERE id = $1 AND status = 'approved'
         FOR UPDATE`,
        [item.product_id]
      );
      const product = rows[0];

      if (!product) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Product ${item.product_id} not found` });
      }
      if (product.stock < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Insufficient stock for "${product.title}" (available: ${product.stock})`,
        });
      }
      if (product.seller_id === req.user.id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `You cannot buy your own product "${product.title}"` });
      }

      await client.query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [
        item.quantity,
        item.product_id,
      ]);

      const lineTotal = Number(product.price) * item.quantity;
      total += lineTotal;
      orderLines.push({
        product_id: product.id,
        title: product.title,
        quantity: item.quantity,
        unit_price: Number(product.price),
        line_total: lineTotal,
      });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, total) VALUES ($1, $2) RETURNING id, buyer_id, total, status, created_at`,
      [req.user.id, total.toFixed(2)]
    );
    const order = orderResult.rows[0];

    for (const line of orderLines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
        [order.id, line.product_id, line.quantity, line.unit_price]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({ order: { ...order, items: orderLines } });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
});

router.get('/', async (req, res, next) => {
  try {
    const ordersResult = await db.query(
      `SELECT id, buyer_id, total, status, created_at
       FROM orders
       WHERE buyer_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const orders = ordersResult.rows;
    if (orders.length === 0) return res.json({ orders: [] });

    const ids = orders.map((o) => o.id);
    const itemsResult = await db.query(
      `SELECT oi.order_id, oi.product_id, oi.quantity, oi.unit_price, p.title
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ANY($1)`,
      [ids]
    );

    const byOrder = {};
    for (const row of itemsResult.rows) {
      (byOrder[row.order_id] = byOrder[row.order_id] || []).push({
        product_id: row.product_id,
        title: row.title,
        quantity: row.quantity,
        unit_price: row.unit_price,
      });
    }

    return res.json({
      orders: orders.map((o) => ({ ...o, items: byOrder[o.id] || [] })),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid order id' });

    const orderResult = await db.query(
      `SELECT id, buyer_id, total, status, created_at FROM orders WHERE id = $1 AND buyer_id = $2`,
      [id, req.user.id]
    );
    if (orderResult.rowCount === 0) return res.status(404).json({ error: 'Order not found' });

    const itemsResult = await db.query(
      `SELECT oi.product_id, oi.quantity, oi.unit_price, p.title
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [id]
    );

    return res.json({
      order: {
        ...orderResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
