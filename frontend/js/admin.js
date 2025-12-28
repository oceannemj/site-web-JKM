// js/admin.js - Version finale : Fix destroy Chart.js + fallback benefits/analytics + modifs layettes OK

import { checkAuth, buildImageUrl, API_BASE } from './api.js';
const ADMIN_EMAILS = ['oceannemandeng@gmail.com', 'admin@loedikids.com'];

// Cache intelligent
const cache = {
  stats: { data: null, timestamp: 0, ttl: 5 * 60 * 1000 },
  products: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 },
  clients: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 },
  orders: { data: null, timestamp: 0, ttl: 1 * 60 * 1000 },
  notifications: { data: null, timestamp: 0, ttl: 30 * 1000 }
};
const REQUEST_TIMEOUT = 3000;

// Variables globales
let allProducts = [];
let allOrders = [];
let allClients = [];
let selectedProducts = new Set();
let notifications = [];
let currentView = 'grid';
let currentPage = 1;
const itemsPerPage = 12;
let orderItems = [];
let currentClientView = 'list';
let currentClientPage = 1;
const clientsPerPage = 20;
let editingClientId = null;
let selectedOrderClient = null;
let activityHistory = [];
let editingOrderId = null; // Pour edit commande

// Fonction utilitaire pour debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Fonction pour fetch avec timeout et cache (fallback 404 pour bénéfices/analytics)
async function fetchWithCache(url, cacheKey, options = {}) {
  const now = Date.now();
  const cached = cache[cacheKey];

  if (cached && cached.data && (now - cached.timestamp) < cached.ttl) {
    console.log(`📦 Cache hit: ${cacheKey}`);
    return cached.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    console.log(`🌐 Fetch: ${url}`);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`⚠️ 404 sur ${url} – Route backend manquante (ajoutez /benefits dans routes/commandes.js)`);
        return []; // FALLBACK : Vide pour bénéfices/analytics
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    cache[cacheKey] = { data, timestamp: now };
    console.log(`✅ Cache updated: ${cacheKey}`);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Requête timeout (3s)');
    }
    console.error(`❌ Fetch error ${cacheKey}:`, error);
    return cached?.data || []; // FALLBACK : Vide
  }
}

// ==================== INITIALISATION ====================
async function initAdmin() {
  try {
    const auth = await checkAuth();
    if (!auth.isAuth || !ADMIN_EMAILS.includes(auth.user.email.toLowerCase())) {
      window.location.href = 'login.html';
      return;
    }
    document.getElementById('admin-name').textContent = auth.user.email.split('@')[0];
    document.getElementById('loading').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    await loadStats();
    loadProductsAsync();
    setTimeout(loadNotifications, 500);
    initEventListeners();
    initKeyboardShortcuts();
    initDragDrop();
    loadActivityHistory();
    if (localStorage.getItem('autoRefresh') === 'true') {
      setInterval(loadStats, 30000);
    }
  } catch (error) {
    console.error('❌ Erreur init admin:', error);
    window.location.href = 'login.html';
  }
}

async function loadProductsAsync() {
  setTimeout(async () => {
    try {
      await loadProducts();
    } catch (error) {
      console.error('Erreur chargement asynchrone produits:', error);
    }
  }, 100);
}

async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadProducts(),
    loadCommandesAdmin(),
    loadNotifications(),
    loadClients()
  ]);
}

