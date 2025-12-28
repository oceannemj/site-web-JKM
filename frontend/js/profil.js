// profil.js - Gestion complète du profil utilisateur
// ⚠️ AUCUN IMPORT - Tout est autonome

const API_BASE = 'http://localhost:3000/api';
const API_ORIGIN = API_BASE.replace(/\/_?api$/, '');

function buildImageUrl(imageUrl) {
  if (!imageUrl) return 'https://via.placeholder.com/300x300?text=Produit';
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  if (imageUrl.startsWith('/')) return API_ORIGIN + imageUrl;
  return `${API_ORIGIN}/${imageUrl}`;
}

// État global
let currentUser = null;
let currentTab = 'commandes';
let commandesData = [];
let avisData = [];
let favorisData = [];

// ============================================
// FONCTION checkAuth LOCALE (sans import)
// ============================================
async function checkAuth() {
  const token = localStorage.getItem('jwtToken');
  
  if (!token) {
    console.log('❌ Pas de token JWT trouvé');
    return { isAuth: false, isAdmin: false };
  }

  try {
    console.log('🔍 Vérification du token...');
    
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      console.warn('⚠️ Token invalide ou expiré');
      localStorage.removeItem('jwtToken');
      return { isAuth: false, isAdmin: false };
    }
    
    const user = await response.json();
    console.log('✅ Utilisateur authentifié:', user.email);
    
    return { 
      isAuth: true, 
      isAdmin: user.role === 'admin', 
      user 
    };
  } catch (err) {
    console.error('❌ Erreur checkAuth:', err);
    
    // Décoder le JWT localement en cas d'erreur réseau
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('📋 Payload JWT décodé:', payload);
      
      // Vérifier si le token est expiré
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        console.warn('⏰ Token expiré');
        localStorage.removeItem('jwtToken');
        return { isAuth: false, isAdmin: false };
      }
      
      // Token valide en local
      return {
        isAuth: true,
        isAdmin: payload.role === 'admin',
        user: {
          id: payload.userId || payload.id,
          email: payload.email,
          role: payload.role,
          nom: payload.nom,
          prenom: payload.prenom
        }
      };
    } catch (decodeErr) {
      console.error('❌ Token JWT invalide:', decodeErr);
      localStorage.removeItem('jwtToken');
      return { isAuth: false, isAdmin: false };
    }
  }
}

// ============================================
// INITIALISATION
// ============================================

async function initProfil() {
  console.log('🚀 Initialisation du profil');
  
  try {
    // Vérifier authentification
    const auth = await checkAuth();
    console.log('📋 Auth status:', auth);
    
    if (!auth.isAuth) {
      console.log('❌ Utilisateur non authentifié');
      showToast('Vous devez être connecté pour accéder au profil', 'warning');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1500);
      return;
    }

    currentUser = auth.user;
    console.log('✅ Utilisateur connecté:', currentUser);

    // Mettre à jour le lien admin si admin
    updateAdminLink(auth.user);

    // Charger les données du profil
    await loadProfilData();
    await loadStats();

    // Charger le premier onglet
    await switchTab('commandes');

    // Initialiser les event listeners
    initEventListeners();

    showToast('Profil chargé avec succès', 'success');
  } catch (error) {
    console.error('❌ Erreur initialisation profil:', error);
    showToast('Erreur lors du chargement du profil', 'error');
    
    // Si erreur d'auth, rediriger vers login
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
  }
}

// ============================================
// CHARGEMENT DES DONNÉES
// ============================================

async function loadProfilData() {
  const token = localStorage.getItem('jwtToken');
  
  console.log('📤 Chargement des données du profil...');
  console.log('🔑 Token présent:', !!token);
  
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📊 Status:', response.status);

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Erreur API:', error);
      throw new Error(error.error || 'Erreur chargement profil');
    }

    const user = await response.json();
    console.log('✅ Données utilisateur reçues:', user);
    
    // Mettre à jour l'interface
    const nomComplet = `${user.prenom || ''} ${user.nom || 'Utilisateur'}`.trim();
    console.log('👤 Nom complet:', nomComplet);
    
    document.getElementById('profil-nom').textContent = nomComplet;
    document.getElementById('profil-email').textContent = user.email || 'Email non disponible';
    
    const roleElement = document.getElementById('profil-role');
    if (user.role === 'admin') {
      roleElement.innerHTML = '<i class="bi bi-shield-check"></i> Administrateur';
      roleElement.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
    } else if (user.role === 'vendeur') {
      roleElement.innerHTML = '<i class="bi bi-shop"></i> Vendeur';
      roleElement.style.background = 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)';
    } else {
      roleElement.innerHTML = '<i class="bi bi-star-fill"></i> Client Premium';
      roleElement.style.background = 'linear-gradient(90deg, var(--pink-500) 0%, var(--purple-500) 100%)';
    }

    // Mettre à jour l'avatar avec les initiales
    const avatarElement = document.querySelector('.profile-avatar');
    const initiales = `${user.prenom?.[0] || ''}${user.nom?.[0] || ''}`.toUpperCase() || '👤';
    avatarElement.textContent = initiales;

    console.log('✅ Interface mise à jour');

  } catch (error) {
    console.error('❌ Erreur chargement profil:', error);
    document.getElementById('profil-nom').textContent = 'Erreur chargement';
    document.getElementById('profil-email').textContent = 'Non disponible';
    
    showToast(`Erreur: ${error.message}`, 'error');
  }
}

