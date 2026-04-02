# VS Code için ING SQL

Visual Studio Code için **güvenlik, denetim uyumluluğu ve thick-mode performansı** için optimize edilmiş profesyonel bir Oracle SQL Developer alternatifi.

## 🚀 Temel Özellikler

### 🏢 Kurumsal Düzeyde Güvenlik
- **Zorunlu Denetim Günlüğü (Audit Logging)**: Her veri dışa aktarımı (export), arka planda çalışan bir dinleyici servisi aracılığıyla **merkezi bir veritabanına** otomatik olarak kaydedilir. Günlük kaydı zorunludur ve kullanıcılar tarafından yönlendirilemez veya devre dışı bırakılamaz.
- **Kısıtlı (Restricted) Sürüm Desteği**: Veri dışa aktarımlarını devre dışı bırakan, panoya kopyalamayı (Ctrl+C / Cmd+C) engelleyen ve sorgulanan verilerde sağ tık menülerini engelleyen özel bir "Restricted" sürüm mevcuttur.

### 🔌 Gelişmiş Bağlantı (Thick Mode)
- **Oracle Thick Mode**: Gelişmiş güvenlik (NNE - Native Network Encryption) ve yüksek performanslı sürücü özellikleri için Oracle Instant Client'ı otomatik olarak kullanır.
- **Güvenli Parola Depolama**: Parolalar yerel VS Code Secret Storage içinde güvenli bir şekilde saklanır.
- **Thick Mode Tanılaması**: Yerel ortamınızı doğrulamak için yerleşik "Verify Oracle Client" komutu.

### 🌲 Profesyonel Nesne Tarayıcısı (Object Browser)
- Tablolar, Görünümler (Views), Prosedürler, Fonksiyonlar, Paketler, Diziler (Sequences) ve daha fazlası için kapsamlı ağaç görünümü.
- **Meta Veri Sekmeleri**: Sütunlar, Veriler, Kısıtlamalar, Yetkiler (Grants), İstatistikler, Tetikleyiciler (Triggers), DDL ve Bağımlılıkları (Dependencies) görüntülemek için zengin, sekmeli arayüz.
- **Tema Uyumu**: ING kurumsal kimliğini korurken, VS Code'un tüm temalarına (Açık, Koyu, Yüksek Karşıtlık) otomatik olarak uyum sağlar.

### 📝 SQL Çalışma Sayfası (Worksheet) ve Geçmiş
- Güçlü SQL ve PL/SQL sözdizimi vurgulama (syntax highlighting) ve otomatik tamamlama.
- Kalıcı SQL Geçmişi ve SQL Snippet yönetimi.
- Çalıştırma Planı (Explain Plan - F10) ve DBMS_OUTPUT desteği.

### ⌨️ Klasik SQL Developer Kısayolları
- **Yeni SQL Çalışma Sayfası**: `Alt+F10`.
- **SQL Uyumlu Büyük Harf**: `Ctrl+Shift+U` (Win/Linux) / `Cmd+Shift+U` (Mac). Tek tırnak içindeki metinleri akıllıca atlar.

### 🧠 Intellisense (İsteğe Bağlı Özellik)
- **Zengin Çevrimdışı Otomatik Tamamlama**: Yüksek gecikmeli veya çevrimdışı ortamlarda anında geri bildirim için 3.500'den fazla şema nesnesi içerir (`+ Intellisense` sürümlerinde mevcuttur).

### 📥 Veri İçe Aktarma (Import)
- Nesne Tarayıcısı sağ tık menüsü aracılığıyla **CSV** ve **XLSX** dosyalarından doğrudan yeni veya mevcut tablolara veri aktarın.

### 📊 Sonuç Izgarası (Results Grid)
- Sıralama, filtreleme ve "Daha Fazla Yükle" (Load More) sayfalama özelliklerine sahip etkileşimli ızgara.
- Satır sayısını ve işlem yürütme süresini takip eden Durum Çubuğu.

