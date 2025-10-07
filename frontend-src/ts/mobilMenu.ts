export function setupMobileMenu() {
  const hamburgerMenu = document.getElementById('hamburger') as HTMLImageElement;
  const closeMenu = document.getElementById('close-menu') as HTMLImageElement;
  const navMenu = document.querySelector('.main-nav') as HTMLElement;

  if (!hamburgerMenu || !closeMenu || !navMenu) {
    return;
  }

  const toggleMenu = (isOpening: boolean) => {
    if (isOpening) {
      navMenu.classList.remove('hidden', 'md:flex');
      navMenu.classList.add(
        'fixed',
        'flex',
        'flex-col',
        'top-16',
        'left-0',
        'right-0',
        'bg-dark',
        'p-4',
        'space-y-4',
        'border-t',
        'border-gray-800',
        'z-40'
      );
      closeMenu.classList.remove('hidden');
      hamburgerMenu.classList.add('hidden');
    } else {
      navMenu.classList.add('hidden', 'md:flex');
      navMenu.classList.remove(
        'fixed',
        'flex',
        'flex-col',
        'top-16',
        'left-0',
        'right-0',
        'bg-dark',
        'p-4',
        'space-y-4',
        'border-t',
        'border-gray-800',
        'z-40'
      );
      closeMenu.classList.add('hidden');
      hamburgerMenu.classList.remove('hidden');
    }
  };

  hamburgerMenu.addEventListener('click', () => toggleMenu(true));
  closeMenu.addEventListener('click', () => toggleMenu(false));

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      // Desktop görünümü
      navMenu.classList.remove(
        'fixed',
        'flex',
        'flex-col',
        'top-16',
        'left-0',
        'right-0',
        'bg-dark',
        'p-4',
        'space-y-4',
        'border-t',
        'border-gray-800',
        'z-40'
      );
      // Desktop'ta navbar görünür olmalı
      navMenu.classList.remove('hidden');
      navMenu.classList.add('md:flex');

      closeMenu.classList.add('hidden');
      hamburgerMenu.classList.remove('hidden');
    } else {
      // Mobile görünümü - menü kapalı
      navMenu.classList.add('hidden');
      navMenu.classList.remove('md:flex');
      closeMenu.classList.add('hidden');
      hamburgerMenu.classList.remove('hidden');
    }
  });
}