// ==================== STATISTIQUES ====================
async function loadStats() {
  const token = localStorage.getItem('jwtToken');
  try {
    const [produits, commandes, clients, revenue] = await Promise.all([
      fetchWithCache(`${API_BASE}/admin/stats/produits`, 'stats_produits', { headers: { Authorization: `Bearer ${token}` } }),
      fetchWithCache(`${API_BASE}/admin/stats/commandes`, 'stats_commandes', { headers: { Authorization: `Bearer ${token}` } }),
      fetchWithCache(`${API_BASE}/admin/stats/clients`, 'stats_clients', { headers: { Authorization: `Bearer ${token}` } }),
      fetchWithCache(`${API_BASE}/admin/stats/revenue`, 'stats_revenue', { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (produits) animateNumber('stats-produits', produits.total || 0);
    if (commandes) animateNumber('stats-commandes', commandes.total || 0);
    if (clients) animateNumber('stats-clients', clients.total || 0);
    if (revenue) document.getElementById('stats-revenue').textContent = `${(revenue.total || 0).toLocaleString('fr-FR')}`;
    await calculateTotalProfit();
  } catch (error) {
    console.error('❌ Erreur stats:', error);
    showToast('Erreur chargement stats', 'error');
  }
}

async function calculateTotalProfit() {
  const token = localStorage.getItem('jwtToken');

  try {
    const ordersWithBenefits = await fetchWithCache(`${API_BASE}/admin/commandes/benefits`, 'orders_benefits', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!ordersWithBenefits || ordersWithBenefits.length === 0) {
      const profitEl = document.getElementById('stats-profit');
      if (profitEl) profitEl.textContent = '0';
      return;
    }

    let totalProfit = 0;

    ordersWithBenefits.forEach(order => {
      const totalAchat = order.items.reduce((sum, item) =>
        sum + ((item.prix_achat || 0) * item.quantite), 0
      );
      const profit = (order.total - (order.remise || 0)) - totalAchat;
      totalProfit += profit;
    });

    const profitEl = document.getElementById('stats-profit');
    if (profitEl) {
      profitEl.textContent = totalProfit.toLocaleString('fr-FR');
    }

  } catch (error) {
    console.error('Erreur calcul bénéfice:', error);
    const profitEl = document.getElementById('stats-profit');
    if (profitEl) profitEl.textContent = '0';
  }
}

function animateNumber(elementId, target) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const duration = 1000;
  const start = parseInt(element.textContent) || 0;
  const increment = (target - start) / (duration / 16);
  let current = start;
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
      element.textContent = target;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}

// ==================== PRODUITS (MODIF FIX : Hidden ID pour PUT) ====================
async function loadProducts() {
  const token = localStorage.getItem('jwtToken');
  const productsSkeleton = document.getElementById('products-skeleton');
  if (productsSkeleton) productsSkeleton.style.display = 'block';
  try {
    const products = await fetchWithCache(`${API_BASE}/admin/produits`, 'products', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (products) {
      allProducts = products;
      if (productsSkeleton) productsSkeleton.style.display = 'none';
      displayProducts(allProducts);
    }
  } catch (error) {
    console.error('❌ Erreur produits:', error);
    if (productsSkeleton) productsSkeleton.style.display = 'none';
    showToast('Erreur chargement produits', 'error');
  }
}

// Ajout hidden ID pour PUT produits (dans modal form)
function setProductEditId(id) {
  const hiddenInput = document.getElementById('product-hidden-id');
  if (!hiddenInput) {
    const form = document.getElementById('product-form');
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = 'product-hidden-id';
    hidden.name = 'id';
    form.appendChild(hidden);
  }
  document.getElementById('product-hidden-id').value = id;
}

// Submit produit avec PUT si ID (modif fix)
document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('jwtToken');
  const id = document.getElementById('product-hidden-id')?.value; // ID pour PUT
  const imageFile = document.getElementById('product-image').files[0];

  const formData = new FormData();

  formData.append('nom', document.getElementById('product-nom').value);
  formData.append('prix_achat', parseFloat(document.getElementById('product-prix-achat').value));
  formData.append('prix', parseFloat(document.getElementById('product-prix').value));
  formData.append('age', document.getElementById('product-age').value);
  formData.append('type', document.getElementById('product-type').value);
  formData.append('stock', parseInt(document.getElementById('product-stock').value) || 0);
  formData.append('description', document.getElementById('product-description').value);
  formData.append('matiere', document.getElementById('product-matiere').value);
  formData.append('entretien', document.getElementById('product-entretien').value);

  if (imageFile) {
    formData.append('image', imageFile);
  }

  try {
    const url = id ? `${API_BASE}/admin/produits/${id}` : `${API_BASE}/admin/produits`;
    const method = id ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (response.ok) {
      showToast(id ? 'Produit modifié avec succès' : 'Produit créé avec image !', 'success');
      productModal.hide();
      document.getElementById('product-form').reset();
      document.getElementById('image-preview').style.display = 'none';
      const hiddenInput = document.getElementById('product-hidden-id');
      if (hiddenInput) hiddenInput.remove(); // Clean hidden
      cache.products = { data: null, timestamp: 0 };
      loadProducts();
      loadStats();
      addToHistory(id ? 'Modification produit layette' : 'Création produit layette');
    } else {
      const error = await response.json();
      showToast(error.error || 'Erreur enregistrement', 'error');
    }
  } catch (error) {
    showToast('Erreur réseau lors de l\'upload', 'error');
  }
});

// editProduct avec set ID (modif fix)
window.editProduct = async function(id) {
  const token = localStorage.getItem('jwtToken');
  try {
    const response = await fetch(`${API_BASE}/admin/produits/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const product = await response.json();
    setProductEditId(id); // Set hidden ID pour PUT
    document.getElementById('product-nom').value = product.nom;
    document.getElementById('product-prix-achat').value = product.prix_achat;
    document.getElementById('product-prix').value = product.prix;
    document.getElementById('product-age').value = product.age;
    document.getElementById('product-type').value = product.type;
    document.getElementById('product-stock').value = product.stock;
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-matiere').value = product.matiere;
    document.getElementById('product-entretien').value = product.entretien || '';
    if (product.image_url) {
      const preview = document.getElementById('image-preview');
      preview.src = buildImageUrl(product.image_url);
      preview.style.display = 'block';
    }
    productModal.show();
  } catch (error) {
    showToast('Erreur chargement produit', 'error');
  }
};

function displayProducts(products) {
  const container = document.getElementById('products-container');
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedProducts = products.slice(start, end);
  if (currentView === 'grid') {
    container.innerHTML = `
      <div class="row g-3">
        ${paginatedProducts.map(p => `
          <div class="col-md-3">
            <div class="card h-100 border-0 shadow-sm">
              <div class="position-relative">
                <img src="${buildImageUrl(p.image_url)}" class="card-img-top" style="height: 200px; object-fit: cover;" alt="${p.nom}">
                <div class="position-absolute top-0 start-0 p-2">
                  <input type="checkbox" class="table-checkbox" onchange="toggleProductSelection('${p.id}')" ${selectedProducts.has(p.id) ? 'checked' : ''}>
                </div>
                <div class="position-absolute top-0 end-0 p-2">
                  <span class="badge ${p.stock > 10 ? 'bg-success' : p.stock > 0 ? 'bg-warning' : 'bg-danger'}">
                    ${p.stock} en stock
                  </span>
                </div>
              </div>
              <div class="card-body">
                <h6 class="card-title fw-bold mb-2">${p.nom}</h6>
                <p class="card-text small text-muted mb-2">${(p.description || '').substring(0, 60)}...</p>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="h5 fw-bold text-primary mb-0">${p.prix.toLocaleString('fr-FR')} FCFA</span>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editProduct('${p.id}')">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-secondary" onclick="generateQR('${p.id}', '${p.nom}')">
                      <i class="bi bi-qr-code"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteProduct('${p.id}')">
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th><input type="checkbox" onclick="toggleAllProducts()"></th>
              <th>Image</th>
              <th>Nom</th>
              <th>Prix Vente</th>
              <th>Prix Achat</th>
              <th>Stock</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${paginatedProducts.map(p => `
              <tr>
                <td><input type="checkbox" class="table-checkbox" onchange="toggleProductSelection('${p.id}')" ${selectedProducts.has(p.id) ? 'checked' : ''}></td>
                <td><img src="${buildImageUrl(p.image_url)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;" alt="${p.nom}"></td>
                <td>
                  <strong>${p.nom}</strong><br>
                  <small class="text-muted">${p.type} | ${p.age}</small>
                </td>
                <td class="fw-bold text-success">${p.prix.toLocaleString('fr-FR')} FCFA</td>
                <td class="fw-bold text-danger">${(p.prix_achat || 0).toLocaleString('fr-FR')} FCFA</td>
                <td><span class="badge ${p.stock > 10 ? 'bg-success' : p.stock > 0 ? 'bg-warning' : 'bg-danger'}">${p.stock}</span></td>
                <td>
                  <button class="btn btn-sm btn-outline-primary" onclick="editProduct('${p.id}')"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  renderPagination(products.length);
  updateBulkActions();
}

function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const pagination = document.getElementById('pagination');

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  pagination.innerHTML = `
    <nav>
      <ul class="pagination justify-content-center">
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
          <a class="page-link" href="#" onclick="event.preventDefault(); changePage(${currentPage - 1})">Précédent</a>
        </li>
        ${Array.from({length: totalPages}, (_, i) => `
          <li class="page-item ${i + 1 === currentPage ? 'active' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); changePage(${i + 1})">${i + 1}</a>
          </li>
        `).join('')}
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
          <a class="page-link" href="#" onclick="event.preventDefault(); changePage(${currentPage + 1})">Suivant</a>
        </li>
      </ul>
    </nav>
  `;
}

window.changePage = function(page) {
  currentPage = page;
  displayProducts(allProducts);
};

const debouncedFilterProducts = debounce(function() {
  const search = document.getElementById('search-produits').value.toLowerCase();
  const type = document.getElementById('filter-type').value;
  const stock = document.getElementById('filter-stock').value;

  let filtered = allProducts.filter(p =>
    p.nom.toLowerCase().includes(search) &&
    (!type || p.type === type) &&
    (!stock || (stock === 'high' && p.stock > 10) || (stock === 'low' && p.stock < 10 && p.stock > 0) || (stock === 'out' && p.stock === 0))
  );

  currentPage = 1;
  displayProducts(filtered);
}, 300);

function filterProducts() {
  debouncedFilterProducts();
}

window.setView = function(view) {
  currentView = view;
  displayProducts(allProducts);
};

window.toggleProductSelection = function(id) {
  if (selectedProducts.has(id)) {
    selectedProducts.delete(id);
  } else {
    selectedProducts.add(id);
  }
  updateBulkActions();
};

window.toggleAllProducts = function() {
  const checkboxes = document.querySelectorAll('.table-checkbox');
  const checked = event.target.checked;

  checkboxes.forEach(cb => {
    cb.checked = checked;
    if (checked) {
      const match = cb.getAttribute('onchange').match(/'([^']+)'/);
      if (match) selectedProducts.add(match[1]);
    }
  });

  if (!checked) {
    selectedProducts.clear();
  }

  updateBulkActions();
};

function updateBulkActions() {
  const count = document.getElementById('selected-count');
  const bar = document.getElementById('bulk-actions');

  if (count) count.textContent = selectedProducts.size;
  if (bar) bar.classList.toggle('show', selectedProducts.size > 0);
}

window.clearSelection = function() {
  selectedProducts.clear();
  document.querySelectorAll('.table-checkbox').forEach(cb => cb.checked = false);
  updateBulkActions();
};

window.bulkDelete = async function() {
  if (!confirm(`Supprimer ${selectedProducts.size} produits ?`)) return;

  const token = localStorage.getItem('jwtToken');
  try {
    for (let id of selectedProducts) {
      await fetch(`${API_BASE}/admin/produits/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    }
    showToast('Produits supprimés', 'success');
    selectedProducts.clear();
    loadProducts();
    addToHistory('Suppression groupée de produits');
  } catch (error) {
    showToast('Erreur suppression', 'error');
  }
};

window.deleteProduct = async function(id) {
  if (!confirm('Supprimer ce produit ?')) return;

  const token = localStorage.getItem('jwtToken');
  try {
    await fetch(`${API_BASE}/admin/produits/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    showToast('Produit supprimé', 'success');
    loadProducts();
    addToHistory('Suppression d\'un produit');
  } catch (error) {
    showToast('Erreur suppression', 'error');
  }
};

// Modal produit
const productModal = new bootstrap.Modal(document.getElementById('productModal'));
window.showProductModal = function() {
  document.getElementById('product-form').reset();
  document.getElementById('image-preview').style.display = 'none';
  const hiddenInput = document.getElementById('product-hidden-id');
  if (hiddenInput) hiddenInput.remove(); // Remove hidden ID for new product
  productModal.show();
};

// ==================== CLIENTS (LAZY LOADING) ====================
window.loadClients = async function() {
  const token = localStorage.getItem('jwtToken');
  const container = document.getElementById('clients-container');

  if (container) {
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-pink mb-3" role="status">
          <span class="visually-hidden">Chargement...</span>
        </div>
        <p class="text-muted">Chargement des clients...</p>
      </div>
    `;
  }

  try {
    const clients = await fetchWithCache(`${API_BASE}/admin/clients`, 'clients', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (clients) {
      allClients = clients;
      console.log('✅ Clients chargés:', allClients.length);
      displayClients(allClients);
    }
  } catch (error) {
    console.error('❌ Erreur chargement clients:', error);
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle"></i>
          Erreur de chargement des clients.
          <button class="btn btn-sm btn-outline-danger ms-2" onclick="loadClients()">
            <i class="bi bi-arrow-clockwise"></i> Réessayer
          </button>
        </div>
      `;
    }
    showToast('Erreur chargement clients', 'error');
  }
};

function displayClients(clients) {
  const container = document.getElementById('clients-container');

  if (clients.length === 0) {
    container.innerHTML = `
      <div class="empty-state text-center py-5">
        <i class="bi bi-people fs-1 text-muted mb-3"></i>
        <h5>Aucun client</h5>
        <p class="text-muted">Créez votre premier client</p>
        <button class="btn btn-gradient" onclick="showClientModal()">
          <i class="bi bi-plus-lg"></i> Nouveau Client
        </button>
      </div>
    `;
    return;
  }

  const start = (currentClientPage - 1) * clientsPerPage;
  const end = start + clientsPerPage;
  const paginatedClients = clients.slice(start, end);

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-hover">
        <thead>
          <tr>
            <th><input type="checkbox" onclick="toggleAllClients()"></th>
            <th>Client</th>
            <th>Contact</th>
            <th>Type</th>
            <th>Commandes</th>
            <th>Total dépensé</th>
            <th>Dernière commande</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${paginatedClients.map(client => {
            const isOffline = client.is_offline || client.email.includes('@loedikids.local');
            const displayName = `${client.prenom || ''} ${client.nom}`.trim();
            const initial = displayName.charAt(0).toUpperCase();

            return `
            <tr>
              <td>
                <input type="checkbox" class="client-checkbox" value="${client.id}">
              </td>
              <td>
                <div class="d-flex align-items-center">
                  <div class="rounded-circle d-flex align-items-center justify-content-center me-2"
                       style="width: 40px; height: 40px; background: linear-gradient(135deg, ${isOffline ? '#f59e0b' : '#ec4899'}, ${isOffline ? '#d97706' : '#a855f7'});">
                    <span class="text-white fw-bold">${initial}</span>
                  </div>
                  <div>
                    <strong>${displayName}</strong>
                  </div>
                </div>
              </td>
              <td>
                <div>
                  ${!isOffline ? `<div class="small"><i class="bi bi-envelope"></i> ${client.email}</div>` : '<div class="small text-muted">Pas d\'email</div>'}
                  ${client.telephone ? `<div class="small"><i class="bi bi-telephone"></i> ${client.telephone}</div>` : ''}
                </div>
              </td>
              <td>
                ${isOffline
                  ? '<span class="badge bg-warning text-dark"><i class="bi bi-shop"></i> Boutique</span>'
                  : '<span class="badge bg-success"><i class="bi bi-globe"></i> En ligne</span>'
                }
              </td>
              <td>
                <span class="badge bg-primary">${client.total_commandes || 0}</span>
              </td>
              <td>
                <strong class="text-success">${(client.total_depense || 0).toLocaleString('fr-FR')} FCFA</strong>
              </td>
              <td>
                ${client.derniere_commande
                  ? new Date(client.derniere_commande).toLocaleDateString('fr-FR')
                  : '<span class="text-muted">Jamais</span>'
                }
              </td>
              <td>
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary" onclick="editClient('${client.id}')" title="Modifier">
                    <i class="bi bi-pencil"></i>
                  </button>
                  ${isOffline
                    ? `<button class="btn btn-outline-success" onclick="activateClient('${client.id}')" title="Activer compte">
                        <i class="bi bi-key"></i>
                      </button>`
                    : ''
                  }
                  <button class="btn btn-outline-info" onclick="viewClientOrders('${client.id}')" title="Commandes">
                    <i class="bi bi-receipt"></i>
                  </button>
                  <button class="btn btn-outline-danger" onclick="deleteClient('${client.id}')" title="Supprimer">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  renderClientPagination(clients.length);
}

function renderClientPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / clientsPerPage);
  const pagination = document.getElementById('pagination-clients');

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  pagination.innerHTML = `
    <nav>
      <ul class="pagination justify-content-center">
        <li class="page-item ${currentClientPage === 1 ? 'disabled' : ''}">
          <a class="page-link" href="#" onclick="event.preventDefault(); changeClientPage(${currentClientPage - 1})">Précédent</a>
        </li>
        ${Array.from({length: totalPages}, (_, i) => `
          <li class="page-item ${i + 1 === currentClientPage ? 'active' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); changeClientPage(${i + 1})">${i + 1}</a>
          </li>
        `).join('')}
        <li class="page-item ${currentClientPage === totalPages ? 'disabled' : ''}">
          <a class="page-link" href="#" onclick="event.preventDefault(); changeClientPage(${currentClientPage + 1})">Suivant</a>
        </li>
      </ul>
    </nav>
  `;
}

window.changeClientPage = function(page) {
  currentClientPage = page;
  displayClients(allClients);
};

const debouncedFilterClients = debounce(function() {
  const search = document.getElementById('search-clients').value.toLowerCase();
  const status = document.getElementById('filter-client-status')?.value || '';

  let filtered = allClients.filter(client => {
    const matchSearch = !search ||
      client.nom.toLowerCase().includes(search) ||
      (client.prenom && client.prenom.toLowerCase().includes(search)) ||
      client.email.toLowerCase().includes(search) ||
      (client.telephone && client.telephone.includes(search));

    const matchStatus = !status ||
      (status === 'actif' && client.total_commandes > 0) ||
      (status === 'inactif' && client.total_commandes === 0);

    return matchSearch && matchStatus;
  });

  currentClientPage = 1;
  displayClients(filtered);
}, 300);

window.filterClients = function() {
  debouncedFilterClients();
};

window.setClientView = function(view) {
  currentClientView = view;
  displayClients(allClients);
};

const clientModal = new bootstrap.Modal(document.getElementById('clientModal'));
window.showClientModal = function(clientId = null) {
  editingClientId = clientId;
  const form = document.getElementById('client-form');
  form.reset();

  document.getElementById('clientModalTitle').textContent = clientId ? 'Modifier Client' : 'Nouveau Client';

  if (clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (client) {
      document.getElementById('client-prenom').value = client.prenom || '';
      document.getElementById('client-nom').value = client.nom;
      document.getElementById('client-email').value = client.email;
      document.getElementById('client-telephone').value = client.telephone || '';
      document.getElementById('client-adresse').value = client.adresse || '';
      document.getElementById('client-notes').value = client.notes || '';
    }
  }

  clientModal.show();
};

window.editClient = function(id) {
  showClientModal(id);
};

window.viewClientOrders = async function(clientId) {
  const token = localStorage.getItem('jwtToken');

  try {
    const response = await fetch(`${API_BASE}/admin/clients/${clientId}/commandes`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const commandes = await response.json();
    document.querySelector('[data-bs-target="#tab-commandes"]').click();
    showToast(`${commandes.length} commande(s) pour ce client`, 'info');
  } catch (error) {
    showToast('Erreur chargement commandes', 'error');
  }
};

window.activateClient = async function(clientId) {
  const email = prompt('Entrez l\'adresse email pour activer ce client :');

  if (!email) return;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('Email invalide', 'error');
    return;
  }

  const token = localStorage.getItem('jwtToken');

  try {
    const response = await fetch(`${API_BASE}/admin/clients/${clientId}/activate`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    if (response.ok) {
      showToast('Client activé avec succès', 'success');
      // Invalider cache clients
      cache.clients = { data: null, timestamp: 0 };
      loadClients();
      addToHistory('Activation d\'un client boutique');
    } else {
      const error = await response.json();
      showToast(error.error || 'Erreur activation', 'error');
    }
  } catch (error) {
    showToast('Erreur réseau', 'error');
  }
};

window.deleteClient = async function(id) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ? Toutes ses commandes seront également supprimées.')) {
    return;
  }

  const token = localStorage.getItem('jwtToken');

  try {
    const response = await fetch(`${API_BASE}/admin/clients/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      showToast('Client supprimé avec succès', 'success');
      // Invalider cache clients
      cache.clients = { data: null, timestamp: 0 };
      loadClients();
      loadStats();
      addToHistory('Suppression d\'un client');
    } else {
      const error = await response.json();
      showToast(error.error || 'Erreur suppression', 'error');
    }
  } catch (error) {
    showToast('Erreur réseau', 'error');
  }
};

document.getElementById('client-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const token = localStorage.getItem('jwtToken');
  const formData = {
    prenom: document.getElementById('client-prenom').value,
    nom: document.getElementById('client-nom').value,
    email: document.getElementById('client-email').value,
    telephone: document.getElementById('client-telephone').value,
    adresse: document.getElementById('client-adresse').value,
    notes: document.getElementById('client-notes').value
  };

  try {
    const url = editingClientId
      ? `${API_BASE}/admin/clients/${editingClientId}`
      : `${API_BASE}/admin/clients`;

    const method = editingClientId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    if (response.ok) {
      showToast(
        editingClientId ? 'Client modifié avec succès' : 'Client créé avec succès',
        'success'
      );
      clientModal.hide();
      // Invalider cache clients
      cache.clients = { data: null, timestamp: 0 };
      loadClients();
      loadStats();
      addToHistory(editingClientId ? 'Modification d\'un client' : 'Création d\'un nouveau client');
    } else {
      const error = await response.json();
      showToast(error.error || 'Erreur enregistrement', 'error');
    }
  } catch (error) {
    showToast('Erreur réseau', 'error');
  }
});

window.toggleAllClients = function() {
  const checkboxes = document.querySelectorAll('.client-checkbox');
  const mainCheckbox = event.target;

  checkboxes.forEach(cb => {
    cb.checked = mainCheckbox.checked;
  });
};

// ==================== COMMANDES (LAZY LOADING) ====================
const orderModal = new bootstrap.Modal(document.getElementById('orderModal'));
window.showOrderModal = function() {
  document.getElementById('order-form').reset();
  selectedOrderClient = null;
  orderItems = [];
  editingOrderId = null; // ✅ RESET pour nouvelle commande

  // Charger la liste des clients pour la recherche
  displayClientSearch();

  // Charger la liste des produits
  displayProductsForOrder();

  // Titre modal pour nouvelle
  document.getElementById('orderModalTitle').textContent = 'Nouvelle Commande';

  orderModal.show();
};

// ✅ FIX : Fonction editOrder définie (charge commande pour PUT)
window.editOrder = async function(id) {
  const token = localStorage.getItem('jwtToken');
  editingOrderId = id; // Set ID pour PUT
  orderItems = []; // Reset items
  selectedOrderClient = null;

  try {
    const response = await fetch(`${API_BASE}/admin/commandes/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Erreur chargement commande');

    const order = await response.json();
    console.log('📦 Commande chargée pour edit:', order);

    // Peuple modal
    document.getElementById('order-client').value = order.client_nom || order.client_id || '';
    selectedOrderClient = { id: order.client_id, nom: order.client_nom };
    document.getElementById('order-status').value = order.status;
    document.getElementById('order-adresse').value = order.adresse || '';
    document.getElementById('order-remise').value = order.remise || '0';
    document.getElementById('order-total-brut').value = order.total; // Approx
    document.getElementById('order-total').value = order.total;

    // Recharge produits/items pour edit
    displayProductsForOrder();
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        const checkbox = document.getElementById(`product-${item.produit_id}`);
        if (checkbox) {
          checkbox.checked = true;
          checkbox.onchange(); // Trigger updateOrderItems
          const qtyInput = document.getElementById(`qty-${item.produit_id}`);
          if (qtyInput) qtyInput.value = item.quantite;
        }
      });
      updateOrderItems(); // Recalcule totals
    }

    // Titre modal pour edit
    document.getElementById('orderModalTitle').textContent = `Modifier Commande #${order.id.substring(0, 8)}...`;

    orderModal.show();
  } catch (error) {
    console.error('❌ Erreur editOrder:', error);
    showToast('Erreur chargement commande pour édition', 'error');
  }
};

function displayClientSearch() {
  const clientSearchContainer = document.getElementById('order-client');

  // Transformer l'input en un datalist pour l'autocomplétion
  const existingDatalist = document.getElementById('clients-datalist');
  if (existingDatalist) existingDatalist.remove();

  const datalist = document.createElement('datalist');
  datalist.id = 'clients-datalist';

  allClients.forEach(client => {
    const option = document.createElement('option');
    option.value = `${client.prenom || ''} ${client.nom}`.trim();
    option.setAttribute('data-client-id', client.id);
    option.setAttribute('data-client-email', client.email);
    datalist.appendChild(option);
  });

  clientSearchContainer.setAttribute('list', 'clients-datalist');
  clientSearchContainer.parentElement.appendChild(datalist);

  // Ajouter un événement pour sélectionner le client
  clientSearchContainer.addEventListener('input', function() {
    const selectedOption = Array.from(datalist.options).find(
      opt => opt.value === this.value
    );

    if (selectedOption) {
      selectedOrderClient = {
        id: selectedOption.getAttribute('data-client-id'),
        email: selectedOption.getAttribute('data-client-email'),
        nom: this.value
      };
      console.log('Client sélectionné:', selectedOrderClient);
    }
  });
}

function displayProductsForOrder() {
  const container = document.getElementById('products-select-list');
  if (!container) return;

  const searchInput = document.getElementById('filter-product-search');
  const typeFilter = document.getElementById('filter-product-type');
  const ageFilter = document.getElementById('filter-product-age');

  function filterAndDisplay() {
    const search = searchInput?.value.toLowerCase() || '';
    const type = typeFilter?.value || '';
    const age = ageFilter?.value || '';

    const filtered = allProducts.filter(p =>
      p.nom.toLowerCase().includes(search) &&
      (!type || p.type === type) &&
      (!age || p.age === age) &&
      p.stock > 0
    );

    container.innerHTML = filtered.map(p => `
      <div class="form-check border-bottom py-2">
        <input
          class="form-check-input product-select"
          type="checkbox"
          value="${p.id}"
          id="product-${p.id}"
          data-price="${p.prix}"
          data-name="${p.nom}"
          onchange="updateOrderItems()">
        <label class="form-check-label d-flex justify-content-between w-100" for="product-${p.id}">
          <span>
            <strong>${p.nom}</strong>
            <small class="text-muted d-block">${p.type} | ${p.age}</small>
          </span>
          <span class="text-success fw-bold">${p.prix.toLocaleString('fr-FR')} FCFA</span>
        </label>
        <div class="ms-4 mt-2" id="quantity-${p.id}" style="display:none;">
          <label for="qty-${p.id}" class="form-label small">Quantité:</label>
          <input
            type="number"
            class="form-control form-control-sm"
            id="qty-${p.id}"
            value="1"
            min="1"
            max="${p.stock}"
            onchange="updateOrderItems()">
          <small class="text-muted">Stock: ${p.stock}</small>
        </div>
      </div>
    `).join('');
  }

  // Initialiser les filtres
  if (searchInput) searchInput.addEventListener('input', filterAndDisplay);
  if (typeFilter) typeFilter.addEventListener('change', filterAndDisplay);
  if (ageFilter) ageFilter.addEventListener('change', filterAndDisplay);

  filterAndDisplay();
}

window.updateOrderItems = function() {
  const checkboxes = document.querySelectorAll('.product-select:checked');
  orderItems = [];
  let totalBrut = 0;

  checkboxes.forEach(cb => {
    const productId = cb.value;
    const price = parseFloat(cb.getAttribute('data-price'));
    const name = cb.getAttribute('data-name');
    const qtyInput = document.getElementById(`qty-${productId}`);
    const quantityDiv = document.getElementById(`quantity-${productId}`);

    // Afficher le champ quantité
    if (quantityDiv) {
      quantityDiv.style.display = 'block';
    }

    const quantity = qtyInput ? parseInt(qtyInput.value) : 1;

    orderItems.push({
      produit_id: productId,
      nom: name,
      prix_unitaire: price,
      quantite: quantity
    });

    totalBrut += price * quantity;
  });

  // Cacher les champs quantité des produits non sélectionnés
  document.querySelectorAll('.product-select:not(:checked)').forEach(cb => {
    const quantityDiv = document.getElementById(`quantity-${cb.value}`);
    if (quantityDiv) {
      quantityDiv.style.display = 'none';
    }
  });

  // Mettre à jour le total brut
  document.getElementById('order-total-brut').value = totalBrut.toFixed(2);

  // Calculer le total net
  calculateTotal();
};

window.calculateTotal = function() {
  const totalBrut = parseFloat(document.getElementById('order-total-brut').value) || 0;
  const remiseInput = document.getElementById('order-remise').value;
  let remise = 0;

  if (remiseInput) {
    if (remiseInput.includes('%')) {
      // Remise en pourcentage
      const percentage = parseFloat(remiseInput.replace('%', ''));
      remise = (totalBrut * percentage) / 100;
    } else {
      // Remise en FCFA
      remise = parseFloat(remiseInput);
    }
  }

  const totalNet = totalBrut - remise;
  document.getElementById('order-total').value = totalNet.toFixed(2);
};

document.getElementById('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const clientInput = document.getElementById('order-client').value;
  const status = document.getElementById('order-status').value;
  const total = parseFloat(document.getElementById('order-total').value);
  const adresse = document.getElementById('order-adresse').value;
  const remise = document.getElementById('order-remise').value;

  if (!clientInput) {
    showToast('Veuillez sélectionner un client', 'error');
    return;
  }

  if (orderItems.length === 0) {
    showToast('Veuillez sélectionner au moins un produit', 'error');
    return;
  }

  const token = localStorage.getItem('jwtToken');

  // Déterminer le client_id
  let clientId = selectedOrderClient ? selectedOrderClient.id : clientInput;

  try {
    const url = editingOrderId ? `${API_BASE}/admin/commandes/${editingOrderId}` : `${API_BASE}/admin/commandes`;
    const method = editingOrderId ? 'PUT' : 'POST'; // ✅ PUT pour edit

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        status: status,
        total: total,
        adresse: adresse,
        remise: remise,
        items: orderItems // ✅ Envoi items pour update/create
      })
    });

    if (response.ok) {
      showToast(editingOrderId ? 'Commande modifiée avec succès' : 'Commande créée avec succès', 'success');
      orderModal.hide();
      editingOrderId = null; // Reset
      // Invalider cache commandes
      cache.orders = { data: null, timestamp: 0 };
      loadCommandesAdmin();
      loadStats();
      addToHistory(editingOrderId ? 'Modification d\'une commande' : 'Création d\'une nouvelle commande');
    } else {
      const error = await response.json();
      showToast(error.error || 'Erreur création/modification commande', 'error');
    }
  } catch (error) {
    showToast('Erreur réseau', 'error');
  }
});

window.loadCommandesAdmin = async function() {
  const token = localStorage.getItem('jwtToken');
  const container = document.getElementById('commandes-container');
  if (container) {
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p>Chargement des commandes...</p></div>';
  }

  try {
    const orders = await fetchWithCache(`${API_BASE}/admin/commandes`, 'orders', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (orders && orders.length > 0) {
      allOrders = orders;

      if (container) {
        container.innerHTML = `
          <div class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Client</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${allOrders.map(order => `
                  <tr>
                    <td><code>${order.id.substring(0, 8)}...</code></td>
                    <td>
                      <strong>${order.client_nom || 'Client'} ${order.client_prenom || ''}</strong><br>
                      <small class="text-muted">${order.client_email || order.client_id}</small>
                    </td>
                    <td class="fw-bold text-success">${order.total.toLocaleString('fr-FR')} FCFA</td>
                    <td><span class="badge bg-${order.status === 'payee' ? 'success' : order.status === 'expediee' ? 'info' : order.status === 'livree' ? 'primary' : order.status === 'annulee' ? 'danger' : 'secondary'}">${order.status}</span></td>
                    <td>${new Date(order.created_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <button class="btn btn-sm btn-outline-info" onclick="viewOrderDetails('${order.id}')"><i class="bi bi-eye"></i></button>
                      <button class="btn btn-sm btn-outline-primary" onclick="editOrder('${order.id}')"><i class="bi bi-pencil"></i></button>
                      <button class="btn btn-sm btn-outline-danger" onclick="deleteOrder('${order.id}')"><i class="bi bi-trash"></i></button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      loadBeneficesGrid();
    } else {
      // ✅ FALLBACK : Si 0 commandes, affiche message
      if (container) {
        container.innerHTML = `
          <div class="text-center py-5">
            <i class="bi bi-receipt-cutoff fs-1 text-muted mb-3"></i>
            <h5>Aucune commande</h5>
            <p class="text-muted">Créez votre première commande</p>
            <button class="btn btn-gradient" onclick="showOrderModal()">
              <i class="bi bi-plus-lg"></i> Nouvelle Commande
            </button>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('❌ Erreur loadCommandesAdmin:', error);
    if (container) {
      container.innerHTML = '<div class="alert alert-danger">Erreur de chargement des commandes. <button class="btn btn-sm btn-outline-danger ms-2" onclick="loadCommandesAdmin()"><i class="bi bi-arrow-clockwise"></i> Réessayer</button></div>';
    }
    showToast('Erreur chargement commandes (404 ? Vérifiez routes)', 'error');
  }
};

window.viewOrderDetails = async function(orderId) {
  const token = localStorage.getItem('jwtToken');

  try {
    const response = await fetch(`${API_BASE}/admin/commandes/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const order = await response.json();

    const detailsHtml = `
      <div class="modal fade show" style="display:block; background: rgba(0,0,0,0.5);" id="orderDetailsModal">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Détails Commande #${order.id.substring(0, 8)}</h5>
              <button onclick="document.getElementById('orderDetailsModal').remove()" class="btn-close"></button>
            </div>
            <div class="modal-body">
              <div class="row mb-3">
                <div class="col-md-6">
                  <strong>Client:</strong> ${order.client_email || order.client_id}
                </div>
                <div class="col-md-6">
                  <strong>Status:</strong> <span class="badge bg-${order.status === 'payee' ? 'success' : 'secondary'}">${order.status}</span>
                </div>
              </div>

              <h6 class="mt-4">Articles:</h6>
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Prix unitaire</th>
                    <th>Quantité</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map(item => `
                    <tr>
                      <td>${item.produit_nom}</td>
                      <td>${item.prix_unitaire.toLocaleString('fr-FR')} FCFA</td>
                      <td>${item.quantite}</td>
                      <td>${(item.prix_unitaire * item.quantite).toLocaleString('fr-FR')} FCFA</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div class="text-end mt-3">
                ${order.remise > 0 ? `
                  <p class="mb-2">
                    <span class="text-muted">Sous-total:</span> 
                    <span class="fw-bold">${(order.total + order.remise).toLocaleString('fr-FR')} FCFA</span>
                  </p>
                  <p class="mb-2">
                    <span class="text-warning">Remise:</span> 
                    <span class="fw-bold text-warning">-${order.remise.toLocaleString('fr-FR')} FCFA</span>
                  </p>
                ` : ''}
                <h5>Total: <span class="text-success">${order.total.toLocaleString('fr-FR')} FCFA</span></h5>
              </div>
            </div>
            <div class="modal-footer">
              <button onclick="document.getElementById('orderDetailsModal').remove()" class="btn btn-secondary">Fermer</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', detailsHtml);
  } catch (error) {
    showToast('Erreur chargement détails', 'error');
  }
};

async function loadBeneficesGrid() {
  const token = localStorage.getItem('jwtToken');
  const grid = document.getElementById('benefices-grid');

  try {
    const ordersWithBenefits = await fetchWithCache(`${API_BASE}/admin/commandes/benefits`, 'orders_benefits', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!ordersWithBenefits || !grid) return;

    if (ordersWithBenefits.length === 0) {
      // ✅ FALLBACK : Message si 0 bénéfices
      grid.innerHTML = `
        <div class="col-12 text-center py-4">
          <i class="bi bi-graph-down fs-1 text-muted mb-3"></i>
          <h5>Aucun bénéfice calculé</h5>
          <p class="text-muted">Créez des commandes pour voir les marges layettes</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = ordersWithBenefits.slice(0, 6).map(order => {
      const totalAchat = order.items.reduce((sum, item) => sum + (item.prix_achat * item.quantite), 0);
      const benefice = (order.total - (order.remise || 0)) - totalAchat;
      const beneficeColor = benefice > 0 ? 'bg-success' : 'bg-danger';

      return `
        <div class="col-md-4">
          <div class="card h-100 border-0 shadow-sm">
            <div class="card-body text-center">
              <h6 class="card-title"><code>${order.id.substring(0, 8)}...</code></h6>
              <p class="text-muted mb-2">Bénéfice: <span class="badge ${beneficeColor}">${benefice.toLocaleString('fr-FR')} FCFA</span></p>
              <small>Total vente: ${order.total.toLocaleString('fr-FR')} FCFA<br>Remise: ${(order.remise || 0).toLocaleString('fr-FR')} FCFA<br>Total achat: ${totalAchat.toLocaleString('fr-FR')} FCFA</small>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('❌ Erreur loadBeneficesGrid:', error);
    if (grid) {
      grid.innerHTML = '<div class="col-12"><div class="alert alert-warning">Erreur chargement bénéfices (404 ? Vérifiez /commandes/benefits)</div></div>';
    }
  }
}

window.deleteOrder = async function(id) {
  if (!confirm('Supprimer cette commande ?')) return;

  const token = localStorage.getItem('jwtToken');
  try {
    await fetch(`${API_BASE}/admin/commandes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    showToast('Commande supprimée', 'success');
    // Invalider cache commandes
    cache.orders = { data: null, timestamp: 0 };
    loadCommandesAdmin();
    loadStats();
    addToHistory('Suppression d\'une commande');
  } catch (error) {
    showToast('Erreur suppression', 'error');
  }
};

// ==================== ANALYTICS (LAZY LOADING) ====================
async function loadAnalytics(period = '7days') {
  const token = localStorage.getItem('jwtToken');

  try {
    // Charger les données analytics
    const data = await fetchWithCache(`${API_BASE}/admin/analytics/overview?period=${period}`, `analytics_overview_${period}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!data) return;

    // Mettre à jour les KPIs
    updateKPIs(data);

    // Mettre à jour les graphiques (fallback si data vide)
    updateSalesChart(data.salesByDay || []);
    updateCategoriesChart(data.typeDistribution || []);
    updateTopProducts(data.topProducts || []);
    updateRevenueByType(data.typeDistribution || []); // ✅ AJOUTÉ : Fonction manquante

    // Charger insights clients
    loadCustomerInsights();

    // Charger prévisions
    loadForecast();

    // Charger meilleurs clients
    loadBestCustomers();

  } catch (error) {
    console.error('Erreur chargement analytics:', error);
    showToast('Erreur chargement analytics', 'error');
  }
}

function updateKPIs(data) {
  const totalRevenue = (data.salesByDay || []).reduce((sum, day) => sum + (day.revenue || 0), 0);
  const totalOrders = (data.salesByDay || []).reduce((sum, day) => sum + (day.orders || 0), 0);
  const avgBasket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const kpiRevenue = document.getElementById('kpi-revenue');
  const kpiOrders = document.getElementById('kpi-orders');
  const kpiAvgBasket = document.getElementById('kpi-avg-basket');
  const kpiConversion = document.getElementById('kpi-conversion');

  if (kpiRevenue) kpiRevenue.textContent = totalRevenue.toLocaleString('fr-FR') + ' FCFA';
  if (kpiOrders) kpiOrders.textContent = totalOrders;
  if (kpiAvgBasket) kpiAvgBasket.textContent = Math.round(avgBasket).toLocaleString('fr-FR') + ' FCFA';
  if (kpiConversion) kpiConversion.textContent = (data.conversionRate || 0) + '%';
}

function updateSalesChart(salesByDay) {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;

  // ✅ FIX : Vérif destroy (évite TypeError)
  if (window.salesChart && typeof window.salesChart.destroy === 'function') {
    window.salesChart.destroy();
  }

  // FALLBACK : Data vide → Labels/données 0
  const labels = salesByDay.length > 0 ? salesByDay.map(d => new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })) : ['Aucune'];
  const dataValues = salesByDay.length > 0 ? salesByDay.map(d => d.revenue || 0) : [0];

  window.salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ventes (FCFA)',
        data: dataValues,
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toLocaleString('fr-FR') + ' FCFA';
            }
          }
        }
      }
    }
  });
}

