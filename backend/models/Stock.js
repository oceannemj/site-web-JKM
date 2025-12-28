const db = require('../config/database');

class Stock {
  static async getAll() {
    const [rows] = await db.execute('SELECT * FROM stocks');
    return rows;
  }

  static async getByProduitId(produitId) {
    const [rows] = await db.execute('SELECT * FROM stocks WHERE produit_id = ?', [produitId]);
    return rows[0];
  }

  static async update(produitId, quantite) {
    await db.execute('UPDATE stocks SET quantite = ? WHERE produit_id = ?', [quantite, produitId]);
    return true;
  }

  static async delete(produitId) {
    const [result] = await db.execute('DELETE FROM stocks WHERE produit_id = ?', [produitId]);
    return result.affectedRows;
  }
}

module.exports = Stock;