// Sounify Pi Documentation Script
document.addEventListener('DOMContentLoaded', () => {
  // 1. Theme Management (Dark & Light)
  const themeToggleBtn = document.getElementById('theme-toggle');
  const iconSun = document.getElementById('icon-sun');
  const iconMoon = document.getElementById('icon-moon');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sounify-theme', theme);

    if (theme === 'light') {
      if (iconSun) iconSun.style.display = 'none';
      if (iconMoon) iconMoon.style.display = 'inline-block';
    } else {
      if (iconSun) iconSun.style.display = 'inline-block';
      if (iconMoon) iconMoon.style.display = 'none';
    }
  }

  // Detect saved theme or system preference
  const savedTheme = localStorage.getItem('sounify-theme') || 
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(savedTheme);

  themeToggleBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  // 2. Copy Code Helper
  window.copyCode = function(btn) {
    const codeBlock = btn.closest('.code-block');
    const code = codeBlock.querySelector('pre code').innerText;
    navigator.clipboard.writeText(code).then(() => {
      const orig = btn.innerText;
      btn.innerText = 'Copied!';
      btn.style.background = 'var(--accent)';
      btn.style.color = '#000000';
      setTimeout(() => {
        btn.innerText = orig;
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
    });
  };

  // 3. Mobile Sidebar Drawer
  const mobileBtn = document.getElementById('btn-mobile-menu');
  const sidebar = document.getElementById('docs-sidebar');

  mobileBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  sidebar?.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  });

  // 4. Scrollspy (Highlight Active Link in Sidebar & Table of Contents)
  const sections = document.querySelectorAll('article section[id]');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const tocLinks = document.querySelectorAll('.toc-link');

  function onScroll() {
    let currentId = '';
    const scrollPos = window.scrollY + 120;

    sections.forEach(sec => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      if (scrollPos >= top && scrollPos < top + height) {
        currentId = sec.getAttribute('id');
      }
    });

    if (currentId) {
      sidebarLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${currentId}`);
      });
      tocLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${currentId}`);
      });
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // 5. Live Search Filter
  const searchInput = document.getElementById('docs-search');
  searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    sections.forEach(sec => {
      const text = sec.textContent.toLowerCase();
      sec.style.display = (!query || text.includes(query)) ? 'block' : 'none';
    });

    // Also filter sidebar links if searching
    sidebarLinks.forEach(link => {
      const text = link.textContent.toLowerCase();
      const parentLi = link.closest('li');
      if (parentLi) {
        parentLi.style.display = (!query || text.includes(query)) ? 'block' : 'none';
      }
    });
  });
});