// Appliquez le même fix destroy à tous charts (categoriesChart, revenueByTypeChart, etc.)
function updateCategoriesChart(typeDistribution) {
  const ctx = document.getElementById('categoriesChart');
  if (!ctx) return;

  if (window.categoriesChart && typeof window.categoriesChart.destroy === 'function') {
    window.categoriesChart.destroy();
  }

  const labels = typeDistribution.length > 0 ? typeDistribution.map(t => t.type) : ['Aucun'];
  const dataValues = typeDistribution.length > 0 ? typeDistribution.map(t => t.quantite || 0) : [0];

  window.categoriesChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: dataValues,
        backgroundColor: ['#ec4899', '#a855f7', '#3b82f6', '#10b981', '#f59e0b']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// ✅ AJOUTÉ : Fonction manquante pour revenus par type layette (bar chart)
function updateRevenueByType(typeDistribution) { 
  const ctx = document.getElementById('revenueByTypeChart');
  if (!ctx) return;

  if (window.revenueByTypeChart) window.revenueByTypeChart.destroy();

  // ✅ FALLBACK : Data vide → Labels/données 0
  const labels = typeDistribution.length > 0 ? typeDistribution.map(t => t.type) : ['Aucun'];
  const dataValues = typeDistribution.length > 0 ? typeDistribution.map(t => t.revenu || 0) : [0];

  window.revenueByTypeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenus par Type (FCFA)',
        data: dataValues,
        backgroundColor: ['#ec4899', '#a855f7', '#3b82f6'],
        borderColor: ['#ec4899', '#a855f7', '#3b82f6'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toLocaleString('fr-FR') + ' FCFA';
            }
          }
        }
      }
    }
  });
}

