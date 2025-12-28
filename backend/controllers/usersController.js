const bcrypt = require('bcryptjs');
const User = require('../models/User');  // Ajoutez un modèle User pour CRUD users

exports.getAll = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const users = await User.getAll();
    res.json(users);  // Sans passwords
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const user = await User.getById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User non trouvé' });
    delete user.password;  // Sécurisé
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    req.body.password = await bcrypt.hash(req.body.password, 10);
    const id = await User.create(req.body);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Non autorisé' });
  }
  try {
    if (req.body.password) req.body.password = await bcrypt.hash(req.body.password, 10);
    await User.update(req.params.id, req.body);
    res.json({ message: 'Mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const deleted = await User.delete(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};