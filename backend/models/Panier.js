const db = require('../config/database');

/**
 * Modèle Panier aligné sur le schéma réel de la BDD (table `paniers`)
 *
 * Table `paniers` (migrations) :
 *  - id VARCHAR(36) PRIMARY KEY DEFAULT (UUID())
 *  - user_id VARCHAR(36) NOT NULL
 *  - produit_id VARCHAR(36) NOT NULL
 *  - quantite INT NOT NULL DEFAULT 1
 */
class Panier {
  /**
   * Retourne le panier complet de l'utilisateur avec les infos produit
   * (nom, prix, image, âge, type, stock, etc.).
   */
  static async getByUserId(userId) {
    const [rows] = await db.execute(
      `SELECT 
         p.id,
         p.user_id,
         p.produit_id,
         p.quantite,
         pr.nom,
         pr.prix,
         pr.age,
         pr.type,
         pr.image_url,
         pr.stock
       FROM paniers p
       JOIN produits pr ON p.produit_id = pr.id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Ajoute un article au panier (ou incrémente la quantité si déjà présent).
   * data: { produit_id, quantite }
   */
  static async addItem(userId, data) {
    const quantite = parseInt(data.quantite || 1, 10);
    const produitId = data.produit_id;

    if (!produitId || isNaN(quantite) || quantite <= 0) {
      throw new Error('Données panier invalides');
    }

    // Utilise la contrainte UNIQUE (user_id, produit_id) pour incrémenter la quantité
    await db.execute(
      `INSERT INTO paniers (user_id, produit_id, quantite)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantite = quantite + VALUES(quantite)`,
      [userId, produitId, quantite]
    );
  }

  /**
   * Supprime un produit du panier de l'utilisateur.
   */
  static async removeItem(userId, produitId) {
    const [result] = await db.execute(
      'DELETE FROM paniers WHERE user_id = ? AND produit_id = ?',
      [userId, produitId]
    );
    return result.affectedRows;
  }

  /**
   * Vide complètement le panier de l'utilisateur.
   */
  static async clear(userId) {
    await db.execute('DELETE FROM paniers WHERE user_id = ?', [userId]);
    return true;
  }
}

module.exports = Panier;
