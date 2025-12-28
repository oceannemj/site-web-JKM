const OrderItem = require('../models/OrderItem');  // Modèle dédié

exports.getAllByCommande = async (req, res) => {
  try {
    const items = await OrderItem.getAllByCommandeId(req.params.commandeId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await OrderItem.getById(req.params.id);
    if (!item) return res.status(404).json({ error: 'OrderItem non trouvé' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const id = await OrderItem.create(req.body);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    await OrderItem.update(req.params.id, req.body);
    res.json({ message: 'Mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const deleted = await OrderItem.delete(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};