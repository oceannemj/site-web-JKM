const express = require('express');
const router = express.Router();
const Panier = require('../models/Panier');
const auth = require('../middleware/auth');

// Récupérer le panier de l'utilisateur connecté
router.get('/', auth, async (req, res) => {
  try {
    const panier = await Panier.getByUserId(req.user.id);
    res.json(panier);
  } catch (err) {
    console.error('❌ Erreur GET /paniers :', err);
    res.status(500).json({ error: 'Erreur récupération panier' });
  }
});

// Ajouter un produit au panier
router.post('/add', auth, async (req, res) => {
  try {
    await Panier.addItem(req.user.id, req.body);
    res.json({ message: 'Ajouté au panier' });
  } catch (err) {
    console.error('❌ Erreur POST /paniers/add :', err);
    res.status(500).json({ error: 'Erreur ajout panier' });
  }
});

// Supprimer un produit du panier
router.delete('/remove/:produitId', auth, async (req, res) => {
  try {
    await Panier.removeItem(req.user.id, req.params.produitId);
    res.json({ message: 'Supprimé' });
  } catch (err) {
    console.error('❌ Erreur DELETE /paniers/remove :', err);
    res.status(500).json({ error: 'Erreur suppression panier' });
  }
});

// Vider le panier
router.delete('/clear', auth, async (req, res) => {
  try {
    await Panier.clear(req.user.id);
    res.json({ message: 'Panier vidé' });
  } catch (err) {
    console.error('❌ Erreur DELETE /paniers/clear :', err);
    res.status(500).json({ error: 'Erreur vidage panier' });
  }
});

module.exports = router;
