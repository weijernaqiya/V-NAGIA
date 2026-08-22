import { TITLE_AUDIO, TITLE_TIMELINE } from '../config/titleTimeline';

type EnterMode = 'sound' | 'silent';

/*
 * 整个标题画面只有一个客户端控制器：
 * CSS/SVG 负责视觉形成，控制器只确定统一起点、启动音乐和维护声音状态。
 * 这样后续重新对齐正式音乐时，不需要在各组件间散落 setTimeout。
 */
class FiniteTitleScreen extends HTMLElement {
  private sequenceStarted = false;
  private sequenceStart = 0;
  private controlsReady = false;
  private audioFadeFrame: number | undefined;
  private readonly events = new AbortController();

  connectedCallback() {
    if (this.hasAttribute('data-enhanced')) return;

    this.setAttribute('data-enhanced', '');

    const signal = this.events.signal;
    this.querySelectorAll<HTMLButtonElement>('[data-enter-mode]').forEach((button) => {
      button.addEventListener(
        'click',
        () => this.beginSequence(button.dataset.enterMode === 'sound' ? 'sound' : 'silent'),
        { signal },
      );
    });

    this.querySelector<HTMLButtonElement>('[data-sound-toggle]')?.addEventListener(
      'click',
      () => this.toggleMute(),
      { signal },
    );

    this.querySelector<HTMLButtonElement>('[data-playback-toggle]')?.addEventListener(
      'click',
      () => this.togglePlayback(),
      { signal },
    );

    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && !this.sequenceStarted) {
          event.preventDefault();
          this.beginSequence('sound');
        }
      },
      { signal },
    );
  }

  disconnectedCallback() {
    this.events.abort();
    if (this.audioFadeFrame !== undefined) cancelAnimationFrame(this.audioFadeFrame);
  }

  private beginSequence(mode: EnterMode) {
    if (this.sequenceStarted) return;

    this.sequenceStarted = true;
    this.sequenceStart = performance.now();
    this.dataset.state = 'started';

    const prompt = this.querySelector<HTMLElement>('[data-enter-prompt]');
    prompt?.setAttribute('aria-hidden', 'true');
    prompt?.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });

    if (mode === 'sound') {
      void this.startAudio();
    } else {
      this.dataset.audio = 'muted';
      this.updateAudioControls();
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealDelay = reducedMotion
      ? TITLE_TIMELINE.reducedReveal
      : TITLE_TIMELINE.screenComplete;

    // 声音按钮在视觉出现后才进入键盘顺序，避免焦点落到不可见控件。
    window.setTimeout(() => this.revealAudioControls(), revealDelay);
  }

  private async startAudio() {
    const audio = this.querySelector<HTMLAudioElement>('[data-title-audio]');
    if (!audio) return;

    if (!audio.getAttribute('src')) {
      const source = audio.dataset.src;
      if (!source) {
        this.markAudioUnavailable(audio);
        return;
      }
      audio.src = source;
    }

    const sequenceElapsed = performance.now() - this.sequenceStart;
    audio.volume = sequenceElapsed >= TITLE_TIMELINE.titleComplete
      ? TITLE_AUDIO.targetVolume
      : 0;
    audio.muted = false;
    this.dataset.audio = 'loading';
    this.updateAudioControls();

    try {
      await audio.play();
      this.dataset.audio = 'playing';
      this.fadeAudioFromTimeline(audio);
      this.updateAudioControls();
    } catch {
      this.markAudioUnavailable(audio);
    }
  }

  private fadeAudioFromTimeline(audio: HTMLAudioElement) {
    if (this.audioFadeFrame !== undefined) cancelAnimationFrame(this.audioFadeFrame);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fadeStart = reducedMotion ? 0 : TITLE_TIMELINE.audioFadeStart;
    const fadeComplete = reducedMotion
      ? TITLE_TIMELINE.reducedAudioFadeComplete
      : TITLE_TIMELINE.titleComplete;

    const updateVolume = (now: number) => {
      const elapsed = now - this.sequenceStart;

      if (elapsed < fadeStart) {
        audio.volume = 0;
        this.audioFadeFrame = requestAnimationFrame(updateVolume);
        return;
      }

      const linearProgress = Math.min(
        1,
        Math.max(0, (elapsed - fadeStart) / Math.max(1, fadeComplete - fadeStart)),
      );
      const easedProgress = linearProgress * linearProgress * (3 - 2 * linearProgress);
      audio.volume = TITLE_AUDIO.targetVolume * easedProgress;

      if (linearProgress < 1) {
        this.audioFadeFrame = requestAnimationFrame(updateVolume);
      } else {
        this.audioFadeFrame = undefined;
      }
    };

    this.audioFadeFrame = requestAnimationFrame(updateVolume);
  }

  private toggleMute() {
    const audio = this.querySelector<HTMLAudioElement>('[data-title-audio]');
    if (!audio) return;

    if (!audio.getAttribute('src')) {
      void this.startAudio();
      return;
    }

    audio.muted = !audio.muted;
    this.dataset.audio = audio.muted ? 'muted' : audio.paused ? 'paused' : 'playing';
    this.updateAudioControls();
  }

  private async togglePlayback() {
    const audio = this.querySelector<HTMLAudioElement>('[data-title-audio]');
    if (!audio?.getAttribute('src')) return;

    if (!audio.paused) {
      audio.pause();
      this.dataset.audio = 'paused';
      this.updateAudioControls();
      return;
    }

    try {
      await audio.play();
      this.dataset.audio = audio.muted ? 'muted' : 'playing';
      this.updateAudioControls();
    } catch {
      this.markAudioUnavailable(audio);
    }
  }

  private revealAudioControls() {
    this.controlsReady = true;
    const controls = this.querySelector<HTMLElement>('[data-sound-controls]');
    controls?.removeAttribute('inert');
    this.updateAudioControls();
  }

  private markAudioUnavailable(audio: HTMLAudioElement) {
    if (this.audioFadeFrame !== undefined) cancelAnimationFrame(this.audioFadeFrame);
    this.audioFadeFrame = undefined;
    audio.pause();
    audio.removeAttribute('src');
    this.dataset.audio = 'unavailable';
    this.updateAudioControls();
  }

  private updateAudioControls() {
    const audio = this.querySelector<HTMLAudioElement>('[data-title-audio]');
    const controls = this.querySelector<HTMLElement>('[data-sound-controls]');
    const muteButton = this.querySelector<HTMLButtonElement>('[data-sound-toggle]');
    const playbackButton = this.querySelector<HTMLButtonElement>('[data-playback-toggle]');
    if (!audio || !controls || !muteButton || !playbackButton) return;

    const unavailable = this.dataset.audio === 'unavailable'
      || audio.dataset.trackAvailable !== 'true';
    const hasSource = Boolean(audio.getAttribute('src'));
    const muted = audio.muted || !hasSource;
    const paused = audio.paused && hasSource;

    controls.dataset.muted = String(muted);
    controls.dataset.playback = paused ? 'paused' : 'playing';
    controls.dataset.available = String(!unavailable);

    muteButton.disabled = !this.controlsReady || unavailable;
    muteButton.ariaPressed = String(muted);
    muteButton.ariaLabel = muted ? '开启标题音乐' : '静音标题音乐';

    playbackButton.disabled = !this.controlsReady || !hasSource || unavailable;
    playbackButton.ariaPressed = String(paused);
    playbackButton.ariaLabel = paused ? '恢复标题音乐' : '暂停标题音乐';
  }
}

if (!customElements.get('finite-title-screen')) {
  customElements.define('finite-title-screen', FiniteTitleScreen);
}
