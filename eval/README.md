# Değerlendirme seti

Etiketler: Claude taslağı, kullanıcı onaylı (2026-11-23)

Bu set, gerçek raporlarda şunları ölçer: araç bilgileri doğru okunuyor mu, maddeler doğru gruba düşüyor mu ve en önemlisi, **"dikkat" olması gereken hiçbir madde "dikkat"in altında gösterilmiyor mu**. Son ölçüt kesin kapıdır: ihlal olursa çıkış kodu 1 olur.

## Fotoğraflar nerede

Rapor fotoğrafları ve PDF'leri **depoya girmez**. Her vaka kendi klasöründe, depo dışında durur:

```
~/ekspertiz-eval/<vaka>/     # örn. ~/ekspertiz-eval/bmw-320i-2021/
```

Dosyalar ada göre sıralı okunur (.jpg, .jpeg, .png, .webp, .pdf). Etiket dosyalarında plaka, şasi numarası, ad, telefon gibi kişisel veri bulunmaz.

## Yeni vaka ekleme

1. Fotoğrafları `~/ekspertiz-eval/<vaka>/` klasörüne koyun (taşımayın, kopyalayın).
2. `eval/labels/<vaka>.json` dosyasını oluşturun (klasör adıyla aynı ad):
   - `vehicle`: yalnızca doğrulamak istediğiniz alanlar (`brand`, `model`, `year`, `engineCc`, `km`, `fuel`, `transmission` ...). Metinler büyük/küçük harf ve boşluktan bağımsız karşılaştırılır, sayılar birebir.
   - `expected`: `{ section, part, group }` listesi. `part`, raporda okunan parça adıdır (Türkçe büyük/küçük harf duyarsız). Ölçümler için `section` değeri `test_hatti` olur ve `part` test koduyla yazılır: `dinamometre_guc`, `fren_sapma_on`, `yanal_kayma_on`, `suspansiyon_tutunma sol ön` gibi (konum isteğe bağlı).
   - `mustBeDikkat`: `{ section, part }` listesi. Bunlar "dikkat" gruplu olmak zorundadır.
3. Çalıştırın.

## Çalıştırma

```
npm run degerlendir -- --cases ~/ekspertiz-eval
```

`ANTHROPIC_API_KEY` ortam değişkeninden ya da `.dev.vars` dosyasından okunur. Gerçek Claude çağrıları yapılır, bilgi tabanı diskten (`kb/`) yüklenir, harcama tavanı bu çalıştırma için 50 USD'dir. Çıktı: vaka başına bir satır (araç alanları doğru/toplam, grup doğruluğu, dikkat altında gösterilen sayısı, USD), toplam harcama ve vaka başına `dikkatShownBelow` listesi. Ham okuma çıktısı basılmaz.

## Çıkış kodları

| Kod | Anlamı |
|---|---|
| 0 | Hiçbir vakada `dikkatShownBelow` yok, tüm vakalar çalıştı |
| 1 | En az bir vakada `dikkatShownBelow` boş değil (ya da bir vaka çalışamadı) |
| 2 | `ANTHROPIC_API_KEY` yok ya da `--cases` klasörü bulunamadı |

`dikkatShownBelow` girdileri `"<bölüm>/<parça>"` biçimindedir. Eşleşen madde hiç yoksa başına `"eksik: "` eklenir.

## Tartışmalı etiketler (kullanıcı onaylı, 2026-11-23)

Etiketleri Claude, örnek raporun çıkarım kaydından ve spesifikasyon §8 tanımlarından taslak olarak hazırladı. Aşağıdaki girdilerde doğru grup tartışmalıydı. Kullanıcı seçilen grupları olduğu gibi onayladı:

- `kaporta_boya/Motor Kaputu` (normal): Cıvatalı parça, değişen. Önceki çarpışma kaydıyla uyumlu; tek başına risk sayılmadı.
- `kaporta_boya/Ön Tampon` (normal): Cıvatalı/klipsli parça, değişen; aynı gerekçe.
- `kaporta_boya/Sol Arka Çamurluk` (dikkat): 750+ µm tadilat boya, kaynaklı parça; gizli onarım ve yüksek maliyet ihtimali.
- `ic_dis_donanim/Lastik (Ön) Durum - Tarih` (dikkat): 2020 tarihli, değişim gerekli; güvenlik ve maliyet. Sadece "bakım" sayılırsa "normal" olabilir.
- `ic_dis_donanim/Lastik (Arka) Durum - Tarih` (dikkat): Aynı gerekçe.
- `ust_motor/Motor Üst Bölge Yağ Sızdırmazlığı` (dikkat): Notta "Yağ Sızdırıyor" yazıyor; kronik olabilir.
- `motor_alt_mekanik/Arka Krank Keçesi` (dikkat): Terleme küçük görünür ama onarımı şanzıman söküm masrafı getirir.
- `motor_alt_mekanik/Yağ Filtresi ve Soğutucusu` (kronik): Bu motorda bilinen yağ filtre yuvası contası sorunu varsayıldı; bilgi tabanında kaydı yoksa "dikkat" ya da "normal" çıkabilir.
- `motor_alt_mekanik/Karter` (normal): "Hafif terleme" yaşa ve km'ye göre beklenen sayıldı.

Ayrıca `mustBeDikkat` listesi (`sasi/Ön Panel`, `sasi/Sol Üst Frangart`) kesin kuraldan gelir (şasi bölümünde orijinal olmayan her madde en az dikkat); onay gerekmez.
