export type FragmentId = 'writing' | 'photography' | 'music' | 'archive';

export type FragmentLabelPosition =
  | 'upper-left'
  | 'upper-right'
  | 'lower-left'
  | 'lower-right';

export interface FragmentSection {
  id: FragmentId;
  title: string;
  href: string;
  image: string | null;
  color: string;
  className: string;
  labelPosition: FragmentLabelPosition;
}

/*
 * 切面内容统一由这份数据驱动。
 * 第一版用低对比度纯色验证构图；未来加入正式图片时，
 * 只需把 image 改为 public 目录下的路径，不需要重写组件。
 */
export const FRAGMENTS = Object.freeze([
  {
    id: 'writing',
    title: 'WRITING',
    href: '/writing',
    image: null,
    color: '#e9edef',
    className: 'fragment-panel--writing',
    labelPosition: 'upper-left',
  },
  {
    id: 'photography',
    title: 'PHOTOGRAPHY',
    href: '/photography',
    image: null,
    color: '#f0ede8',
    className: 'fragment-panel--photography',
    labelPosition: 'upper-right',
  },
  {
    id: 'music',
    title: 'MUSIC',
    href: '/music',
    image: null,
    color: '#e2eaee',
    className: 'fragment-panel--music',
    labelPosition: 'lower-left',
  },
  {
    id: 'archive',
    title: 'ARCHIVE',
    href: '/archive',
    image: null,
    color: '#ebe8e1',
    className: 'fragment-panel--archive',
    labelPosition: 'lower-right',
  },
] satisfies readonly FragmentSection[]);
