lucide.createIcons();

const navItems = document.querySelectorAll(".nav-item");
const searchInput = document.getElementById("searchInput");
const searchableItems = document.querySelectorAll("[data-search]");
const emptyState = document.getElementById("emptyState");
const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");

    if (window.innerWidth <= 768) {
      sidebar.classList.remove("open");
    }
  });
});

menuBtn?.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (
    window.innerWidth <= 768 &&
    !sidebar.contains(e.target) &&
    !menuBtn.contains(e.target)
  ) {
    sidebar.classList.remove("open");
  }
});

searchInput.addEventListener("input", (e) => {
  const value = e.target.value.toLowerCase().trim();
  let visibleCount = 0;

  searchableItems.forEach((item) => {
    const text = item.dataset.search.toLowerCase();
    const match = text.includes(value);

    item.style.display = match ? "" : "none";
    if (match) visibleCount++;
  });

  emptyState.classList.toggle("hidden", visibleCount !== 0 || value === "");
});