## 🛠️ Gereksinimler

- **Oracle Veritabanı**: 12.1 veya daha yenisi.
- **Oracle İstemcisi**: Thick Mode çalışması için Oracle Instant Client 19c veya 23ai **gereklidir**. Eklenti, istemci kitaplığını güvenli, önceden tanımlanmış bir yolda (veya `ORACLE_CLIENT_PATH` ortam değişkeni aracılığıyla) bekler.

## 🛡️ Denetim Günlüğü (Audit Log) Detayları
Denetim sistemi, maksimum güvenlik için koda gömülmüştür. Her veri aktarımı için sunucu adı, kullanıcı, bağlantı, format ve içerik meta verilerini kaydeder. Kayıtlar `http://dwh-logger-api.athena.svc.cluster.local` adresine iletilir.

## 💾 Büyük Dosya Dışa Aktarımı (Large Export) Bilgileri
- **50MB+ dışa aktarımlarda CSV formatını tercih edin** — Excel'e kıyasla 4-5x daha az bellek kullanır.
- **VPN/Uzak bağlantılarda**: İndirme sunucusu dosya boyutuna göre dinamik zaman aşımı kullanır (60s + 50MB başına 60s). Çok büyük dosyalar için dosyayı sunucudan doğrudan kopyalamayı tercih edebilirsiniz.
- Export işlemi, `oracledb.queryStream()` kullanarak Oracle'dan satır satır veri çeker ve doğrudan diske yazar. RAM'de birikim yapılmaz.

## 📦 Dağıtım Dosyaları (V2.6.6)

| Sürüm | Linux (x64) | Mac (ARM64) |
| :--- | :--- | :--- |
| **Full** | `ing-sql-linux-x64-2.6.6.vsix` | `ing-sql-darwin-arm64-2.6.6.vsix` |
| **Full + Intellisense** | `ing-sql-intl-linux-x64-2.6.6.vsix` | `ing-sql-intl-darwin-arm64-2.6.6.vsix` |
| **Restricted** | `ing-sql-restricted-linux-x64-2.6.6.vsix` | `ing-sql-restricted-darwin-arm64-2.6.6.vsix` |
| **Restricted + Intl** | `ing-sql-restricted-intl-linux-x64-2.6.6.vsix` | `ing-sql-restricted-intl-darwin-arm64-2.6.6.vsix` |

## 📋 Sürüm Notları (Changelog)

### v2.6.6 — Kararlı Büyük Dosya Export Motoru
- **XLSX 200K+ Satır Bozulma Düzeltmesi**: `null`, boş string ve `N/A` değer içeren tablolarda 200K satırı aşan Excel export'larda dosya bozulması tamamen çözüldü. Kök neden: ExcelJS `addRow(array)` streaming modunda boş hücreleri `<c t="inlineStr">` olarak yazar ve kolon referans kaymasına neden olur. Çözüm: `getRow().getCell()` ile her hücrenin kolon referansı açıkça belirtilir, boş hücreler XML'den temiz şekilde atlanır.
- **Binary Stream Düzeltmesi**: XLSX dosyaları için `fs.createWriteStream` üzerindeki `encoding:'utf-8'` ayarı kaldırıldı. XLSX bir ZIP arşivi (binary) olduğundan, UTF-8 encoding binary veriyi bozuyordu.
- **Backpressure Kontrolü**: Her 500 satırda bir `writableNeedDrain` kontrolü yapılarak ExcelJS'in iç ZIP stream buffer'ının taşması engellendi.
- **AutoFilter Sınırı**: 100K+ satırlık export'larda `autoFilter` devre dışı bırakıldı — ExcelJS streaming modunda büyük range autoFilter'ler sheet XML'ini bozabiliyordu.
- **Export Hata Görünürlüğü**: `logFailedExport` çağrısı `try-catch` ile sarmalandı — artık audit log hatası asıl export hatasını yutamıyor. Kullanıcı her zaman gerçek hata mesajını görür.
- **Null-Safe Audit Log**: `format.toUpperCase()` çağrısı null-safe hale getirildi (`(format || 'UNKNOWN').toUpperCase()`).

