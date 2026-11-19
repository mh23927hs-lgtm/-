# دليل بناء ونشر تطبيق زاد مهاوي (ZAD MAHAWI) على Android و Google Play

هذا المشروع مُهيّأ ليعمل كتطبيق ويب تقدمي (PWA) قابل للتثبيت الفوري على Android/iOS، ومُعدّ بملف `capacitor.config.ts` وأيقونات التطبيق (`public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/pwa-maskable-512x512.png`) لبناء حزم Android الأصلية (`APK` و `AAB`).

> ملاحظة تقنية: بيئة التشغيل الحالية هي خادم Node.js/Linux بدون Android SDK/Gradle، لذلك يجب تنفيذ خطوات بناء `.apk` و `.aab` أدناه على جهاز يحتوي على **Android Studio** و **JDK 17+**.

## 1. بناء نسخة الويب
```bash
npm install
npm run build
```

## 2. تهيئة مشروع Android عبر Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
```

## 3. إنشاء مفتاح التوقيع (Keystore) لإصدار Google Play
```bash
keytool -genkey -v -keystore zad-mahawi-release.keystore -alias zadmahawi -keyalg RSA -keysize 2048 -validity 10000
```

## 4. بناء APK للاختبار و AAB للنشر على Google Play
```bash
cd android
# نسخة APK للاختبار:
./gradlew assembleRelease
# المخرج: android/app/build/outputs/apk/release/app-release.apk

# نسخة AAB للنشر على Google Play:
./gradlew bundleRelease
# المخرج: android/app/build/outputs/bundle/release/app-release.aab
```

## 5. متطلبات Google Play
- معرف التطبيق: `com.zadmahawi.app`
- الاسم: `زاد مهاوي - ZAD MAHAWI`
- صفحة سياسة الخصوصية متوفرة داخل التطبيق في تبويب حسابي / التذييل.
- تفعيل Firebase Cloud Messaging بإضافة `google-services.json` داخل `android/app/` عند بناء النسخة الأصلية.