async function loadStats() {
  const token = localStorage.getItem('jwtToken');
  
  console.log('📊 Chargement des statistiques...');
  
  try {
    const [commandesRes, avisRes] = await Promise.allSettled([
      fetch(`${API_BASE}/commandes/user`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(err => {
        console.warn('⚠️ Erreur chargement commandes:', err);
        return { ok: false };
      }),
      fetch(`${API_BASE}/avis/user`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(err => {
        console.warn('⚠️ Erreur chargement avis:', err);
        return { ok: false };
      })
    ]);

    let commandesCount = 0;
    if (commandesRes.status === 'fulfilled' && commandesRes.value.ok) {
      const commandes = await commandesRes.value.json();
      commandesCount = Array.isArray(commandes) ? commandes.length : 0;
    }

    let avisCount = 0;
    if (avisRes.status === 'fulfilled' && avisRes.value.ok) {
      const avis = await avisRes.value.json();
      avisCount = Array.isArray(avis) ? avis.length : 0;
    }

    animateNumber('total-commandes', commandesCount);
    animateNumber('total-avis', avisCount);

    console.log('✅ Stats chargées:', { commandes: commandesCount, avis: avisCount });

  } catch (error) {
    console.error('❌ Erreur chargement stats:', error);
    document.getElementById('total-commandes').textContent = '0';
    document.getElementById('total-avis').textContent = '0';
  }
}

// ============================================
// CHARGEMENT DES COMMANDES
// ============================================

async function loadCommandes() {
  const token = localStorage.getItem('jwtToken');
  const container = document.getElementById('historique-commandes');
  
  console.log('📦 Chargement des commandes...');
  
  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-pink mb-3" role="status">
        <span class="visually-hidden">Chargement...</span>
      </div>
      <p class="text-muted">Chargement de vos commandes...</p>
    </div>
  `;

  try {
    const response = await fetch(`${API_BASE}/commandes/user`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('📊 Status commandes:', response.status);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur chargement commandes');
    }

    commandesData = await response.json();
    console.log('✅ Commandes chargées:', commandesData.length);
    
    document.getElementById('commandes-count').textContent = `${commandesData.length} commande${commandesData.length > 1 ? 's' : ''}`;

    if (commandesData.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h5 class="fw-bold mb-2">Aucune commande</h5>
          <p class="text-secondary mb-4">Vous n'avez pas encore passé de commande</p>
          <a href="catalogue.html" class="btn btn-gradient rounded-pill">
            <i class="bi bi-bag"></i> Explorer le Catalogue
          </a>
        </div>
      `;
      return;
    }

    container.innerHTML = commandesData.map(commande => {
      const statusConfig = getStatusConfig(commande.status);
      const date = new Date(commande.date);
      const dateFormatted = date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      return `
        <div class="order-card fade-in">
          <div class="row align-items-center g-3">
            <div class="col-auto">
              <div style="width: 70px; height: 70px; border-radius: var(--border-radius); background: linear-gradient(135deg, var(--pink-100) 0%, var(--purple-100) 100%); display: flex; align-items: center; justify-content: center; font-size: 2rem; box-shadow: var(--shadow);">
                ${statusConfig.emoji}
              </div>
            </div>
            <div class="col">
              <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                <div>
                  <h6 class="fw-bold mb-1">
                    Commande #${commande.id.substring(0, 8).toUpperCase()}
                  </h6>
                  <p class="text-muted small mb-0">
                    <i class="bi bi-calendar3"></i> ${dateFormatted}
                  </p>
                </div>
                <span class="order-status ${statusConfig.class}">
                  <i class="bi bi-${statusConfig.icon}"></i> 
                  ${statusConfig.label}
                </span>
              </div>
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <span class="text-muted small">Total: </span>
                  <span class="fw-bold price-gradient fs-5">${commande.total.toLocaleString('fr-FR')} FCFA</span>
                </div>
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary rounded-pill" onclick="viewOrderDetails('${commande.id}')">
                    <i class="bi bi-eye"></i> Voir détails
                  </button>
                  ${commande.status === 'en_attente' || commande.status === 'payee' ? `
                    <button class="btn btn-outline-danger rounded-pill" onclick="cancelOrder('${commande.id}')">
                      <i class="bi bi-x-circle"></i> Annuler
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('❌ Erreur chargement commandes:', error);
    container.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-info-circle"></i>
        <strong>Aucune commande</strong><br>
        <small>${error.message}</small>
      </div>
    `;
  }
}

// ============================================
// CHARGEMENT DES AVIS
// ============================================

async function loadAvis() {
  const token = localStorage.getItem('jwtToken');
  const container = document.getElementById('mes-avis');
  
  console.log('⭐ Chargement des avis...');
  
  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-pink mb-3" role="status">
        <span class="visually-hidden">Chargement...</span>
      </div>
      <p class="text-muted">Chargement de vos avis...</p>
    </div>
  `;

  try {
    const response = await fetch(`${API_BASE}/avis/user`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('📊 Status avis:', response.status);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur chargement avis');
    }

    avisData = await response.json();
    console.log('✅ Avis chargés:', avisData.length);
    
    document.getElementById('avis-count').textContent = `${avisData.length} avis`;

    if (avisData.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⭐</div>
          <h5 class="fw-bold mb-2">Aucun avis</h5>
          <p class="text-secondary mb-4">Partagez votre expérience pour aider d'autres parents</p>
          <a href="catalogue.html" class="btn btn-gradient rounded-pill">
            <i class="bi bi-star"></i> Laisser un Avis
          </a>
        </div>
      `;
      return;
    }

    container.innerHTML = avisData.map(avi => {
      const date = new Date(avi.date);
      const stars = '⭐'.repeat(avi.note) + '☆'.repeat(5 - avi.note);
      
      return `
        <div class="review-card fade-in">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
            <div class="flex-grow-1">
              <h6 class="fw-bold mb-1">${avi.produit_nom || 'Produit'}</h6>
              <div class="stars mb-2">${stars}</div>
            </div>
            <div class="d-flex gap-2 align-items-center">
              <small class="text-muted">${date.toLocaleDateString('fr-FR')}</small>
            </div>
          </div>
          <p class="text-secondary mb-0">${avi.commentaire}</p>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('❌ Erreur chargement avis:', error);
    container.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-info-circle"></i>
        <strong>Aucun avis</strong><br>
        <small>${error.message}</small>
      </div>
    `;
  }
}

// ============================================
// CHARGEMENT DES FAVORIS
// ============================================

async function loadFavoris() {
  const token = localStorage.getItem('jwtToken');
  const container = document.getElementById('mes-favoris');
  
  console.log('💝 Chargement des favoris...');
  
  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-pink mb-3" role="status">
        <span class="visually-hidden">Chargement...</span>
      </div>
      <p class="text-muted">Chargement de vos favoris...</p>
    </div>
  `;

  try {
    const response = await fetch(`${API_BASE}/likes/user`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('📊 Status favoris:', response.status);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur chargement favoris');
    }

    favorisData = await response.json();
    console.log('✅ Favoris chargés:', favorisData.length);
    
    document.getElementById('favoris-count').textContent = `${favorisData.length} article${favorisData.length > 1 ? 's' : ''}`;

    if (favorisData.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💝</div>
          <h5 class="fw-bold mb-2">Aucun favori</h5>
          <p class="text-secondary mb-4">Ajoutez des produits à vos favoris pour les retrouver facilement</p>
          <a href="catalogue.html" class="btn btn-gradient rounded-pill">
            <i class="bi bi-bag"></i> Explorer le Catalogue
          </a>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="row g-4">
        ${favorisData.map(fav => `
          <div class="col-12 col-sm-6 col-md-4">
            <div class="card product-card h-100 fade-in">
              <div class="product-image position-relative">
                <img src="${buildImageUrl(fav.image_url)}" 
                     alt="${fav.nom}" 
                     class="w-100"
                     onerror="this.src='https://via.placeholder.com/300x300?text=Image+non+disponible'">
                <button class="heart-btn active" onclick="removeFavori('${fav.produit_id}')">
                  <i class="bi bi-heart-fill text-danger"></i>
                </button>
                <span class="age-badge">${fav.age || 'Tous âges'}</span>
              </div>
              <div class="card-body d-flex flex-column">
                <h6 class="fw-bold mb-2">${fav.nom}</h6>
                <p class="text-secondary small line-clamp-2 mb-3">${fav.description || 'Aucune description'}</p>
                <div class="mt-auto">
                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="fw-bold price-gradient fs-5">${fav.prix?.toLocaleString('fr-FR') || '0'} FCFA</span>
                    <span class="badge ${fav.stock > 10 ? 'bg-success' : fav.stock > 0 ? 'bg-warning' : 'bg-danger'}">
                      ${fav.stock > 0 ? `${fav.stock} en stock` : 'Rupture'}
                    </span>
                  </div>
                  <div class="d-grid gap-2">
                    <a href="produit.html?id=${fav.produit_id}" class="btn btn-gradient btn-sm rounded-pill">
                      <i class="bi bi-eye"></i> Voir le produit
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

  } catch (error) {
    console.error('❌ Erreur chargement favoris:', error);
    container.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-info-circle"></i>
        <strong>Aucun favori</strong><br>
        <small>${error.message}</small>
      </div>
    `;
  }
}

// ============================================
// GESTION DES ONGLETS
// ============================================

window.switchTab = async function(tabName) {
  console.log('🔄 Changement d\'onglet:', tabName);
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const buttons = Array.from(document.querySelectorAll('.tab-btn'));
  const targetButton = buttons.find(btn => btn.textContent.toLowerCase().includes(tabName));
  if (targetButton) {
    targetButton.classList.add('active');
  }

  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = 'none';
  });

  const tabElement = document.getElementById(`tab-${tabName}`);
  if (tabElement) {
    tabElement.style.display = 'block';
  }

  currentTab = tabName;
  
  switch(tabName) {
    case 'commandes':
      await loadCommandes();
      break;
    case 'avis':
      await loadAvis();
      break;
    case 'favoris':
      await loadFavoris();
      break;
  }
};

// ============================================
// DÉCONNEXION
// ============================================

window.logout = function() {
  if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
    console.log('👋 Déconnexion...');
    localStorage.removeItem('jwtToken');
    showToast('Déconnexion réussie', 'success');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1000);
  }
};

// ============================================
// ACTIONS (STUBS)
// ============================================

window.viewOrderDetails = function(orderId) {
  showToast('Fonctionnalité en développement', 'info');
};

window.cancelOrder = function(orderId) {
  showToast('Fonctionnalité en développement', 'info');
};

window.removeFavori = function(produitId) {
  showToast('Fonctionnalité en développement', 'info');
};

window.editProfile = function() {
  showToast('Fonctionnalité en développement', 'info');
};

// ============================================
// UTILITAIRES
// ============================================

function getStatusConfig(status) {
  const configs = {
    'en_attente': {
      label: 'En attente',
      class: 'status-pending',
      icon: 'hourglass-split',
      emoji: '⏳'
    },
    'payee': {
      label: 'Payée',
      class: 'status-completed',
      icon: 'check-circle',
      emoji: '✅'
    },
    'expediee': {
      label: 'Expédiée',
      class: 'status-processing',
      icon: 'truck',
      emoji: '🚚'
    },
    'livree': {
      label: 'Livrée',
      class: 'status-completed',
      icon: 'box-seam',
      emoji: '📦'
    },
    'annulee': {
      label: 'Annulée',
      class: 'status-annulee',
      icon: 'x-circle',
      emoji: '❌'
    }
  };

  return configs[status] || configs['en_attente'];
}

function animateNumber(elementId, target) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const duration = 1000;
  const start = 0;
  const increment = target / (duration / 16);
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      element.textContent = target;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'check-circle-fill',
    error: 'x-circle-fill',
    warning: 'exclamation-triangle-fill',
    info: 'info-circle-fill'
  };

  const colors = {
    success: 'success',
    error: 'danger',
    warning: 'warning',
    info: 'info'
  };

  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-white bg-${colors[type]} border-0`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi bi-${icons[type]} me-2"></i>
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  container.appendChild(toast);
  
  const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
  bsToast.show();

  toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

function updateAdminLink(user) {
  const adminLink = document.querySelector('.nav-admin');
  if (adminLink) {
    adminLink.style.display = user.role === 'admin' ? 'block' : 'none';
  }
}

function initEventListeners() {
  console.log('🎯 Event listeners initialisés');
}

// ============================================
// INITIALISATION AU CHARGEMENT
// ============================================

document.addEventListener('DOMContentLoaded', initProfil);