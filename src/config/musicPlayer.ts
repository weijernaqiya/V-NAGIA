/*
 * ===== ASYMPTOTE 全站播放器参数 =====
 *
 * 音量、淡入淡出与面板展开速度集中在这里。
 * 后续根据正式音乐重新校准时，不需要修改播放器状态机。
 */
export const MUSIC_PLAYER_CONFIG = Object.freeze({
  defaultVolume: 0.42,
  switchFadeOutDuration: 520,
  switchFadeInDuration: 760,
  pauseFadeDuration: 260,
  resumeFadeDuration: 420,
  expandDuration: 420,
  progressSteps: 1000,
});

export const getMusicPlayerStyle = () => [
  `--player-expand-duration: ${MUSIC_PLAYER_CONFIG.expandDuration / 1000}s`,
].join('; ');
