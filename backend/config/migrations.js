// config/migrations.js
// Système de migration automatique des tables

const db = require('./database');

const migrations = {
  // Table users (doit exister en premier pour les clés étrangères)
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      nom VARCHAR(100) NOT NULL,
      prenom VARCHAR(100) NOT NULL,
      role ENUM('admin','vendeur','user') NOT NULL DEFAULT 'user',
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  // Table produits
  produits: `
    CREATE TABLE IF NOT EXISTS produits (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      nom VARCHAR(255) NOT NULL,
      description TEXT,
      prix_achat DECIMAL(10,2) NOT NULL,
      prix DECIMAL(10,2) NOT NULL,
      image_url VARCHAR(500),
      age VARCHAR(50) NOT NULL,
      type VARCHAR(100) NOT NULL,
      stock INT NOT NULL DEFAULT 0,
      matiere VARCHAR(100) NOT NULL,
      entretien TEXT,
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX idx_type (type),
      INDEX idx_age (age),
      INDEX idx_stock (stock)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  // Table clients (AMÉLIORÉE pour boutique)
  clients: `
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_email (email),
      INDEX idx_user_id (user_id),
      INDEX idx_telephone (telephone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  

  // Table commandes
  commandes: `
    CREATE TABLE IF NOT EXISTS commandes (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      client_id VARCHAR(255) NOT NULL,
      date TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      status ENUM('en_attente','payee','expediee','livree','annulee') NOT NULL DEFAULT 'en_attente',
      remise DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX idx_client_id (client_id),
      INDEX idx_status (status),
      INDEX idx_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  // Migration supplémentaire pour ajouter la colonne remise si la table existe déjà
  commandes_add_remise: `
    ALTER TABLE commandes
    ADD COLUMN IF NOT EXISTS remise DECIMAL(10,2) NOT NULL DEFAULT 0.00;
  `,

  // Table orderitems (détails des commandes)
  orderitems: `
    CREATE TABLE IF NOT EXISTS orderitems (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      commande_id VARCHAR(36) NOT NULL,
      produit_id VARCHAR(36) NOT NULL,
      quantite INT NOT NULL DEFAULT 1,
      prix_unitaire DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE,
      FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE CASCADE,
      INDEX idx_commande_id (commande_id),
      INDEX idx_produit_id (produit_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  // Table paniers
  paniers: `
    CREATE TABLE IF NOT EXISTS paniers (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      user_id VARCHAR(36) NOT NULL,
      produit_id VARCHAR(36) NOT NULL,
      quantite INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_produit (user_id, produit_id),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  // Table avis
  avis: `
    CREATE TABLE IF NOT EXISTS avis (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      produit_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      commentaire TEXT NOT NULL,
      note INT NOT NULL CHECK (note >= 1 AND note <= 5),
      date TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_produit_id (produit_id),
      INDEX idx_user_id (user_id),
      INDEX idx_note (note)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  // Table likes
  likes: `
    CREATE TABLE IF NOT EXISTS likes (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      produit_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_produit_like (user_id, produit_id),
      INDEX idx_produit_id (produit_id),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,

  // Table d'inventaire prévisionnel / réel
  inventory_plans: `
    CREATE TABLE IF NOT EXISTS inventory_plans (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      produit_id VARCHAR(36) NOT NULL,
      quantite_prevue INT NOT NULL,
      quantite_reelle INT DEFAULT 0,
      date_prevue DATE NULL,
      notes TEXT,
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE CASCADE,
      INDEX idx_produit_id (produit_id),
      INDEX idx_date_prevue (date_prevue)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `
};

// Données de test (optionnel)
const seedData = {
  // Insérer un admin par défaut
  admin: `
    INSERT IGNORE INTO users (id, email, password, nom, prenom, role)
    VALUES (
      UUID(),
      'oceannemandeng@gmail.com',
      '$2a$12$qQFHBMEQH93cAATZHFW5AOBoWKSt5.jCtJ/kR48NvvKOmENupXgC.',
      'Admin',
      'Loedi Kids',
      'admin'
    );
  `,

  // Insérer des produits de test
  produits: `
    INSERT IGNORE INTO produits (id, nom, description, prix, prix_achat, image_url, age, type, stock, matiere, entretien)
    SELECT UUID(), 'Body Rose Premium', 'Body doux en coton bio pour bébé', 15000, 10000, 'https://source.unsplash.com/400x300/?baby,clothes', '0-3 mois', 'Body', 25, 'Coton Bio', 'Lavage à 30°C'
    WHERE NOT EXISTS (SELECT 1 FROM produits WHERE nom = 'Body Rose Premium')
    UNION ALL
    SELECT UUID(), 'Pyjama Étoiles', 'Pyjama confortable avec imprimé étoiles', 18000, 12000, 'https://source.unsplash.com/400x300/?baby,pajamas', '3-6 mois', 'Pyjama', 15, 'Coton', 'Lavage à 40°C'
    WHERE NOT EXISTS (SELECT 1 FROM produits WHERE nom = 'Pyjama Étoiles')
    UNION ALL
    SELECT UUID(), 'Bonnet Bleu Ciel', 'Bonnet chaud pour protéger bébé', 5000, 2000, 'https://source.unsplash.com/400x300/?baby,hat', '0-12 mois', 'Accessoire', 30, 'Laine', 'Lavage à la main'
    WHERE NOT EXISTS (SELECT 1 FROM produits WHERE nom = 'Bonnet Bleu Ciel');
  `
};

/**
 * Exécute toutes les migrations
 */
async function runMigrations() {
  console.log('🔄 Démarrage des migrations...\n');

  try {
    // Ordre d'exécution des migrations (important pour les clés étrangères)
    const migrationOrder = [
      'users',
      'produits',
      'clients',
      'commandes',
      'commandes_add_remise',
      'orderitems',
      'paniers',
      'avis',
      'likes',
      'inventory_plans'
    ];

    for (const tableName of migrationOrder) {
      try {
        await db.execute(migrations[tableName]);
        console.log(`✅ Table '${tableName}' créée/vérifiée`);
      } catch (error) {
        console.error(`❌ Erreur création table '${tableName}':`, error.message);
        throw error;
      }
    }

    console.log('\n🌱 Insertion des données de test...\n');

    // Insérer les données de test
    for (const [name, query] of Object.entries(seedData)) {
      try {
        await db.execute(query);
        console.log(`✅ Données '${name}' insérées`);
      } catch (error) {
        console.error(`⚠️  Avertissement données '${name}':`, error.message);
      }
    }

    console.log('\n✅ Toutes les migrations sont terminées avec succès !\n');
    
    // Afficher un résumé
    await displayDatabaseSummary();

  } catch (error) {
    console.error('\n❌ Erreur critique lors des migrations:', error);
    throw error;
  }
}

/**
 * Affiche un résumé de la base de données
 */
async function displayDatabaseSummary() {
  try {
    console.log('📊 Résumé de la base de données:\n');

    const tables = [
      'users', 'produits', 'clients', 'commandes', 
      'orderitems', 'paniers', 'avis', 'likes', 'inventory_plans'
    ];

    for (const table of tables) {
      try {
        const [rows] = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ${table.padEnd(15)} : ${rows[0].count} enregistrement(s)`);
      } catch (error) {
        console.log(`   ${table.padEnd(15)} : Erreur`);
      }
    }

    console.log('');
  } catch (error) {
    console.error('Erreur affichage résumé:', error.message);
  }
}

/**
 * Supprime toutes les tables (DANGER - à utiliser avec précaution)
 */
async function dropAllTables() {
  console.log('⚠️  ATTENTION : Suppression de toutes les tables...\n');

  const tables = [
    'inventory_plans', 'likes', 'avis', 'paniers', 'orderitems', 
    'commandes', 'clients', 'produits', 'users'
  ];

  for (const table of tables) {
    try {
      await db.execute(`DROP TABLE IF EXISTS ${table}`);
      console.log(`🗑️  Table '${table}' supprimée`);
    } catch (error) {
      console.error(`❌ Erreur suppression '${table}':`, error.message);
    }
  }

  console.log('\n✅ Toutes les tables ont été supprimées\n');
}

module.exports = {
  runMigrations,
  dropAllTables,
  displayDatabaseSummary
};