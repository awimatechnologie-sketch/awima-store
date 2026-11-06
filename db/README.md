# تفعيل الإعجابات وتقييمات الزوار (مرة واحدة، من لوحة Cloudflare)

1. Cloudflare ← Workers & Pages ← **D1 SQL Database** ← Create ← الاسم: `awima-store-db`.
2. (اختياري) الجداول تُنشأ تلقائياً عند أول طلب. إن أردت يدوياً: Console ← الصق `db/schema.sql` ← Execute.
3. مشروع Pages (awima-store) ← Settings ← **Bindings** ← Add ← D1 database:
   - Variable name: `DB` ← القاعدة `awima-store-db` (للـProduction والـPreview).
4. Settings ← **Variables and Secrets** ← أضف (كـSecret):
   - `ADMIN_TOKEN` = نص طويل عشوائي (12 حرفاً على الأقل). به تدخل صفحة `/moderation`.
   - `HASH_SALT` = نص عشوائي آخر (لتجزئة عناوين IP والأجهزة).
   - اختياري: `TURNSTILE_SECRET` (والمفتاح العام يوضع في الإعدادات ← مجتمع الموقع).
5. أعد نشر الموقع (Retry deployment) ليأخذ الربط.

تحقق: افتح `https://موقعك/api/community` فيجب أن ترى `{"likes":{},"reviews":{}}`.
المراجعة: `https://موقعك/moderation` ← الرمز السري ← انشر أو ارفض.
