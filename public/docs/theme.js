// Light / dark theme for the docs pages. Same saved choice as the app
// (localStorage 'xps-irf-theme', see src/lib/theme.ts), so the docs open in the
// app's theme and a change here carries back to the app. Loaded in <head>
// without defer, so the theme is set before first paint.
(function () {
  const KEY = 'xps-irf-theme';
  const root = document.documentElement;

  function savedTheme() {
    try {
      return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  // ☾ in the light theme, ☀ in the dark one, like the app's button
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-toggle').forEach(function (button) {
      button.textContent = theme === 'light' ? '☾' : '☀';
    });
  }

  apply(savedTheme());

  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-theme'));
    document.querySelectorAll('.theme-toggle').forEach(function (button) {
      button.addEventListener('click', function () {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        apply(next);
        try {
          localStorage.setItem(KEY, next);
        } catch (e) {
          // Not persisted; the choice still holds for this page
        }
      });
    });
  });

  // The theme changed in another tab (the app or another docs page)
  window.addEventListener('storage', function (event) {
    if (event.key === KEY) apply(savedTheme());
  });
})();
