// header.js – Shared Header Logic (with aggressive retry)
(function() {
    // ============================================================
    // GLOBALS
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
    // UPDATE HEADER AVATAR + NAME (with aggressive retry)
    // ============================================================
    let pendingUser = null;
    let applyTimer = null;

    function applyUserState(user) {
        const avatar = document.getElementById('userAvatar');
        const name = document.getElementById('userNameDisplay');

        if (!avatar || !name) {
            // Header not loaded yet – store and retry in 100ms
            pendingUser = user;
            if (applyTimer) clearTimeout(applyTimer);
            applyTimer = setTimeout(function() {
                applyUserState(pendingUser);
            }, 100);
            return;
        }

        // Found the header – apply the avatar
        applyTimer = null;
        pendingUser = null;

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
    }

    // Expose updateUserState so pages can call it after login
    window.updateUserState = function(user) {
        applyUserState(user);
    };

    // ============================================================
    // INIT HEADER – dropdown, logout, mobile sidebar
    // ============================================================
    let headerInitialized = false;

    window.initHeader = function() {
        // Apply avatar first
        const user = window.getCurrentUser();
        applyUserState(user);

        if (headerInitialized) return;

        const userInfo = document.getElementById('userInfo');
        const dropdown = document.getElementById('userDropdown');
        if (!userInfo || !dropdown) {
            // Header not ready – will retry via observer or manual call
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
    // WATCH FOR HEADER APPEARANCE (for dynamically loaded headers)
    // ============================================================
    function watchForHeader() {
        // If header already exists, init immediately
        if (document.getElementById('userInfo')) {
            window.initHeader();
            return;
        }

        // Use MutationObserver
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && node.querySelector && node.querySelector('#userInfo')) {
                        observer.disconnect();
                        window.initHeader();
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Fallback: check every 200ms
        const interval = setInterval(function() {
            if (document.getElementById('userInfo')) {
                clearInterval(interval);
                observer.disconnect();
                window.initHeader();
            }
        }, 200);
    }

    // ============================================================
    // AUTO-INIT – run when DOM is ready
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchForHeader);
    } else {
        watchForHeader();
    }

    // Expose a method to force a retry from outside (e.g., after login)
    window.forceHeaderUpdate = function() {
        const user = window.getCurrentUser();
        applyUserState(user);
        if (!headerInitialized) window.initHeader();
    };
})();