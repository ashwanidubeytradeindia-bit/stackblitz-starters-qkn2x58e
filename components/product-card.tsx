import Link from 'next/link';
import type { Product } from '@/data/catalog';

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} className={`product-visual ${product.visualTone}`} aria-label={`View ${product.name}`}>
        <span className="visual-category">{product.category}</span><span className="product-illustration" aria-hidden="true">{product.visual}</span><span className="visual-spark" aria-hidden="true">✦</span>
      </Link>
      <div className="product-body">
        <div className="product-category">{product.category}</div>
        <Link className="product-title" href={`/products/${product.slug}`}>{product.name}</Link>
        <div className="product-price">{product.price}<span> / {product.unit}</span></div>
        <div className="product-moq">MOQ: {product.moq}</div>
        <div className="product-divider" />
        <Link className="supplier-mini" href={`/suppliers/${product.supplierSlug}`}><span className="supplier-avatar">{product.supplierInitials}</span><span><b>{product.supplierName}</b><small><span className="mini-check">✓</span> {product.location}</small></span></Link>
        <Link className="card-enquire" href={`/products/${product.slug}#enquiry`}>Send enquiry <span>→</span></Link>
      </div>
    </article>
  );
}
