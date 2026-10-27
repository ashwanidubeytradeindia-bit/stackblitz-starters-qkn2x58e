import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/product-card';
import { SiteHeader } from '@/components/site-header';
import { getSupplier, getSupplierProducts } from '@/data/catalog';

export default function SupplierPage({ params }: { params: { slug: string } }) {
  const supplier = getSupplier(params.slug);
  if (!supplier) notFound();
  const supplierProducts = getSupplierProducts(supplier.slug);

  return <><SiteHeader /><main className="page-width supplier-page">
    <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><span>Supplier profile</span></div>
    <section className="supplier-hero"><div className="supplier-hero-main"><span className="supplier-avatar supplier-hero-avatar">{supplier.initials}</span><div><span className="section-kicker">Business profile · Sample data</span><h1>{supplier.name}</h1><p className="supplier-location">⌖ {supplier.location}</p><div className="profile-status"><span className="mini-check">✓</span> Profile preview <span className="status-separator">·</span> {supplier.years} in business</div></div></div><a href="#supplier-products" className="button button-primary">View products <span>↓</span></a></section>
    <div className="supplier-content"><section className="supplier-about"><span className="section-kicker">About this business</span><h2>Built around your business needs.</h2><p>{supplier.description}</p><h3>Product specialties</h3><div className="specialty-list">{supplier.specialties.map((item) => <span key={item}>{item}</span>)}</div><div className="contact-placeholder"><span className="contact-icon">↗</span><div><b>Interested in working together?</b><p>Open a product listing to send a sourcing enquiry.</p></div><Link href={supplierProducts[0] ? `/products/${supplierProducts[0].slug}#enquiry` : '/'}>Contact supplier →</Link></div></section><aside className="supplier-facts"><div><span>Location</span><b>{supplier.location}</b></div><div><span>Business experience</span><b>{supplier.years}</b></div><div><span>Listings in this preview</span><b>{supplierProducts.length} products</b></div><div className="facts-note">Supplier verification is a planned platform workflow. This sample profile is not a verified business.</div></aside></div>
    <section className="supplier-products" id="supplier-products"><div className="section-heading"><div><span className="section-kicker">Browse this supplier</span><h2>Products from {supplier.name}</h2></div></div>{supplierProducts.length ? <div className="product-grid">{supplierProducts.map((product) => <ProductCard key={product.slug} product={product} />)}</div> : <p>No sample products yet.</p>}</section>
  </main></>;
}
