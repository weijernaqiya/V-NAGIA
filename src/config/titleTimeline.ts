/*
 * ===== FINITE FOREVER 标题动画统一时间轴 =====
 *
 * 所有数值都以用户按下 ENTER 的瞬间为 0，单位为毫秒。
 * 后续拿到正式主题音乐的时间点后，只需要在这里重新校准，
 * 不必分别寻找 SVG、CSS 和音频脚本中的独立延时。
 */
export const TITLE_TIMELINE = Object.freeze({
  // 首次进入时，入口文字从纯白中出现。
  promptReveal: 650,

  // ENTER 淡出完成，画面重新回到近乎纯白。
  entryFadeComplete: 800,

  // 音乐已经静默启动，并从此处开始逐渐获得音量。
  audioFadeStart: 800,

  // 第一条无法立即辨认的标题线迹出现。
  traceStart: 1200,

  // 两个单词开始沿字形形成。
  finiteStart: 1700,
  foreverStart: 2400,

  // 标题约一半可辨认，淡蓝灰的凝结雾迹开始出现。
  titleHalfReadable: 3200,

  // 占位艺术图的主线与次级细节依次出现。
  artworkStart: 4000,
  artworkSecondaryStart: 5200,

  // 两个单词的轮廓绘制分别完成。
  finiteTraceComplete: 5000,
  foreverTraceComplete: 5800,

  // 轮廓开始凝结为实体文字，随后标题稳定。
  fillStart: 6500,
  titleComplete: 7200,

  // 艺术图与整个标题画面依次进入静止状态。
  artworkComplete: 7800,
  screenComplete: 8500,

  // 最后出现极轻的署名。
  creditReveal: 9000,

  // 减少动画模式下不让用户等待完整时间轴。
  reducedReveal: 500,
  reducedAudioFadeComplete: 1200,
});

export const TITLE_AUDIO = Object.freeze({
  path: '/audio/title-theme.mp3',
  targetVolume: 0.42,
});

const seconds = (milliseconds: number) => `${milliseconds / 1000}s`;

/*
 * CSS 只消费这些变量，不再保存另一套绝对时间。
 * 派生时长同样在这里计算，保证视觉与音乐共用同一时钟。
 */
export const getTitleTimelineStyle = () => {
  const timeline = TITLE_TIMELINE;

  const variables = {
    '--delay-prompt-reveal': seconds(timeline.promptReveal),
    '--duration-entry-exit': seconds(timeline.entryFadeComplete),
    '--delay-trace-start': seconds(timeline.traceStart),
    '--delay-finite-start': seconds(timeline.finiteStart),
    '--delay-forever-start': seconds(timeline.foreverStart),
    '--delay-title-half': seconds(timeline.titleHalfReadable),
    '--delay-artwork-start': seconds(timeline.artworkStart),
    '--delay-artwork-secondary': seconds(timeline.artworkSecondaryStart),
    '--delay-fill-start': seconds(timeline.fillStart),
    '--delay-screen-complete': seconds(timeline.screenComplete),
    '--delay-credit-reveal': seconds(timeline.creditReveal),
    '--duration-finite-trace': seconds(
      timeline.finiteTraceComplete - timeline.finiteStart,
    ),
    '--duration-forever-trace': seconds(
      timeline.foreverTraceComplete - timeline.foreverStart,
    ),
    '--duration-title-mist': seconds(
      timeline.titleComplete - timeline.titleHalfReadable,
    ),
    '--duration-title-fill': seconds(
      timeline.titleComplete - timeline.fillStart,
    ),
    '--duration-artwork': seconds(
      timeline.artworkComplete - timeline.artworkStart,
    ),
    '--duration-artwork-secondary': seconds(
      timeline.artworkComplete - timeline.artworkSecondaryStart,
    ),
    '--duration-reduced-reveal': seconds(timeline.reducedReveal),
  } satisfies Record<string, string>;

  return Object.entries(variables)
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ');
};
