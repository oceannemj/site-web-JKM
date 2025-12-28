const db = require('../config/database');

class OrderItem {
  static async getAllByCommandeId(commandeId) {
    const [rows] = await db.execute(
      'SELECT oi.*, p.nom as produit_nom, p.prix as prix_unitaire FROM orderitems oi JOIN produits p ON oi.produit_id = p.id WHERE oi.commande_id = ?',
      [commandeId]
    );
    return rows;
  }

  static async getById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM orderitems WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  static async create(data) {
    const [result] = await db.execute(
      'INSERT INTO orderitems (commande_id, produit_id, quantite) VALUES (?, ?, ?)',
      [data.commande_id, data.produit_id, data.quantite]
    );
    // Optionnel : Update stock (déduire quantite)
    await db.execute(
      'UPDATE stocks SET quantite = quantite - ? WHERE produit_id = ?',
      [data.quantite, data.produit_id]
    );
    return result.insertId;
  }

  static async update(id, data) {
    // Récupérer ancienne quantite pour ajuster stock
    const oldItem = await this.getById(id);
    const delta = data.quantite - oldItem.quantite;
    await db.execute(
      'UPDATE orderitems SET quantite = ? WHERE id = ?',
      [data.quantite, id]
    );
    // Ajuster stock
    await db.execute(
      'UPDATE stocks SET quantite = quantite - ? WHERE produit_id = (SELECT produit_id FROM orderitems WHERE id = ?)',
      [delta, id]
    );
    return true;
  }

  static async delete(id) {
    // Récupérer pour restaurer stock
    const item = await this.getById(id);
    if (item) {
      await db.execute(
        'UPDATE stocks SET quantite = quantite + ? WHERE produit_id = ?',
        [item.quantite, item.produit_id]
      );
    }
    const [result] = await db.execute('DELETE FROM orderitems WHERE id = ?', [id]);
    return result.affectedRows;
  }

  static async getTotalByCommandeId(commandeId) {
    const items = await this.getAllByCommandeId(commandeId);
    return items.reduce((total, item) => total + (item.prix_unitaire * item.quantite), 0);
  }
}

module.exports = OrderItem;