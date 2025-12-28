const Avis = require('../models/Avis');
const Like = require('../models/Like');

// Liste générique d'avis (optionnellement filtrés par user connecté)
exports.getAll = async (req, res) => {
  try {
    const avis = await Avis.getAll(req.user ? req.user.id : null);
    res.json(avis);
  } catch (err) {
    console.error('❌ Erreur getAll avis:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const avis = await Avis.getById(req.params.id);
    if (!avis) return res.status(404).json({ error: 'Avis non trouvé' });
    res.json(avis);
  } catch (err) {
    console.error('❌ Erreur getById avis:', err);
    res.status(500).json({ error: err.message });
  }
};

// Création d'un avis pour un produit par l'utilisateur connecté
exports.create = async (req, res) => {
  try {
    const data = {
      produit_id: req.body.produit_id,
      user_id: req.user.id,
      commentaire: req.body.commentaire,
      note: req.body.note,
    };
    const id = await Avis.create(data);
    res.status(201).json({ id });
  } catch (err) {
    console.error('❌ Erreur create avis:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const existing = await Avis.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Avis non trouvé' });
    }
    if (req.user.id !== existing.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    await Avis.update(req.params.id, req.body);
    res.json({ message: 'Mis à jour' });
  } catch (err) {
    console.error('❌ Erreur update avis:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const existing = await Avis.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Avis non trouvé' });
    }
    if (req.user.id !== existing.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const deleted = await Avis.delete(req.params.id);
    res.json({ deleted });
  } catch (err) {
    console.error('❌ Erreur delete avis:', err);
    res.status(500).json({ error: err.message });
  }
};

// Avis + likes pour un produit donné (pour pages produit)
exports.getByProduit = async (req, res) => {
  try {
    const produitId = req.params.produitId;
    const avis = await Avis.getByProduitId(produitId);
    const likes = await Like.countByProduitId(produitId);
    res.json({ avis, likes });
  } catch (err) {
    console.error('❌ Erreur getByProduit avis:', err);
    res.status(500).json({ error: err.message });
  }
};

// Avis de l'utilisateur connecté (pour profil)
exports.getByUser = async (req, res) => {
  try {
    const avis = await Avis.getByUserId(req.user.id);
    res.json(avis);
  } catch (err) {
    console.error('❌ Erreur getByUser avis:', err);
    res.status(500).json({ error: err.message });
  }
};
