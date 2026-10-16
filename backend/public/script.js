/* ===== Real Discord Auth + Permissions API ===== */

const RANK_LEVEL = { staff: 1, hogerop: 2, beheer: 3 };
const RANK_LABELS = {
    staff: { label: 'Staff', class: 'perm-staff' },
    hogerop: { label: 'Hogerop', class: 'perm-hogerop' },
    beheer: { label: 'Beheer', class: 'perm-beheer' },
};

let currentUser = null;

async function api(path, options = {}) {
    const res = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || res.statusText || 'Request mislukt');
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<i class="fas fa-info-circle"></i><span>' + message + '</span>';
    document.body.appendChild(toast);
    setTimeout(function () {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(function () { toast.remove(); }, 300);
    }, 2800);
}

function avatarUrl(user) {
    if (user.avatar) {
        return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png?size=64';
    }
    return null;
}

function applyAuthUI() {
    var overlay = document.getElementById('loginOverlay');
    var app = document.getElementById('app');
    var nameEl = document.getElementById('userName');
    var rankEl = document.getElementById('userRank');
    var avatarEl = document.getElementById('userAvatar');

    if (!currentUser) {
        if (overlay) overlay.classList.remove('hidden');
        if (app) app.classList.add('locked');
        if (nameEl) nameEl.textContent = 'Niet ingelogd';
        if (rankEl) rankEl.innerHTML = '';
        if (avatarEl) {
            avatarEl.textContent = '?';
            avatarEl.style.backgroundImage = '';
            avatarEl.style.background = 'linear-gradient(135deg,#5865F2,#3b82f6)';
        }
        return;
    }

    if (overlay) overlay.classList.add('hidden');
    if (app) app.classList.remove('locked');
    if (nameEl) nameEl.textContent = currentUser.globalName || currentUser.username;
    if (rankEl) {
        var r = RANK_LABELS[currentUser.rank] || RANK_LABELS.staff;
        rankEl.innerHTML = '<span class="perm ' + r.class + '">' + r.label + '</span>';
    }
    if (avatarEl) {
        var url = avatarUrl(currentUser);
        if (url) {
            avatarEl.textContent = '';
            avatarEl.style.backgroundImage = 'url(' + url + ')';
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
        } else {
            avatarEl.style.backgroundImage = '';
            avatarEl.textContent = (currentUser.username || '?').slice(0, 2).toUpperCase();
            avatarEl.style.background = 'linear-gradient(135deg,#5865F2,#3b82f6)';
        }
    }

    applyRankVisibility();
}

function applyRankVisibility() {
    if (!currentUser) return;
    var level = RANK_LEVEL[currentUser.rank] || 0;

    document.querySelectorAll('.nav-section').forEach(function (section) {
        var title = section.querySelector('.nav-section-title');
        if (!title) return;
        var text = title.textContent.trim().toLowerCase();
        if (text.indexOf('hogerop') === 0) {
            section.style.display = level >= 2 ? '' : 'none';
        } else if (text.indexOf('beheer') === 0) {
            section.style.display = level >= 3 ? '' : 'none';
        }
    });

    document.querySelectorAll('[data-perm]').forEach(function (el) {
        var need = el.getAttribute('data-perm');
        var needLevel = RANK_LEVEL[need] || 0;
        el.classList.toggle('perm-dimmed', level < needLevel);
    });
}

async function checkAuth() {
    try {
        var data = await api('/api/auth/status');
        if (data.authenticated && data.user) {
            currentUser = data.user;
        } else {
            currentUser = null;
        }
    } catch (e) {
        currentUser = null;
    }
    applyAuthUI();
}

async function logout() {
    try {
        await api('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch (e) {}
    currentUser = null;
    applyAuthUI();
    document.querySelectorAll('.nav-link').forEach(function (l) { l.classList.remove('active'); });
    document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
    var dashLink = document.querySelector('.nav-link[data-section="dashboard"]');
    var dash = document.getElementById('dashboard');
    if (dashLink) dashLink.classList.add('active');
    if (dash) dash.classList.add('active');
    showToast('Uitgelogd');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderRoleMappings(store) {
    var list = document.getElementById('roleMappingList');
    if (!list) return;
    var items = store.roleMappings || [];
    if (!items.length) {
        list.innerHTML = '<div class="empty-state">Nog geen Discord-rollen gekoppeld</div>';
        return;
    }
    list.innerHTML = items.map(function (m) {
        var r = RANK_LABELS[m.rank] || RANK_LABELS.staff;
        return '<div class="data-item"><div class="left"><span class="perm ' + r.class + '">' + r.label +
            '</span><div><div style="font-weight:500;font-size:13px">' + escapeHtml(m.roleName) +
            '</div><div style="font-size:11px;color:var(--text-muted)">Rol ID: ' + escapeHtml(m.roleId) +
            '</div></div></div><button class="btn btn-sm btn-danger" data-action="delete-role" data-id="' +
            escapeHtml(m.roleId) + '">Verwijderen</button></div>';
    }).join('');
}

function renderManualUsers(store) {
    var list = document.getElementById('manualUsersList');
    if (!list) return;
    var items = store.manualUsers || [];
    if (!items.length) {
        list.innerHTML = '<div class="empty-state">Nog geen handmatige toewijzingen</div>';
        return;
    }
    list.innerHTML = items.map(function (u) {
        var r = RANK_LABELS[u.rank] || RANK_LABELS.staff;
        return '<div class="data-item"><div class="left"><span class="perm ' + r.class + '">' + r.label +
            '</span><div><div style="font-weight:500;font-size:13px">' + escapeHtml(u.displayName) +
            '</div><div style="font-size:11px;color:var(--text-muted)">Discord: ' + escapeHtml(u.discordId) +
            '</div></div></div><button class="btn btn-sm btn-danger" data-action="delete-user" data-id="' +
            escapeHtml(u.discordId) + '">Verwijderen</button></div>';
    }).join('');
}

async function loadPermissions() {
    if (!currentUser || currentUser.rank !== 'beheer') return;
    try {
        var store = await api('/api/permissions');
        renderRoleMappings(store);
        renderManualUsers(store);
    } catch (err) {
        showToast(err.message || 'Permissies laden mislukt');
    }
}

/* Navigation */
var navLinks = document.querySelectorAll('.nav-link[data-section]');
var sections = document.querySelectorAll('.section');
var sidebar = document.getElementById('sidebar');
var overlayEl = document.getElementById('sidebarOverlay');
var mobileToggle = document.getElementById('mobileToggle');

navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
        e.preventDefault();
        if (!currentUser) return;
        var target = link.getAttribute('data-section');
        navLinks.forEach(function (l) { l.classList.remove('active'); });
        link.classList.add('active');
        sections.forEach(function (s) { s.classList.remove('active'); });
        var el = document.getElementById(target);
        if (el) el.classList.add('active');
        if (target === 'permissions') loadPermissions();
        if (sidebar) sidebar.classList.remove('open');
        if (overlayEl) overlayEl.classList.remove('show');
    });
});

