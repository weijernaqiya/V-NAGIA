// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // 标题画面需要完整留白，本地预览时也不显示 Astro 开发工具条。
  devToolbar: {
    enabled: false,
  },
});
