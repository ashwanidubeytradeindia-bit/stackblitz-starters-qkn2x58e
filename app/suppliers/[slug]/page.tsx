import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { products, supplierList } from "@/lib/products";
import { Footer, Header, MobileNav, SupplierProfile } from "@/components/marketplace";

type Props = { params: { slug: string } };

export function generateStaticParams() {
  return supplierList.map((supplier) => ({ slug: supplier.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const supplier = supplierList.find((item) => item.slug === params.slug);
  return { title: supplier?.name ?? "Supplier profile" };
}

export default function SupplierPage({ params }: Props) {
  const supplier = supplierList.find((item) => item.slug === params.slug);
  if (!supplier) notFound();
  const catalogue = products.filter((product) => product.supplier.slug === supplier.slug);
  return <><Header /><SupplierProfile supplier={supplier} products={catalogue} /><Footer /><MobileNav /></>;
}
