# ASYMPTOTE 音乐文件

- 标题主题曲当前放置为 `public/audio/title-theme.flac`。
- 其他曲目放入 `public/audio/tracks/`，再到 `src/data/music.ts` 登记曲目、专辑与艺人资料。
- 播放器结构支持 FLAC、MP3、AAC、M4A、WAV、OGG 与 OPUS；公开网站优先准备 FLAC + MP3/AAC 兼容源会更稳妥。
- 首页只预载 metadata，不绕过浏览器限制自动发声；用户在全站播放器按播放后才开始有声播放。
- `public/` 下的文件会随静态网站公开发布。私人或没有公开授权的音频不应放在这里；未来应通过带权限的服务器媒体接口提供。
- 不要修改原始音频来伪造 Tag、抓轨日志或校验结果。
