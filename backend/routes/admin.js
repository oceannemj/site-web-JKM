const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auth = require('../middleware/auth');
const multer = require('multer'); // Upload images
const path = require('path');
const fs = require('fs');
const Commande = require('../models/Commande'); // Modèle commandes (stock + montants)

// ✅ Configuration Multer pour upload images (avec création auto du dossier)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'images');
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('📁 Dossier uploads créé:', uploadDir);
      }
      cb(null, uploadDir);
    } catch (err) {
      console.error('❌ Erreur création dossier uploads:', err);
      cb(err, uploadDir);
    }
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seulement des images (JPG, PNG, etc.)'), false);
    }
  }
});

// ==================== MIDDLEWARE ADMIN ====================
const isAdmin = async (req, res, next) => {
  try {
    const ADMIN_EMAILS = [
      'oceannemandeng@gmail.com',
      'admin@loedikids.com'
    ];
    
    if (!ADMIN_EMAILS.includes(req.user.email.toLowerCase()) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé. Droits administrateur requis.' });
    }
    
    console.log('✅ Admin autorisé:', req.user.email);
    next();
  } catch (error) {
    console.error('❌ Erreur isAdmin:', error);
    res.status(500).json({ error: 'Erreur vérification admin' });
  }
};

// ==================== STATISTIQUES AVANCÉES ====================

// GET /api/admin/stats/produits
router.get('/stats/produits', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT COUNT(*) as total FROM produits');
    res.json({ total: rows[0].total });
  } catch (error) {
    console.error('❌ Erreur stats produits:', error);
    res.status(500).json({ error: 'Erreur récupération stats produits' });
  }
});

// GET /api/admin/stats/commandes
router.get('/stats/commandes', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT COUNT(*) as total FROM commandes');
    res.json({ total: rows[0].total });
  } catch (error) {
    console.error('❌ Erreur stats commandes:', error);
    res.status(500).json({ error: 'Erreur récupération stats commandes' });
  }
});

// GET /api/admin/stats/clients
router.get('/stats/clients', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT COUNT(*) as total FROM clients');
    res.json({ total: rows[0].total });
  } catch (error) {
    console.error('❌ Erreur stats clients:', error);
    res.status(500).json({ error: 'Erreur récupération stats clients' });
  }
});

// GET /api/admin/stats/revenue
// 💡 Montant d'entrée = commandes payées ou expédiées UNIQUEMENT (pas "livree")
router.get('/stats/revenue', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT COALESCE(SUM(total), 0) as total FROM commandes WHERE status IN ("payee", "expediee")'
    );
    res.json({ total: rows[0].total });
  } catch (error) {
    console.error('❌ Erreur stats revenue:', error);
    res.status(500).json({ error: 'Erreur récupération stats revenue' });
  }
});

// GET /api/admin/stats/top-product - Produit le plus vendu (sur commandes payées/expédiées)
router.get('/stats/top-product', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        p.id,
        p.nom,
        p.image_url,
        COUNT(oi.id) as total_ventes,
        SUM(oi.quantite) as quantite_totale
      FROM produits p
      LEFT JOIN orderitems oi ON p.id = oi.produit_id
      LEFT JOIN commandes c ON oi.commande_id = c.id
      WHERE c.status IN ('payee', 'expediee')
      GROUP BY p.id, p.nom, p.image_url
      ORDER BY quantite_totale DESC
      LIMIT 1
    `);
    
    res.json(rows[0] || { nom: 'N/A', total_ventes: 0 });
  } catch (error) {
    console.error('❌ Erreur top produit:', error);
    res.json({ nom: 'N/A', total_ventes: 0 });
  }
});

// GET /api/admin/stats/pending-orders - Commandes en attente
router.get('/stats/pending-orders', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT COUNT(*) as count FROM commandes WHERE status = "en_attente"'
    );
    res.json({ count: rows[0].count });
  } catch (error) {
    console.error('❌ Erreur commandes en attente:', error);
    res.json({ count: 0 });
  }
});

// GET /api/admin/stats/critical-stock - Stock critique
router.get('/stats/critical-stock', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT COUNT(*) as count FROM produits WHERE stock < 5'
    );
    res.json({ count: rows[0].count });
  } catch (error) {
    console.error('❌ Erreur stock critique:', error);
    res.json({ count: 0 });
  }
});

// GET /api/admin/stats/daily-revenue - Revenus par jour (7 derniers jours)
router.get('/stats/daily-revenue', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        SUM(total) as revenue,
        COUNT(*) as orders
      FROM commandes
      WHERE status IN ('payee', 'livree', 'expediee')
        AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur revenus quotidiens:', error);
    res.json([]);
  }
});

// GET /api/admin/stats/category-distribution - Distribution par catégorie
router.get('/stats/category-distribution', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        type as category,
        COUNT(*) as count,
        SUM(stock) as total_stock
      FROM produits
      GROUP BY type
      ORDER BY count DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur distribution catégories:', error);
    res.json([]);
  }
});

// GET /api/admin/stats/best-customers - Meilleurs clients (commandes payées/expédiées)
router.get('/stats/best-customers', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        c.id,
        c.nom,
        c.prenom,
        c.email,
        COUNT(cmd.id) as total_commandes,
        COALESCE(SUM(cmd.total), 0) as total_depense
      FROM clients c
      LEFT JOIN commandes cmd ON c.id = cmd.client_id OR c.email = cmd.client_id
      WHERE cmd.status IN ('payee', 'expediee')
      GROUP BY c.id, c.nom, c.prenom, c.email
      ORDER BY total_depense DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur meilleurs clients:', error);
    res.json([]);
  }
});


// ==================== PRODUITS AVEC UPLOAD IMAGE ====================
router.get('/produits', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM produits ORDER BY created_at DESC`);
    console.log('✅ Produits admin récupérés:', rows.length);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération produits:', error);
    res.status(500).json({ error: 'Erreur récupération produits' });
  }
});

