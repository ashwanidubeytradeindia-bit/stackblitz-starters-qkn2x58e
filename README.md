# Biz Trade Mart — Buyer MVP Frontend

An original, responsive buyer-facing marketplace preview built on the repository's existing Next.js 13 App Router, React 18, TypeScript and Tailwind setup. It uses original Biz Trade Mart branding and sample marketplace data; it does not use competitor branding or source code.

## Included in this MVP skeleton

- Branded responsive header with product search and category navigation.
- Homepage hero, category directory and sample product cards.
- Search by product, category, specification or supplier, plus category filtering.
- Product detail route with specifications, supplier link and enquiry CTA.
- Supplier profile route with sample business details and that supplier's listings.
- Mobile, tablet and desktop styling.
- Enquiry form UI placeholder. OTP verification, enquiry storage, real supplier verification, authentication and messaging are not connected.

## Reusable components and data

- `components/site-header.tsx` — marketplace header, search and navigation.
- `components/product-card.tsx` — reusable listing card used on the home, product and supplier pages.
- `data/catalog.ts` — typed category, product and supplier sample records and lookup helpers.
- `app/page.tsx` — searchable/category-filtered buyer homepage.
- `app/products/[slug]/page.tsx` — product detail and enquiry CTA.
- `app/suppliers/[slug]/page.tsx` — supplier profile and supplier listings.

A product record includes a stable `slug`, display name, category, sample price and unit, MOQ, five specification strings, description, visual token, and supplier references. Supplier records contain a stable slug, display name, initials, location, description, experience label and specialties. Replace these preview records with API/database data in a later backend phase.

## Run locally

Requirements: Node.js 18.17 or later and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build check

```bash
npm run build
```

The search form uses URL query parameters (for example `/?q=solar`); category links use `/?category=Packaging#products`. Product pages use `/products/<slug>`; supplier pages use `/suppliers/<slug>`.

All names, prices, supplier details and listings in `data/catalog.ts` are illustrative preview content. Do not treat them as verified offers or real supplier commitments.