// Exporter un graphique
window.exportChart = function(chartId) {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;

  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `${chartId}_${new Date().toISOString().split('T')[0]}.png`;
  link.href = url;
  link.click();
  showToast('Graphique exporté', 'success');
};

function updateTopProducts(products) {
  const container = document.getElementById('top-products-list');
  if (!container) return;

  // ✅ FALLBACK : Si 0 produits, message
  if ((products || []).length === 0) {
    container.innerHTML = '<div class="text-center py-3 text-muted">Aucun produit vendu</div>';
    return;
  }

  container.innerHTML = products.map((product, index) => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div class="d-flex align-items-center">
        <span class="badge ${index < 3 ? 'bg-warning' : 'bg-secondary'} me-2">${index + 1}</span>
        <div>
          <strong>${product.nom}</strong>
          <small class="text-muted d-block">${product.type}</small>
        </div>
      </div>
      <div class="text-end">
        <div class="fw-bold text-success">${(product.revenu_total || 0).toLocaleString('fr-FR')} FCFA</div>
        <small class="text-muted">${product.total_vendu || 0} vendus</small>
      </div>
    </div>
  `).join('');
}

async function loadBestCustomers() {
  const token = localStorage.getItem('jwtToken');

  try {
    const customers = await fetchWithCache(`${API_BASE}/admin/stats/best-customers`, 'stats_best_customers', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const tbody = document.getElementById('best-customers-table');
    if (!tbody || !customers) return;

    // ✅ FALLBACK : Si 0 clients, message
    if ((customers || []).length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Aucun client</td></tr>';
      return;
    }

    tbody.innerHTML = customers.map((customer, index) => `
      <tr>
        <td><span class="badge ${index < 3 ? 'bg-warning' : 'bg-secondary'}">${index + 1}</span></td>
        <td>
          <strong>${customer.prenom || ''} ${customer.nom}</strong>
          <small class="text-muted d-block">${customer.email}</small>
        </td>
        <td><span class="badge bg-primary">${customer.total_commandes || 0}</span></td>
        <td class="fw-bold text-success">${(customer.total_depense || 0).toLocaleString('fr-FR')} FCFA</td>
        <td>${Math.round((customer.total_depense || 0) / (customer.total_commandes || 1)).toLocaleString('fr-FR')} FCFA</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement meilleurs clients:', error);
  }
}

