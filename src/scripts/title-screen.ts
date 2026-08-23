import { FRAGMENT_TIMELINE } from '../config/fragmentTimeline';
import { TITLE_TIMELINE } from '../config/titleTimeline';
import { navigate } from 'astro:transitions/client';
import { prepareTitleTrack } from './music-player-api';

type ScreenState = 'title' | 'transitioning' | 'fragments' | 'returning';
type InputModality = 'keyboard' | 'pointer';
type FragmentTheme = 'dark' | 'light';
const SECTION_THEME_KEY = 'asymptote.section.theme.v1';

/*
 * 整个标题画面只有一个客户端控制器：
 * CSS/SVG 负责视觉形成，控制器只确定统一起点并维护页面状态。
 * 标题音乐会被预载，但在用户操作播放器前不会尝试有声自动播放。
 * 这样后续重新对齐正式音乐时，不需要在各组件间散落 setTimeout。
 */
class AsymptoteTitleScreen extends HTMLElement {
  private sequenceStarted = false;
  private sequenceStart = 0;
  private continueReady = false;
  private screenState: ScreenState = 'title';
  private focusedFragment: string | null = null;
  private inputModality: InputModality = 'keyboard';
  private lastPointerType = '';
  private titleReadyTimer: number | undefined;
  private screenTransitionTimer: number | undefined;
  private events = new AbortController();

  connectedCallback() {
    if (this.hasAttribute('data-enhanced') && !this.events.signal.aborted) return;

    /*
     * ClientRouter 的历史恢复可能重新挂载原来的首页节点。
     * disconnectedCallback 已注销旧事件，因此重连时必须建立新的控制器；
     * 不能因为节点仍带 data-enhanced 就留下一个“看得见但无法点击”的切面。
     */
    if (this.events.signal.aborted) this.events = new AbortController();

    /*
     * 首页 head 中的无脚本保护计时器可能在离开首页后才执行；ClientRouter
     * 又会保留同一份 documentElement，于是它曾把全局 js 标记从后续首页移除。
     * 自定义元素能连接就已经证明增强脚本可用，因此每次挂载都在这里恢复标记，
     * 确保 PRESS / ENTER 与切面层不会被无脚本降级样式永久隐藏。
     */
    document.documentElement.classList.add('js');

    this.setAttribute('data-enhanced', '');

    const signal = this.events.signal;
    this.querySelector<HTMLButtonElement>('[data-fragment-enter]')?.addEventListener(
      'click',
      () => this.beginFragmentTransition(),
      { signal },
    );

    this.querySelector<HTMLButtonElement>('[data-fragment-back]')?.addEventListener(
      'click',
      () => this.returnToTitle(),
      { signal },
    );

    this.querySelector<HTMLButtonElement>('[data-fragment-theme-toggle]')?.addEventListener(
      'click',
      () => this.setFragmentTheme(this.dataset.fragmentTheme === 'dark' ? 'light' : 'dark'),
      { signal },
    );

    const storedTheme = window.localStorage.getItem(SECTION_THEME_KEY);
    this.setFragmentTheme(storedTheme === 'light' ? 'light' : 'dark', false);

    const fragmentPanels = this.querySelectorAll<HTMLButtonElement>('[data-fragment-id]');
    fragmentPanels.forEach((panel) => {
      panel.addEventListener(
        'pointerdown',
        (event) => {
          this.inputModality = 'pointer';
          this.lastPointerType = event.pointerType;
        },
        { signal },
      );

      panel.addEventListener(
        'pointerenter',
        (event) => this.handleFragmentPointerEnter(event, panel),
        { signal },
      );

      panel.addEventListener(
        'focusin',
        () => {
          if (this.inputModality === 'keyboard') this.focusFragment(panel);
        },
        { signal },
      );

      panel.addEventListener(
        'click',
        (event) => this.handleFragmentActivation(event, panel),
        { signal },
      );
    });

    this.querySelector<HTMLElement>('[data-fragment-canvas]')?.addEventListener(
      'pointerleave',
      () => {
        if (this.inputModality === 'pointer') this.clearFragmentFocus();
      },
      { signal },
    );

    this.querySelector<HTMLElement>('[data-fragment-screen]')?.addEventListener(
      'focusout',
      () => {
        queueMicrotask(() => {
          if (this.inputModality !== 'keyboard') return;
          const activeElement = document.activeElement;
          if (!(activeElement instanceof Element)
            || !activeElement.closest('[data-fragment-id]')) {
            this.clearFragmentFocus();
          }
        });
      },
      { signal },
    );

    this.querySelector<HTMLElement>('[data-fragment-focus-reset]')?.addEventListener(
      'pointerdown',
      (event) => {
        this.inputModality = 'pointer';
        this.lastPointerType = event.pointerType;
        this.clearFragmentFocus(true);
      },
      { signal },
    );

    window.addEventListener(
      'keydown',
      (event) => this.handleKeydown(event),
      { signal },
    );

    // 首次声音选择已经移除：组件完成接管后立即从统一时间轴开始形成 Logo。
    if (!this.sequenceStarted) {
      this.beginSequence();
    } else {
      this.resumeAfterReconnect();
    }
  }

