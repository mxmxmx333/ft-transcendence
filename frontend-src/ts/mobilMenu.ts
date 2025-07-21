export function setupMobileMenu() {
    const hamburgerMenu = document.getElementById('hamburger') as HTMLImageElement;
    const closeMenu = document.getElementById('close-menu') as HTMLImageElement;
    const navMenu = document.getElementById('main-nav') as HTMLUListElement;

    if (!hamburgerMenu || !closeMenu || !navMenu) {
        console.error('Mobile menu elements not found!');
        return;
    }

    const toggleMenu = (isOpening: boolean) => {
        if (isOpening) {
            // Menüyü aç
            navMenu.classList.remove('hidden');
            navMenu.classList.add(
                'fixed', 'md:hidden',
                'flex', 'flex-col',
                'top-16', 'left-0', 'right-0',
                'bg-dark', 'p-4', 'space-y-4',
                'border-t', 'border-gray-800',
                'z-40'
            );
            closeMenu.classList.remove('hidden');
            hamburgerMenu.classList.add('hidden');
        } else {
            // Menüyü kapat
            navMenu.classList.add('hidden');
            navMenu.classList.remove(
                'fixed', 'flex', 'flex-col',
                'top-16', 'left-0', 'right-0',
                'bg-dark', 'p-4', 'space-y-4',
                'border-t', 'border-gray-800',
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
            navMenu.classList.remove(
                'fixed', 'flex', 'flex-col',
                'top-16', 'left-0', 'right-0',
                'bg-dark', 'p-4', 'space-y-4',
                'border-t', 'border-gray-800',
                'z-40'
            );
            navMenu.classList.add('md:flex');
            closeMenu.classList.add('hidden');
            hamburgerMenu.classList.remove('hidden');
        }
    });
}