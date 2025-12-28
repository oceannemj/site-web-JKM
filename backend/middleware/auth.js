// middleware/auth.js - Middleware d'authentification JWT
const jwt = require('jsonwebtoken');
const db = require('../config/database');

module.exports = async (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} 🔑 Middleware auth pour: ${req.method} ${req.path}`);  // ✅ CORRIGÉ
  
  // Récupérer le token depuis le header Authorization
  const authHeader = req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) {
    console.log(`${timestamp} ❌ Pas de token fourni`);  // ✅ CORRIGÉ
    return res.status(401).json({ 
      error: 'Accès refusé. Authentification requise.' 
    });
  }
  
  try {
    // Vérifier et décoder le token
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'votre_secret_jwt_super_securise'
    );
    
    console.log(`${timestamp} ✅ Token décodé: user ID ${decoded.id || decoded.userId}`);  // ✅ CORRIGÉ
    
    // Récupérer l'utilisateur depuis la base de données
    const userId = decoded.id || decoded.userId;
    const [rows] = await db.execute(
      'SELECT id, email, nom, prenom, role, created_at FROM users WHERE id = ?', 
      [userId]
    );
    
    if (rows.length === 0) {
      console.log(`${timestamp} ❌ Utilisateur non trouvé: ${userId}`);  // ✅ CORRIGÉ
      return res.status(401).json({ 
        error: 'Utilisateur non trouvé.' 
      });
    }
    
    // Attacher l'utilisateur à la requête
    req.user = rows[0];
    console.log(`${timestamp} ✅ User chargé: ${req.user.email} (role: ${req.user.role})`);  // ✅ CORRIGÉ
    
    // Passer au middleware suivant
    next();
    
  } catch (err) {
    console.error(`${timestamp} ❌ Erreur middleware auth:`, err.message);  // ✅ CORRIGÉ
    
    // Gestion des erreurs spécifiques JWT
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expiré. Veuillez vous reconnecter.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token invalide.',
        code: 'TOKEN_INVALID'
      });
    }
    
    // Erreur générique
    res.status(401).json({ 
      error: 'Authentification échouée.',
      message: err.message
    });
  }
};

/**
 * Middleware optionnel pour vérifier le rôle admin
 */
module.exports.adminOnly = (req, res, next) => {
  const timestamp = new Date().toISOString();
  
  if (!req.user) {
    console.log(`${timestamp} ❌ adminOnly: Pas d'utilisateur attaché`);  // ✅ CORRIGÉ
    return res.status(401).json({ 
      error: 'Authentification requise' 
    });
  }
  
  if (req.user.role !== 'admin') {
    console.log(`${timestamp} ❌ adminOnly: ${req.user.email} n'est pas admin (role: ${req.user.role})`);  // ✅ CORRIGÉ
    return res.status(403).json({ 
      error: 'Accès réservé aux administrateurs' 
    });
  }
  
  console.log(`${timestamp} ✅ adminOnly: Accès autorisé pour ${req.user.email}`);  // ✅ CORRIGÉ
  next();
};

/**
 * Middleware optionnel pour vérifier le rôle (admin ou vendeur)
 */
module.exports.staffOnly = (req, res, next) => {
  const timestamp = new Date().toISOString();
  
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentification requise' 
    });
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'vendeur') {
    console.log(`${timestamp} ❌ staffOnly: ${req.user.email} n'a pas les droits (role: ${req.user.role})`);  // ✅ CORRIGÉ
    return res.status(403).json({ 
      error: 'Accès réservé au personnel autorisé' 
    });
  }
  
  console.log(`${timestamp} ✅ staffOnly: Accès autorisé pour ${req.user.email}`);  // ✅ CORRIGÉ
  next();
};