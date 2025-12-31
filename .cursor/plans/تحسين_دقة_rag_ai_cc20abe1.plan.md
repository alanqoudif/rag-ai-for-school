---
name: تحسين دقة RAG AI
overview: حذف البيانات القديمة من Supabase، إنشاء سكريبت جديد لإدخال ملف data.text بطريقة محسنة تحافظ على سياق كل برنامج، وتحديث الـ prompts لضمان دقة الإجابات.
todos:
  - id: delete-old-data
    content: حذف البيانات القديمة من جدول documents في Supabase
    status: completed
  - id: create-ingest-script
    content: إنشاء سكريبت ingest-text.ts لإدخال data.text بتقطيع ذكي
    status: completed
  - id: update-prompts
    content: تحديث lib/prompts.ts - إزالة النص المعكوس وإضافة تعليمات الدقة
    status: completed
  - id: update-route
    content: تحديث route.ts - تحسين threshold و matchCount
    status: completed
  - id: run-ingest
    content: تشغيل سكريبت الإدخال لإضافة البيانات الجديدة
    status: completed
  - id: test-accuracy
    content: اختبار دقة الإجابات بأسئلة عن برامج محددة
    status: completed
---

# تحسين دقة نظام RAG AI

## المشكلة الحالية

AI يعطي معلومات خاطئة لأن:

1. البيانات القديمة من PDF المعكوس لا تزال في قاعدة البيانات
2. الـ prompt مصمم لنص معكوس - والبيانات الجديدة واضحة
3. طريقة التقطيع (chunking) قد تفصل معلومات البرنامج الواحد
4. AI يخلط بين برامج مختلفة (مثال: SQ050 لدكتور بالطب يظهر عند السؤال عن علم الطب الحيوي SQ959)

---

## خطة الحل

### 1. حذف البيانات القديمة من Supabase

```sql
DELETE FROM documents;
```

### 2. إنشاء سكريبت جديد لإدخال data.text

سكريبت جديد `scripts/ingest-text.ts` يقوم بـ:

- قراءة ملف `data.text`
- تقطيع ذكي: كل برنامج كـ chunk واحد كامل
- استخراج metadata دقيقة (اسم البرنامج، الرمز، المؤسسة، القسم)
- إنشاء embeddings وتخزينها في Supabase

### 3. تحديث الـ prompts في `lib/prompts.ts`

- **إزالة** كل الإشارات للنص المعكوس
- **إضافة** تعليمات صارمة:
  - عدم خلط معلومات برامج مختلفة
  - التأكد من تطابق الرمز مع اسم البرنامج
  - إذا سأل عن برنامج محدد، يرد بمعلومات هذا البرنامج فقط

### 4. تحسين route.ts

- زيادة `matchThreshold` من 0.01 إلى 0.3 للحصول على نتائج أكثر دقة
- تقليل `matchCount` من 15 إلى 5 للتركيز على الأكثر صلة

---

## الملفات المتأثرة

- [scripts/ingest-text.ts](scripts/ingest-text.ts) - سكريبت جديد
- [lib/prompts.ts](lib/prompts.ts) - تحديث
- [app/api/chat/route.ts](app/api/chat/route.ts) - تحديث