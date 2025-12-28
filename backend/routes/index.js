const express = require('express');
const router = express.Router();
const authRoutes = require('./auth');  // À créer pour login
const produitRoutes = require('./produits');
const commandeRoutes = require('./Commande');
const clientRoutes = require('./Client');
const panierRoutes = require('./Panier');
const avisRoutes = require('./Avis');

// Routes publiques/protégées
router.use('/auth', authRoutes);
router.use('/produits', produitRoutes);
router.use('/commandes', commandeRoutes);
router.use('/clients', clientRoutes);
router.use('/paniers', panierRoutes);
router.use('/avis', avisRoutes);

module.exports = router;