# VN crochet

**VN crochet** is a handmade crochet storefront and mobile-friendly **Studio Desk** admin panel. Customers can browse products, filter by collection, inspect sizes/materials/care notes, toggle product photos and videos, choose ribbon colours, manage their cart, and place orders via Supabase + WhatsApp. The shop owner can add/edit products, adjust prices, customize the storefront appearance, manage orders, and upload photos/videos directly from any phone or computer.

- **Live Storefront:** https://vn-crochets.pages.dev/
- **Live Admin Studio Desk:** https://www.google.com/search?q=https://vn-crochets.pages.dev/admin/
- **GitHub Repository:** https://www.google.com/search?q=https://github.com/himanshu-dev-UK11/VN-crochets

---

## 1. Architecture & Hosting (₹0/month Cloud Stack)

This project was migrated from **Microsoft Azure** (Azure Static Web Apps + Azure Functions + Azure Blob Storage) to a zero-cost, zero-maintenance stack that requires no build step and no backend server management:

| Layer | Service | Role |
| :--- | :--- | :--- |
| **Static Hosting & CDN** | **Cloudflare Pages** | Serves `index.html`, `admin/`, `pages/`, `css/`, `js/`, and `images/` over HTTPS with automatic deploys from GitHub `main`. |
| **Database & Admin Auth** | **Supabase** (Free Tier) | Stores the live product catalogue + shop settings (`public.store_state`), customer orders (`public.orders`), and handles admin email/password authentication with JWT refresh. |
| **Photo & Video Uploads** | **Cloudinary** (Free Tier) | Accepts direct unsigned browser uploads from `/admin/` (photos up to 10 MB, MP4/WebM videos up to 95 MB) into the `vn-crochet` folder and returns `https://res.cloudinary.com/...` URLs. |
| **Order Hand-off** | **WhatsApp (`wa.me`)** | After saving an order to Supabase `orders`, checkout generates a pre-filled WhatsApp message to the shop's configured number. |
| **Local Dev Server (Optional)** | **Node.js (`server.js`)** | Local fallback server at `http://localhost:3000` (launched via `Open Website.bat` or `Open Admin.bat`). |

---

## 2. How the Website Works

### Operating Modes (`js/cloud-config.js`)
The website switches automatically between **Cloud Mode** and **Local Mode** depending on `js/cloud-config.js`:

1. **Cloud Mode (Active in production):**
   - Triggered when `CLOUD_CONFIG.supabaseUrl` and `CLOUD_CONFIG.supabaseAnonKey` are filled in `js/cloud-config.js`.
   - **Storefront (`js/data.js`):** Fetches live products and settings from Supabase `store_state` (`id = 'main'`). If Supabase is unreachable or empty, it gracefully falls back to `data/catalog.json` (and optional `data/settings.json`).
   - **Checkout (`pages/checkout.js`):** Validates the customer's name, email, phone, and city, saves the order into Supabase `orders` with a generated `VN-XXXXXX` reference ID, clears the cart in `localStorage`, and shows a **Confirm on WhatsApp** button.
   - **Admin Studio Desk (`admin/admin.js`):** Authenticates via Supabase Auth (`/auth/v1/token`), refreshes expired tokens automatically, reads/writes `store_state`, lists/updates `orders`, and uploads photos/videos directly to Cloudinary (`cloudinaryUpload()` in `js/cloud.js`) using the unsigned preset.

2. **Local Mode (When `js/cloud-config.js` is blank):**
   - Run `Open Website.bat` or `npm start` to start `server.js` on `http://localhost:3000`.
   - Talks to `/api/catalog`, `/api/login`, `/api/upload`, and `/api/orders`, saving data to `data/` and uploaded media to `images/`.

### First-Time Sync Behaviour
If `public.store_state` in Supabase has no row yet, `admin/admin.js` automatically loads the 16 starter items from `data/catalog.json` and displays a **Publish to shop now** prompt on the Overview screen. Clicking it writes the initial catalogue and settings into Supabase (`id = 'main'`).

---

## 3. Project Structure

```text
.
├── index.html                  # Main storefront page (hero, ticker, filters, grid, modal, cart drawer)
├── 404.html                    # Fallback page with yarn-texture styling
├── Open Website.bat            # Windows one-click launcher -> http://localhost:3000
├── Open Admin.bat              # Windows one-click launcher -> http://localhost:3000/admin/
├── server.js                   # Local Node.js dev server (used when running locally)
├── supabase-setup.sql          # SQL script to create Supabase tables & RLS policies
├── package.json                # Local dev dependencies (Express, etc.)
│
├── admin/
│   ├── index.html              # Studio Desk HTML shell (loads admin.js?v=10)
│   ├── admin.js                # Auth, Overview, Product editor, Shop appearance, Orders
│   └── admin.css               # Studio Desk styling
│
├── css/
│   └── styles.css              # Storefront design system, responsive mobile-first layout, zoom/fallback CSS
│
├── js/
│   ├── cloud-config.js         # Supabase URL, Supabase Publishable/Anon Key, Cloudinary Name & Preset
│   ├── cloud.js                # Zero-dependency Supabase REST/Auth + Cloudinary upload adapter
│   ├── data.js                 # Storefront data loader (Supabase -> /api/catalog -> data/catalog.json)
│   ├── store.js                # Cart state & calculations (localStorage)
│   └── app.js                  # Storefront UI rendering, search, filters, product modal, photo/video toggle
│
├── pages/
│   ├── checkout.html           # Checkout page
│   └── checkout.js             # Cart summary, validation, Supabase order insert, WhatsApp link
│
├── data/
│   └── catalog.json            # Starter 16-product catalogue fallback
│
├── images/                     # Local product images (kept locally / in repo; excluded from small code-only zips)
├── api/                        # Legacy Azure Functions backend (kept for reference only; unused in Cloud Mode)
└── staticwebapp.config.json    # Legacy Azure Static Web Apps config (unused on Cloudflare Pages)
```

