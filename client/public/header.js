// header.js – Shared Header Logic (place in same folder as index.html)
(function() {
    // ============================================================
    // GLOBALS – shared across all pages
    // ============================================================
    window.STATIC_BASE_URL = 'https://soldout-jh33.onrender.com';

    window.getAbsoluteUrl = function(url) {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        const clean = url.startsWith('/') ? url.slice(1) : url;
        return `${window.STATIC_BASE_URL}/${clean}`;
    };

    window.getCurrentUser = function() {
        const data = localStorage.getItem('currentUser');
        return data ? JSON.parse(data) : null;
    };

    // ============================================================
    // UPDATE HEADER AVATAR + NAME
    // ============================================================
    window.updateUserState = function(user) {
        const avatar = document.getElementById('userAvatar');
        const name = document.getElementById('userNameDisplay');
        if (!avatar || !name) return;

        if (user && user.firstName) {
            if (user.profilePicture) {
                const pic = window.getAbsoluteUrl(user.profilePicture);
                avatar.innerHTML = `<img src="${pic}" alt="${user.firstName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                avatar.innerHTML = `<i class="fas fa-user-circle user-icon"></i>`;
            }
            name.textContent = `${user.firstName} ${user.lastName || ''}`;
        } else {
            avatar.innerHTML = `<i class="fas fa-user-circle user-icon"></i>`;
            name.textContent = '';
        }
    };

    // ============================================================
    // INIT HEADER – dropdown, logout, mobile sidebar
    // ============================================================
    let headerInitialized = false;

    window.initHeader = function() {
        // Always update avatar first (in case user changed)
        const user = window.getCurrentUser();
        window.updateUserState(user);

        // If already attached listeners, skip
        if (headerInitialized) return;

        const userInfo = document.getElementById('userInfo');
        const dropdown = document.getElementById('userDropdown');

        if (!userInfo || !dropdown) {
            // Elements not yet in DOM – will try again later
            return;
        }

        // ----- Dropdown toggle -----
        userInfo.addEventListener('click', function(e) {
            e.stopPropagation();
            const currentUser = window.getCurrentUser();
            if (currentUser) {
                dropdown.classList.toggle('show');
            } else {
                const loginOverlay = document.getElementById('loginOverlay');
                if (loginOverlay) loginOverlay.classList.add('active');
                else window.location.href = 'index.html';
            }
        });

        document.addEventListener('click', function() {
            dropdown.classList.remove('show');
        });

        // ----- Logout -----
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            const newBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
            newBtn.addEventListener('click', function(e) {
                e.preventDefault();
                localStorage.removeItem('currentUser');
                localStorage.removeItem('authToken');
                window.updateUserState(null);
                window.location.href = 'index.html';
            });
        }

        // ----- Home link -----
        const homeLink = document.getElementById('homeLink');
        if (homeLink) {
            homeLink.addEventListener('click', function(e) {
                e.preventDefault();
                window.location.href = 'index.html';
            });
        }

        // ----- Mobile sidebar -----
        const hamburger = document.getElementById('hamburgerBtn');
        const sidebar = document.getElementById('sidebarMobile');
        const overlay = document.getElementById('sidebarOverlay');

        if (hamburger && sidebar && overlay) {
            function toggleSidebar(open) {
                const isOpen = open !== undefined ? open : !sidebar.classList.contains('open');
                sidebar.classList.toggle('open', isOpen);
                overlay.classList.toggle('active', isOpen);
                hamburger.classList.toggle('active', isOpen);
                document.body.style.overflow = isOpen ? 'hidden' : '';
            }

            hamburger.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleSidebar();
            });

            overlay.addEventListener('click', function() {
                toggleSidebar(false);
            });

            sidebar.querySelectorAll('a').forEach(function(link) {
                link.addEventListener('click', function() {
                    toggleSidebar(false);
                });
            });

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                    toggleSidebar(false);
                }
            });

            window.addEventListener('resize', function() {
                if (window.innerWidth > 992 && sidebar.classList.contains('open')) {
                    toggleSidebar(false);
                }
            });
        }

        headerInitialized = true;
    };

    // ============================================================
    // AUTO-INIT – only if header elements already exist (e.g., profile page)
    // ============================================================
    function tryAutoInit() {
        // Check if header elements are already in the DOM (hardcoded header)
        if (document.getElementById('userInfo') && document.getElementById('userDropdown')) {
            window.initHeader();
        }
        // For dynamically loaded headers, pages will call initHeader() after injection.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryAutoInit);
    } else {
        tryAutoInit();
    }

    // Expose initHeader so pages can call it after dynamic injection
    // (already exposed globally via window.initHeader)
})();