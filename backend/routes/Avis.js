const express = require('express');
const router = express.Router();
const avisCtrl = require('../controllers/avisController');
const likesCtrl = require('../controllers/likesController');
const auth = require('../middleware/auth');

// Avis génériques
router.get('/', auth, avisCtrl.getAll);
router.get('/:id', auth, avisCtrl.getById);
router.post('/', auth, avisCtrl.create);
router.put('/:id', auth, avisCtrl.update);
router.delete('/:id', auth, avisCtrl.delete);

// Avis pour un produit (public)
router.get('/produit/:produitId', avisCtrl.getByProduit);

// Avis de l'utilisateur connecté (profil)
router.get('/user/me', auth, avisCtrl.getByUser);

// Likes (sous /avis pour simplicité)
router.get('/likes/produit/:produitId', likesCtrl.getAllByProduit);
router.post('/likes', auth, likesCtrl.toggle);
router.get('/likes/user', auth, likesCtrl.getByUser);

module.exports = router;
