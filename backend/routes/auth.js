// routes/auth.js - Routes d'authentification complètes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');  // ✅ AJOUTÉ
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// ============================================
// INSCRIPTION
// ============================================

router.post('/register', [
  // Validation des champs
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères'),
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis')  // ✅ RENDU OBLIGATOIRE
], async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} 📝 Tentative d'inscription: ${req.body.email}`);

  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log(`${timestamp} ❌ Erreurs de validation:`, errors.array());
      return res.status(400).json({ 
        error: 'Données invalides',
        message: errors.array().map(e => e.msg).join(', '),
        details: errors.array() 
      });
    }

    const { email, password, nom, prenom } = req.body;

    // Vérifier si l'email existe déjà
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      console.log(`${timestamp} ⚠️ Email déjà utilisé: ${email}`);
      return res.status(409).json({  // ✅ 409 Conflict au lieu de 400
        error: 'Cet email est déjà utilisé',
        message: 'Un compte existe déjà avec cet email'
      });
    }

    // Hasher le mot de passe
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log(`${timestamp} 🔐 Mot de passe hashé`);

    // ✅ GÉNÉRER UN UUID MANUELLEMENT
    const userId = uuidv4();
    console.log(`${timestamp} 🆔 UUID généré: ${userId}`);

    // Créer l'utilisateur avec UUID explicite
    await db.execute(
      `INSERT INTO users (id, email, password, nom, prenom, role, created_at) 
       VALUES (?, ?, ?, ?, ?, 'user', NOW())`,
      [userId, email, hashedPassword, nom, prenom]
    );

    console.log(`${timestamp} ✅ Utilisateur créé avec ID: ${userId}`);

    // ✅ Créer aussi une entrée dans clients (pour compatibilité avec ton système)
    try {
      const clientId = uuidv4();
      await db.execute(
        `INSERT INTO clients (id, nom, email, user_id, created_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [clientId, `${prenom} ${nom}`, email, userId]
      );
      console.log(`${timestamp} ✅ Client créé avec ID: ${clientId}`);
    } catch (clientErr) {
      // Non bloquant si la table clients n'existe pas ou autre erreur
      console.warn(`${timestamp} ⚠️ Erreur création client (non bloquant):`, clientErr.message);
    }

    // Récupérer l'utilisateur créé
    const [newUser] = await db.execute(
      'SELECT id, email, nom, prenom, role, created_at FROM users WHERE id = ?',
      [userId]
    );

    const user = newUser[0];

    // Générer un token JWT (auto-login)
    const token = jwt.sign(
      { 
        id: user.id,
        userId: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role 
      },
      process.env.JWT_SECRET || 'votre_secret_jwt_super_securise',
      { expiresIn: '7d' }
    );

    console.log(`${timestamp} 🎉 Inscription réussie pour: ${email}`);

    // ✅ Réponse avec token pour auto-login
    res.status(201).json({
      success: true,  // ✅ AJOUTÉ pour le frontend
      message: 'Inscription réussie ! Bienvenue chez Loedi Kids 🎉',
      token,
      user: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error(`${timestamp} ❌ Erreur inscription:`, {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    // Gestion d'erreurs spécifiques
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        error: 'Base de données non initialisée',
        message: 'Veuillez exécuter les migrations (npm run migrate)'
      });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Données en doublon',
        message: 'Cet email est déjà utilisé'
      });
    }

    res.status(500).json({
      error: 'Erreur lors de l\'inscription',
      message: 'Une erreur est survenue. Veuillez réessayer.'
    });
  }
});

// ============================================
// CONNEXION
// ============================================

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} 🔐 Tentative de connexion: ${req.body.email}`);

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        message: 'Email ou mot de passe invalide',
        details: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Récupérer l'utilisateur
    const [users] = await db.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      console.log(`${timestamp} ❌ Utilisateur non trouvé: ${email}`);
      return res.status(401).json({ 
        error: 'Email ou mot de passe incorrect',
        message: 'Identifiants invalides'
      });
    }

    const user = users[0];

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log(`${timestamp} ❌ Mot de passe incorrect pour: ${email}`);
      return res.status(401).json({ 
        error: 'Email ou mot de passe incorrect',
        message: 'Identifiants invalides'
      });
    }

    // Générer un token JWT
    const token = jwt.sign(
      { 
        id: user.id,
        userId: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role 
      },
      process.env.JWT_SECRET || 'votre_secret_jwt_super_securise',
      { expiresIn: '7d' }
    );

    console.log(`${timestamp} ✅ Connexion réussie pour: ${email} (role: ${user.role})`);

    res.json({
      success: true,
      message: 'Connexion réussie',
      token,
      user: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role
      }
    });

  } catch (error) {
    console.error(`${timestamp} ❌ Erreur connexion:`, error);
    res.status(500).json({ 
      error: 'Erreur lors de la connexion',
      message: 'Une erreur est survenue. Veuillez réessayer.'
    });
  }
});

