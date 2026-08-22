/*
 * ===== ASYMPTOTE 标题动画统一时间轴 =====
 *
 * 所有数值都以标题页完成客户端接管的瞬间为 0，单位为毫秒。
 * 页面不再等待声音选择；加载后会直接从这条时间轴开始形成 Logo。
 * 后续拿到正式主题音乐的时间点后，只需要在这里重新校准，
 * 不必分别寻找 SVG、CSS 和音频脚本中的独立延时。
 */
export const TITLE_TIMELINE = Object.freeze({
  // 第一条无法立即辨认的标题线迹出现。
  traceStart: 1200,

  // 主标题沿字形形成，标题下方的渐近箭头随即开始向右延伸。
  wordTraceStart: 1700,
  approachLineStart: 1900,

  // 标题约一半可辨认，淡蓝灰的凝结雾迹开始出现。
  titleHalfReadable: 3200,

  // 占位艺术图的主线与次级细节依次出现。
  artworkStart: 4000,
  artworkSecondaryStart: 5200,

  // 主标题轮廓绘制完成。
  wordTraceComplete: 5800,

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
});

const seconds = (milliseconds: number) => `${milliseconds / 1000}s`;

/*
 * CSS 只消费这些变量，不再保存另一套绝对时间。
 * 派生时长同样在这里计算，保证视觉与音乐共用同一时钟。
 */
export const getTitleTimelineStyle = () => {
  const timeline = TITLE_TIMELINE;

  const variables = {
    '--delay-trace-start': seconds(timeline.traceStart),
    '--delay-word-trace-start': seconds(timeline.wordTraceStart),
    '--delay-approach-line': seconds(timeline.approachLineStart),
    '--delay-word-trace-complete': seconds(timeline.wordTraceComplete),
    '--delay-title-half': seconds(timeline.titleHalfReadable),
    '--delay-artwork-start': seconds(timeline.artworkStart),
    '--delay-artwork-secondary': seconds(timeline.artworkSecondaryStart),
    '--delay-fill-start': seconds(timeline.fillStart),
    '--delay-screen-complete': seconds(timeline.screenComplete),
    '--delay-credit-reveal': seconds(timeline.creditReveal),
    '--duration-word-trace': seconds(
      timeline.wordTraceComplete - timeline.wordTraceStart,
    ),
    '--duration-approach-line': seconds(
      timeline.wordTraceComplete - timeline.approachLineStart,
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
