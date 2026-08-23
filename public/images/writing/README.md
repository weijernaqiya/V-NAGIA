# WRITING 图片目录

- 小说封面：`public/images/writing/fiction/<novel-slug>/cover.webp`
- 小说横幅：`public/images/writing/fiction/<novel-slug>/hero.webp`
- 章节插图：`public/images/writing/fiction/<novel-slug>/<chapter-slug>/`
- 文章图片：`public/images/writing/articles/<article-slug>/`
- 分享封面：`public/images/writing/social/`

在 `src/data/writing.ts` 的 `cover`、`heroImage` 或 `shareImage` 中登记以 `/images/writing/` 开头的公开路径。
图片字段不是必填；没有图片时，现有纯文字扉页会继续完整显示。
