export type Product = {
  slug: string;
  name: string;
  category: string;
  price: string;
  unit: string;
  moq: string;
  specifications: string[];
  description: string;
  visual: string;
  visualTone: string;
  supplierSlug: string;
  supplierName: string;
  supplierInitials: string;
  location: string;
};

export type Supplier = {
  slug: string;
  name: string;
  initials: string;
  location: string;
  description: string;
  years: string;
  specialties: string[];
};

export const categories = [
  { name: 'Industrial Machinery', icon: '⚙', tone: 'tone-blue' },
  { name: 'Electrical & Solar', icon: '✳', tone: 'tone-yellow' },
  { name: 'Packaging', icon: '▤', tone: 'tone-peach' },
  { name: 'Metals & Materials', icon: '⬡', tone: 'tone-lilac' },
  { name: 'Business Services', icon: '↗', tone: 'tone-mint' },
];

export const suppliers: Supplier[] = [
  { slug: 'surya-solar-industries', name: 'Surya Solar Industries', initials: 'SS', location: 'Jaipur, Rajasthan', description: 'A sample Indian supplier profile focused on dependable solar and electrical solutions for commercial projects.', years: '8 years', specialties: ['Solar panels', 'Solar inverters', 'Commercial installations'] },
  { slug: 'northstar-machinery', name: 'Northstar Machinery Works', initials: 'NM', location: 'Faridabad, Haryana', description: 'A sample manufacturer profile for industrial machinery and workshop equipment.', years: '12 years', specialties: ['CNC equipment', 'Workshop machinery', 'Industrial spares'] },
  { slug: 'packwell-industries', name: 'Packwell Industries', initials: 'PI', location: 'Ahmedabad, Gujarat', description: 'A sample packaging supplier profile serving growing manufacturers and distributors.', years: '6 years', specialties: ['Corrugated boxes', 'Custom packaging', 'Bulk cartons'] },
];

export const products: Product[] = [
  { slug: 'mono-perc-solar-panel-550w', name: 'Mono PERC Solar Panel, 550 W', category: 'Electrical & Solar', price: '₹8,250', unit: 'piece', moq: '10 pieces', specifications: ['550 W output', 'Mono PERC cells', 'Half-cut design', '25-year performance warranty', 'Suitable for commercial rooftops'], description: 'High-efficiency solar modules for commercial rooftops and distributed energy projects. Ask the supplier for current pricing, availability and project quantities.', visual: '☼', visualTone: 'visual-solar', supplierSlug: 'surya-solar-industries', supplierName: 'Surya Solar Industries', supplierInitials: 'SS', location: 'Jaipur, Rajasthan' },
  { slug: 'industrial-cnc-turning-machine', name: 'CNC Turning Machine, Industrial', category: 'Industrial Machinery', price: '₹12,50,000', unit: 'unit', moq: '1 unit', specifications: ['CNC controlled', 'Heavy-duty build', 'Custom bed length options', 'Digital operation panel', 'Installation support available'], description: 'A versatile turning machine concept for precision workshop operations. Configuration and final quotation are confirmed directly by the supplier.', visual: '◉', visualTone: 'visual-machine', supplierSlug: 'northstar-machinery', supplierName: 'Northstar Machinery Works', supplierInitials: 'NM', location: 'Faridabad, Haryana' },
  { slug: 'corrugated-shipping-boxes', name: 'Corrugated Shipping Boxes', category: 'Packaging', price: '₹18', unit: 'piece', moq: '500 pieces', specifications: ['5-ply corrugated board', 'Custom sizes available', 'Recyclable paper material', 'Flexo printing option', 'Bulk supply available'], description: 'Customizable corrugated cartons for shipping and storage. Share your dimensions and order quantity to request a tailored quote.', visual: '▧', visualTone: 'visual-packaging', supplierSlug: 'packwell-industries', supplierName: 'Packwell Industries', supplierInitials: 'PI', location: 'Ahmedabad, Gujarat' },
  { slug: 'solar-hybrid-inverter-5kw', name: 'Solar Hybrid Inverter, 5 kW', category: 'Electrical & Solar', price: '₹42,000', unit: 'piece', moq: '2 pieces', specifications: ['5 kW rated output', 'Hybrid solar support', 'Single-phase compatible', 'LCD monitoring display', 'Warranty as per supplier terms'], description: 'A sample hybrid inverter listing for rooftop and small commercial systems. Ask for a system compatibility check before ordering.', visual: 'ϟ', visualTone: 'visual-inverter', supplierSlug: 'surya-solar-industries', supplierName: 'Surya Solar Industries', supplierInitials: 'SS', location: 'Jaipur, Rajasthan' },
  { slug: 'stainless-steel-sheet-304', name: 'Stainless Steel Sheet, Grade 304', category: 'Metals & Materials', price: '₹245', unit: 'kg', moq: '100 kg', specifications: ['Grade 304 stainless steel', 'Multiple thicknesses', 'Mill finish options', 'Cut-to-size on request', 'Material test certificate on request'], description: 'Stainless steel sheet material for fabrication and industrial applications. Availability, finish and final rate depend on size and quantity.', visual: '◇', visualTone: 'visual-steel', supplierSlug: 'northstar-machinery', supplierName: 'Northstar Machinery Works', supplierInitials: 'NM', location: 'Faridabad, Haryana' },
  { slug: 'custom-printed-paper-cartons', name: 'Custom Printed Paper Cartons', category: 'Packaging', price: '₹12', unit: 'piece', moq: '1,000 pieces', specifications: ['Custom printed artwork', 'Folding carton format', 'Food-grade stock options', 'Multiple board thicknesses', 'Sample development available'], description: 'Printed folding cartons for product packaging. Share the artwork, dimensions and quantity to begin a quotation.', visual: '▤', visualTone: 'visual-carton', supplierSlug: 'packwell-industries', supplierName: 'Packwell Industries', supplierInitials: 'PI', location: 'Ahmedabad, Gujarat' },
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}

export function getSupplier(slug: string) {
  return suppliers.find((supplier) => supplier.slug === slug);
}

export function getSupplierProducts(slug: string) {
  return products.filter((product) => product.supplierSlug === slug);
}
