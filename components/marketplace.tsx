"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { Product, Supplier } from "@/lib/products";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Biz Trade Mart home">
      <span className="brand-mark"><span /></span>
      <span className="brand-name">biz<span>trade</span>mart</span>
    </Link>
  );
}

export function Header({ onSearch, initialQuery = "" }: { onSearch?: (query: string) => void; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch?.(query.trim());
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <form className="header-search" onSubmit={submit}>
          <span className="search-symbol">⌕</span>
          <input aria-label="Search products" placeholder="What are you looking for?" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="search-button" type="submit">Search</button>
        </form>
        <div className="header-actions">
          <button className="language-button" type="button" aria-label="Language">EN⌄</button>
          <a className="login-link" href="#how-it-works">How it works</a>
          <a className="sell-button" href="#supplier-cta">Sell on BizTrade</a>
        </div>
      </div>
    </header>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} className="product-image-wrap">
        <img src={product.image} alt={product.name} className="product-image" loading="lazy" />
        {product.tag && <span className="product-tag">{product.tag}</span>}
        <span className="image-arrow">↗</span>
      </Link>
      <div className="product-card-body">
        <span className="eyebrow">{product.category}</span>
        <Link href={`/products/${product.slug}`} className="product-title">{product.name}</Link>
        <p className="product-price">{product.price} <span>/ {product.unit}</span></p>
        <div className="product-meta"><span>Min. order: {product.moq}</span><span>•</span><span>{product.location}</span></div>
        <div className="product-card-bottom">
          <Link href={`/suppliers/${product.supplier.slug}`} className="supplier-mini">
            <span className="supplier-avatar" style={{ background: product.supplier.color }}>{product.supplier.initials}</span>
            <span><strong>{product.supplier.name}</strong><small>{product.supplier.verified ? "✓ Verified supplier" : "Supplier"}</small></span>
          </Link>
          <Link className="card-enquire" href={`/products/${product.slug}#enquire`} aria-label={`Enquire about ${product.name}`}>↗</Link>
        </div>
      </div>
    </article>
  );
}

export function OtpEnquiry({ product, supplier }: { product?: Product; supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [done, setDone] = useState(false);

  const sendOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phone.replace(/\D/g, "").length < 10) return;
    setSent(true);
  };
  const verifyOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otp === "123456") setDone(true);
  };

  return (
    <>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>
        Send enquiry <span>↗</span>
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="enquiry-modal" role="dialog" aria-modal="true" aria-labelledby="enquiry-title">
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
            {!done ? (
              <>
                <div className="modal-icon">✉</div>
                <p className="eyebrow">FREE BUYER ENQUIRY</p>
                <h2 id="enquiry-title">{sent ? "Verify your mobile" : "Connect with the supplier"}</h2>
                <p className="modal-copy">{sent ? "Enter the demo OTP to see the enquiry confirmation." : `Share your mobile number and ${supplier.name} can respond to your request.`}</p>
                {!sent ? (
                  <form onSubmit={sendOtp} className="modal-form">
                    <label htmlFor="buyer-phone">Mobile number</label>
                    <div className="phone-input"><span>🇮🇳 +91</span><input id="buyer-phone" type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} required minLength={10} /></div>
                    <button className="primary-button full-button" type="submit">Send OTP <span>→</span></button>
                  </form>
                ) : (
                  <form onSubmit={verifyOtp} className="modal-form">
                    <label htmlFor="buyer-otp">One-time password</label>
                    <input id="buyer-otp" className="otp-input" inputMode="numeric" maxLength={6} placeholder="6-digit demo OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required />
                    <p className="demo-note">Demo only: use <strong>123456</strong>. No SMS is sent.</p>
                    <button className="primary-button full-button" type="submit">Verify &amp; continue <span>→</span></button>
                  </form>
                )}
                <div className="privacy-note">🔒 Your details are shared only for this enquiry.</div>
                {product && <div className="modal-product">Enquiry for <strong>{product.name}</strong></div>}
              </>
            ) : (
              <div className="success-state">
                <div className="success-check">✓</div>
                <p className="eyebrow">ENQUIRY READY</p>
                <h2>Thanks! Your request is confirmed.</h2>
                <p className="modal-copy">This is a front-end demo. No enquiry was sent to a live supplier.</p>
                <button className="primary-button full-button" onClick={() => setOpen(false)}>Done</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export function SupplierBadge({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "verified-badge compact" : "verified-badge"}><span>✓</span> Verified supplier</span>;
}

export function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="Main navigation">
      <Link href="/"><span>⌂</span>Home</Link>
      <a href="/#categories"><span>▦</span>Categories</a>
      <a href="/#products"><span>⌕</span>Search</a>
      <a href="/#supplier-cta"><span>＋</span>Sell</a>
    </nav>
  );
}

