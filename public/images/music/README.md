# MUSIC 图像文件

- 专辑封面建议放在 `public/images/music/albums/`。
- 艺人图像建议放在 `public/images/music/artists/`。
- CD 实体照片建议放在 `public/images/music/cd/<release-slug>/`。
- 推荐使用 WebP、AVIF 或经过压缩的 JPEG；正方形封面建议至少 1200×1200。
- 放好图片后，在 `src/data/music.ts` 对应条目的 `artwork` 或 `portrait` 字段填写以 `/images/music/` 开头的公开路径。
- 缺少图片时页面会显示 ASYMPTOTE 原生占位封面，不会出现破损图片图标。
