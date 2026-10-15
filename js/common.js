/* Shared: stop the animated stripes for people who prefer reduced motion. */
(function () {
  'use strict';
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.stripe-bg svg').forEach(function (svg) {
        if (svg.pauseAnimations) svg.pauseAnimations();
      });
    }
  } catch (e) { /* ignore */ }
})();
