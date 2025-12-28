const Produit = require('../models/Produit');
const auth = require('../middleware/auth');  // Import pour usage, mais appliqué en route

exports.getAll = async (req, res) => {
  try {
    const produits = await Produit.getAll();
    res.json(produits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const produit = await Produit.getById(req.params.id);
    if (!produit) return res.status(404).json({ error: 'Produit non trouvé' });
    res.json(produit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  // Vérif admin via req.user (middleware appliqué en route)
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const id = await Produit.create(req.body);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    await Produit.update(req.params.id, req.body);
    res.json({ message: 'Mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const deleted = await Produit.delete(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};