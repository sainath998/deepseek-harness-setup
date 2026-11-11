window.__ModuleLoader__.load({
  id: '@local/fast-animations',
  factory() {
    // Every finite animation or transition finishes in at most this many milliseconds.
    const TARGET_MS = 50;
    const CSS = `
:root, body {
  --ds-transition-duration: 0.05s !important;
  --ds-transition-duration-fast: 0.05s !important;
  --ds-transition-duration-slow: 0.05s !important;
}
`;
    // Looping animations (spinners, shimmers) keep their speed; only one-shot motion is compressed.
    function speedUp(animation) {
      try {
        const timing = animation.effect?.getComputedTiming?.();
        if (!timing || timing.iterations === Infinity) return;
        const total = (Number(timing.delay) || 0) + (Number(timing.activeDuration) || 0);
        if (total <= TARGET_MS) return;
        const rate = total / TARGET_MS;
        if (animation.playbackRate !== rate) animation.updatePlaybackRate(rate);
      } catch { /* leave this animation alone */ }
    }
    function onStart(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      for (const animation of target.getAnimations()) speedUp(animation);
    }
    return {
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.id = 'local-fast-animations';
          style.textContent = CSS;
          document.head.appendChild(style);
          const events = ['transitionrun', 'animationstart'];
          for (const name of events) document.addEventListener(name, onStart, true);
          // Script-driven animations (Element.animate) are compressed the same way.
          const original = Element.prototype.animate;
          Element.prototype.animate = function (...args) {
            const animation = original.apply(this, args);
            speedUp(animation);
            return animation;
          };
          for (const animation of document.getAnimations()) speedUp(animation);
          return () => {
            Element.prototype.animate = original;
            for (const name of events) document.removeEventListener(name, onStart, true);
            style.remove();
          };
        }, 'fast-animations: motion speed');
      },
    };
  },
});
