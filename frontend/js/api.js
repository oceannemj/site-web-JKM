const API_BASE = 'https://loedikids-backend.onrender.com';
const API_ORIGIN = API_BASE.replace(/\/_?api$/, ''); // ex: http://localhost:3000

function buildImageUrl(imageUrl) {
  if (!imageUrl) return 'images/placeholder.jpg';
  // URL absolue déjà prête
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  // URL relative backend (/uploads/...)
  if (imageUrl.startsWith('/')) return API_ORIGIN + imageUrl;
  // Autre cas: chemin relatif simple
  return `${API_ORIGIN}/${imageUrl}`;
}

// ============================================
// AUTHENTIFICATION
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
    
    // Solution temporaire : décoder le JWT localement
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

async function login(email, password) {
  try {
    console.log('🔐 Tentative de connexion:', email);
    
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Login échoué');
    }
    
    if (data.token) {
      localStorage.setItem('jwtToken', data.token);
      console.log('✅ Token JWT stocké');
      
      // Décoder le token pour obtenir les infos utilisateur
      try {
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        console.log('📋 Payload JWT:', payload);
        
        // Retourner les infos utilisateur
        return data.user || {
          id: payload.userId || payload.id,
          email: payload.email,
          role: payload.role,
          nom: payload.nom,
          prenom: payload.prenom
        };
      } catch (err) {
        console.error('⚠️ Erreur décodage token:', err);
        return data.user || { email };
      }
    }
    
    throw new Error('Token manquant dans la réponse');
  } catch (err) {
    console.error('❌ Erreur login:', err);
    throw err;
  }
}


/**
 * NOUVELLE FONCTION : Inscription d'un utilisateur
 */
async function register(userData) {
  try {
    console.log('📝 Tentative d\'inscription:', userData.email);
    console.log('🌐 URL:', `${API_BASE}/auth/register`);
    
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(userData)
    });
    
    console.log('📊 Status HTTP:', response.status);
    
    // Lire la réponse
    const data = await response.json();
    console.log('📦 Données reçues:', data);
    
    if (!response.ok) {
      // Erreur HTTP (400, 409, 500, etc.)
      const errorMessage = data.message || data.error || `Erreur ${response.status}`;
      console.error('❌ Erreur serveur:', errorMessage);
      throw new Error(errorMessage);
    }
    
    console.log('✅ Inscription réussie côté serveur');
    
    // Si le backend renvoie un token (auto-login)
    if (data.token) {
      localStorage.setItem('jwtToken', data.token);
      console.log('✅ Token JWT stocké (auto-login)');
      
      return {
        success: true,
        user: data.user,
        token: data.token,
        message: data.message || 'Inscription réussie'
      };
    }
    
    // Sinon, juste confirmer l'inscription
    return {
      success: true,
      user: data.user,
      message: data.message || 'Inscription réussie'
    };
    
  } catch (err) {
    console.error('❌ Erreur register:', err);
    
    // Vérifier si c'est une erreur réseau
    if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
      return {
        success: false,
        error: 'Impossible de contacter le serveur. Vérifiez votre connexion et que le serveur est démarré.'
      };
    }
    
    return {
      success: false,
      error: err.message || 'Une erreur est survenue lors de l\'inscription'
    };
  }
}

// ============================================
// PRODUITS
// ============================================

async function loadProduits(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${API_BASE}/produits?${params}`);
    
    if (!response.ok) throw new Error('Load produits failed');
    
    return await response.json();
  } catch (err) {
    console.error('❌ Erreur loadProduits:', err);
    throw err;
  }
}

// ============================================
// PANIER
// ============================================

async function addToPanier(produitId, quantite = 1) {
  const token = localStorage.getItem('jwtToken');
  
  try {
    const response = await fetch(`${API_BASE}/paniers/add`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ produit_id: produitId, quantite })
    });
    
    if (!response.ok) throw new Error('Erreur ajout panier');
    
    return await response.json();
  } catch (err) {
    console.error('❌ Erreur addToPanier:', err);
    throw err;
  }
}

// ============================================
// AVIS / LIKES
// ============================================

async function submitAvis(produitId, commentaire, note) {
  const token = localStorage.getItem('jwtToken');
  
  try {
    const response = await fetch(`${API_BASE}/avis`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ produit_id: produitId, commentaire, note })
    });
    
    if (!response.ok) throw new Error('Erreur soumission avis');
    
    return await response.json();
  } catch (err) {
    console.error('❌ Erreur submitAvis:', err);
    throw err;
  }
}

async function toggleLike(produitId) {
  const token = localStorage.getItem('jwtToken');
  
  try {
    const response = await fetch(`${API_BASE}/avis/likes`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ produit_id: produitId })
    });
    
    if (!response.ok) throw new Error('Erreur toggle like');
    
    return await response.json();
  } catch (err) {
    console.error('❌ Erreur toggleLike:', err);
    throw err;
  }
}

export { 
  API_BASE,
  API_ORIGIN,
  buildImageUrl,
  checkAuth, 
  login, 
  register,  // ✅ AJOUTÉ
  loadProduits, 
  addToPanier, 
  submitAvis, 
  toggleLike 
};
