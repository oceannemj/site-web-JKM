const db = require('../config/database');

class Like {
  static async getAllByProduitId(produitId) {
    const [rows] = await db.execute(
      'SELECT l.*, u.email as user_email FROM likes l JOIN users u ON l.user_id = u.id WHERE l.produit_id = ?',
      [produitId]
    );
    return rows;
  }

  static async getById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM likes WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  static async getByUserAndProduit(userId, produitId) {
    const [rows] = await db.execute(
      'SELECT * FROM likes WHERE user_id = ? AND produit_id = ?',
      [userId, produitId]
    );
    return rows[0];
  }

  static async create(data) {
    // Vérifier si déjà existant
    const existing = await this.getByUserAndProduit(data.user_id, data.produit_id);
    if (existing) {
      return null;  // Déjà liké
    }
    const [result] = await db.execute(
      'INSERT INTO likes (produit_id, user_id) VALUES (?, ?)',
      [data.produit_id, data.user_id]
    );
    return result.insertId;
  }

  static async update(id, data) {
    // Likes sont binaires ; update non nécessaire, mais pour complétude
    await db.execute(
      'UPDATE likes SET produit_id = ?, user_id = ? WHERE id = ?',
      [data.produit_id, data.user_id, id]
    );
    return true;
  }

  static async deleteById(id) {
    const [result] = await db.execute('DELETE FROM likes WHERE id = ?', [id]);
    return result.affectedRows;
  }

  static async deleteByUserAndProduit(userId, produitId) {
    const [result] = await db.execute(
      'DELETE FROM likes WHERE user_id = ? AND produit_id = ?',
      [userId, produitId]
    );
    return result.affectedRows;
  }

  static async countByProduitId(produitId) {
    const [rows] = await db.execute(
      'SELECT COUNT(*) as total FROM likes WHERE produit_id = ?',
      [produitId]
    );
    return rows[0].total;
  }
}

module.exports = Like;