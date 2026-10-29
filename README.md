# Biz Trade Mart buyer demo

Phone-friendly buyer experience built with the repository's existing Next.js 13, React 18, and Tailwind setup. The interface uses original Biz Trade Mart branding and sample catalogue data.

## Routes

- `/` — responsive homepage, product search, category filters, sample product cards
- `/products/industrial-air-compressor` — product detail with mobile + OTP enquiry demo
- `/suppliers/shree-engineering` — supplier profile and catalogue

Other sample product and supplier routes are generated from `lib/products.ts`.

## Open on a phone with StackBlitz

1. Open this branch in StackBlitz:  
   https://stackblitz.com/github/ashwanidubeytradeindia-bit/stackblitz-starters-qkn2x58e/tree/feat/biz-trade-mart-buyer-demo
2. Wait for dependencies to install and the preview to start. If it does not start automatically, open the StackBlitz terminal and run `npm run dev`.
3. Use the preview's **Open in new tab** button, then open that URL on your phone. You can also share the StackBlitz project URL above.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Next.js (usually http://localhost:3000). To open it on a phone connected to the same Wi-Fi, run:

```bash
npm run dev -- --hostname 0.0.0.0
```

Then visit `http://<your-computer-local-IP>:3000` on the phone. Keep both devices on the same Wi-Fi.

## Preview the enquiry flow

Open any product and tap **Send enquiry**. Enter a 10-digit mobile number, tap **Send OTP**, then use demo OTP `123456`. No SMS is sent and the final confirmation is not saved or sent to a real supplier.

## Shareable deployed preview (optional)

For a stable public preview URL, import this GitHub repository into Vercel, select branch `feat/biz-trade-mart-buyer-demo`, and deploy. Vercel will detect Next.js automatically. The generated deployment URL can be opened and shared from a phone. This repo branch itself remains the reviewable source for the demo.

## Sample-data notice

Product names, prices, locations, specs, supplier profiles, and verification badges are illustrative interface data. They do not represent live listings or verified businesses. Search and category filters run in the browser; enquiry OTP is a demo-only flow and is not connected to a backend, database, SMS provider, or supplier account.
