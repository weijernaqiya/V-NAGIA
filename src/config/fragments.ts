export type FragmentId = 'writing' | 'image' | 'cinema' | 'music' | 'games';

export type FragmentLabelPosition =
  | 'left-major'
  | 'upper-middle'
  | 'upper-right'
  | 'lower-middle'
  | 'lower-right';

export interface FragmentSection {
  id: FragmentId;
  title: string;
  titleZh: string;
  description: string;
  href: string;
  image: string | null;
  imagePosition: string;
  color: string;
  className: string;
  labelPosition: FragmentLabelPosition;
}

/*
 * 切面内容统一由这份数据驱动。
 * 当前用低对比度纯色验证五分区构图；未来加入正式图片时，
 * 只需填写 image 和 imagePosition，不需要改组件或 polygon。
 */
export const FRAGMENTS = Object.freeze([
  {
    id: 'writing',
    title: 'WRITING',
    titleZh: '文字',
    description: '文学 / 小说 / 思考',
    href: '/writing',
    image: null,
    imagePosition: 'center',
    color: '#e5eaec',
    className: 'fragment-panel--writing',
    labelPosition: 'left-major',
  },
  {
    id: 'image',
    title: 'IMAGE',
    titleZh: '影像',
    description: '摄影 / 绘画 / 视频',
    href: '/image',
    image: null,
    imagePosition: 'center',
    color: '#efede8',
    className: 'fragment-panel--image',
    labelPosition: 'upper-middle',
  },
  {
    id: 'cinema',
    title: 'CINEMA',
    titleZh: '电影',
    description: '电影 / 动画 / 影像研究',
    href: '/cinema',
    image: null,
    imagePosition: 'center',
    color: '#e7eae9',
    className: 'fragment-panel--cinema',
    labelPosition: 'upper-right',
  },
  {
    id: 'music',
    title: 'MUSIC',
    titleZh: '音乐',
    description: '音乐 / CD / Audio',
    href: '/music',
    image: null,
    imagePosition: 'center',
    color: '#dfe7eb',
    className: 'fragment-panel--music',
    labelPosition: 'lower-middle',
  },
  {
    id: 'games',
    title: 'GAMES',
    titleZh: '游戏',
    description: '游戏 / Galgame / 互动媒体',
    href: '/games',
    image: null,
    imagePosition: 'center',
    color: '#ece8e1',
    className: 'fragment-panel--games',
    labelPosition: 'lower-right',
  },
] satisfies readonly FragmentSection[]);
