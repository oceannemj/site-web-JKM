// routes/produits.js - Routes corrigées (sans duplication sur PUT/update layettes)

const express = require('express');
const router = express.Router();
const multer = require('multer'); // Multer pour uploads images layettes
const Produit = require('../models/produit'); // Import modèle corrigé
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth'); // Assumant export

// ============================================
// CONFIG MULTER (locale pour routes admin)
// ============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    const uploadDir = './uploads/images';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const path = require('path');
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB pour photos layettes
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images JPG/PNG sont acceptées pour layettes'), false);
  }
});

// ============================================
// ROUTES PUBLIQUES (Frontend non-admin, sans auth)
// ============================================
// GET /api/produits (liste layettes avec ?limit=3)
router.get('/', async (req, res) => {
  try {
    const produits = await Produit.getAll(req.query); // Supporte ?limit=3
    res.json(produits);
  } catch (error) {
    console.error('❌ Erreur GET layettes:', error);
    res.status(500).json({ error: 'Erreur récupération layettes' });
  }
});

// GET /api/produits/:id (détail layette publique)
router.get('/:id', async (req, res) => {
  try {
    const produit = await Produit.getById(req.params.id);
    if (!produit) return res.status(404).json({ error: 'Layette non trouvée' });
    res.json(produit);
  } catch (error) {
    console.error('❌ Erreur GET layette:', error);
    res.status(500).json({ error: 'Erreur récupération layette' });
  }
});

// ============================================
// ROUTES ADMIN (Protégées par auth + adminOnly)
// ============================================
// POST /api/admin/produits (création nouvelle layette avec image)
router.post('/admin/produits', auth, adminOnly, uploadMiddleware.single('image'), async (req, res) => {
  try {
    const { nom, prix_achat, prix, age, type, stock, description, matiere, entretien } = req.body;
    
    let image_url = null;
    if (req.file) {
      image_url = `/uploads/images/${req.file.filename}`;
      console.log(`🖼️ Image layette uploadée: ${req.file.filename}`);
    }
    
    const newId = await Produit.create({
      nom,
      prix_achat: parseFloat(prix_achat),
      prix: parseFloat(prix),
      image_url,
      age,
      type,
      stock: parseInt(stock) || 0,
      description,
      matiere,
      entretien
    });
    
    res.status(201).json({ success: true, id: newId, message: 'Layette créée avec succès' + (image_url ? ' et photo' : '') });
  } catch (error) {
    console.error('❌ Erreur création layette:', error);
    res.status(500).json({ error: 'Erreur création layette : ' + error.message });
  }
});

// ✅ FIX PRINCIPAL : PUT /api/admin/produits/:id (modification SANS duplication)
router.put('/admin/produits/:id', auth, adminOnly, uploadMiddleware.single('image'), async (req, res) => {
  try {
    const id = req.params.id; // ID de l'URL pour cibler UPDATE exact
    const { nom, prix_achat, prix, age, type, stock, description, matiere, entretien } = req.body;
    
    // Gérer image (nouvelle ou garder ancienne)
    let image_url = null;
    const existing = await Produit.getById(id);
    if (!existing) return res.status(404).json({ error: 'Layette non trouvée' });
    
    if (req.file) {
      // Supprimer ancienne image
      if (existing.image_url) {
        const fs = require('fs');
        const path = require('path');
        const oldPath = path.join(__dirname, '..', existing.image_url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      image_url = `/uploads/images/${req.file.filename}`;
      console.log(`🖼️ Photo layette mise à jour: #${id}`);
    } else {
      image_url = existing.image_url; // Garder si pas de nouvelle
    }
    
    // Update via modèle (cible exact ID, pas de CREATE)
    await Produit.update(id, {
      nom,
      prix_achat: parseFloat(prix_achat),
      prix: parseFloat(prix),
      image_url,
      age,
      type,
      stock: parseInt(stock),
      description,
      matiere,
      entretien
    });
    
    res.json({ success: true, message: 'Layette modifiée avec succès' + (req.file ? ' et nouvelle photo' : '') });
  } catch (error) {
    console.error('❌ Erreur modification layette:', error);
    res.status(500).json({ error: 'Erreur modification layette : ' + error.message });
  }
});

// DELETE /api/admin/produits/:id (suppression)
router.delete('/admin/produits/:id', auth, adminOnly, async (req, res) => {
  try {
    const deleted = await Produit.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Layette non trouvée' });
    res.json({ success: true, message: 'Layette supprimée avec succès' });
  } catch (error) {
    console.error('❌ Erreur suppression layette:', error);
    res.status(500).json({ error: 'Erreur suppression layette' });
  }
});

// GET /api/admin/produits (liste complète pour dashboard admin)
router.get('/admin/produits', auth, adminOnly, async (req, res) => {
  try {
    const produits = await Produit.getAll(); // Pas de limit pour admin
    res.json(produits);
  } catch (error) {
    console.error('❌ Erreur GET admin layettes:', error);
    res.status(500).json({ error: 'Erreur récupération layettes admin' });
  }
});

// GET /api/admin/produits/:id (détail admin pour edit)
router.get('/admin/produits/:id', auth, adminOnly, async (req, res) => {
  try {
    const produit = await Produit.getById(req.params.id);
    if (!produit) return res.status(404).json({ error: 'Layette non trouvée' });
    res.json(produit);
  } catch (error) {
    console.error('❌ Erreur GET admin layette:', error);
    res.status(500).json({ error: 'Erreur récupération layette admin' });
  }
});

module.exports = router;