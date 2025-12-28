const db = require('../config/database');

class Client {
  static async getAll() {
    const [rows] = await db.execute('SELECT * FROM clients');
    return rows;
  }

  static async getById(id) {
    const [rows] = await db.execute('SELECT * FROM clients WHERE id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const [result] = await db.execute(
      'INSERT INTO clients (nom, email, adresse, user_id) VALUES (?, ?, ?, ?)',
      [data.nom, data.email, data.adresse, data.user_id]
    );
    return result.insertId;
  }

  static async update(id, data) {
    await db.execute(
      'UPDATE clients SET nom = ?, email = ?, adresse = ? WHERE id = ?',
      [data.nom, data.email, data.adresse, id]
    );
    return true;
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM clients WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

module.exports = Client;