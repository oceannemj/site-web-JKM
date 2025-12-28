import { submitAvis, toggleLike, loadProduits, API_BASE } from './api.js';

async function loadAvisForProduit(produitId) {
  // Appel API pour avis + likes d'un produit
  const response = await fetch(`${API_BASE}/avis/produit/${produitId}`);
  if (!response.ok) {
    console.error('Erreur chargement avis produit', await response.text());
    return;
  }
  const { avis, likes } = await response.json();
  const container = document.getElementById('avis-container');
  if (container) {
    container.innerHTML = avis.map(a => `
      <div class="card mb-2">
        <div class="card-body">
          <div class="d-flex justify-content-between">
            <span class="fw-bold">${a.user_nom}</span>
            <span>⭐${'★'.repeat(a.note)}</span>
          </div>
          <p class="text-muted">${a.commentaire}</p>
        </div>
      </div>
    `).join('') || '<p>Aucun avis</p>';
    // Update likes count
    document.getElementById('likes-count') ? document.getElementById('likes-count').textContent = likes : null;
  }
}

async function submitAvisForm(produitId) {
  const commentaire = document.getElementById('avis-commentaire').value;
  const note = document.querySelector('input[name="note"]:checked').value;
  try {
    await submitAvis(produitId, commentaire, note);
    alert('Avis soumis !');
    document.getElementById('avis-form').reset();
    await loadAvisForProduit(produitId);
  } catch (err) { alert('Erreur: ' + err.message); }
}

function toggleLikeBtn(produitId, btn) {
  btn.classList.toggle('text-danger');
  toggleLike(produitId).then(() => loadAvisForProduit(produitId));
}

// Global pour pages
window.loadAvisForProduit = loadAvisForProduit;
window.submitAvisForm = submitAvisForm;
window.toggleLikeBtn = toggleLikeBtn;