export interface Product {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  price: number | null; // null = اتصل لمعرفة السعر
  currency: string;
  category: string; // معرّف القسم
  images: string[];
  availability: 'in_stock' | 'out_of_stock' | 'on_request';
  featured: boolean;
  specs: Record<string, string>;
  whatsappOrder: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}
