
export function setupMobileMenu() {
  const hamburgerMenu = document.getElementById('hamburger') as HTMLImageElement;
  const closeMenu = document.getElementById('close-menu') as HTMLImageElement;
  const navMenu = document.querySelector('.main-nav') as HTMLElement;

  if (!hamburgerMenu || !closeMenu || !navMenu) return;

  const toggleMenu = (isOpening: boolean) => {
    if (isOpening) {
      navMenu.classList.remove('hidden', 'md:flex');
      navMenu.classList.add(
        'fixed', 'flex', 'flex-col',
        'top-16', 'left-0', 'right-0',
        'bg-dark', 'p-4', 'space-y-4',
        'border-t', 'border-gray-800', 'z-40'
      );
      closeMenu.classList.remove('hidden');
      hamburgerMenu.classList.add('hidden');
    } else {
      navMenu.classList.add('hidden', 'md:flex');
      navMenu.classList.remove(
        'fixed', 'flex', 'flex-col',
        'top-16', 'left-0', 'right-0',
        'bg-dark', 'p-4', 'space-y-4',
        'border-t', 'border-gray-800', 'z-40'
      );
      closeMenu.classList.add('hidden');
      hamburgerMenu.classList.remove('hidden');
    }
  };

  hamburgerMenu.addEventListener('click', () => toggleMenu(true));
  closeMenu.addEventListener('click', () => toggleMenu(false));

  // Menüdeki linke tıklanınca kapanır
  const navLinks = navMenu.querySelectorAll('a[data-link]');
  navLinks.forEach((link) => {
    link.addEventListener('click', () => toggleMenu(false));
  });

  // Menü dışına tıklanınca kapanır
  document.addEventListener('click', (event) => {
    const target = event.target as Node;
    const isMenuOpen = !navMenu.classList.contains('hidden');
    if (
      isMenuOpen &&
      !navMenu.contains(target) &&
      target !== hamburgerMenu &&
      target !== closeMenu
    ) {
      toggleMenu(false);
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      navMenu.classList.remove(
        'fixed', 'flex', 'flex-col',
        'top-16', 'left-0', 'right-0',
        'bg-dark', 'p-4', 'space-y-4',
        'border-t', 'border-gray-800', 'z-40'
      );
      navMenu.classList.remove('hidden');
      navMenu.classList.add('md:flex');
      closeMenu.classList.add('hidden');
      hamburgerMenu.classList.remove('hidden');
    } else {
      navMenu.classList.add('hidden');
      navMenu.classList.remove('md:flex');
      closeMenu.classList.add('hidden');
      hamburgerMenu.classList.remove('hidden');
    }
  });
}
