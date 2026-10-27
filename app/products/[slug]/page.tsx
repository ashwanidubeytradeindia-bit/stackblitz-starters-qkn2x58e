import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ProductCard } from '@/components/product-card';
import { getProduct, getSupplier, getSupplierProducts } from '@/data/catalog';

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProduct(params.slug);
  if (!product) notFound();
  const supplier = getSupplier(product.supplierSlug);
  const relatedProducts = getSupplierProducts(product.supplierSlug).filter((item) => item.slug !== product.slug).slice(0, 2);

  return <><SiteHeader /><main className="page-width detail-page">
    <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href={`/?category=${encodeURIComponent(product.category)}#products`}>{product.category}</Link><span>/</span><span>{product.name}</span></div>
    <div className="detail-layout">
      <section className={`detail-visual product-visual ${product.visualTone}`}><span className="visual-category">{product.category}</span><span className="product-illustration" aria-hidden="true">{product.visual}</span><span className="visual-spark" aria-hidden="true">✦</span></section>
      <section className="detail-info">
        <span className="section-kicker">Product details</span><h1>{product.name}</h1>
        <div className="detail-price">{product.price}<span> / {product.unit}</span></div><p className="detail-moq">Minimum order: <b>{product.moq}</b></p>
        <p className="detail-description">{product.description}</p>
        <h2 className="detail-subheading">Product specifications</h2><ul className="spec-list">{product.specifications.map((spec) => <li key={spec}><span>✓</span>{spec}</li>)}</ul>
        <div className="detail-cta-row"><a className="button button-primary" href="#enquiry">Send enquiry <span>→</span></a>{supplier && <Link className="button button-secondary" href={`/suppliers/${supplier.slug}`}>View supplier</Link>}</div>
        <p className="sample-disclaimer">Sample listing. Price and specifications are illustrative and should be confirmed with the supplier.</p>
      </section>
    </div>
    <div className="detail-lower">
      <section className="enquiry-panel" id="enquiry"><div className="enquiry-heading"><div><span className="section-kicker">Connect with the supplier</span><h2>Request a quote</h2></div><span className="enquiry-step">01 <i /> 02</span></div><p>Leave your mobile number to start an enquiry. This MVP preview does not send OTPs or transmit enquiry data.</p><form className="enquiry-form" action="#enquiry"><label htmlFor="mobile">Mobile number</label><div className="mobile-input"><span>+91</span><input id="mobile" name="mobile" placeholder="Enter 10-digit mobile number" inputMode="tel" maxLength={10} /></div><button className="button button-primary" type="button">Continue with OTP <span>→</span></button></form><small className="privacy-note">OTP verification and enquiry delivery will be connected in the backend phase.</small></section>
      {supplier && <aside className="supplier-card"><span className="section-kicker">Supplier</span><Link href={`/suppliers/${supplier.slug}`} className="supplier-profile-link"><span className="supplier-avatar large-avatar">{supplier.initials}</span><span><b>{supplier.name}</b><small><span className="mini-check">✓</span> Sample profile</small></span><span className="profile-arrow">↗</span></Link><div className="supplier-location">⌖ {supplier.location}</div><p>{supplier.description}</p><Link className="text-link" href={`/suppliers/${supplier.slug}`}>View business profile <span>→</span></Link></aside>}
    </div>
    {!!relatedProducts.length && <section className="related-section"><div className="section-heading"><div><span className="section-kicker">More to explore</span><h2>From this supplier</h2></div></div><div className="product-grid">{relatedProducts.map((item) => <ProductCard key={item.slug} product={item} />)}</div></section>}
  </main></>;
}