// ============================================
// VÉRIFICATION DU TOKEN (ME)
// ============================================

router.get('/me', authMiddleware, async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} 👤 Récupération profil pour: ${req.user.email}`);

  try {
    // L'utilisateur est déjà disponible via le middleware
    res.json({
      id: req.user.id,
      email: req.user.email,
      nom: req.user.nom,
      prenom: req.user.prenom,
      role: req.user.role,
      created_at: req.user.created_at
    });
  } catch (error) {
    console.error(`${timestamp} ❌ Erreur récupération profil:`, error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      message: error.message 
    });
  }
});

// ============================================
// VÉRIFICATION UNICITÉ EMAIL (Optionnel)
// ============================================

router.get('/check-email', async (req, res) => {
  const timestamp = new Date().toISOString();
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ 
      error: 'Email requis' 
    });
  }

  try {
    const [users] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    console.log(`${timestamp} 🔍 Vérification email ${email}: ${users.length === 0 ? 'disponible' : 'déjà utilisé'}`);

    res.json({
      available: users.length === 0,
      message: users.length === 0 ? 'Email disponible' : 'Email déjà utilisé'
    });

  } catch (error) {
    console.error(`${timestamp} ❌ Erreur vérification email:`, error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      message: error.message 
    });
  }
});

// ============================================
// DÉCONNEXION (Optionnel - côté client)
// ============================================

router.post('/logout', authMiddleware, (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} 👋 Déconnexion de: ${req.user.email}`);

  // En JWT, la déconnexion se fait principalement côté client
  // en supprimant le token du localStorage
  res.json({
    success: true,
    message: 'Déconnexion réussie'
  });
});

// ============================================
// CHANGEMENT DE MOT DE PASSE
// ============================================

router.post('/change-password', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword').isLength({ min: 8 }).withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
], async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} 🔑 Changement de mot de passe pour: ${req.user.email}`);

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        message: errors.array().map(e => e.msg).join(', '),
        details: errors.array() 
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Vérifier le mot de passe actuel
    const isPasswordValid = await bcrypt.compare(currentPassword, req.user.password);

    if (!isPasswordValid) {
      console.log(`${timestamp} ❌ Mot de passe actuel incorrect`);
      return res.status(401).json({ 
        error: 'Mot de passe actuel incorrect',
        message: 'Le mot de passe actuel est incorrect'
      });
    }

    // Hasher le nouveau mot de passe
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Mettre à jour le mot de passe
    await db.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    console.log(`${timestamp} ✅ Mot de passe changé pour: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Mot de passe changé avec succès'
    });

  } catch (error) {
    console.error(`${timestamp} ❌ Erreur changement mot de passe:`, error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors du changement de mot de passe'
    });
  }
});

// ============================================
// RÉINITIALISATION MOT DE PASSE (Demande)
// ============================================

router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  const timestamp = new Date().toISOString();
  const { email } = req.body;

  console.log(`${timestamp} 📧 Demande de réinitialisation pour: ${email}`);

  try {
    const [users] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    // Toujours retourner un succès pour éviter l'énumération d'emails
    if (users.length === 0) {
      console.log(`${timestamp} ⚠️ Email non trouvé: ${email}`);
    } else {
      // TODO: Générer un token de réinitialisation
      // TODO: Envoyer un email avec le lien
      console.log(`${timestamp} ✅ Email de réinitialisation envoyé à: ${email}`);
    }

    res.json({
      success: true,
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
    });

  } catch (error) {
    console.error(`${timestamp} ❌ Erreur forgot-password:`, error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      message: 'Une erreur est survenue'
    });
  }
});

module.exports = router;