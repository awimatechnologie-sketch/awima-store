export interface Product {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  price: number | null; // سعر البيع. null = اتصل لمعرفة السعر
  oldPrice?: number | null; // سعر السوق قبل التخفيض (اختياري)
  currency: string;
  category: string; // معرّف القسم
  images: string[];
  availability: 'in_stock' | 'out_of_stock' | 'on_request';
  featured: boolean;
  specs: Record<string, string>;
  whatsappOrder: boolean;
  related?: string[]; // معرّفات منتجات مقترحة يدوياً (يُشترى معه)
  hidden?: boolean; // مخفي من الموقع (مسودة) دون حذفه
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}
