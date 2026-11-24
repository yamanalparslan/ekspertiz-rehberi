import type { Group } from "@/lib/schema/interpretation";

// Tailwind sınıfları tam adlarıyla yazılır (taranabilmeleri için). Renkler yalnız anlam taşır:
// dikkat kırmızı, kronik turuncu, belirsiz gri, normal yeşil (açık ve koyu temada aynı anlam).
export const TONE: Record<Group, { text: string; bar: string; tint: string; rule: string }> = {
  dikkat: { text: "text-dikkat", bar: "bg-dikkat-bar", tint: "bg-dikkat-tint", rule: "border-dikkat-bar" },
  kronik: { text: "text-kronik", bar: "bg-kronik-bar", tint: "bg-kronik-tint", rule: "border-kronik-bar" },
  belirsiz: {
    text: "text-belirsiz",
    bar: "bg-belirsiz-bar",
    tint: "bg-belirsiz-tint",
    rule: "border-belirsiz-bar",
  },
  normal: { text: "text-normal", bar: "bg-normal-bar", tint: "bg-normal-tint", rule: "border-normal-bar" },
};