router.get('/produits/:id', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM produits WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Erreur récupération produit:', error);
    res.status(500).json({ error: 'Erreur récupération produit' });
  }
});

// ✅ POST produit avec upload Multer
router.post('/produits', auth, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { nom, description, prix, prix_achat, age, type, stock, matiere, entretien } = req.body;
    
    if (!nom || !prix || !prix_achat || !age || !type || !matiere) {
      return res.status(400).json({ error: 'Nom, prix, prix d\'achat, âge, type et matière sont obligatoires' });
    }
    
    const id = uuidv4();
    
    // ✅ Chemin image si uploadée
    const image_url = req.file ? `/uploads/images/${req.file.filename}` : '';
    
    await db.execute(
      `INSERT INTO produits (id, nom, description, prix, prix_achat, image_url, age, type, stock, matiere, entretien) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nom, description || '', prix, prix_achat, image_url, age, type, stock || 0, matiere, entretien || '']
    );
    
    console.log('✅ Produit créé avec image:', id, image_url);
    res.status(201).json({ id, message: 'Produit créé avec succès', image_url });
  } catch (error) {
    console.error('❌ Erreur création produit:', error);
    res.status(500).json({ error: 'Erreur création produit: ' + error.message });
  }
});

// ✅ PUT produit avec upload Multer
router.put('/produits/:id', auth, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { nom, description, prix, prix_achat, age, type, stock, matiere, entretien } = req.body;
    const { id } = req.params;
    
    const [existing] = await db.execute('SELECT id, image_url FROM produits WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    // ✅ Nouvelle image ou garder ancienne
    const image_url = req.file ? `/uploads/images/${req.file.filename}` : existing[0].image_url;
    
    await db.execute(
      `UPDATE produits 
       SET nom = ?, description = ?, prix = ?, prix_achat = ?, image_url = ?, age = ?, type = ?, stock = ?, matiere = ?, entretien = ?
       WHERE id = ?`,
      [nom, description, prix, prix_achat, image_url, age, type, stock, matiere, entretien, id]
    );
    
    console.log('✅ Produit modifié:', id);
    res.json({ message: 'Produit modifié avec succès', image_url });
  } catch (error) {
    console.error('❌ Erreur modification produit:', error);
    res.status(500).json({ error: 'Erreur modification produit' });
  }
});

router.delete('/produits/:id', auth, isAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM produits WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    console.log('✅ Produit supprimé:', req.params.id);
    res.json({ message: 'Produit supprimé avec succès' });
  } catch (error) {
    console.error('❌ Erreur suppression produit:', error);
    res.status(500).json({ error: 'Erreur suppression produit' });
  }
});


// ==================== CLIENTS (AVEC GESTION BOUTIQUE) ====================

// GET /api/admin/clients - Liste tous les clients
router.get('/clients', auth, isAdmin, async (req, res) => {
  try {
    const [clients] = await db.execute(`
      SELECT 
        c.id,
        c.nom,
        c.prenom,
        c.email,
        c.telephone,
        c.adresse,
        c.notes,
        c.user_id,
        c.created_at,
        CASE 
          WHEN c.email LIKE '%@loedikids.local' THEN true 
          ELSE false 
        END as is_offline,
        COUNT(DISTINCT cmd.id) as total_commandes,
        COALESCE(SUM(CASE WHEN cmd.status IN ('payee', 'livree', 'expediee') THEN cmd.total ELSE 0 END), 0) as total_depense,
        MAX(cmd.date) as derniere_commande
      FROM clients c
      LEFT JOIN commandes cmd ON c.id = cmd.client_id OR c.email = cmd.client_id
      GROUP BY c.id, c.nom, c.prenom, c.email, c.telephone, c.adresse, c.notes, c.user_id, c.created_at
      ORDER BY c.created_at DESC
    `);
    
    console.log(`✅ ${clients.length} clients récupérés`);
    res.json(clients);
  } catch (error) {
    console.error('❌ Erreur chargement clients:', error);
    
    // Si table n'existe pas, la créer
    if (error.code === 'ER_NO_SUCH_TABLE') {
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS clients (
            id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
            nom VARCHAR(255) NOT NULL,
            prenom VARCHAR(255) DEFAULT '',
            email VARCHAR(255) UNIQUE NOT NULL,
            telephone VARCHAR(50),
            adresse TEXT,
            notes TEXT,
            user_id VARCHAR(36),
            created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            INDEX idx_email (email),
            INDEX idx_user_id (user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ Table clients créée');
        return res.json([]);
      } catch (createError) {
        console.error('❌ Erreur création table:', createError);
      }
    }
    
    res.status(500).json({ error: 'Erreur chargement clients' });
  }
});

// GET /api/admin/clients/search - Recherche de clients
router.get('/clients/search', auth, isAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const [clients] = await db.execute(`
      SELECT 
        id,
        nom,
        prenom,
        email,
        telephone,
        CONCAT(prenom, ' ', nom) as display_name
      FROM clients
      WHERE 
        nom LIKE ? OR
        prenom LIKE ? OR
        email LIKE ? OR
        telephone LIKE ?
      LIMIT 20
    `, [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]);
    
    res.json(clients);
  } catch (error) {
    console.error('❌ Erreur recherche clients:', error);
    res.json([]);
  }
});

// POST /api/admin/clients - Créer client (boutique ou en ligne)
router.post('/clients', auth, isAdmin, async (req, res) => {
  const { prenom, nom, email, telephone, adresse, notes, source = 'boutique' } = req.body;
  
  if (!nom) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  
  // Générer email unique si absent (client boutique)
  let finalEmail = email;
  let isOfflineClient = false;
  
  if (!email || email.trim() === '') {
    const uniqueId = telephone ? telephone.replace(/\s/g, '') : Date.now();
    finalEmail = `client_boutique_${uniqueId}@loedikids.local`;
    isOfflineClient = true;
  }
  
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Vérifier si user existe
    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [finalEmail.toLowerCase()]
    );
    
    let userId;
    
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      
      // Vérifier si client existe déjà
      const [existingClients] = await connection.execute(
        'SELECT id FROM clients WHERE user_id = ? OR email = ?',
        [userId, finalEmail.toLowerCase()]
      );
      
      if (existingClients.length > 0) {
        await connection.rollback();
        return res.status(409).json({ 
          error: 'Un client existe déjà pour cet utilisateur' 
        });
      }
    } else {
      // Créer nouveau User
      userId = uuidv4();
      const tempPassword = Math.random().toString(36).slice(-12);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      await connection.execute(`
        INSERT INTO users (id, email, password, nom, prenom, role, created_at) 
        VALUES (?, ?, ?, ?, ?, 'user', NOW())
      `, [userId, finalEmail.toLowerCase(), hashedPassword, nom, prenom || '']);
      
      console.log(`✅ User créé: ${userId}`);
    }
    
    // Créer le Client
    const clientId = uuidv4();
    
    const notesData = {
      notes: notes || '',
      source: source,
      offline: isOfflineClient,
      created_by: req.user.email,
      created_at: new Date().toISOString()
    };
    
    await connection.execute(`
      INSERT INTO clients (id, nom, prenom, email, telephone, adresse, notes, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      clientId,
      nom,
      prenom || '',
      finalEmail.toLowerCase(),
      telephone || null,
      adresse || null,
      JSON.stringify(notesData),
      userId
    ]);
    
    console.log(`✅ Client créé: ${clientId}`);
    
    await connection.commit();
    
    // Récupérer client complet
    const [newClient] = await db.execute(`
      SELECT 
        c.*,
        CASE WHEN c.email LIKE '%@loedikids.local' THEN true ELSE false END as is_offline,
        0 as total_commandes,
        0 as total_depense
      FROM clients c
      WHERE c.id = ?
    `, [clientId]);
    
    res.status(201).json({
      success: true,
      message: isOfflineClient 
        ? 'Client boutique créé avec succès' 
        : 'Client créé avec succès',
      client: newClient[0],
      metadata: {
        userId,
        email: finalEmail,
        isOffline: isOfflineClient,
        canLogin: !isOfflineClient
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur création client:', error);
    res.status(500).json({ 
      error: 'Erreur création client',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});

// GET /api/admin/clients/:id
router.get('/clients/:id', auth, isAdmin, async (req, res) => {
  try {
    const [clients] = await db.execute(
      'SELECT * FROM clients WHERE id = ?',
      [req.params.id]
    );
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    res.json(clients[0]);
  } catch (error) {
    console.error('❌ Erreur chargement client:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/clients/:id/commandes
router.get('/clients/:id/commandes', auth, isAdmin, async (req, res) => {
  try {
    const [client] = await db.execute(
      'SELECT email FROM clients WHERE id = ?',
      [req.params.id]
    );
    
    if (client.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    const [commandes] = await db.execute(`
      SELECT * FROM commandes 
      WHERE client_id = ? OR client_id = ?
      ORDER BY date DESC
    `, [req.params.id, client[0].email]);
    
    res.json(commandes);
  } catch (error) {
    console.error('❌ Erreur commandes client:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/clients/:id
router.put('/clients/:id', auth, isAdmin, async (req, res) => {
  const { prenom, nom, email, telephone, adresse, notes } = req.body;
  
  if (!nom) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  
  try {
    const [existing] = await db.execute(
      'SELECT id, email FROM clients WHERE id = ?',
      [req.params.id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    // Si email fourni et différent, vérifier unicité
    if (email && email !== existing[0].email) {
      const [emailCheck] = await db.execute(
        'SELECT id FROM clients WHERE email = ? AND id != ?',
        [email.toLowerCase(), req.params.id]
      );
      
      if (emailCheck.length > 0) {
        return res.status(409).json({ 
          error: 'Cet email est déjà utilisé' 
        });
      }
    }
    
    await db.execute(`
      UPDATE clients 
      SET nom = ?, prenom = ?, email = ?, telephone = ?, adresse = ?, notes = ?
      WHERE id = ?
    `, [
      nom,
      prenom || '',
      email || existing[0].email,
      telephone || null,
      adresse || null,
      notes || null,
      req.params.id
    ]);
    
    const [updated] = await db.execute(
      'SELECT * FROM clients WHERE id = ?',
      [req.params.id]
    );
    
    console.log('✅ Client modifié:', req.params.id);
    res.json({
      success: true,
      message: 'Client modifié avec succès',
      client: updated[0]
    });
    
  } catch (error) {
    console.error('❌ Erreur modification client:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/clients/:id
router.delete('/clients/:id', auth, isAdmin, async (req, res) => {
  try {
    const [existing] = await db.execute(
      'SELECT email FROM clients WHERE id = ?',
      [req.params.id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    // Supprimer commandes associées
    await db.execute(
      'DELETE FROM commandes WHERE client_id = ? OR client_id = ?',
      [req.params.id, existing[0].email]
    );
    
    // Supprimer client
    await db.execute('DELETE FROM clients WHERE id = ?', [req.params.id]);
    
    console.log('✅ Client supprimé:', req.params.id);
    res.json({ success: true, message: 'Client supprimé avec succès' });
    
  } catch (error) {
    console.error('❌ Erreur suppression client:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/admin/clients/:id/activate - Activer compte client boutique
router.patch('/clients/:id/activate', auth, isAdmin, async (req, res) => {
  const { email } = req.body;
  
  try {
    const [clients] = await db.execute(
      'SELECT * FROM clients WHERE id = ?',
      [req.params.id]
    );
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    
    const client = clients[0];
    
    if (!client.email.includes('@loedikids.local')) {
      return res.status(400).json({ 
        error: 'Ce client a déjà un email valide' 
      });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    
    const [existingEmail] = await db.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email.toLowerCase(), client.user_id]
    );
    
    if (existingEmail.length > 0) {
      return res.status(409).json({ 
        error: 'Cet email est déjà utilisé' 
      });
    }
    
    // Mettre à jour User
    await db.execute(
      'UPDATE users SET email = ? WHERE id = ?',
      [email.toLowerCase(), client.user_id]
    );
    
    // Mettre à jour Client
    await db.execute(
      'UPDATE clients SET email = ? WHERE id = ?',
      [email.toLowerCase(), req.params.id]
    );
    
    console.log(`✅ Client ${req.params.id} activé: ${email}`);
    
    res.json({
      success: true,
      message: 'Client activé avec succès',
      email: email,
      canLogin: true
    });
    
  } catch (error) {
    console.error('❌ Erreur activation client:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== COMMANDES ====================

// Helpers règles métier commandes
function statusImpactsStock(status) {
  return ['livree', 'expediee', 'payee'].includes(status);
}

function computeTotalsAndRemise(items = [], rawRemise) {
  let totalBrut = 0;

  if (Array.isArray(items)) {
    for (const item of items) {
      const prix = parseFloat(item.prix_unitaire || 0);
      const quantite = parseInt(item.quantite || 0, 10);
      if (!isNaN(prix) && !isNaN(quantite)) {
        totalBrut += prix * quantite;
      }
    }
  }

  let remiseValue = 0;
  if (rawRemise !== undefined && rawRemise !== null && rawRemise !== '') {
    const asString = String(rawRemise).trim();
    if (asString.includes('%')) {
      const percentage = parseFloat(asString.replace('%', ''));
      if (!isNaN(percentage)) {
        remiseValue = (totalBrut * percentage) / 100;
      }
    } else {
      const r = parseFloat(asString);
      if (!isNaN(r)) remiseValue = r;
    }
  }

  const netTotal = Math.max(0, totalBrut - remiseValue);
  return { totalBrut, remiseValue, netTotal };
}

// GET /api/admin/commandes
router.get('/commandes', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        c.*,
        COALESCE(u.email, cl.email, c.client_id) as client_email,
        COALESCE(u.nom, cl.nom, 'Client') as client_nom,
        COALESCE(u.prenom, cl.prenom, '') as client_prenom
      FROM commandes c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN clients cl ON c.client_id = cl.id OR c.client_id = cl.email
      ORDER BY c.created_at DESC
      LIMIT 100
    `);
    
    console.log('✅ Commandes récupérées:', rows.length);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération commandes:', error);
    res.status(500).json({ error: 'Erreur récupération commandes' });
  }
});

// GET /api/admin/commandes/:id
router.get('/commandes/:id', auth, isAdmin, async (req, res) => {
  try {
    const commande = await Commande.getById(req.params.id);
    if (!commande) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    res.json(commande);
  } catch (error) {
    console.error('❌ Erreur détails commande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/commandes
router.post('/commandes', auth, isAdmin, async (req, res) => {
  try {
    const { client_id, status, adresse, remise, items } = req.body;

    if (!client_id || !status) {
      return res.status(400).json({ error: 'Client et statut requis' });
    }

    const validStatuts = ['en_attente', 'payee', 'expediee', 'livree', 'annulee'];
    if (!validStatuts.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const { totalBrut, remiseValue, netTotal } = computeTotalsAndRemise(items || [], remise);

    const commandeId = uuidv4();

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `INSERT INTO commandes (id, client_id, total, status, remise, created_at) 
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [commandeId, client_id, netTotal, status, remiseValue]
      );

      if (items && items.length > 0) {
        for (const item of items) {
          await connection.execute(
            `INSERT INTO orderitems (id, commande_id, produit_id, quantite, prix_unitaire, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [uuidv4(), commandeId, item.produit_id, item.quantite, item.prix_unitaire]
          );

          if (statusImpactsStock(status)) {
            await connection.execute(
              'UPDATE produits SET stock = stock - ? WHERE id = ?',
              [item.quantite, item.produit_id]
            );
          }
        }
      }

      await connection.commit();
      console.log('✅ Commande créée:', commandeId, '(total brut:', totalBrut, 'remise:', remiseValue, 'net:', netTotal, ')');
      res.status(201).json({ 
        id: commandeId, 
        message: 'Commande créée avec succès' 
      });
    } catch (dbErr) {
      await connection.rollback();
      console.error('❌ Erreur création commande (transaction):', dbErr);
      return res.status(500).json({ error: 'Erreur création commande' });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Erreur création commande:', error);
    res.status(500).json({ error: 'Erreur création commande' });
  }
});


// ✅ PUT commande COMPLET (status + items + logique stock/remise)
router.put('/commandes/:id', auth, isAdmin, async (req, res) => {
  try {
    const { status, adresse, remise, items, client_id } = req.body;
    const { id } = req.params;

    const validStatuts = ['en_attente', 'payee', 'expediee', 'livree', 'annulee'];
    if (status && !validStatuts.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [existing] = await connection.execute('SELECT status FROM commandes WHERE id = ?', [id]);
      if (existing.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Commande non trouvée' });
      }

      const oldStatus = existing[0].status;
      const newStatus = status || oldStatus;

      const { totalBrut, remiseValue, netTotal } = computeTotalsAndRemise(items || [], remise);

      await connection.execute(
        `UPDATE commandes 
         SET status = ?, total = ?, remise = ?, client_id = COALESCE(?, client_id)
         WHERE id = ?`,
        [newStatus, netTotal, remiseValue, client_id, id]
      );

      // Restaurer stock de l'ancien statut si besoin
      if (statusImpactsStock(oldStatus)) {
        const [oldItems] = await connection.execute(
          'SELECT produit_id, quantite FROM orderitems WHERE commande_id = ?',
          [id]
        );
        for (const oldItem of oldItems) {
          await connection.execute(
            'UPDATE produits SET stock = stock + ? WHERE id = ?',
            [oldItem.quantite, oldItem.produit_id]
          );
        }
      }

      // Remplacer les items si fournis
      if (items && items.length > 0) {
        await connection.execute('DELETE FROM orderitems WHERE commande_id = ?', [id]);

        for (const item of items) {
          await connection.execute(
            `INSERT INTO orderitems (id, commande_id, produit_id, quantite, prix_unitaire, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [uuidv4(), id, item.produit_id, item.quantite, item.prix_unitaire]
          );

          if (statusImpactsStock(newStatus)) {
            await connection.execute(
              'UPDATE produits SET stock = stock - ? WHERE id = ?',
              [item.quantite, item.produit_id]
            );
          }
        }
      }

      await connection.commit();
      console.log('✅ Commande modifiée:', id, `(ancien statut: ${oldStatus}, nouveau: ${newStatus})`);
      res.json({ message: 'Commande modifiée avec succès' });
    } catch (dbErr) {
      await connection.rollback();
      console.error('❌ Erreur modification commande (transaction):', dbErr);
      return res.status(500).json({ error: 'Erreur serveur: ' + dbErr.message });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Erreur modification commande:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// DELETE /api/admin/commandes/:id
router.delete('/commandes/:id', auth, isAdmin, async (req, res) => {
  try {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [existing] = await connection.execute('SELECT status FROM commandes WHERE id = ?', [req.params.id]);
      if (existing.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Commande non trouvée' });
      }

      const oldStatus = existing[0].status;

      if (statusImpactsStock(oldStatus)) {
        const [items] = await connection.execute(
          'SELECT produit_id, quantite FROM orderitems WHERE commande_id = ?',
          [req.params.id]
        );

        for (const item of items) {
          await connection.execute(
            'UPDATE produits SET stock = stock + ? WHERE id = ?',
            [item.quantite, item.produit_id]
          );
        }
      }

      await connection.execute('DELETE FROM orderitems WHERE commande_id = ?', [req.params.id]);
      const [result] = await connection.execute('DELETE FROM commandes WHERE id = ?', [req.params.id]);

      await connection.commit();

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Commande non trouvée' });
      }

      console.log('✅ Commande supprimée:', req.params.id, `(statut: ${oldStatus})`);
      res.json({ success: true, message: 'Commande supprimée' });
    } catch (dbErr) {
      await connection.rollback();
      console.error('❌ Erreur suppression commande (transaction):', dbErr);
      return res.status(500).json({ error: 'Erreur serveur' });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Erreur suppression commande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/commandes/benefits
// Bénéfices = (total - remise) - somme(prix_achat * quantité)
router.get('/commandes/benefits', auth, isAdmin, async (req, res) => {
  try {
    const [commandes] = await db.execute(`
      SELECT c.* FROM commandes c 
      WHERE c.status IN ('payee', 'expediee')
      ORDER BY c.created_at DESC 
      LIMIT 50
    `);

    const commandesAvecBenefices = await Promise.all(
      commandes.map(async (commande) => {
        const [items] = await db.execute(`
          SELECT oi.quantite, oi.prix_unitaire, p.prix_achat, p.nom
          FROM orderitems oi 
          JOIN produits p ON oi.produit_id = p.id
          WHERE oi.commande_id = ?
        `, [commande.id]);

        const totalAchat = items.reduce(
          (sum, item) => sum + ((item.prix_achat || 0) * item.quantite),
          0
        );
        const remiseValue = commande.remise || 0;
        const benefice = (commande.total - remiseValue) - totalAchat;

        return { ...commande, items, benefice, totalAchat };
      })
    );

    console.log('💰 Bénéfices commandes:', commandesAvecBenefices.length);
    res.json(commandesAvecBenefices);
  } catch (error) {
    console.error('❌ Erreur /commandes/benefits:', error);
    res.json([]);
  }
});

// ==================== NOTIFICATIONS ====================

// GET /api/admin/notifications
router.get('/notifications', auth, isAdmin, async (req, res) => {
  try {
    const notifications = [];
    
    const [lowStock] = await db.execute(`
      SELECT nom, stock FROM produits WHERE stock < 10 ORDER BY stock ASC LIMIT 5
    `);
    
    lowStock.forEach(product => {
      notifications.push({
        id: `stock-${product.nom}`,
        type: 'warning',
        message: `⚠️ Stock faible: ${product.nom} (${product.stock} restant)`,
        read: false,
        created_at: new Date()
      });
    });
    
    const [pendingOrders] = await db.execute(`
      SELECT COUNT(*) as count FROM commandes WHERE status = 'en_attente'
    `);
    
    if (pendingOrders[0].count > 0) {
      notifications.push({
        id: 'orders-pending',
        type: 'info',
        message: `📦 ${pendingOrders[0].count} commande(s) en attente`,
        read: false,
        created_at: new Date()
      });
    }
    
    const [recentOrders] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM commandes 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
    
    if (recentOrders[0].count > 0) {
      notifications.push({
        id: 'orders-recent',
        type: 'success',
        message: `✅ ${recentOrders[0].count} nouvelle(s) commande(s) aujourd'hui`,
        read: false,
        created_at: new Date()
      });
    }
    
    const [outOfStock] = await db.execute(`
      SELECT COUNT(*) as count FROM produits WHERE stock = 0
    `);
    
    if (outOfStock[0].count > 0) {
      notifications.push({
        id: 'stock-out',
        type: 'error',
        message: `🚨 ${outOfStock[0].count} produit(s) en rupture de stock`,
        read: false,
        created_at: new Date()
      });
    }
    
    console.log(`✅ ${notifications.length} notifications générées`);
    res.json(notifications);
    
  } catch (error) {
    console.error('❌ Erreur notifications:', error);
    res.json([]);
  }
});

// PATCH /api/admin/notifications/:id/read
router.patch('/notifications/:id/read', auth, isAdmin, async (req, res) => {
  try {
    console.log(`✅ Notification ${req.params.id} marquée comme lue`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur marquage notification:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/admin/notifications/read-all
router.patch('/notifications/read-all', auth, isAdmin, async (req, res) => {
  try {
    console.log('✅ Toutes les notifications marquées comme lues');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur marquage notifications:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== STOCKS ====================

// GET /api/admin/stocks/low
router.get('/stocks/low', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT id, nom, stock, type, age
      FROM produits 
      WHERE stock < 10
      ORDER BY stock ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération stocks faibles:', error);
    res.status(500).json({ error: 'Erreur récupération stocks' });
  }
});

// ==================== INVENTAIRE (PLANS D'ACHAT) ====================

const InventoryPlan = require('../models/InventoryPlan');

// GET /api/admin/inventory - Liste des plans d'achat
router.get('/inventory', auth, isAdmin, async (req, res) => {
  try {
    const plans = await InventoryPlan.getAll();
    res.json(plans);
  } catch (error) {
    console.error('❌ Erreur récupération inventaire:', error);
    res.status(500).json({ error: 'Erreur récupération inventaire' });
  }
});

// POST /api/admin/inventory - Créer un plan d'achat
router.post('/inventory', auth, isAdmin, async (req, res) => {
  try {
    const id = await InventoryPlan.create(req.body);
    res.status(201).json({ id });
  } catch (error) {
    console.error('❌ Erreur création plan inventaire:', error);
    res.status(500).json({ error: 'Erreur création plan inventaire' });
  }
});

// PUT /api/admin/inventory/:id - Mettre à jour un plan
router.put('/inventory/:id', auth, isAdmin, async (req, res) => {
  try {
    await InventoryPlan.update(req.params.id, req.body);
    res.json({ message: 'Plan inventaire mis à jour' });
  } catch (error) {
    console.error('❌ Erreur mise à jour plan inventaire:', error);
    res.status(500).json({ error: 'Erreur mise à jour plan inventaire' });
  }
});

// DELETE /api/admin/inventory/:id - Supprimer un plan
router.delete('/inventory/:id', auth, isAdmin, async (req, res) => {
  try {
    await InventoryPlan.delete(req.params.id);
    res.json({ message: 'Plan inventaire supprimé' });
  } catch (error) {
    console.error('❌ Erreur suppression plan inventaire:', error);
    res.status(500).json({ error: 'Erreur suppression plan inventaire' });
  }
});

// ==================== ANALYTICS ====================

// GET /api/admin/analytics/overview - Vue d'ensemble complète
router.get('/analytics/overview', auth, isAdmin, async (req, res) => {
  try {
    const { period = '7days' } = req.query;
    
    let dateFilter = 'DATE_SUB(NOW(), INTERVAL 7 DAY)';
    if (period === '30days') dateFilter = 'DATE_SUB(NOW(), INTERVAL 30 DAY)';
    if (period === '90days') dateFilter = 'DATE_SUB(NOW(), INTERVAL 90 DAY)';
    
    // Ventes par jour (commandes payées/expédiées uniquement)
    const [salesByDay] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        SUM(total) as revenue
      FROM commandes
      WHERE status IN ('payee', 'expediee')
        AND created_at >= ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    // Produits les plus vendus (sur commandes payées/expédiées)
    const [topProducts] = await db.execute(`
      SELECT 
        p.nom,
        p.type,
        SUM(oi.quantite) as total_vendu,
        SUM(oi.quantite * oi.prix_unitaire) as revenu_total
      FROM orderitems oi
      JOIN produits p ON oi.produit_id = p.id
      JOIN commandes c ON oi.commande_id = c.id
      WHERE c.status IN ('payee', 'expediee')
        AND c.created_at >= ${dateFilter}
      GROUP BY p.id, p.nom, p.type
      ORDER BY total_vendu DESC
      LIMIT 10
    `);
    
    // Distribution par type (commandes payées/expédiées)
    const [typeDistribution] = await db.execute(`
      SELECT 
        p.type,
        COUNT(DISTINCT oi.commande_id) as commandes,
        SUM(oi.quantite) as quantite,
        SUM(oi.quantite * oi.prix_unitaire) as revenu
      FROM orderitems oi
      JOIN produits p ON oi.produit_id = p.id
      JOIN commandes c ON oi.commande_id = c.id
      WHERE c.status IN ('payee', 'expediee')
        AND c.created_at >= ${dateFilter}
      GROUP BY p.type
    `);
    
    // Taux de conversion
    const [totalClients] = await db.execute('SELECT COUNT(*) as count FROM clients');
    const [clientsAcheteurs] = await db.execute(`
      SELECT COUNT(DISTINCT client_id) as count 
      FROM commandes 
      WHERE status IN ('payee', 'expediee')
    `);
    
    const conversionRate = totalClients[0].count > 0 
      ? ((clientsAcheteurs[0].count / totalClients[0].count) * 100).toFixed(2)
      : 0;
    
    res.json({
      salesByDay,
      topProducts,
      typeDistribution,
      conversionRate,
      period
    });
    
  } catch (error) {
    console.error('❌ Erreur analytics overview:', error);
    res.status(500).json({ error: 'Erreur récupération analytics' });
  }
});

// GET /api/admin/analytics/revenue-forecast - Prévision revenus
router.get('/analytics/revenue-forecast', auth, isAdmin, async (req, res) => {
  try {
    const [last30Days] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        SUM(total) as revenue
      FROM commandes
      WHERE status IN ('payee', 'expediee')
        AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    // Calculer moyenne mobile
    const avgDailyRevenue = last30Days.reduce((sum, day) => sum + day.revenue, 0) / last30Days.length;
    
    // Prévision simple pour les 7 prochains jours
    const forecast = [];
    for (let i = 1; i <= 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      forecast.push({
        date: date.toISOString().split('T')[0],
        predicted_revenue: Math.round(avgDailyRevenue * (0.9 + Math.random() * 0.2))
      });
    }
    
    res.json({
      historical: last30Days,
      forecast,
      avgDailyRevenue: Math.round(avgDailyRevenue)
    });
    
  } catch (error) {
    console.error('❌ Erreur prévision revenus:', error);
    res.status(500).json({ error: 'Erreur prévision' });
  }
});

// GET /api/admin/analytics/customer-insights - Insights clients
router.get('/analytics/customer-insights', auth, isAdmin, async (req, res) => {
  try {
    // Nouveaux clients par mois
    const [newClientsByMonth] = await db.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as new_clients
      FROM clients
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);
    
    // Clients actifs vs inactifs
    const [activeClients] = await db.execute(`
      SELECT 
        CASE 
          WHEN last_order >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'actif'
          WHEN last_order >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 'peu_actif'
          ELSE 'inactif'
        END as status,
        COUNT(*) as count
      FROM (
        SELECT 
          c.id,
          MAX(cmd.created_at) as last_order
        FROM clients c
        LEFT JOIN commandes cmd ON c.id = cmd.client_id OR c.email = cmd.client_id
        WHERE cmd.status IN ('payee', 'expediee')
        GROUP BY c.id
      ) as client_activity
      GROUP BY status
    `);
    
    // Valeur moyenne par client
    const [avgClientValue] = await db.execute(`
      SELECT 
        AVG(total_spent) as avg_value,
        MAX(total_spent) as max_value,
        MIN(total_spent) as min_value
      FROM (
        SELECT 
          client_id,
          SUM(total) as total_spent
        FROM commandes
        WHERE status IN ('payee', 'expediee')
        GROUP BY client_id
      ) as client_totals
    `);
    
    res.json({
      newClientsByMonth,
      activeClients,
      avgClientValue: avgClientValue[0] || { avg_value: 0, max_value: 0, min_value: 0 }
    });
    
  } catch (error) {
    console.error('❌ Erreur insights clients:', error);
    res.status(500).json({ error: 'Erreur insights' });
  }
});

// ==================== RAPPORTS ====================

// GET /api/admin/reports/daily - Rapport quotidien
router.get('/reports/daily', auth, isAdmin, async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    
    const [summary] = await db.execute(`
      SELECT 
        COUNT(*) as total_commandes,
        SUM(total) as revenu_total,
        AVG(total) as panier_moyen
      FROM commandes
      WHERE DATE(created_at) = ?
        AND status IN ('payee', 'expediee')
    `, [date]);
    
    const [topProducts] = await db.execute(`
      SELECT 
        p.nom,
        SUM(oi.quantite) as quantite_vendue,
        SUM(oi.quantite * oi.prix_unitaire) as revenu
      FROM orderitems oi
      JOIN produits p ON oi.produit_id = p.id
      JOIN commandes c ON oi.commande_id = c.id
      WHERE DATE(c.created_at) = ?
        AND c.status IN ('payee', 'expediee')
      GROUP BY p.id, p.nom
      ORDER BY quantite_vendue DESC
      LIMIT 5
    `, [date]);
    
    res.json({
      date,
      summary: summary[0],
      topProducts
    });
    
  } catch (error) {
    console.error('❌ Erreur rapport quotidien:', error);
    res.status(500).json({ error: 'Erreur génération rapport' });
  }
});

// GET /api/admin/reports/monthly - Rapport mensuel
router.get('/reports/monthly', auth, isAdmin, async (req, res) => {
  try {
    const { month = new Date().toISOString().slice(0, 7) } = req.query;
    
    const [summary] = await db.execute(`
      SELECT 
        COUNT(*) as total_commandes,
        SUM(total) as revenu_total,
        AVG(total) as panier_moyen,
        COUNT(DISTINCT client_id) as clients_uniques
      FROM commandes
      WHERE DATE_FORMAT(created_at, '%Y-%m') = ?
        AND status IN ('payee', 'expediee')
    `, [month]);
    
    const [dailyBreakdown] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as commandes,
        SUM(total) as revenu
      FROM commandes
      WHERE DATE_FORMAT(created_at, '%Y-%m') = ?
        AND status IN ('payee', 'expediee')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [month]);
    
    res.json({
      month,
      summary: summary[0],
      dailyBreakdown
    });
    
  } catch (error) {
    console.error('❌ Erreur rapport mensuel:', error);
    res.status(500).json({ error: 'Erreur génération rapport' });
  }
});


module.exports = router;