  disconnectedCallback() {
    this.events.abort();
    if (this.titleReadyTimer !== undefined) {
      window.clearTimeout(this.titleReadyTimer);
      this.titleReadyTimer = undefined;
    }
    if (this.screenTransitionTimer !== undefined) {
      window.clearTimeout(this.screenTransitionTimer);
      this.screenTransitionTimer = undefined;
    }
  }

  private beginSequence() {
    if (this.sequenceStarted) return;

    this.sequenceStarted = true;
    this.sequenceStart = performance.now();
    this.dataset.state = 'started';

    /*
     * TitleScreen 的模块可能先于全局播放器模块执行。
     * 等播放器自定义元素注册完成后再发送预载事件，避免自动启动时丢失事件；
     * 这段等待不阻塞视觉时间轴，也不会让缺少音频文件的页面失效。
     */
    void customElements.whenDefined('asymptote-music-player').then(() => {
      if (this.isConnected) prepareTitleTrack(this.sequenceStart);
    });

    this.scheduleContinueReveal();
  }

  private scheduleContinueReveal() {
    if (this.titleReadyTimer !== undefined || this.continueReady) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealAt = reducedMotion
      ? TITLE_TIMELINE.reducedReveal
      : TITLE_TIMELINE.screenComplete;
    const elapsed = this.sequenceStart > 0 ? performance.now() - this.sequenceStart : 0;

    /*
     * 第二阶段入口只在标题稳定后进入键盘顺序。历史恢复时按原始起点计算余量，
     * 已经过完时间轴的页面会立即恢复可操作状态，而不是重新等待整段动画。
     */
    this.titleReadyTimer = window.setTimeout(() => {
      this.revealContinuePrompt();
      this.titleReadyTimer = undefined;
    }, Math.max(0, revealAt - elapsed));
  }

  private resumeAfterReconnect() {
    if (!this.continueReady) this.scheduleContinueReveal();

    if (this.screenState === 'transitioning') {
      this.completeFragmentTransition();
      return;
    }
    if (this.screenState === 'returning') {
      this.completeReturnToTitle();
      return;
    }

    const fragmentScreen = this.querySelector<HTMLElement>('[data-fragment-screen]');
    const inFragments = this.screenState === 'fragments';
    fragmentScreen?.setAttribute('aria-hidden', String(!inFragments));
    fragmentScreen?.toggleAttribute('inert', !inFragments);

    const continueButton = this.querySelector<HTMLButtonElement>('[data-fragment-enter]');
    if (continueButton && this.screenState === 'title') {
      continueButton.disabled = !this.continueReady;
    }
  }

