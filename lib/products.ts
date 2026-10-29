export type Supplier = {
  slug: string;
  name: string;
  city: string;
  state: string;
  years: number;
  verified: boolean;
  initials: string;
  color: string;
  about: string;
  products: number;
};

export type Product = {
  slug: string;
  name: string;
  category: string;
  price: string;
  unit: string;
  moq: string;
  image: string;
  location: string;
  supplier: Supplier;
  specs: string[];
  description: string;
  tag?: string;
};

const suppliers: Record<string, Supplier> = {
  "shree-engineering": {
    slug: "shree-engineering",
    name: "Shree Engineering Works",
    city: "Rajkot",
    state: "Gujarat",
    years: 12,
    verified: true,
    initials: "SE",
    color: "#d7efe5",
    about: "Manufacturer of reliable industrial machinery and workshop equipment for businesses across India.",
    products: 38,
  },
  "greenfield-agro": {
    slug: "greenfield-agro",
    name: "Greenfield Agro Systems",
    city: "Pune",
    state: "Maharashtra",
    years: 9,
    verified: true,
    initials: "GA",
    color: "#e1edcf",
    about: "Agricultural equipment supplier focused on practical, easy-to-maintain solutions for Indian farms.",
    products: 24,
  },
  "prime-packaging": {
    slug: "prime-packaging",
    name: "Prime Packaging Solutions",
    city: "Faridabad",
    state: "Haryana",
    years: 7,
    verified: true,
    initials: "PP",
    color: "#f5e5d6",
    about: "Packaging material and machinery supplier serving manufacturers, retailers, and growing brands.",
    products: 19,
  },
};

export const products: Product[] = [
  {
    slug: "industrial-air-compressor",
    name: "Industrial Air Compressor",
    category: "Industrial Machinery",
    price: "₹48,000",
    unit: "Piece",
    moq: "1 Piece",
    image: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=900&q=85",
    location: "Rajkot, Gujarat",
    supplier: suppliers["shree-engineering"],
    specs: ["5 HP motor", "200 L tank", "8 bar pressure", "Single phase", "Cast iron pump"],
    description: "A workshop-ready air compressor for pneumatic tools, service stations, and small manufacturing units. Ask the supplier to confirm configuration and delivery options.",
    tag: "Popular",
  },
  {
    slug: "mini-power-tiller",
    name: "Mini Power Tiller",
    category: "Agriculture",
    price: "₹72,500",
    unit: "Piece",
    moq: "1 Piece",
    image: "https://images.unsplash.com/photo-1592982537447-6f2a6a0b7f4a?auto=format&fit=crop&w=900&q=85",
    location: "Pune, Maharashtra",
    supplier: suppliers["greenfield-agro"],
    specs: ["7 HP engine", "Petrol powered", "Rotary blades", "Adjustable handle", "1 year warranty"],
    description: "Compact tiller for soil preparation in small and medium farms. Specifications and included attachments may vary by configuration.",
    tag: "Farm pick",
  },
  {
    slug: "automatic-pouch-packing-machine",
    name: "Automatic Pouch Packing Machine",
    category: "Packaging Machinery",
    price: "₹1,85,000",
    unit: "Piece",
    moq: "1 Piece",
    image: "https://images.unsplash.com/photo-1567789884554-0b844b597180?auto=format&fit=crop&w=900&q=85",
    location: "Faridabad, Haryana",
    supplier: suppliers["prime-packaging"],
    specs: ["20–60 pouches/min", "Servo control", "100–1000 g range", "SS contact parts", "Digital panel"],
    description: "Automatic pouch filling and sealing equipment for small production lines. Share your product and pack size to check suitability.",
  },
  {
    slug: "cnc-turning-machine",
    name: "CNC Turning Machine",
    category: "Industrial Machinery",
    price: "Get latest price",
    unit: "Machine",
    moq: "1 Machine",
    image: "https://images.unsplash.com/photo-1565043666747-69f6646db940?auto=format&fit=crop&w=900&q=85",
    location: "Rajkot, Gujarat",
    supplier: suppliers["shree-engineering"],
    specs: ["CNC controlled", "Industrial grade", "Custom chuck sizes", "Operator panel", "Installation support"],
    description: "Precision turning machine for repeatable component manufacturing. Request a quotation with your workpiece dimensions and production volume.",
    tag: "Made in India",
  },
  {
    slug: "solar-water-pump",
    name: "Solar Water Pump",
    category: "Renewable Energy",
    price: "₹36,900",
    unit: "Set",
    moq: "1 Set",
    image: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=900&q=85",
    location: "Pune, Maharashtra",
    supplier: suppliers["greenfield-agro"],
    specs: ["1 HP capacity", "DC submersible", "Solar compatible", "Low maintenance", "Controller included"],
    description: "Solar-compatible water pumping system for agricultural and rural use. Confirm head, flow rate, and panel requirements before purchase.",
  },
  {
    slug: "corrugated-boxes",
    name: "Corrugated Packaging Boxes",
    category: "Packaging",
    price: "₹12 / Piece",
    unit: "Piece",
    moq: "500 Pieces",
    image: "https://images.unsplash.com/photo-1607166452427-7e4477079cb9?auto=format&fit=crop&w=900&q=85",
    location: "Faridabad, Haryana",
    supplier: suppliers["prime-packaging"],
    specs: ["3-ply / 5-ply", "Custom dimensions", "Recyclable kraft", "Printed options", "Bulk supply"],
    description: "Customisable corrugated boxes for shipping, storage, and retail packaging. Final price depends on board grade, dimensions, and print requirements.",
    tag: "Bulk ready",
  },
];

export const categories = [
  { name: "Industrial Machinery", icon: "⚙", count: "2,400+" },
  { name: "Agriculture", icon: "✳", count: "1,850+" },
  { name: "Packaging", icon: "▧", count: "980+" },
  { name: "Electrical", icon: "ϟ", count: "1,200+" },
  { name: "Building Materials", icon: "⌂", count: "1,100+" },
  { name: "Renewable Energy", icon: "☼", count: "620+" },
];

export const supplierList = Object.values(suppliers);
