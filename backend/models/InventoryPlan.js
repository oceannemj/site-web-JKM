const db = require('../config/database');

class InventoryPlan {
  static async getAll() {
    const [rows] = await db.execute(`
      SELECT 
        ip.id,
        ip.produit_id,
        ip.quantite_prevue,
        ip.quantite_reelle,
        ip.date_prevue,
        ip.notes,
        ip.created_at,
        p.nom,
        p.type,
        p.age,
        p.stock,
        p.prix_achat,
        p.prix
      FROM inventory_plans ip
      JOIN produits p ON ip.produit_id = p.id
      ORDER BY ip.date_prevue IS NULL, ip.date_prevue ASC, p.nom ASC
    `);
    return rows;
  }

  static async create(data) {
    const { produit_id, quantite_prevue, quantite_reelle = 0, date_prevue = null, notes = null } = data;
    const [result] = await db.execute(
      `INSERT INTO inventory_plans (produit_id, quantite_prevue, quantite_reelle, date_prevue, notes, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        produit_id,
        parseInt(quantite_prevue, 10),
        parseInt(quantite_reelle || 0, 10),
        date_prevue || null,
        notes || null,
      ]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const { quantite_prevue, quantite_reelle, date_prevue, notes } = data;
    await db.execute(
      `UPDATE inventory_plans
       SET quantite_prevue = ?,
           quantite_reelle = ?,
           date_prevue = ?,
           notes = ?
       WHERE id = ?`,
      [
        parseInt(quantite_prevue, 10),
        parseInt(quantite_reelle || 0, 10),
        date_prevue || null,
        notes || null,
        id,
      ]
    );
    return true;
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM inventory_plans WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

module.exports = InventoryPlan;
