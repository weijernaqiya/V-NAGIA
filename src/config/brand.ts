/*
 * ===== ASYMPTOTE 品牌素材入口 =====
 *
 * titleArtwork 为 null 时显示 TitleArtwork.astro 内置的极淡线稿占位图。
 * 正式自制 Logo / 插画完成后，把文件放入 public/images/brand/，
 * 再把这里改成对应的站点绝对路径，例如：
 *
 * titleArtwork: '/images/brand/asymptote-title-artwork.svg'
 *
 * SVG、PNG、WebP 都可以；组件会按现有构图尺寸整体承载，不需要重做首页。
 */
export const BRAND_ASSETS = Object.freeze({
  titleArtwork: null as string | null,
});
