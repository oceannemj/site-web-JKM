// server.js - Version corrigée : Fix PathError (*) + CORS preflight pour frontend 8000 layettes

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { runMigrations } = require('./config/migrations');
const multer = require('multer');
const mysql = require('mysql2/promise'); // Pour test DB
const app = express();

// ============================================
// MIDDLEWARE DE LOGS DÉTAILLÉS (avec CORS debug)
// ============================================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log('\n' + '='.repeat(60));
  console.log(`${timestamp} 📥 REQUÊTE ENTRANTE`);
  console.log(`  Méthode : ${req.method}`);
  console.log(`  URL     : ${req.url}`);
  console.log(`  Path    : ${req.path}`);
  console.log(`  Origin  : ${req.get('Origin')} (CORS check)`); // Debug CORS
  console.log(`  Headers : ${JSON.stringify(req.headers, null, 2)}`);

  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`  Body    :`, req.body);
  }
  console.log('='.repeat(60) + '\n');

  next();
});

// ============================================
// MIDDLEWARE CORS ROBUSTE (Fix preflight OPTIONS, sans app.options('*'))
// ============================================
const corsOptions = {
  origin: [
    'http://127.0.0.1:8000',  // Frontend principal (Vite/Live Server)
    'http://localhost:8000',
    'http://localhost:3000',
    'https://loedikids-backend.onrender.com',
      // Backup si port change
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // Incl OPTIONS
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization'], // ✅ FIX : Expose JWT pour frontend
  credentials: true, // Si cookies JWT
  preflightContinue: false,
  optionsSuccessStatus: 204 // Réponse OPTIONS
};

// Appliquer CORS global (gère preflight auto, sans app.options('*'))
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// CONFIG MULTER POUR UPLOADS IMAGES (Layettes)
// ============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/images';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log(`📁 Dossier créé : ${uploadDir}`);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images (JPG, PNG) sont acceptées'), false);
    }
  }
});
// Appliquez upload.single('image') SEULEMENT dans routes/produits.js POST (pas global)

// ============================================
// ROUTES
// ============================================
const authRoutes = require('./routes/auth');
const produitRoutes = require('./routes/produits');
const adminRoutes = require('./routes/admin');
const panierRoutes = require('./routes/Panier');
const avisRoutes = require('./routes/Avis');
const clientRoutes = require('./routes/Client');
const commandeRoutes = require('./routes/Commande');

app.use('/api/auth', authRoutes);
app.use('/api/produits', produitRoutes);
app.use('/api/admin', adminRoutes);
// Routes côté client (panier, avis, clients, commandes)
app.use('/api/paniers', panierRoutes);
app.use('/api/avis', avisRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/commandes', commandeRoutes);

// ============================================
// SERVEUR STATIQUE POUR UPLOADS (IMAGES Layettes)
// ============================================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// ROUTE DE TEST / HEALTH CHECK (DB + CORS Test)
// ============================================
app.get('/health', async (req, res) => {
  try {
    // Test DB
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'loedikids'
    });
    await connection.ping();
    await connection.end();

    // Test CORS (simule frontend origin 8000)
    const testOrigin = req.get('Origin') || 'http://127.0.0.1:8000' || 'https://loedikids-backend.onrender.com';
    res.set('Access-Control-Allow-Origin', testOrigin); // Debug header

    res.json({
      success: true,
      message: '✅ Backend + DB + CORS OK (prêt pour ventes layettes frontend 8000)',
      db: 'connected',
      cors: { allowed: corsOptions.origin.includes(testOrigin) ? 'yes' : 'no', origin: testOrigin },
      migrations: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Health check DB failed:', error);
    res.status(500).json({
      success: false,
      error: 'DB non connectée (vérifiez .env + MySQL Laragon)',
      details: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '✅ API Loedi Kids - Backend fonctionnel (CORS fix pour frontend 8000, uploads layettes)',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me (CORS OPTIONS OK)'
      },
      produits: 'GET /api/produits (layettes list)',
      admin: 'GET /api/admin/stats/* (ventes/marges)',
      health: 'GET /health (test CORS/DB)',
      uploads: 'GET /uploads/images/* (images statiques layettes)'
    }
  });
});

// ============================================
// GESTION DES ERREURS 404
// ============================================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ❌ 404 - Route non trouvée: ${req.method} ${req.path}`);

  res.status(404).json({
    success: false,
    error: 'Route non trouvée',
    path: req.path,
    method: req.method
  });
});