### v2.6.5 — Büyük Dosya Export Altyapısı
- **Oracle `queryStream()` Entegrasyonu**: Export motoru `execute()` + `ResultSet.getRows()` yerine `oracledb.queryStream()` ile satır satır veri çeker. RAM'de birikim yapılmaz.
- **Dinamik İndirme Zaman Aşımı**: Sabit 30s yerine dosya boyutuna göre dinamik timeout (60s + 50MB başına 60s). `599 Unknown HTTP Error` çözüldü.
- **RFC 5987 Content-Disposition**: Tarayıcının dosya uzantısını kaybetmesi ve "Save As" klasör seçimi sorunu düzeltildi.
- **Content-Length Header**: İndirme ilerleme çubuğu desteği ve proxy truncation önleme.
- **JSON Writer Optimizasyonu**: 200 satırlık mikro-chunk'lar ile diske yazma.
- **İndirme Sunucusu Yaşam Döngüsü**: Transfer tamamlanınca kapanır, client kopması algılanır.

### v2.6.0 — Akıllı IntelliSense ve Tanılamalar
- **Akıllı Bağlama Duyarlı IntelliSense**: Alias'lar (`a.`), tablolar (`TABLO.`) ve şemalar (`SEMA.`) için nokta ile tamamlama desteği. `SELECT` ve `WHERE` yan tümceleri içinde bağlama uygun sütun önerileri. Maksimum performans için sütunları gecikmeli (lazy) olarak önbelleğe alır.
- **Gerçek Zamanlı SQL Tanılamaları**: Yazı yazarken kapatılmamış tırnaklar (`'`), eşleşmeyen parantezler ve sonlandırılmamış çoklu yorum satırları (`/*`) için anında beliren kırmızı dalgalı alt çizgiler.
- **Çalıştırma Hatası Vurgulama**: Oracle çalışma hataları (örn. `ORA-00942`), artık kırmızı dalgalı çizgi ve "Sorunlar" (Problems) paneli üzerinden kodunuzdaki soruna neden olan kelimeyle doğrudan eşleştiriliyor.
- **Sonuç Izgarasında Null Gösterimi**: `ingSql.resultGrid.nullDisplay` (varsayılan: `(null)`) ayarıyla, `NULL` değerlerin sonuç ızgarasında ve CSV/HTML çıktı formatlarında nasıl görüntüleneceğini özelleştirebilirsiniz.
- **Sonuç Izgarası Düzenleyici Yazı Tipi**: Sütunların mükemmel hizalanması için `ingSql.resultGrid.useEditorFont` ayarıyla sonuç ızgarası, VS Code'un `editor.fontFamily` (örn. monospace) yazı tipini doğrudan miras alır.
- **Paket Gövdesi Görünümü**: Nesne Tarayıcısı'ndaki paketler (Packages) artık eksik gövde görünürlüğü sorununu çözerek belirgin `Spec` (Tanım) ve `Body` (Gövde) düğümlerine genişler.
- **Snippet Depolama Taşıması**: Tarayıcıya bağlı `globalState` önbelleğindeki snippet'ler, tarayıcılar arası (cross-browser) kalıcılık için fiziksel `snippets.json` dosyalarına güvenli bir şekilde taşındı.

