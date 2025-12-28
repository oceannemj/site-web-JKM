const db = require('../config/database');

class Avis {
  /**
   * Retourne tous les avis. Si userId est fourni, filtre sur cet utilisateur.
   */
  static async getAll(userId = null) {
    let query = 'SELECT * FROM avis';
    const params = [];
    if (userId) {
      query += ' WHERE user_id = ?';
      params.push(userId);
    }
    query += ' ORDER BY date DESC';
    const [rows] = await db.execute(query, params);
    return rows;
  }

  static async getById(id) {
    const [rows] = await db.execute('SELECT * FROM avis WHERE id = ?', [id]);
    return rows[0];
  }

  /**
   * Avis pour un produit (avec infos utilisateur basiques).n   */
  static async getByProduitId(produitId) {
    const [rows] = await db.execute(
      `SELECT a.*, u.email as user_email
       FROM avis a
       JOIN users u ON a.user_id = u.id
       WHERE a.produit_id = ?
       ORDER BY a.date DESC`,
      [produitId]
    );
    return rows;
  }

  static async getByUserId(userId) {
    const [rows] = await db.execute(
      `SELECT a.*, p.nom as produit_nom
       FROM avis a
       JOIN produits p ON a.produit_id = p.id
       WHERE a.user_id = ?
       ORDER BY a.date DESC`,
      [userId]
    );
    return rows;
  }

  static async create(data) {
    const { produit_id, user_id, commentaire, note } = data;
    const [result] = await db.execute(
      'INSERT INTO avis (produit_id, user_id, commentaire, note, date, created_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [produit_id, user_id, commentaire, note]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const { commentaire, note } = data;
    await db.execute(
      'UPDATE avis SET commentaire = ?, note = ? WHERE id = ?',
      [commentaire, note, id]
    );
    return true;
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM avis WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

module.exports = Avis;