export function ProductDetail({ product }: { product: Product }) {
  return (
    <main className="detail-page">
      <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></div>
      <div className="detail-grid">
        <div className="detail-photo"><img src={product.image} alt={product.name} /></div>
        <section className="detail-info">
          <span className="eyebrow">{product.category}</span>
          <h1>{product.name}</h1>
          <p className="detail-price">{product.price} <span>/ {product.unit}</span></p>
          <p className="detail-subline">Minimum order: <strong>{product.moq}</strong> <span>·</span> {product.location}</p>
          <div className="detail-divider" />
          <h3>Product specifications</h3>
          <ul className="spec-list">{product.specs.map((spec) => <li key={spec}><span>✓</span>{spec}</li>)}</ul>
          <p className="detail-description">{product.description}</p>
          <div id="enquire" className="detail-cta"><OtpEnquiry product={product} supplier={product.supplier} /><span className="secure-copy">Mobile number + OTP</span></div>
        </section>
      </div>
      <section className="supplier-panel">
        <div className="supplier-panel-heading"><span className="supplier-avatar large" style={{ background: product.supplier.color }}>{product.supplier.initials}</span><div><span className="eyebrow">SUPPLIER</span><Link href={`/suppliers/${product.supplier.slug}`} className="supplier-name-link">{product.supplier.name} ↗</Link><SupplierBadge /></div></div>
        <div className="supplier-panel-facts"><span>📍 {product.supplier.city}, {product.supplier.state}</span><span>◷ {product.supplier.years} years in business</span><Link href={`/suppliers/${product.supplier.slug}`}>View company profile →</Link></div>
      </section>
      <p className="demo-disclaimer">Demo listing · Price and specifications are sample data for interface preview.</p>
    </main>
  );
}

export function SupplierProfile({ supplier, products }: { supplier: Supplier; products: Product[] }) {
  return (
    <main className="supplier-page">
      <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><span>Suppliers</span><span>/</span><span>{supplier.name}</span></div>
      <section className="supplier-hero">
        <div className="supplier-avatar profile-avatar" style={{ background: supplier.color }}>{supplier.initials}</div>
        <div className="supplier-hero-copy"><span className="eyebrow">SUPPLIER COMPANY PROFILE</span><h1>{supplier.name}</h1><SupplierBadge /><p>{supplier.about}</p></div>
      </section>
      <div className="supplier-stats"><div><span>📍</span><small>Location</small><strong>{supplier.city}, {supplier.state}</strong></div><div><span>◷</span><small>Business experience</small><strong>{supplier.years} years</strong></div><div><span>▦</span><small>Listed products</small><strong>{supplier.products}+</strong></div></div>
      <section className="supplier-products"><div className="section-heading"><div><span className="eyebrow">CATALOGUE</span><h2>Products from this supplier</h2></div><span className="catalog-count">{products.length} items</span></div><div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.slug} />)}</div></section>
      <p className="demo-disclaimer">Supplier profile and verification badge are sample data for interface preview.</p>
    </main>
  );
}

export function Footer() {
  return <footer className="site-footer"><div className="footer-inner"><Brand /><p>Find products. Connect with suppliers. Grow business.</p><span>© 2026 Biz Trade Mart · Buyer demo</span></div></footer>;
}
