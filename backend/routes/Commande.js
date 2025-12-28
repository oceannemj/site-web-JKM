// routes/commandes.js - Routes pour commandes côté client + quelques routes admin héritées

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const commandeCtrl = require('../controllers/commandeController');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth'); // Admin pour modifs

// ==================== ROUTES UTILISATEUR (PROFIL + CHECKOUT) ====================

// Historique des commandes de l'utilisateur connecté
router.get('/user', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const [rows] = await db.execute(
      `SELECT 
         c.id,
         c.total,
         c.status,
         c.date,
         c.created_at
       FROM commandes c
       LEFT JOIN clients cl ON c.client_id = cl.id OR c.client_id = cl.email
       WHERE c.client_id = ? OR c.client_id = ? OR cl.user_id = ?
       ORDER BY c.created_at DESC`,
      [userId, userEmail, userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Erreur GET /commandes/user :', err);
    res.status(500).json({ error: 'Erreur récupération commandes utilisateur' });
  }
});

// Création d'une commande à partir du panier (checkout)
router.post('/', auth, async (req, res) => {
  const { client_id, orderitems, items, payment_method } = req.body;

  try {
    const lignes = items || orderitems || [];
    if (!client_id || !Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'Client et articles requis' });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Récupérer les prix produits pour calculer le total et les prix_unitaire
      let total = 0;
      const itemsAvecPrix = [];

      for (const ligne of lignes) {
        const produitId = ligne.produit_id || ligne.id;
        const quantite = parseInt(ligne.quantite || 1, 10);
        if (!produitId || isNaN(quantite) || quantite <= 0) continue;

        const [produits] = await connection.execute(
          'SELECT id, prix FROM produits WHERE id = ?',
          [produitId]
        );
        if (produits.length === 0) continue;

        const prix = parseFloat(produits[0].prix);
        total += prix * quantite;
        itemsAvecPrix.push({
          produit_id: produits[0].id,
          quantite,
          prix_unitaire: prix,
        });
      }

      if (itemsAvecPrix.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Articles du panier invalides' });
      }

      const commandeId = uuidv4();

      await connection.execute(
        'INSERT INTO commandes (id, client_id, total, status, remise, created_at) VALUES (?, ?, ?, ?, 0, NOW())',
        [commandeId, client_id, total, 'en_attente']
      );

      for (const item of itemsAvecPrix) {
        await connection.execute(
          'INSERT INTO orderitems (id, commande_id, produit_id, quantite, prix_unitaire, created_at) VALUES (UUID(), ?, ?, ?, ?, NOW())',
          [commandeId, item.produit_id, item.quantite, item.prix_unitaire]
        );
      }

      await connection.commit();
      console.log('✅ Commande checkout créée:', commandeId, '(status en_attente)');

      res.status(201).json({ id: commandeId, total, status: 'en_attente' });
    } catch (dbErr) {
      await connection.rollback();
      console.error('❌ Erreur création commande checkout (transaction):', dbErr);
      res.status(500).json({ error: 'Erreur création commande' });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('❌ Erreur POST /commandes :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES ADMIN HÉRITÉES (/api/commandes/admin/*) ====================

// Garder les anciennes routes /admin pour compat éventuelle, même si le dashboard utilise surtout /api/admin/commandes.

// Préfixe /admin
router.use('/admin', (req, res, next) => {
  req.originalUrl = '/api' + req.baseUrl + req.path; // Log pour debug
  next();
});

// Routes user (ses commandes layettes) via contrôleur existant
router.get('/admin', auth, commandeCtrl.getAll); // Seulement connectés
router.get('/admin/:id', auth, commandeCtrl.getById);

// Routes création (user ou admin) via contrôleur existant
router.post('/admin', auth, commandeCtrl.create);

// Bénéfices pour grid analytics (marges layettes)
router.get('/admin/benefits', auth, adminOnly, commandeCtrl.getBenefits);

// Routes admin (gestion globale layettes)
router.put('/admin/:id', auth, adminOnly, commandeCtrl.update); // Update items/stock (admin only)
router.delete('/admin/:id', auth, adminOnly, commandeCtrl.delete); // Delete (admin only)

module.exports = router;
