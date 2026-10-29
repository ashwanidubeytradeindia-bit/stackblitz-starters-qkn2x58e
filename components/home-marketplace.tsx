"use client";

import { useMemo, useState } from "react";
import { categories, products } from "@/lib/products";
import { Footer, Header, MobileNav, ProductCard } from "@/components/marketplace";

const quickSearches = ["Packaging machine", "Solar pump", "CNC machine"];

export default function HomeMarketplace() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All products");

  const shown = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "All products" || product.category.toLowerCase().includes(category.toLowerCase()) || (category === "Industrial Machinery" && product.category === "Industrial Machinery");
    const matchesQuery = !query || [product.name, product.category, product.location, product.supplier.name].join(" ").toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  }), [category, query]);

  return (
    <>
      <Header onSearch={setQuery} />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span className="kicker-dot" /> INDIA’S B2B MARKETPLACE</div>
            <h1>Business finds<br />its <em>right match.</em></h1>
            <p>Discover products from Indian suppliers and connect directly with businesses ready to serve you.</p>
            <div className="hero-proof"><span className="proof-avatars"><i>R</i><i>A</i><i>M</i></span><span><strong>Built for business buyers</strong><small>Explore suppliers across India</small></span></div>
          </div>
          <div className="hero-art" aria-label="Abstract marketplace illustration">
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
            <div className="art-sun" />
            <div className="art-card art-card-top"><span className="art-icon mint">↗</span><span><b>Direct enquiries</b><small>Connect with suppliers</small></span></div>
            <div className="art-card art-card-bottom"><span className="art-icon orange">✓</span><span><b>Verified profiles</b><small>Make informed choices</small></span></div>
            <div className="art-center"><span className="art-center-mark">b<span>t</span>m</span><small>India • Business • Growth</small></div>
            <span className="art-spark spark-one">✳</span><span className="art-spark spark-two">✦</span>
          </div>
        </section>

        <section className="search-panel" aria-label="Find products">
          <div className="search-panel-top"><div><span className="eyebrow">START YOUR SOURCING</span><h2>What are you looking for?</h2></div><span className="search-ai-pill">✦ Smart search</span></div>
          <form className="main-search" onSubmit={(e) => { e.preventDefault(); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}>
            <span className="search-symbol">⌕</span><input aria-label="Product or supplier" placeholder="Enter product or supplier name" value={query} onChange={(e) => setQuery(e.target.value)} /><button type="submit">Find suppliers <span>→</span></button>
          </form>
          <div className="quick-searches"><span>Popular:</span>{quickSearches.map((item) => <button key={item} onClick={() => setQuery(item)} type="button">{item}</button>)}</div>
        </section>

        <section className="category-section" id="categories">
          <div className="section-heading"><div><span className="eyebrow">BROWSE BY INDUSTRY</span><h2>Explore categories</h2></div><a className="text-link" href="#products">View all categories <span>→</span></a></div>
          <div className="category-grid">{categories.map((item, index) => <button key={item.name} className={category === item.name ? "category-tile active" : "category-tile"} onClick={() => { setCategory(category === item.name ? "All products" : item.name); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}><span className={`category-icon icon-${index}`}>{item.icon}</span><strong>{item.name}</strong><small>{item.count} products</small><span className="category-arrow">↗</span></button>)}</div>
        </section>

        <section className="featured-section" id="products">
          <div className="section-heading product-heading"><div><span className="eyebrow">HANDPICKED FOR YOU</span><h2>{query ? `Results for “${query}”` : category === "All products" ? "Popular products" : category}</h2></div><div className="sort-wrap"><span>{shown.length} sample listings</span><select aria-label="Sort products"><option>Recommended</option><option>Price: low to high</option></select></div></div>
          <div className="filter-chips"><button className={category === "All products" ? "filter-chip selected" : "filter-chip"} onClick={() => setCategory("All products")}>All products</button>{["Industrial Machinery", "Agriculture", "Packaging"].map((name) => <button key={name} className={category === name ? "filter-chip selected" : "filter-chip"} onClick={() => setCategory(name)}>{name}</button>)}</div>
          {shown.length ? <div className="product-grid">{shown.map((product) => <ProductCard product={product} key={product.slug} />)}</div> : <div className="empty-state"><span>⌕</span><h3>No matching sample listings</h3><p>Try a broader search or clear the selected category.</p><button onClick={() => { setQuery(""); setCategory("All products"); }}>Show all products</button></div>}
        </section>

        <section className="trust-band" id="how-it-works"><div><span className="trust-icon">01</span><span><strong>Discover products</strong><small>Browse sample listings by category</small></span></div><span className="trust-line" /><div><span className="trust-icon">02</span><span><strong>Check the supplier</strong><small>Review company profile and details</small></span></div><span className="trust-line" /><div><span className="trust-icon">03</span><span><strong>Send an enquiry</strong><small>Confirm your mobile in the demo flow</small></span></div></section>

        <section className="supplier-cta" id="supplier-cta"><div><span className="eyebrow">FOR INDIAN BUSINESSES</span><h2>Ready to find your next supplier?</h2><p>Browse the demo catalogue and try a mobile-verified enquiry flow.</p></div><a href="#products" className="cta-button">Explore products <span>→</span></a><span className="cta-decoration">✳</span></section>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
