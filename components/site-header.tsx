import Link from 'next/link';

export function SiteHeader() {
  return (
    <>
      <div className="announcement"><span className="announcement-spark">✦</span> Meet your next business connection <span className="announcement-divider">·</span> Discover the marketplace <span aria-hidden="true">→</span></div>
      <header className="site-header">
        <div className="header-main page-width">
          <Link className="brand-lockup" href="/" aria-label="Biz Trade Mart home">
            <span className="brand-mark">B<span>+</span></span><span className="brand-words"><b>Biz Trade Mart</b><small>Business starts here</small></span>
          </Link>
          <form action="/" className="header-search" role="search">
            <span aria-hidden="true">⌕</span><input name="q" aria-label="Search products and suppliers" placeholder="Search products, suppliers and more" /><button type="submit" aria-label="Submit search">→</button>
          </form>
          <nav className="header-actions" aria-label="Account navigation"><Link href="#products">Browse products</Link><Link className="header-sell" href="/suppliers/surya-solar-industries">Sell with us <span>↗</span></Link></nav>
        </div>
        <div className="header-sub"><div className="page-width sub-inner"><span className="sub-label"><span className="sub-dot" /> Explore</span><Link href="/?category=Industrial%20Machinery#products">Industrial machinery</Link><Link href="/?category=Electrical%20%26%20Solar#products">Electrical &amp; solar</Link><Link href="/?category=Packaging#products">Packaging</Link><Link href="/?category=Metals%20%26%20Materials#products">Metals &amp; materials</Link><Link href="/?category=Business%20Services#products">Business services</Link><span className="location-label">⌖ India</span></div></div>
      </header>
    </>
  );
}
