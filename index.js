const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "eventmart_dev_secret_change_me";
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

app.use(cors());
app.use(express.json());

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizeUser(userRow) {
  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: userRow.role,
    created_at: userRow.created_at,
    last_login_at: userRow.last_login_at
  };
}

function createAuthToken(userRow) {
  return jwt.sign(
    {
      sub: userRow.id,
      email: userRow.email,
      role: userRow.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice(7).trim();
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = Number(decoded.sub);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ error: "Invalid token payload." });
    }
    req.auth = {
      userId,
      email: decoded.email,
      role: decoded.role
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

async function ensureSchema() {
  const schemaPath = path.resolve(__dirname, "../../schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schemaSql);
}

app.get("/", (req, res) => {
  res.send("EventMart API running");
});

app.get("/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("PRODUCTS ROUTE ERROR:", err.message);
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("API PRODUCTS ROUTE ERROR:", err.message);
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email is already registered." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const created = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, created_at, last_login_at`,
      [name, email, passwordHash]
    );

    const user = sanitizeUser(created.rows[0]);
    const token = createAuthToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error("REGISTER ROUTE ERROR:", err.message);
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const result = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [email]);
    const userRow = result.rows[0];
    if (!userRow) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const loginUpdate = await pool.query(
      `UPDATE users
       SET last_login_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, role, created_at, last_login_at`,
      [userRow.id]
    );

    const user = sanitizeUser(loginUpdate.rows[0]);
    const token = createAuthToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error("LOGIN ROUTE ERROR:", err.message);
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

app.get("/api/users", async (_req, res) => {
  try {
    const users = await pool.query(
      `SELECT id, name, email, role, created_at, last_login_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(users.rows);
  } catch (err) {
    console.error("USERS ROUTE ERROR:", err.message);
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, created_at, last_login_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.auth.userId]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error("ME ROUTE ERROR:", err.message);
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

app.put("/api/me", requireAuth, async (req, res) => {
  try {
    const incomingName = req.body?.name;
    const incomingEmail = req.body?.email;
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    const currentResult = await pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [req.auth.userId]);
    const currentUser = currentResult.rows[0];
    if (!currentUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const nextName =
      typeof incomingName === "string" ? incomingName.trim() : String(currentUser.name || "").trim();
    const nextEmail =
      typeof incomingEmail === "string" ? normalizeEmail(incomingEmail) : normalizeEmail(currentUser.email);

    if (!nextName || !nextEmail) {
      return res.status(400).json({ error: "Name and email are required." });
    }

    if (nextEmail !== normalizeEmail(currentUser.email)) {
      const existing = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1",
        [nextEmail, req.auth.userId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "Email is already registered." });
      }
    }

    let nextPasswordHash = currentUser.password_hash;
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters." });
      }
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required to set a new password." });
      }

      const passwordOk = await bcrypt.compare(currentPassword, currentUser.password_hash);
      if (!passwordOk) {
        return res.status(401).json({ error: "Current password is incorrect." });
      }

      nextPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    }

    const updated = await pool.query(
      `UPDATE users
       SET name = $1,
           email = $2,
           password_hash = $3
       WHERE id = $4
       RETURNING id, name, email, role, created_at, last_login_at`,
      [nextName, nextEmail, nextPasswordHash, req.auth.userId]
    );

    const user = sanitizeUser(updated.rows[0]);
    const token = createAuthToken(user);
    return res.json({ user, token });
  } catch (err) {
    console.error("UPDATE ME ROUTE ERROR:", err.message);
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

app.get("/api/me/orders", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        o.id,
        o.status,
        o.subtotal,
        o.tax,
        o.discount,
        o.shipping,
        o.total,
        o.created_at,
        o.paid_at,
        COALESCE(SUM(oi.quantity), 0)::INT AS total_items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      `,
      [req.auth.userId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("ME ORDERS ROUTE ERROR:", err.message);
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

async function start() {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("SERVER STARTUP ERROR:", err.message);
    process.exit(1);
  }
}

start();
