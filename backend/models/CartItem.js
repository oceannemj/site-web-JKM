const db = require('../config/database');
class CartItem {
  static async getAllByPanierId(panierId, userId) {
    const [rows] = await db.execute('SELECT * FROM cartitems WHERE panier_id = ? AND user_id = ?', [panierId, userId]);
    return rows;
  }
  static async getById(id) { /* SELECT */ }
  static async create(data) { /* INSERT */ }
  static async update(id, data) { /* UPDATE */ }
  static async delete(id) { /* DELETE */ }
}
module.exports = CartItem; 