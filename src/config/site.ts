// كل إعدادات الهوية والتواصل هنا فقط. لا تكررها في أي ملف آخر.
export const site = {
  name: 'AWIMA Store',
  tagline: 'منتجات إلكترونية بجودة موثوقة',
  // غيّر الرابط بعد النشر على Cloudflare أو عند ربط الدومين
  url: 'https://awima-store.pages.dev',
  lang: 'ar',
  dir: 'rtl',
  currency: 'MAD',
  currencyLabel: 'د.م.',
  logo: {
    store: '/images/logo-store.png', // الشعار الكامل (الهيدر والفوتر)
    icon: '/images/logo-icon.png', // رمز الشعار فقط
    og: '/images/og-image.png', // صورة المشاركة على السوشيال
  },
  colors: {
    primary: '#0B2A6F',
    accent: '#0A6CFF',
    alert: '#E4161B',
  },
  contact: {
    // الصيغة الدولية بدون + ولا صفر البداية
    whatsapp: '212652091799',
    whatsappSecondary: '212652305405',
    phoneDisplay: '0652091799',
    phoneSecondaryDisplay: '0652305405',
    email: '', // لم يتم تحديده بعد
    address: '', // لم يتم تحديده بعد
  },
  social: {
    facebook: '',
    instagram: '',
    tiktok: '',
  },
} as const;
