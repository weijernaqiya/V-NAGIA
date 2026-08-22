# ASYMPTOTE 字体文件

- 仅在确认字体网页嵌入许可后，把 WOFF2 文件放入此目录。
- 在 `src/styles/title-screen.css` 顶部添加 `@font-face`，再修改 `.logo__word` 的字体栈。
- 未提供授权字体时，网站继续使用现有系统 Serif 回退，不会向网络请求第三方字体。
