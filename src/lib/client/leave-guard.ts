/**
 * Sayfadan ayrılma koruması: ücretli bir analiz sürerken ya da sonuç ekrandayken başlıktaki
 * logo gibi iç bağlantılar önce onay ister. Analiz ekranı korumayı kurar, ayrılınca kaldırır.
 * Yalnız bellekte; rapor verisi taşımaz.
 */
export type LeaveGuard = {
  /** Onay sorusu. */
  message: string;
  /** Aynı sayfaya (ana sayfa) giden bağlantı onaylanınca yapılacak iş: analizi sıfırlamak. */
  onLeave: () => void;
};

let current: LeaveGuard | null = null;

export function setLeaveGuard(guard: LeaveGuard | null): void {
  current = guard;
}

export function getLeaveGuard(): LeaveGuard | null {
  return current;
}