if (mobileToggle) {
    mobileToggle.addEventListener('click', function () {
        if (sidebar) sidebar.classList.toggle('open');
        if (overlayEl) overlayEl.classList.toggle('show');
    });
}
if (overlayEl) {
    overlayEl.addEventListener('click', function () {
        if (sidebar) sidebar.classList.remove('open');
        overlayEl.classList.remove('show');
    });
}

document.querySelectorAll('.nav-section-title').forEach(function (title) {
    title.addEventListener('click', function () {
        title.parentElement.classList.toggle('collapsed');
    });
});

document.addEventListener('DOMContentLoaded', async function () {
    var params = new URLSearchParams(window.location.search);
    var authError = params.get('auth_error');
    if (authError) {
        var box = document.getElementById('authError');
        if (box) {
            box.style.display = 'block';
            box.textContent = authError;
        }
        window.history.replaceState({}, '', '/');
    }

    await checkAuth();

    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    var addRole = document.getElementById('addRoleMapping');
    if (addRole) {
        addRole.addEventListener('click', async function (e) {
            e.preventDefault();
            var roleId = (document.getElementById('newRoleId') || {}).value;
            var roleName = (document.getElementById('newRoleName') || {}).value;
            var rank = (document.getElementById('newRoleRank') || {}).value;
            if (roleId) roleId = roleId.trim();
            if (roleName) roleName = roleName.trim();
            if (!roleId || !rank) return showToast('Vul rol-ID en rank in');
            try {
                var store = await api('/api/permissions/roles', {
                    method: 'POST',
                    body: JSON.stringify({ roleId: roleId, roleName: roleName || roleId, rank: rank }),
                });
                renderRoleMappings(store);
                renderManualUsers(store);
                var a = document.getElementById('newRoleId');
                var b = document.getElementById('newRoleName');
                if (a) a.value = '';
                if (b) b.value = '';
                showToast('Rol gekoppeld');
            } catch (err) {
                showToast(err.message);
            }
        });
    }

    var addUser = document.getElementById('addManualUser');
    if (addUser) {
        addUser.addEventListener('click', async function (e) {
            e.preventDefault();
            var discordId = (document.getElementById('manualDiscordId') || {}).value;
            var rank = (document.getElementById('manualRank') || {}).value;
            if (discordId) discordId = discordId.trim();
            if (!discordId || !rank) return showToast('Vul Discord ID en rank in');
            try {
                var store = await api('/api/permissions/users', {
                    method: 'POST',
                    body: JSON.stringify({ discordId: discordId, displayName: discordId, rank: rank }),
                });
                renderRoleMappings(store);
                renderManualUsers(store);
                var c = document.getElementById('manualDiscordId');
                if (c) c.value = '';
                showToast('Gebruiker toegewezen');
            } catch (err) {
                showToast(err.message);
            }
        });
    }

    var roleList = document.getElementById('roleMappingList');
    if (roleList) {
        roleList.addEventListener('click', async function (e) {
            var btn = e.target.closest('[data-action="delete-role"]');
            if (!btn) return;
            try {
                var store = await api('/api/permissions?action=delete_roles&id=' + encodeURIComponent(btn.dataset.id), { method: 'POST', body: '{}' });
                renderRoleMappings(store);
                renderManualUsers(store);
                showToast('Rol-koppeling verwijderd');
            } catch (err) {
                showToast(err.message);
            }
        });
    }

    var userList = document.getElementById('manualUsersList');
    if (userList) {
        userList.addEventListener('click', async function (e) {
            var btn = e.target.closest('[data-action="delete-user"]');
            if (!btn) return;
            try {
                var store = await api('/api/permissions?action=delete_users&id=' + encodeURIComponent(btn.dataset.id), { method: 'POST', body: '{}' });
                renderRoleMappings(store);
                renderManualUsers(store);
                showToast('Toewijzing verwijderd');
            } catch (err) {
                showToast(err.message);
            }
        });
    }
});