  private handleKeydown(event: KeyboardEvent) {
    const target = event.target instanceof Element ? event.target : null;

    if (event.key === 'Tab') this.inputModality = 'keyboard';

    if (event.key === 'Escape' && this.screenState !== 'title') {
      event.preventDefault();
      this.returnToTitle();
      return;
    }

    if (event.key !== 'Enter') return;

    if (this.screenState !== 'title' || !this.continueReady) return;

    const interactiveTarget = target?.closest('button, a, input, select, textarea');
    if (interactiveTarget && !interactiveTarget.matches('[data-fragment-enter]')) return;

    event.preventDefault();
    this.beginFragmentTransition();
  }

  /*
   * TITLE → FRAGMENT 只由这一处切换状态。
   * CSS 读取 data-screen-state 展开切面，脚本只在统一时间线结束时开放交互。
   */
  private beginFragmentTransition() {
    if (!this.continueReady || this.screenState !== 'title') return;

    this.clearFragmentFocus();
    this.setScreenState('transitioning');

    const continueButton = this.querySelector<HTMLButtonElement>('[data-fragment-enter]');
    continueButton?.setAttribute('disabled', '');

    const fragmentScreen = this.querySelector<HTMLElement>('[data-fragment-screen]');
    fragmentScreen?.setAttribute('aria-hidden', 'true');
    fragmentScreen?.setAttribute('inert', '');

    this.scheduleScreenState(
      () => this.completeFragmentTransition(),
      this.getScreenTransitionDuration('enter'),
    );
  }

  private completeFragmentTransition() {
    if (this.screenState !== 'transitioning') return;

    this.setScreenState('fragments');

    const fragmentScreen = this.querySelector<HTMLElement>('[data-fragment-screen]');
    fragmentScreen?.setAttribute('aria-hidden', 'false');
    fragmentScreen?.removeAttribute('inert');
    fragmentScreen?.focus({ preventScroll: true });
  }

  /* 切面收回时不刷新页面，标题音乐也保持当前播放位置。 */
  private returnToTitle() {
    if (this.screenState === 'title' || this.screenState === 'returning') return;

    this.clearFragmentFocus();

    const fragmentScreen = this.querySelector<HTMLElement>('[data-fragment-screen]');
    fragmentScreen?.setAttribute('aria-hidden', 'true');
    fragmentScreen?.setAttribute('inert', '');

    this.setScreenState('returning');
    this.scheduleScreenState(
      () => this.completeReturnToTitle(),
      this.getScreenTransitionDuration('return'),
    );
  }

  private completeReturnToTitle() {
    if (this.screenState !== 'returning') return;

    this.setScreenState('title');

    const continueButton = this.querySelector<HTMLButtonElement>('[data-fragment-enter]');
    if (continueButton && this.continueReady) {
      continueButton.disabled = false;
      continueButton.focus({ preventScroll: true });
    }
  }

  private setScreenState(state: ScreenState) {
    this.screenState = state;
    this.dataset.screenState = state;
  }

  /* 五分区与各内容板块共用同一个主题选择，标题画面的白色本身不受影响。 */
  private setFragmentTheme(theme: FragmentTheme, persist = true) {
    this.dataset.fragmentTheme = theme;
    const button = this.querySelector<HTMLButtonElement>('[data-fragment-theme-toggle]');
    const label = button?.querySelector<HTMLElement>('[data-fragment-theme-label]');
    if (button) button.ariaPressed = String(theme === 'dark');
    if (label) label.textContent = theme === 'dark' ? '切换至浅色' : '切换至深色';
    if (persist) window.localStorage.setItem(SECTION_THEME_KEY, theme);
  }

  private scheduleScreenState(callback: () => void, delay: number) {
    if (this.screenTransitionTimer !== undefined) {
      window.clearTimeout(this.screenTransitionTimer);
    }

    this.screenTransitionTimer = window.setTimeout(() => {
      this.screenTransitionTimer = undefined;
      callback();
    }, delay);
  }

