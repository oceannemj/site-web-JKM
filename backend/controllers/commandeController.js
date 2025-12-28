// controllers/commandeController.js - Contrôleur corrigé pour commandes layettes (update items, bénéfices)

const Commande = require('../models/commande');
const auth = require('../middleware/auth');

exports.getAll = async (req, res) => {
  try {
    const commandes = await Commande.getAll(req.user ? req.user.id : null);
    res.json(commandes);
  } catch (err) {
    console.error('❌ Erreur getAll commandes:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const commande = await Commande.getById(req.params.id);
    if (!commande) return res.status(404).json({ error: 'Commande layette non trouvée' });
    res.json(commande);
  } catch (err) {
    console.error('❌ Erreur getById commande:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    const id = await Commande.create(req.body);
    res.status(201).json({ id, message: 'Commande layette créée' });
  } catch (err) {
    console.error('❌ Erreur create commande:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis pour modifs layettes' });
  try {
    await Commande.update(req.params.id, req.body); // Gère items, stock
    res.json({ message: 'Commande layette mise à jour (items/stock OK)' });
  } catch (err) {
    console.error('❌ Erreur update commande:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  try {
    const deleted = await Commande.delete(req.params.id); // Restaure stock layettes
    res.json({ deleted, message: 'Commande supprimée (stock restauré)' });
  } catch (err) {
    console.error('❌ Erreur delete commande:', err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Bénéfices pour grid analytics (calcul marges layettes, fallback vide)
exports.getBenefits = async (req, res) => {
  try {
    const commandes = await Commande.getAll(); // Récup avec items/prix_achat
    const commandesAvecBenefices = commandes.map(commande => {
      const totalAchat = commande.items.reduce((sum, item) =>
        sum + ((item.prix_achat || 0) * item.quantite), 0
      );
      const benefice = (commande.total - (commande.remise || 0)) - totalAchat;
      return { ...commande, benefice, totalAchat };
    });
    console.log('💰 Bénéfices layettes calculés:', commandesAvecBenefices.length);
    res.json(commandesAvecBenefices); // Vide OK si 0 commandes
  } catch (err) {
    console.error('❌ Erreur bénéfices layettes:', err);
    res.json([]); // Fallback array vide pour frontend
  }
};