async function loadCustomerInsights() {
  const token = localStorage.getItem('jwtToken');

  try {
    const data = await fetchWithCache(`${API_BASE}/admin/analytics/customer-insights`, 'analytics_customer_insights', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const ctx = document.getElementById('clientActivityChart');
    if (!ctx || !data) return;

    if (window.clientActivityChart) window.clientActivityChart.destroy();

    // ✅ FALLBACK : Data vide → Labels/données 0
    const labels = (data.activeClients || []).map(s => {
      if (s.status === 'actif') return 'Actifs (30j)';
      if (s.status === 'peu_actif') return 'Peu actifs (90j)';
      return 'Inactifs';
    });
    const dataValues = (data.activeClients || []).map(s => s.count || 0);

    window.clientActivityChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: dataValues,
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  } catch (error) {
    console.error('Erreur insights clients:', error);
  }
}

async function loadForecast() {
  const token = localStorage.getItem('jwtToken');

  try {
    const data = await fetchWithCache(`${API_BASE}/admin/analytics/revenue-forecast`, 'analytics_forecast', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const ctx = document.getElementById('forecastChart');
    if (!ctx || !data) return;

    if (window.forecastChart) window.forecastChart.destroy();

    const allDates = [
      ...(data.historical || []).map(d => d.date),
      ...(data.forecast || []).map(d => d.date)
    ];

    // ✅ FALLBACK : Data vide → Labels/données 0
    const historicalData = (data.historical || []).map(d => d.revenue || 0);
    const forecastData = (data.forecast || []).map(d => d.predicted_revenue || 0);
    const labels = allDates.map(d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) || ['Aucune'];

    window.forecastChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Réel',
            data: [
              ...historicalData,
              ...Array(forecastData.length).fill(null)
            ],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4
          },
          {
            label: 'Prévision',
            data: [
              ...Array(historicalData.length).fill(null),
              ...forecastData
            ],
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            borderDash: [5, 5],
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  } catch (error) {
    console.error('Erreur prévisions:', error);
  }
}

// ==================== HISTORIQUE DYNAMIQUE ====================
function loadActivityHistory() {
  const history = JSON.parse(localStorage.getItem('activityHistory') || '[]');
  activityHistory = history;
}

function addToHistory(action) {
  const entry = {
    action: action,
    timestamp: new Date().toISOString(),
    user: document.getElementById('admin-name').textContent
  };

  activityHistory.unshift(entry);

  // Garder seulement les 50 dernières actions
  if (activityHistory.length > 50) {
    activityHistory = activityHistory.slice(0, 50);
  }

  localStorage.setItem('activityHistory', JSON.stringify(activityHistory));
}

window.showHistory = function() {
  const historyHtml = `
    <div class="modal fade show" style="display:block; background: rgba(0,0,0,0.5);" id="historyModal">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-clock-history"></i> Historique des activités</h5>
            <button onclick="document.getElementById('historyModal').remove()" class="btn-close"></button>
          </div>
          <div class="modal-body" style="max-height: 500px; overflow-y: auto;">
            ${activityHistory.length === 0 ?
              '<p class="text-muted text-center py-5">Aucune activité enregistrée</p>' :
              `<div class="list-group">
                ${activityHistory.map(entry => `
                  <div class="list-group-item">
                    <div class="d-flex w-100 justify-content-between">
                      <h6 class="mb-1">${entry.action}</h6>
                      <small class="text-muted">${new Date(entry.timestamp).toLocaleString('fr-FR')}</small>
                    </div>
                    <small class="text-muted">Par: ${entry.user}</small>
                  </div>
                `).join('')}
              </div>`
            }
          </div>
          <div class="modal-footer">
            <button onclick="clearHistory()" class="btn btn-outline-danger">Effacer l'historique</button>
            <button onclick="document.getElementById('historyModal').remove()" class="btn btn-secondary">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', historyHtml);
};

window.clearHistory = function() {
  if (confirm('Effacer tout l\'historique ?')) {
    localStorage.removeItem('activityHistory');
    activityHistory = [];
    document.getElementById('historyModal').remove();
    showToast('Historique effacé', 'success');
  }
};

// ==================== INVENTAIRE ====================
async function loadInventory() {
  const token = localStorage.getItem('jwtToken');
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-4 text-muted">
        <div class="spinner-border text-pink me-2" role="status"></div>
        Chargement de l'inventaire...
      </td>
    </tr>
  `;

  try {
    const plans = await fetchWithCache(`${API_BASE}/admin/inventory`, 'inventory_plans', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!plans || plans.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-muted">
            Aucun plan d'achat pour le moment.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = plans.map(plan => `
      <tr>
        <td>
          <strong>${plan.nom}</strong><br>
          <small class="text-muted">${plan.type} • ${plan.age}</small>
        </td>
        <td>
          <span class="badge ${plan.stock > 10 ? 'bg-success' : plan.stock > 0 ? 'bg-warning' : 'bg-danger'}">
            ${plan.stock}
          </span>
        </td>
        <td>${plan.quantite_prevue}</td>
        <td>${plan.quantite_reelle || 0}</td>
        <td>${plan.date_prevue ? new Date(plan.date_prevue).toLocaleDateString('fr-FR') : '-'}</td>
        <td>${plan.notes ? `<small class="text-muted">${plan.notes}</small>` : '<span class="text-muted">-</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editInventoryPlan('${plan.id}')">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteInventoryPlan('${plan.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('❌ Erreur chargement inventaire:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-danger">
          Erreur chargement inventaire
        </td>
      </tr>
    `;
  }
}

window.showInventoryModal = function(planId = null) {
  const existingRow = planId ? document.querySelector(`#inventory-table-body tr[data-id="${planId}"]`) : null;
  const today = new Date().toISOString().split('T')[0];

  const modalHtml = `
    <div class="modal fade show" style="display:block; background: rgba(0,0,0,0.5);" id="inventoryModal">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${planId ? 'Modifier' : 'Nouveau'} plan d'achat</h5>
            <button class="btn-close" onclick="document.getElementById('inventoryModal').remove()"></button>
          </div>
          <div class="modal-body">
            <form id="inventory-form">
              <div class="mb-3">
                <label class="form-label">Produit</label>
                <select class="form-select" id="inventory-produit" required>
                  ${allProducts.map(p => `
                    <option value="${p.id}">${p.nom} (${p.stock} en stock)</option>
                  `).join('')}
                </select>
              </div>
              <div class="row g-2 mb-3">
                <div class="col-6">
                  <label class="form-label">Quantité prévue</label>
                  <input type="number" min="1" class="form-control" id="inventory-qty-prevue" required>
                </div>
                <div class="col-6">
                  <label class="form-label">Quantité réelle</label>
                  <input type="number" min="0" class="form-control" id="inventory-qty-reelle" value="0">
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Date prévue</label>
                <input type="date" class="form-control" id="inventory-date" value="${today}">
              </div>
              <div class="mb-3">
                <label class="form-label">Notes</label>
                <textarea class="form-control" id="inventory-notes" rows="2"></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('inventoryModal').remove()">Annuler</button>
            <button class="btn btn-gradient" onclick="saveInventoryPlan('${planId || ''}')">Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.editInventoryPlan = function(id) {
  // Pour simplifier, on recharge puis on laisse l'utilisateur choisir le produit/quantités.
  showInventoryModal(id);
};

window.deleteInventoryPlan = async function(id) {
  if (!confirm('Supprimer ce plan d\'achat ?')) return;
  const token = localStorage.getItem('jwtToken');
  try {
    await fetch(`${API_BASE}/admin/inventory/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    cache.inventory_plans = { data: null, timestamp: 0 };
    loadInventory();
    showToast('Plan inventaire supprimé', 'success');
  } catch (error) {
    showToast('Erreur suppression inventaire', 'error');
  }
};

window.saveInventoryPlan = async function(planId) {
  const token = localStorage.getItem('jwtToken');
  const body = {
    produit_id: document.getElementById('inventory-produit').value,
    quantite_prevue: parseInt(document.getElementById('inventory-qty-prevue').value, 10),
    quantite_reelle: parseInt(document.getElementById('inventory-qty-reelle').value || '0', 10),
    date_prevue: document.getElementById('inventory-date').value || null,
    notes: document.getElementById('inventory-notes').value || null,
  };

  const url = planId ? `${API_BASE}/admin/inventory/${planId}` : `${API_BASE}/admin/inventory`;
  const method = planId ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Erreur enregistrement inventaire');
    }

    cache.inventory_plans = { data: null, timestamp: 0 };
    loadInventory();
    showToast('Inventaire enregistré', 'success');
    const modal = document.getElementById('inventoryModal');
    if (modal) modal.remove();
  } catch (error) {
    console.error('❌ Erreur saveInventoryPlan:', error);
    showToast(error.message, 'error');
  }
}

// ==================== NOTIFICATIONS ====================
async function loadNotifications() {
  const token = localStorage.getItem('jwtToken');
  try {
    const notifs = await fetchWithCache(`${API_BASE}/admin/notifications`, 'notifications', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (notifs) {
      notifications = notifs;
      const unreadCount = notifications.filter(n => !n.read).length;
      const notifCount = document.getElementById('notif-count');
      if (notifCount) notifCount.textContent = unreadCount;
    }
  } catch (error) {
    console.error('Erreur chargement notifications');
  }
}

window.toggleNotifications = function() {
  const dropdown = document.getElementById('notifications-dropdown');
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  if (dropdown.style.display === 'block') {
    displayNotifications();
  }
};

function displayNotifications() {
  const list = document.getElementById('notifications-list');
  if (!list) return;

  list.innerHTML = notifications.map(notif => `
    <div class="alert alert-${notif.type === 'success' ? 'success' : notif.type === 'error' ? 'danger' : 'warning'} alert-dismissible fade show mb-2" role="alert">
      ${notif.message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" onclick="markAsRead('${notif.id}')"></button>
    </div>
  `).join('');
}

window.markAsRead = async function(id) {
  const token = localStorage.getItem('jwtToken');
  try {
    await fetch(`${API_BASE}/admin/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    loadNotifications();
  } catch (error) {
    showToast('Erreur mise à jour notification', 'error');
  }
};

window.markAllAsRead = async function() {
  const token = localStorage.getItem('jwtToken');
  try {
    await fetch(`${API_BASE}/admin/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    loadNotifications();
    displayNotifications();
  } catch (error) {
    showToast('Erreur', 'error');
  }
};

// ==================== UTILITAIRES ====================
function initDragDrop() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('product-image');
  const preview = document.getElementById('image-preview');
  if (!zone || !input || !preview) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    }
  });
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageUpload(file);
  });
  function handleImageUpload(file) {
    // Validation fichier
    if (!file.type.startsWith('image/')) {
      showToast('Veuillez sélectionner une image valide (JPG, PNG)', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB
      showToast('L\'image ne doit pas dépasser 5MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('image-preview');
      preview.src = e.target.result;
      preview.style.display = 'block';
      preview.classList.add('img-thumbnail', 'rounded'); // Style Bootstrap pour aperçu
      preview.style.maxWidth = '200px'; // Limite taille
      preview.style.maxHeight = '200px';
    };
    reader.readAsDataURL(file);
  }
}

window.exportData = async function(format) {
  if (format === 'excel') {
    const ws = XLSX.utils.json_to_sheet(allProducts.map(p => ({
      Nom: p.nom,
      Prix: p.prix,
      Type: p.type,
      Âge: p.age,
      Stock: p.stock,
      Matière: p.matiere
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produits');
    XLSX.writeFile(wb, `loedikids_produits_${new Date().toISOString().split('T')[0]}.xlsx`);

    showToast('Export Excel réussi', 'success');
    addToHistory('Export Excel des produits');
  } else if (format === 'pdf') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.text('Loedi Kids - Liste des Produits', 10, 10);
    let y = 20;

    allProducts.forEach(p => {
      doc.text(`${p.nom} - ${p.prix} FCFA - Stock: ${p.stock}`, 10, y);
      y += 10;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`loedikids_produits_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('Export PDF réussi', 'success');
    addToHistory('Export PDF des produits');
  }
};

window.generateQR = function(id, nom) {
  const qrDiv = document.createElement('div');
  qrDiv.className = 'qr-code-container';
  new QRCode(qrDiv, {
    text: `https://loedikids.com/produit/${id}`,
    width: 200,
    height: 200
  });
  const modal = document.createElement('div');
  modal.innerHTML = `
    <div class="modal fade show" style="display:block; background: rgba(0,0,0,0.5);">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5>QR Code - ${nom}</h5>
            <button onclick="this.closest('.modal').remove()" class="btn-close"></button>
          </div>
          <div class="modal-body text-center">
            ${qrDiv.outerHTML}
            <p class="mt-3">Scannez pour voir le produit</p>
          </div>
          <div class="modal-footer">
            <button onclick="this.closest('.modal').remove()" class="btn btn-secondary">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

function showToast(message, type = 'info') {
  const container = document.querySelector('.toast-container');
  const toast = document.createElement('div');
  toast.className = `toast custom-toast align-items-center text-white bg-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'} border-0`;
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info-circle'}"></i>
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

window.showToast = showToast;

window.toggleTheme = function() {
  const html = document.documentElement;
  const icon = document.getElementById('theme-icon');
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  icon.className = newTheme === 'dark' ? 'bi bi-sun fs-4' : 'bi bi-moon-stars fs-4';
  localStorage.setItem('theme', newTheme);
};

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      showProductModal();
    }
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      document.getElementById('global-search').focus();
    }
    if (e.key === 'Escape') {
      clearSelection();
    }
  });
}

window.showShortcuts = function() {
  const shortcutsHtml = `
    <div class="modal fade show" style="display:block; background: rgba(0,0,0,0.5);" id="shortcutsModal">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-keyboard"></i> Raccourcis clavier</h5>
            <button onclick="document.getElementById('shortcutsModal').remove()" class="btn-close"></button>
          </div>
          <div class="modal-body">
            <table class="table">
              <tbody>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>N</kbd></td>
                  <td>Nouveau produit</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>K</kbd></td>
                  <td>Recherche globale</td>
                </tr>
                <tr>
                  <td><kbd>Esc</kbd></td>
                  <td>Annuler la sélection</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button onclick="document.getElementById('shortcutsModal').remove()" class="btn btn-secondary">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', shortcutsHtml);
};

function initEventListeners() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    themeIcon.className = savedTheme === 'dark' ? 'bi bi-sun fs-4' : 'bi bi-moon-stars fs-4';
  }

  // Lazy loading pour onglets
  const clientsTab = document.querySelector('[data-bs-target="#tab-clients"]');
  if (clientsTab) {
    clientsTab.addEventListener('shown.bs.tab', function() {
      if (allClients.length === 0) {
        loadClients();
      }
    });
  }

  // Rafraîchir les analytics au clic sur l'onglet
  const analyticsTab = document.querySelector('[data-bs-target="#tab-analytics"]');
  if (analyticsTab) {
    analyticsTab.addEventListener('shown.bs.tab', function() {
      loadAnalytics('7days');
    });
  }

  // Lazy loading pour inventaire
  const inventoryTab = document.querySelector('[data-bs-target="#tab-inventory"]');
  if (inventoryTab) {
    inventoryTab.addEventListener('shown.bs.tab', function() {
      loadInventory();
    });
  }

  // Lazy loading pour commandes
  const ordersTab = document.querySelector('[data-bs-target="#tab-commandes"]');
  if (ordersTab) {
    ordersTab.addEventListener('shown.bs.tab', function() {
      if (allOrders.length === 0) {
        loadCommandesAdmin();
      }
    });
  }

  // Event listeners pour les filtres de période analytics
  document.querySelectorAll('input[name="analytics-period"]').forEach(input => {
    input.addEventListener('change', function() {
      loadAnalytics(this.value);
    });
  });

  // Recherche globale avec debounce
  const globalSearch = document.getElementById('global-search');
  if (globalSearch) {
    const debouncedGlobalSearch = debounce(function(e) {
      const query = e.target.value.toLowerCase();

      if (query.length < 2) return;

      // Rechercher dans les produits
      const matchingProducts = allProducts.filter(p =>
        p.nom.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query))
      );

      // Rechercher dans les clients
      const matchingClients = allClients.filter(c =>
        c.nom.toLowerCase().includes(query) ||
        (c.prenom && c.prenom.toLowerCase().includes(query)) ||
        c.email.toLowerCase().includes(query)
      );

      console.log(`Résultats: ${matchingProducts.length} produits, ${matchingClients.length} clients`);

      if (matchingProducts.length > 0 || matchingClients.length > 0) {
        showToast(`${matchingProducts.length} produit(s) et ${matchingClients.length} client(s) trouvé(s)`, 'info');
      }
    }, 300);

    globalSearch.addEventListener('input', debouncedGlobalSearch);
  }
}

window.logout = function() {
  if (confirm('Déconnexion ?')) {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('activityHistory');
    window.location.href = 'login.html';
  }
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', initAdmin);
