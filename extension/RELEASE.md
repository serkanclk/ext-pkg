# 📦 VSIX Release Yapılacaklar Listesi

Bu dosya, yeni bir sürüm yayınlarken takip edilmesi gereken adımları içerir.
Aşağıdaki prompt'u Antigravity'e vererek tüm süreci otomatikleştirebilirsiniz.

---

## 🤖 Otomatik Release Prompt'u

Aşağıdaki prompt'u kopyalayıp yapıştırın ve `X.Y.Z` yerine yeni versiyon numarasını, `BAŞLIK` yerine sürüm başlığını, ve `DEĞİŞİKLİKLER` yerine changelog maddelerini yazın:

```
Yeni bir VSIX release hazırla:

1. package.json dosyasında version'ı "X.Y.Z" olarak güncelle
2. README.md dosyasında:
   - "Dağıtım Dosyaları" tablosundaki versiyon numaralarını X.Y.Z olarak güncelle
   - "Sürüm Notları (Changelog)" bölümüne v2.6.0 formatına uygun şekilde yeni madde ekle:
     ### vX.Y.Z — BAŞLIK
     DEĞİŞİKLİKLER
3. npm run compile ile projeyi derle ve hata olmadığını doğrula
4. node scripts/package-all.js komutuyla tüm VSIX paketlerini oluştur
5. releases/ klasöründeki çıktıları listele
```

---

## 📋 Manuel Yapılacaklar Listesi

Sırasıyla aşağıdaki adımları takip edin:

### 1. Versiyon Güncelleme
- [ ] `package.json` → `"version": "X.Y.Z"` olarak güncelle

### 2. README Güncelleme
- [ ] `README.md` → **Dağıtım Dosyaları** tablosundaki tüm `.vsix` dosya adlarını yeni versiyonla güncelle
- [ ] `README.md` → **Sürüm Notları** bölümüne yeni changelog maddesi ekle (mevcut formata uygun)

### 3. Derleme
- [ ] `npm run compile` çalıştır — TypeScript hata olmadığını doğrula

### 4. Paketleme
- [ ] `node scripts/package-all.js` çalıştır — Bu komut:
  - Eski release dosyalarını temizler
  - `prepare.js` ile 4 farklı build varyantını hazırlar (Full, Full+Intl, Restricted, Restricted+Intl)
  - Her varyant için `darwin-arm64` ve `linux-x64` hedeflerini paketler
  - VSIX dosyalarını `releases/regular/` ve `releases/restricted/` klasörlerine taşır
  - Son olarak `prepare.js` ile package.json'ı Full moda geri döndürür

### 5. Doğrulama
- [ ] `releases/regular/` klasöründe 4 dosya olduğunu doğrula
- [ ] `releases/restricted/` klasöründe 4 dosya olduğunu doğrula
- [ ] Dosya boyutlarının makul olduğunu kontrol et (genellikle 2-5MB arası)

### 6. Dağıtım
- [ ] VSIX dosyalarını hedef sunuculara/kullanıcılara dağıt

---

## 📁 Çıktı Yapısı

```
releases/
├── regular/
│   ├── ing-sql-darwin-arm64-X.Y.Z.vsix
│   ├── ing-sql-linux-x64-X.Y.Z.vsix
│   ├── ing-sql-intl-darwin-arm64-X.Y.Z.vsix
│   └── ing-sql-intl-linux-x64-X.Y.Z.vsix
└── restricted/
    ├── ing-sql-restricted-darwin-arm64-X.Y.Z.vsix
    ├── ing-sql-restricted-linux-x64-X.Y.Z.vsix
    ├── ing-sql-restricted-intl-darwin-arm64-X.Y.Z.vsix
    └── ing-sql-restricted-intl-linux-x64-X.Y.Z.vsix
```
