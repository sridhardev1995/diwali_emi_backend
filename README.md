# Diwali & EMI Scheme Management — Backend (Step 1: Admin Auth)

Stack: Node.js + Express + MySQL (mysql2), bcrypt password hashing, JWT auth.

## Setup Steps

1. **Install dependencies** (already done if you got this zip with `node_modules` — otherwise run):
   ```
   npm install
   ```

2. **Create `.env`** — copy `.env.example` to `.env` and fill in your real MySQL password
   and a long random `JWT_SECRET`:
   ```
   cp .env.example .env
   ```

3. **Create the database + admins table** — run `schema.sql` in MySQL:
   ```
   mysql -u root -p < schema.sql
   ```

4. **Seed the first Admin** (hashes the password from `.env` and inserts one row):
   ```
   node seedAdmin.js
   ```
   Uses `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` from `.env`. Change these
   in `.env` before running if you don't want the default `admin` / `Admin@12345`.

5. **Start the server**:
   ```
   npm run dev      # with nodemon, auto-restarts
   # or
   npm start
   ```
   Server runs on `http://localhost:5000` by default.

## API Endpoints (v1 — Auth only)

| Method | Endpoint                     | Auth required | Body / Notes |
|--------|-------------------------------|----------------|---------------|
| GET    | `/api/health`                 | No             | Quick check server is up |
| POST   | `/api/auth/login`             | No             | `{ "username": "...", "password": "..." }` → returns JWT token |
| GET    | `/api/auth/profile`           | Yes (Bearer)   | Returns logged-in admin's basic info |
| POST   | `/api/auth/change-password`   | Yes (Bearer)   | `{ "currentPassword": "...", "newPassword": "..." }` |

For protected routes, send header:
```
Authorization: Bearer <token from login>
```

## What's next (per requirement doc)

- Customer Master (CRUD)
- Diwali Scheme Master + enrollment + 52-week auto schedule
- EMI Scheme Master + enrollment + weekly EMI schedule + commission
- Weekly collection entry (Paid/Unpaid/Partial)
- Chit quantity mid-scheme modification + excess adjustment log
- Reports module (customer-wise, scheme-wise, date-wise, commission, overdue) with pagination
