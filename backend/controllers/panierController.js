const Panier = require('../models/Panier');  // Modèle existant

exports.getByUser = async (req, res) => {
  try {
    const panier = await Panier.getByUserId(req.user.id);
    res.json(panier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const id = await Panier.create({ user_id: req.user.id });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    await Panier.update(req.params.id, req.body);
    res.json({ message: 'Mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const deleted = await Panier.delete(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};