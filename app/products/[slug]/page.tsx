import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { products } from "@/lib/products";
import { Footer, Header, MobileNav, ProductDetail } from "@/components/marketplace";

type Props = { params: { slug: string } };

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const product = products.find((item) => item.slug === params.slug);
  return { title: product?.name ?? "Product" };
}

export default function ProductPage({ params }: Props) {
  const product = products.find((item) => item.slug === params.slug);
  if (!product) notFound();
  return <><Header /><ProductDetail product={product} /><Footer /><MobileNav /></>;
}