// ============================================
// GESTION GLOBALE DES ERREURS (incl. Multer)
// ============================================
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error('\n' + '!'.repeat(60));
  console.error(`${timestamp} ❌ ERREUR GLOBALE`);
  console.error(`  Message : ${err.message}`);
  console.error(`  Stack   : ${err.stack}`);
  console.error('!'.repeat(60) + '\n');

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'Fichier trop volumineux (max 5MB pour images layettes)'
      });
    }
    return res.status(400).json({
      success: false,
      error: 'Erreur upload fichier layette'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    error: 'Erreur serveur',
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err
    })
  });
});

// ============================================
// FONCTION DE DÉMARRAGE (Migrations Retry)
// ============================================
async function startServer() {
  try {
    console.log('\n' + '🚀'.repeat(30));
    console.log('🚀 DÉMARRAGE DU SERVEUR LOEDI KIDS...');
    console.log('🚀'.repeat(30) + '\n');

    // Migrations avec retry
    console.log('📊 Exécution des migrations de base de données...\n');
    let migrationsOk = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await runMigrations();
        migrationsOk = true;
        console.log(`✅ Migrations réussies (tentative ${attempt}/3)`);
        break;
      } catch (migError) {
        console.warn(`⚠️ Migrations échouées (tentative ${attempt}/3):`, migError.message);
        if (attempt < 3) {
          console.log('🔄 Retry dans 2s... (vérifiez MySQL Laragon)');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    if (!migrationsOk) {
      console.error('❌ Migrations définitivement échouées – Server continue sans (manuel requis)');
    }

    // Démarrage serveur
    const PORT = process.env.PORT || 3000;
    const HOST = process.env.HOST || 'localhost';

    app.listen(PORT, HOST, () => {
      console.log('\n' + '═'.repeat(60));
      console.log('🎉 SERVEUR DÉMARRÉ AVEC SUCCÈS ! (CORS fix pour frontend 8000)');
      console.log('═'.repeat(60));
      console.log(`📡 API disponible sur    : http://${HOST}:${PORT}`);
      console.log(`🌐 Health check          : http://${HOST}:${PORT}/health (test CORS/DB)`);
      console.log(`🗄️  Base de données      : ${process.env.DB_NAME || 'loedikids'}`);
      console.log(`🔒 JWT Secret            : ${process.env.JWT_SECRET ? '✓ Configuré' : '⚠️ Par défaut'}`);
      console.log(`⚙️  Environnement        : ${process.env.NODE_ENV || 'development'}`);
      console.log(`📁 Dossier uploads       : ./uploads/images (pour layettes produits)`);
      console.log(`🔗 Origins CORS autorisées: ${corsOptions.origin.join(', ')}`);
      console.log('═'.repeat(60));
      console.log('\n📋 ROUTES DISPONIBLES:');
      console.log('  🔐 POST   /api/auth/register     → Inscription client layettes');
      console.log('  🔐 POST   /api/auth/login        → Connexion admin');
      console.log('  🔐 GET    /api/auth/me           → Profil utilisateur (CORS OPTIONS OK)');
      console.log('  🛍️  GET    /api/produits         → Liste layettes');
      console.log('  👑 GET    /api/admin/stats/*     → Stats ventes/marges (produits/commandes)');
      console.log('  📁 GET    /uploads/images/*      → Afficher images produits layettes');
      console.log('═'.repeat(60) + '\n');
      console.log('✅ Prêt à recevoir des requêtes... (Gestion ventes layettes OK !)\n');
    });

  } catch (error) {
    console.error('\n' + '❌'.repeat(30));
    console.error('❌ ERREUR FATALE LORS DU DÉMARRAGE');
    console.error('❌'.repeat(30));
    console.error('\n📋 Détails de l\'erreur:');
    console.error(error);
    console.error('\n💡 SOLUTIONS POSSIBLES:');
    console.error('  1. ✓ Vérifiez MySQL démarré (Laragon)');
    console.error('  2. ✓ .env : DB_HOST=localhost, DB_USER=root, DB_PASS=, DB_NAME=loedikids');
    console.error('  3. ✓ Créez base: CREATE DATABASE loedikids;');
    console.error('  4. ✓ npm install multer mysql2 cors');
    console.error('  5. ✓ Test: curl -H "Origin: http://127.0.0.1:8000" -X OPTIONS http://localhost:3000/api/auth/me');
    console.error('\n📦 Commandes:');
    console.error('  npm install uuid bcryptjs jsonwebtoken express-validator mysql2 multer cors dotenv');
    console.error('  npm list mysql2 multer cors\n');
    console.error('❌'.repeat(30) + '\n');
    process.exit(1);
  }
}

// ============================================
// GESTION DE L'ARRÊT PROPRE
// ============================================
process.on('SIGINT', () => {
  console.log('\n\n👋 Arrêt du serveur...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n\n👋 Arrêt du serveur...');
  process.exit(0);
});

// ✅ Démarrer le serveur
startServer();