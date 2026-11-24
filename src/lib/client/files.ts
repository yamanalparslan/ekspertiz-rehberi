// Sunucudaki sınırlarla aynı (src/lib/pipeline/upload.ts). O modül Claude istemcisini
// içe aktardığı için tarayıcı paketine alınmaz; eşitliği files.test.ts denetler.
// Seçimin bu sınırlara göre değerlendirilmesi: selection.ts (assessSelection).
export const MAX_IMAGES = 25;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
