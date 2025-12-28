const Stock = require('../models/Stock');  // Modèle existant

exports.getAll = async (req, res) => {
  try {
    const stocks = await Stock.getAll();
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const stock = await Stock.getById(req.params.id);
    if (!stock) return res.status(404).json({ error: 'Stock non trouvé' });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const id = await Stock.create(req.body);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    await Stock.update(req.params.id, req.body);
    res.json({ message: 'Mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const deleted = await Stock.delete(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};