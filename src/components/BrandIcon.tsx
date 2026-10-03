import type { Platform } from '../lib/presets'

/**
 * Biểu tượng một màu (theo màu chữ) của Facebook, Instagram, TikTok, cỡ như icon lucide, để nhận ra nền tảng nhanh hơn
 * đọc tên.
 */
export function BrandIcon({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === 'instagram')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className={className} aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5.5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      {platform === 'facebook' ? (
        // Vòng tròn với chữ "f" khoét rỗng, chân chữ chạm mép dưới như logo gốc.
        <path d="M12 2a10 10 0 0 0-1.6 19.87V14.9H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.45 2.9h-2.35v6.97A10 10 0 0 0 12 2Z" />
      ) : (
        // Nốt nhạc của TikTok.
        <path d="M16.6 2h-3.3v13.2a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.2 6.2 0 1 0 5.3 6.2V8.6a7.7 7.7 0 0 0 4.4 1.4V6.7a4.4 4.4 0 0 1-4.4-4.4V2Z" />
      )}
    </svg>
  )
}
