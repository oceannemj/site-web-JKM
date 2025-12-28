import { addToPanier, loadProduits, API_BASE, buildImageUrl } from './api.js';

// État panier en mémoire. On privilégie le panier serveur, avec fallback localStorage.
let panierItems = [];

function updatePanierUI() {
  const container = document.getElementById('panier-items');
  if (!container) return;

  if (!panierItems || panierItems.length === 0) {
    container.innerHTML = '<p class="text-center text-muted">Panier vide</p>';
  } else {
    container.innerHTML = panierItems.map(item => {
      const productId = item.produit_id || item.id; // compat ancien format
      const imageSrc = item.image || buildImageUrl(item.image_url);
      return `
    <div class="card mb-3">
      <div class="row g-0">
        <div class="col-md-3">
          <img src="${imageSrc}" class="img-fluid rounded-start" alt="${item.nom}">
        </div>
        <div class="col-md-9">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <h5 class="card-title mb-1">${item.nom}</h5>
              <p class="card-text mb-0">${item.prix.toLocaleString('fr-FR')} FCFA x ${item.quantite}</p>
            </div>
            <button onclick="removeFromPanier('${productId}')" class="btn btn-outline-danger btn-sm">Supprimer</button>
          </div>
        </div>
      </div>
    </div>`;
    }).join('');
  }

  const total = panierItems.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
  const totalEl = document.getElementById('total-panier');
  if (totalEl) totalEl.textContent = `${total.toLocaleString('fr-FR')} FCFA`;

  // Cache local pour badge/consultation hors ligne
  localStorage.setItem('panier', JSON.stringify(panierItems));
}

async function loadPanierFromServer() {
  const token = localStorage.getItem('jwtToken');

  // Si pas connecté, fallback localStorage uniquement
  if (!token) {
    panierItems = JSON.parse(localStorage.getItem('panier') || '[]');
    updatePanierUI();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/paniers`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Erreur chargement panier');

    const data = await response.json();
    // data provient de la table `paniers` join `produits`
    panierItems = data.map(item => ({
      // On garde l'id panier mais on expose aussi produit_id pour la suite
      id: item.id,
      produit_id: item.produit_id,
      nom: item.nom,
      prix: item.prix,
      quantite: item.quantite,
      image_url: item.image_url,
      image: buildImageUrl(item.image_url)
    }));
  } catch (err) {
    console.error('❌ Erreur panier serveur, fallback localStorage:', err);
    panierItems = JSON.parse(localStorage.getItem('panier') || '[]');
  }

  updatePanierUI();
}

async function removeFromPanier(produitId) {
  // Supprimer localement (compat ancien format)
  panierItems = panierItems.filter(item => (item.produit_id || item.id) !== produitId);
  updatePanierUI();

  // Appel API pour sync (si connecté)
  const token = localStorage.getItem('jwtToken');
  if (token) {
    try {
      await fetch(`${API_BASE}/paniers/remove/${produitId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('❌ Erreur suppression panier serveur:', err);
    }
  }
}

async function viderPanier() {
  panierItems = [];
  updatePanierUI();

  const token = localStorage.getItem('jwtToken');
  if (token) {
    try {
      await fetch(`${API_BASE}/paniers/clear`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('❌ Erreur vidage panier serveur:', err);
    }
  }
}

// Init : charger d'abord depuis le serveur (si connecté)
document.addEventListener('DOMContentLoaded', loadPanierFromServer);

// Export pour global si besoin (ex: depuis catalogue)
window.addToPanierGlobal = async (produitId) => {
  try {
    const produits = await loadProduits();
    const produit = produits.find(p => p.id === produitId);
    if (produit) {
      const existing = panierItems.find(item => (item.produit_id || item.id) === produitId);
      if (existing) {
        existing.quantite++;
      } else {
        panierItems.push({
          id: produitId,
          produit_id: produitId,
          nom: produit.nom,
          prix: produit.prix,
          quantite: 1,
          image: buildImageUrl(produit.image_url),
          image_url: produit.image_url
        });
      }
      updatePanierUI();
      await addToPanier(produitId);
      alert('Ajouté au panier !');
    }
  } catch (err) { alert('Erreur: ' + err.message); }
};

window.removeFromPanier = removeFromPanier;
window.viderPanier = viderPanier;
