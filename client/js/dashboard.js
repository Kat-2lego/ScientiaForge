document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menuBtn');
  const searchInput = document.getElementById('searchInput');
  const emptyState = document.getElementById('emptyState');
  const fileInput = document.getElementById('cvFileInput');
  const navItems = Array.from(document.querySelectorAll('.nav-item'));
  const sections = Array.from(document.querySelectorAll('main .searchable'));

  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const label = item.dataset.label;

      if (item.tagName === 'A' && item.getAttribute('href') && item.getAttribute('href') !== '#') {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        return;
      }

      e.preventDefault();

      if (label === 'CV Analyzer') {
        window.location.href = 'cvDashboard.html';
        return;
      }

      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  const uploadButtons = Array.from(document.querySelectorAll('.btn-primary, .action-row, .btn-secondary')).filter(btn => {
    const text = (btn.textContent || '').toLowerCase();
    return text.includes('upload cv') || text.includes('choose file') || text.includes('upload new cv');
  });

  uploadButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  });

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const fileName = fileInput.files?.[0]?.name;
      if (fileName) {
        const target = document.querySelector('.hero p');
        if (target) target.textContent = `Selected file: ${fileName}`;
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.toLowerCase().trim();
      let visible = 0;

      sections.forEach(el => {
        const text = (el.dataset.search || el.textContent || '').toLowerCase();
        const match = !term || text.includes(term);
        el.classList.toggle('hidden', !match);
        if (match) visible += 1;
      });

      if (emptyState) emptyState.classList.toggle('hidden', visible !== 0);
    });
  }

  if (window.lucide) lucide.createIcons();
});