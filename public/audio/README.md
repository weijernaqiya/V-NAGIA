# ASYMPTOTE 音乐文件

- 标题主题曲放置为 `public/audio/title-theme.mp3`。
- 其他曲目放入 `public/audio/tracks/`，并在 `src/data/music.ts` 登记。
- 首页加载时只预载标题曲，不会绕过浏览器限制自动发声；用户在全站播放器中按播放后才开始有声播放。
- 不要提交没有明确授权的音频素材。