*(Note: `node_modules/`, `.venv/`, `.git/`, `.github/`, and `uploads/` are local/environment folders and are excluded from `.gitignore` or code-patch zips.)*

---

## 4. Supabase Database & Security Setup

The Supabase project uses two tables in the `public` schema:

1. **`public.store_state`**
   - `id` (`text`, primary key — always `'main'`)
   - `products` (`jsonb`) — array of product objects (`id`, `n`, `e`, `c`, `p`, `lv`, `bg`, `s`, `m`, `d`, `care`, `stock`, `featured`, `active`, `image`, `video`, `imageX`, `imageY`, `imageZoom`, `ribbons`)
   - `settings` (`jsonb`) — brand name, currency, hero copy/image, ticker, announcement, shipping thresholds, WhatsApp/Instagram, accent colour, ribbon colours/names, categories
   - `updated_at` (`timestamptz`)

2. **`public.orders`**
   - `id` (`text`, primary key — e.g. `VN-A1B2C3`)
   - `name`, `phone`, `email`, `city`, `notes`, `items` (`jsonb`), `subtotal`, `shipping`, `total`, `status` (`new`, `confirmed`, `shipped`, `delivered`, `cancelled`), `created_at`, `updated_at`

### Required Permissions (`GRANT` + RLS)
In addition to the Row Level Security (RLS) policies in `supabase-setup.sql`, Supabase requires explicit table grants for `anon` and `authenticated`:

```sql
grant usage on schema public to anon, authenticated;

grant select on table public.store_state to anon, authenticated;
grant insert, update on table public.store_state to authenticated;

grant insert on table public.orders to anon, authenticated;
grant select, update on table public.orders to authenticated;
```

- **Public (`anon`):** Can read `store_state` and insert into `orders`. Cannot modify products/settings or read other customers' orders.
- **Admin (`authenticated`):** Created manually in **Supabase → Authentication → Users** with **Allow new users to sign up** turned **OFF** so strangers cannot register admin accounts.

---

## 5. Cloudinary Setup

1. Create a free Cloudinary account and note the **Cloud Name**.
2. Go to **Settings → Upload → Upload presets → Add upload preset**:
   - **Upload preset name:** `vn_crochet_unsigned`
   - **Signing Mode:** `Unsigned`
3. `js/cloud.js` posts `FormData` (`file`, `upload_preset`, `folder: 'vn-crochet'`) directly to `https://api.cloudinary.com/v1_1/<cloudName>/auto/upload`.

---

## 6. Deployment on Cloudflare Pages

The site is connected to Cloudflare Pages via **Pages → Connect to Git** (`VN-crochets`, branch `main`):

- **Framework preset:** `None`
- **Build command:** *(blank)*
- **Build output directory:** `/` *(blank)*

Any `git push` to `main` automatically redeploys the live site at `https://vn-crochets.pages.dev/` within ~30–60 seconds. Product, price, appearance, and photo/video edits made in `/admin/` go live immediately without touching Git.

---

## 7. Important Notes for Developers & AI Assistants

If you are an AI assistant or developer continuing work on this repository, keep these verified invariants in mind:

1. **Zero-build static ES modules:** All browser JS uses native ES modules (`<script type="module">`). Do not introduce a bundler (`vite`, `webpack`, etc.) unless the deployment pipeline is intentionally changed.
2. **Supabase `sb_publishable_...` key handling (`js/cloud.js`):** Newer Supabase projects issue `sb_publishable_...` keys instead of JWT `eyJ...` anon keys. In `sbFetch()`, `Authorization: Bearer <key>` must **only** be sent when `isJwt(key)` is true (3 dot-separated segments) or when `auth: true` (using the user's JWT access token). Sending `sb_publishable_...` as a Bearer token causes PostgREST `401` errors.
3. **Cache busting in `admin/index.html`:** When modifying `admin/admin.js` or `admin/admin.css`, bump the `?v=...` query parameter in `admin/index.html` so mobile/desktop browsers load the updated file immediately.
4. **Supabase Free Tier inactivity:** Supabase pauses free projects after 7 consecutive days with zero API requests. If the storefront falls back to `data/catalog.json` or admin shows a connection error after long inactivity, unpause/restore the project from the Supabase dashboard.
5. **Legacy `api/` folder:** The `api/` directory and `staticwebapp.config.json` are leftovers from the earlier Azure Static Web Apps setup. They are not used on Cloudflare Pages.
6. **Do not commit secrets:** `js/cloud-config.js` contains only **public client keys** (Supabase URL, Supabase Publishable/Anon Key, Cloudinary Cloud Name, and Unsigned Preset). Never put the Supabase `service_role` secret key or Cloudinary API Secret in any frontend file.
