import { DonationProjectCard } from '@/components/ui/DonationProjectCard'
import { fetchDonationsByCharity } from '@/lib/api/getRelated'

/**
 * Spec 004a §3 — 公益團體介紹頁底部「捐款專案」cross-link 區。
 *
 * Async server component。並行 fetch（charity detail 在 parent RSC fetch 同
 * waterfall 層）— Next 16 RSC 預設可串行 await 但效能差異對 demo 不關鍵。
 *
 * 0 筆 → 整段不渲染（無「目前沒有專案」空狀態，spec 004a §5）。
 */
export async function RelatedProjects({ charityId }: { charityId: string }) {
  const donations = await fetchDonationsByCharity(charityId)
  if (donations.length === 0) return null
  return (
    <section className="px-3 py-6">
      <h2 className="text-base font-medium text-ink-AAA mb-3 px-2">
        捐款專案
      </h2>
      <div className="flex flex-col gap-3">
        {donations.map((d) => (
          <DonationProjectCard key={d.id} item={d} />
        ))}
      </div>
    </section>
  )
}