### v2.5.11 — SQL Çalışma Sayfası UX İyileştirmeleri
- **Fiziksel .sql Dosyaları:** Yeni çalışma sayfaları artık isimsiz belgeler yerine gerçek `Worksheet_1.sql`, `Worksheet_2.sql` dosyaları oluşturur. SQL Geçmişi kayıtları `History_*.sql` dosyaları olarak açılır.
- **Varsayılan Yorumların Kaldırılması:** Yeni çalışma sayfalarındaki varsayılan açıklayıcı yorum satırları kaldırıldı.
- **CodeLens Eylemleri:** İfadeyi Çalıştır, Komut Dosyasını Çalıştır ve Çalıştırma Planı (Explain Plan) artık her `.sql` dosyasının üstünde tıklanabilir CodeLens düğmeleri olarak görünüyor.
- **Hata Mesajını Kopyala:** Başarısız olan SQL Geçmişi kayıtları için artık sağ tık bağlam menüsüne "Hata Mesajını Kopyala" (Copy Error Message) seçeneği eklendi.
- **BEGIN Bloğu Düzeltmesi:** `BEGIN` veya `DECLARE` ile başlayan PL/SQL blokları artık başarısız olmuyor - sondaki `END;` noktalı virgülü (semicolon) artık yürütme sırasında doğru bir şekilde korunuyor.

### v2.5.9 — Çökmeyen (Crash-Proof) Dictionary Motoru
- **Sağlamlaştırılmış Veri Çıkarıcıları:** Eklentinin meta veri çıkarma yönteminde tam bir paradigma değişimi! Kesin sütun isimleri (`TABLE_SCHEMA` ve `OWNER` çekişmeleri) veya eksik kısıtlamalar nedeniyle oluşan `ORA-00904` Oracle Dictionary çökmeleri yerine, eklenti artık hatasız `SELECT *` komutları yayınlıyor. Şemalar arası tüm veri çözme, eşleme ve filtreleme, anlık olarak NodeJS motoru içinde dinamik bir şekilde gerçekleştirilir.

### v2.5.8 — Bağımsız DBA Dictionary Çözümlemesi
- **Statik DBA Önbelleği (Cache) Kaldırıldı:** Yetkiniz olmayan bir görünüme tıkladığınızda `DBA_TAB_PRIVS` gibi sorguları engelleyen önbellek mekanizması düzeltildi. Diğer Kullanıcıların (Other Users) sekmeleri her sorgu tamamen bağımsız çalıştığı için anında yüklenir.

### v2.5.7 — Yenilmez Fallback'ler ve Bağımlı (Dependent) Yetkiler
- **Webview Hata Restorasyonu:** Webview paneli hatalarının sessizce yutulmasını çözen düzeltme uygulandı.
- **Oracle Fallback Esnekliği:** Sadece `ORA-00942` hatalarından ziyade, `DBA_` görünümlerinden gelen herhangi bir ORA istisnası artık başarıyla yakalanıyor ve anında standart `ALL_` sözlük eşdeğerlerine geçiş yapıyor.
- **Tablo GRANT Kodları:** **SQL** sekmesi artık Tablonun bağımlı (dependent) `OBJECT_GRANT` komutunu otomatik olarak getirip ekliyor.

### Önceki Sürümlerin Özeti
- **v2.5.6-v2.3.0**: Diğer kullanıcıları görüntüleme hataları giderildi. "İçe Aktarma Sihirbazı (Import Wizard)" ve "Excel >1M satır sınırı" aşıldı ve dosyalar parçalara bölündü. "Diğer Kullanıcılar" sekmesine meta veri sekmeleri eklendi.
- **v2.2.0-v2.0.0**: 10K satırlık doğrudan veritabanından diske "Akış (Streaming) İle Dışa Aktarma" ve performans optimizasyonları eklendi. Eklentinin tamamen çalışmamasına sebep olan `NJS-021` yükleme çökmesi giderildi. "Tüm Kullanıcılar (Other Users)" ağacı tasarlandı.
- **v1.9.0-v1.0.0**: Sonda bulunan ";" noktalı virgül yürütme hataları düzeltildi, Her çalışma sayfasına kendi özel Session SID verildi. "SQL Çalıştırma Durum Çubuğu" tasarlandı, `NLS_DATE_FORMAT` okuma hataları onarıldı ve zorunlu denetim ile ING eklentisi yayınlandı.

---
*Athena DWH Ekibi tarafından geliştirilmiştir.*
