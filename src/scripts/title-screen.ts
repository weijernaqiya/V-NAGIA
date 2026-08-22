import { FRAGMENT_TIMELINE } from '../config/fragmentTimeline';
import { TITLE_TIMELINE } from '../config/titleTimeline';
import { prepareTitleTrack } from './music-player-api';

type ScreenState = 'title' | 'transitioning' | 'fragments' | 'returning';
type InputModality = 'keyboard' | 'pointer';

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
  private readonly events = new AbortController();

  connectedCallback() {
    if (this.hasAttribute('data-enhanced')) return;

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
    this.beginSequence();
  }

  disconnectedCallback() {
    this.events.abort();
    if (this.titleReadyTimer !== undefined) window.clearTimeout(this.titleReadyTimer);
    if (this.screenTransitionTimer !== undefined) {
      window.clearTimeout(this.screenTransitionTimer);
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

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealDelay = reducedMotion
      ? TITLE_TIMELINE.reducedReveal
      : TITLE_TIMELINE.screenComplete;

    /*
     * 第二阶段入口只在标题稳定后进入键盘顺序，
     * 全站播放器会依据同一时间线自行显示，不再由 Title Screen 管理。
     */
    this.titleReadyTimer = window.setTimeout(() => {
      this.revealContinuePrompt();
      this.titleReadyTimer = undefined;
    }, revealDelay);
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
   * 手机第一次 Tap 只聚焦；第二次 Tap 目前保持 Focus，不执行 href。
   * 等内容页建立后，可在 wasFocused 分支接入真正导航。
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