  private getScreenTransitionDuration(direction: 'enter' | 'return') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return FRAGMENT_TIMELINE.reducedTransitionComplete;
    }

    return direction === 'enter'
      ? FRAGMENT_TIMELINE.transitionComplete
      : FRAGMENT_TIMELINE.returnComplete;
  }

  /*
   * 桌面端只有真正具备 Hover 的精细指针才响应 pointerenter。
   * 触屏产生的兼容鼠标事件不会在第一次 Tap 时绕过 Focus 阶段。
   */
  private handleFragmentPointerEnter(event: PointerEvent, panel: HTMLButtonElement) {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!canHover || event.pointerType === 'touch') return;

    this.inputModality = 'pointer';
    this.lastPointerType = event.pointerType;
    this.focusFragment(panel);
  }

  /*
   * 手机第一次 Tap 只聚焦；第二次 Tap 才进入已经完成的栏目。
   * 桌面 Hover / 键盘 Focus 已经先建立 Focus，因此第一次确认即可进入。
   * 尚未完成的栏目保持原型状态，不会跳向不存在的路由。
   */
  private handleFragmentActivation(event: MouseEvent, panel: HTMLButtonElement) {
    if (this.screenState !== 'fragments') return;

    event.preventDefault();

    const fragmentId = panel.dataset.fragmentId;
    if (!fragmentId) return;

    const usesTapFocus = this.inputModality === 'pointer'
      && (this.lastPointerType === 'touch'
        || window.matchMedia('(hover: none), (pointer: coarse)').matches);
    const wasFocused = this.focusedFragment === fragmentId;

    this.setFocusedFragment(fragmentId);

    if (usesTapFocus && !wasFocused) {
      panel.focus({ preventScroll: true });
      return;
    }

    const href = panel.dataset.fragmentHref;
    if (wasFocused && panel.dataset.fragmentReady === 'true' && href) {
      /*
       * 使用 ClientRouter 导航而不是整页刷新，transition:persist 才能保留
       * 同一个播放器媒体元素、当前曲目与播放位置，进入板块时音乐不会重启。
       */
      void navigate(href);
    }
  }

  private focusFragment(panel: HTMLButtonElement) {
    if (this.screenState !== 'fragments') return;

    const fragmentId = panel.dataset.fragmentId;
    if (fragmentId) this.setFocusedFragment(fragmentId);
  }

  private setFocusedFragment(fragmentId: string) {
    if (this.screenState !== 'fragments' || this.focusedFragment === fragmentId) return;

    this.focusedFragment = fragmentId;
    this.dataset.focusedFragment = fragmentId;
    this.querySelectorAll<HTMLButtonElement>('[data-fragment-id]').forEach((panel) => {
      panel.ariaPressed = String(panel.dataset.fragmentId === fragmentId);
    });
  }

  private clearFragmentFocus(moveFocusToScreen = false) {
    if (this.focusedFragment === null && !this.hasAttribute('data-focused-fragment')) return;

    this.focusedFragment = null;
    this.removeAttribute('data-focused-fragment');
    this.querySelectorAll<HTMLButtonElement>('[data-fragment-id]').forEach((panel) => {
      panel.ariaPressed = 'false';
    });

    if (moveFocusToScreen && this.screenState === 'fragments') {
      this.querySelector<HTMLElement>('[data-fragment-screen]')?.focus({ preventScroll: true });
    }
  }

  private revealContinuePrompt() {
    this.continueReady = true;
    const continueButton = this.querySelector<HTMLButtonElement>('[data-fragment-enter]');
    if (continueButton && this.screenState === 'title') continueButton.disabled = false;
  }

}

if (!customElements.get('asymptote-title-screen')) {
  customElements.define('asymptote-title-screen', AsymptoteTitleScreen);
}
