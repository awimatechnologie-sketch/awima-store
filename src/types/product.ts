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
  stock?: number | null; // الكمية المتوفرة. null/غير موجود = غير محدود، 0 = غير متوفر تلقائياً
  fr?: ProductFr; // ترجمة فرنسية اختيارية (تُدار من اللوحة)
  related?: string[]; // معرّفات منتجات مقترحة يدوياً (يُشترى معه)
  hidden?: boolean; // مخفي من الموقع (مسودة) دون حذفه
  warranty?: number | null; // أيام الضمان لهذا المنتج. فارغ = الافتراضي العام، 0 = بلا ضمان
  leadDays?: number | null; // مدة التوفر بالأيام للمنتج «عند الطلب» (اختياري)
  ports?: ('usb-c' | 'lightning' | 'micro-usb')[]; // منافذ الهواتف المدعومة (لباحث التوافق)
}

export interface ProductFr {
  name?: string;
  shortDescription?: string;
  description?: string;
  specs?: Record<string, string>;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  nameFr?: string; // اسم القسم بالفرنسية (اختياري)
}
