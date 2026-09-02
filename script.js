document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Loader ---------- */
  const loader = document.getElementById('loader');
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('is-hidden'), 500);
  });
  // Fallback in case 'load' takes too long / assets missing
  setTimeout(() => loader.classList.add('is-hidden'), 2200);

  /* ---------- Ambient sparkle field ---------- */
  const field = document.querySelector('.sparkle-field');
  const SPARKLE_COUNT = window.innerWidth < 640 ? 40 : 70;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const s = document.createElement('span');
    s.style.top = Math.random() * 100 + '%';
    s.style.left = Math.random() * 100 + '%';
    s.style.setProperty('--peak', (0.35 + Math.random() * 0.55).toFixed(2));
    s.style.animationDuration = (2.2 + Math.random() * 3.5).toFixed(2) + 's';
    s.style.animationDelay = (Math.random() * 4).toFixed(2) + 's';
    frag.appendChild(s);
  }
  field.appendChild(frag);

  /* ---------- Scroll progress bar ---------- */
  const progress = document.getElementById('progress');
  const updateProgress = () => {
    const h = document.documentElement;
    const scrolled = h.scrollTop;
    const height = h.scrollHeight - h.clientHeight;
    const pct = height > 0 ? (scrolled / height) * 100 : 0;
    progress.style.width = pct + '%';
  };
  document.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ---------- Tilt effect on project cards (pointer devices) ---------- */
  const tiltCards = document.querySelectorAll('[data-tilt]');
  const supportsHover = window.matchMedia('(hover: hover)').matches;

  if (supportsHover) {
    tiltCards.forEach(card => {
      const maxTilt = 7;

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const rotateY = (x - 0.5) * maxTilt * 2;
        const rotateX = (0.5 - y) * maxTilt * 2;
        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0)';
      });
    });
  } else {
    // Touch devices: a light "press" feedback instead of tilt
    tiltCards.forEach(card => {
      card.addEventListener('touchstart', () => {
        card.style.transform = 'scale(0.98)';
      }, { passive: true });
      card.addEventListener('touchend', () => {
        card.style.transform = 'scale(1)';
      }, { passive: true });
    });
  }

  /* ---------- Ripple effect on buttons / contact items ---------- */
  const rippleEls = document.querySelectorAll('[data-ripple]');
  rippleEls.forEach(el => {
    el.addEventListener('click', function (e) {
      const rect = this.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height) * 1.2;
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      this.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });

});
