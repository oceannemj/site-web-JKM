const Like = require('../models/Like');

exports.getAllByProduit = async (req, res) => {
  try {
    const likes = await Like.getAllByProduitId(req.params.produitId);
    res.json(likes);
  } catch (err) {
    console.error('❌ Erreur getAllByProduit likes:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const like = await Like.getById(req.params.id);
    if (!like) return res.status(404).json({ error: 'Like non trouvé' });
    res.json(like);
  } catch (err) {
    console.error('❌ Erreur getById like:', err);
    res.status(500).json({ error: err.message });
  }
};

// Toggle like pour un produit (création si absent, suppression si présent)
exports.toggle = async (req, res) => {
  try {
    const data = {
      produit_id: req.body.produit_id,
      user_id: req.user.id,
    };

    const existing = await Like.getByUserAndProduit(data.user_id, data.produit_id);
    if (existing) {
      await Like.deleteByUserAndProduit(data.user_id, data.produit_id);
      return res.json({ liked: false });
    }

    const id = await Like.create(data);
    res.status(201).json({ id, liked: true });
  } catch (err) {
    console.error('❌ Erreur toggle like:', err);
    res.status(500).json({ error: err.message });
  }
};

// Likes de l'utilisateur connecté (profil)
exports.getByUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await require('../config/database').execute(
      `SELECT l.*, p.nom, p.prix, p.image_url, p.age, p.type, p.stock
       FROM likes l
       JOIN produits p ON l.produit_id = p.id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Erreur getByUser likes:', err);
    res.status(500).json({ error: err.message });
  }
};
