import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import { SiteHeader } from '@/components/site-header';
import { categories, products } from '@/data/catalog';

type HomeProps = { searchParams?: { q?: string; category?: string } };

export default function Home({ searchParams = {} }: HomeProps) {
  const query = (searchParams.q ?? '').trim().toLowerCase();
  const selectedCategory = searchParams.category ?? '';
  const visibleProducts = products.filter((product) => {
    const matchesQuery = !query || [product.name, product.category, product.supplierName, ...product.specifications].join(' ').toLowerCase().includes(query);
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    return matchesQuery && matchesCategory;
  });

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-inner page-width">
            <div className="hero-copy">
              <span className="eyebrow"><span className="eyebrow-dot" /> India’s B2B sourcing marketplace</span>
              <h1>Find the right supplier.<br /><span>Build what’s next.</span></h1>
              <p>Discover products from businesses across India. Compare details, connect directly, and get your sourcing moving.</p>
              <form action="/" className="hero-search" role="search">
                <span aria-hidden="true" className="search-icon">⌕</span>
                <input aria-label="Search products" name="q" placeholder="What are you looking for today?" defaultValue={searchParams.q ?? ''} />
                <button type="submit">Search products <span aria-hidden="true">→</span></button>
              </form>
              <div className="popular-searches"><span>Popular:</span><Link href="/?q=solar">Solar panels</Link><Link href="/?q=packaging">Packaging</Link><Link href="/?q=steel">Steel</Link></div>
            </div>
            <div className="hero-art" aria-label="Illustration of sourcing and supply">
              <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
              <div className="art-sun" />
              <div className="art-card art-card-top"><span className="art-icon">↗</span><span><b>Made for business</b><small>Source with confidence</small></span></div>
              <div className="art-box"><div className="box-tape" /><div className="box-mark">BTM</div><div className="box-spark">✦</div></div>
              <div className="art-card art-card-bottom"><span className="verified-mark">✓</span><span><b>Trusted connections</b><small>Businesses, closer together</small></span></div>
              <span className="art-leaf leaf-one">✦</span><span className="art-leaf leaf-two">✦</span>
            </div>
            <div className="hero-stats"><div><strong>Made in India</strong><span>Built for business, everywhere</span></div><i /><div><strong>One simple place</strong><span>Products, people and possibilities</span></div></div>
          </div>
        </section>

        <section className="category-section page-width">
          <div className="section-heading"><div><span className="section-kicker">Explore the marketplace</span><h2>Source by category</h2></div><Link className="text-link" href="#products">View all products <span>→</span></Link></div>
          <nav className="category-grid" aria-label="Product categories">
            {categories.map((category) => (
              <Link href={`/?category=${encodeURIComponent(category.name)}#products`} className="category-tile" key={category.name}>
                <span className={`category-icon ${category.tone}`} aria-hidden="true">{category.icon}</span><span className="category-name">{category.name}</span><span className="category-arrow">↗</span>
              </Link>
            ))}
          </nav>
        </section>

        <section className="products-section" id="products">
          <div className="page-width">
            <div className="section-heading">
              <div><span className="section-kicker">Handpicked for business</span><h2>{query || selectedCategory ? 'Matching products' : 'Popular right now'}</h2><p className="section-subtitle">{query ? `Showing results for “${searchParams.q}”` : selectedCategory ? `Products in ${selectedCategory}` : 'Explore products businesses are sourcing this week.'}</p></div>
              <Link className="text-link" href="/">Browse all <span>→</span></Link>
            </div>
            {visibleProducts.length ? <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.slug} product={product} />)}</div> : <div className="empty-state"><span>⌕</span><h3>No matching products yet</h3><p>Try a broader search or browse all categories.</p><Link href="/" className="button button-secondary">Clear search</Link></div>}
            <div className="demo-note">Sample listings for the Biz Trade Mart MVP preview.</div>
          </div>
        </section>

        <section className="supplier-banner page-width">
          <div><span className="section-kicker">For Indian businesses</span><h2>Have something to supply?</h2><p>Create your business profile and help buyers discover what you make.</p></div>
          <Link href="/suppliers/surya-solar-industries" className="button button-light">Explore a supplier profile <span>→</span></Link>
          <div className="banner-shape" aria-hidden="true">B</div>
        </section>
      </main>
      <footer className="site-footer"><div className="page-width footer-inner"><Link className="brand-lockup" href="/"><span className="brand-mark">B<span>+</span></span><span className="brand-words"><b>Biz Trade Mart</b><small>Business starts here</small></span></Link><p>Connecting businesses with possibilities.</p><span>© 2026 Biz Trade Mart · MVP preview</span></div></footer>
    </>
  );
}
