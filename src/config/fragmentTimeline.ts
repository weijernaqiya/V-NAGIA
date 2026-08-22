/*
 * ===== TITLE SCREEN → FRAGMENT SCREEN 统一时间线 =====
 *
 * 所有节点都以用户按下 PRESS / ENTER 为 0，单位为毫秒。
 * 面板出现次序、标题退后和最终可交互时间集中在这里，
 * 后续可直接按照正式音乐的具体时间点重新校准。
 */
export const FRAGMENT_TIMELINE = Object.freeze({
  continueExitComplete: 560,
  artworkMotionStart: 200,
  panelReveal: Object.freeze({
    writing: 500,
    photography: 700,
    music: 900,
    archive: 1100,
  }),
  logoRecedeStart: 1300,
  transitionComplete: 2000,
  returnComplete: 1500,
  panelTransitionDuration: 900,
  focusTransitionDuration: 680,
  reducedTransitionComplete: 320,
});

const seconds = (milliseconds: number) => `${milliseconds / 1000}s`;

/* CSS 与状态控制脚本共同消费上面的时间线，不保留第二套魔法数字。 */
export const getFragmentTimelineStyle = () => {
  const timeline = FRAGMENT_TIMELINE;

  const variables = {
    '--duration-continue-exit': seconds(timeline.continueExitComplete),
    '--delay-fragment-artwork': seconds(timeline.artworkMotionStart),
    '--delay-fragment-writing': seconds(timeline.panelReveal.writing),
    '--delay-fragment-photography': seconds(timeline.panelReveal.photography),
    '--delay-fragment-music': seconds(timeline.panelReveal.music),
    '--delay-fragment-archive': seconds(timeline.panelReveal.archive),
    '--delay-fragment-logo': seconds(timeline.logoRecedeStart),
    '--duration-fragment-panel': seconds(timeline.panelTransitionDuration),
    '--duration-fragment-focus': seconds(timeline.focusTransitionDuration),
    '--duration-fragment-return': seconds(timeline.returnComplete),
    '--duration-fragment-reduced': seconds(timeline.reducedTransitionComplete),
  } satisfies Record<string, string>;

  return Object.entries(variables)
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ');
};
