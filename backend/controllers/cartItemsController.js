const CartItem = require('../models/CartItem');  // Ajoutez un modèle dédié si pas existant ; sinon utilisez Panier.addItem

exports.getAllByPanier = async (req, res) => {
  try {
    const items = await CartItem.getAllByPanierId(req.params.panierId, req.user.id);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await CartItem.getById(req.params.id);
    if (req.user.id !== item.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    req.body.panier_id = req.body.panier_id || (await getPanierId(req.user.id));  // Logique pour associer panier
    req.body.user_id = req.user.id;
    const id = await CartItem.create(req.body);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    await CartItem.update(req.params.id, req.body);
    res.json({ message: 'Mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const deleted = await CartItem.delete(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};