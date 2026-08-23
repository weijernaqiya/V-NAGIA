export interface CreativeSection {
  id: 'image' | 'cinema' | 'games';
  name: string;
  index: string;
  description: string;
  categories: readonly string[];
}

/*
 * 尚未进入完整开发阶段的三个板块先共用同一份中文入口数据。
 * 页面是真实路由而不是 404；后续开发时可以逐个替换内部内容，
 * 共用的深色主题、播放器和全站标题不需要重新实现。
 */
export const CREATIVE_SECTIONS = Object.freeze([
  {
    id: 'image',
    name: '影像',
    index: '02',
    description: '保存摄影、绘画与动态影像的视觉档案。',
    categories: ['摄影', '绘画', '视频'],
  },
  {
    id: 'cinema',
    name: '电影',
    index: '03',
    description: '记录电影、动画以及关于影像形式的观察。',
    categories: ['电影', '动画', '影像研究'],
  },
  {
    id: 'games',
    name: '游戏',
    index: '05',
    description: '整理游戏、视觉小说与互动媒体经验。',
    categories: ['游戏', '视觉小说', '互动媒体'],
  },
] satisfies readonly CreativeSection[]);
