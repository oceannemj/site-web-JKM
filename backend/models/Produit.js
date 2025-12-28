// models/produit.js - Modèle complet pour gestion layettes (sans duplication sur update)

const db = require('../config/database');

class Produit {
  static async getAll(filters = {}) {
    try {
      let query = 'SELECT * FROM produits';
      let params = [];
      
      // Filtres optionnels (ex. : limit pour frontend)
      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));
      }
      
      const [rows] = await db.execute(query, params);
      console.log('📦 Layettes récupérées:', rows.length);
      return rows;
    } catch (error) {
      console.error('❌ Erreur getAll layettes:', error);
      throw error;
    }
  }

  static async getById(id) {
    try {
      const [rows] = await db.execute('SELECT * FROM produits WHERE id = ?', [id]);
      return rows[0];
    } catch (error) {
      console.error('❌ Erreur getById layette:', error);
      throw error;
    }
  }

  static async create(data) {
    try {
      const [result] = await db.execute(
        'INSERT INTO produits (nom, prix_achat, prix, image_url, age, type, stock, description, matiere, entretien) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          data.nom,
          data.prix_achat,
          data.prix,
          data.image_url || null, // Gère null si pas d'image
          data.age,
          data.type,
          data.stock || 0,
          data.description || '',
          data.matiere || '',
          data.entretien || ''
        ]
      );
      console.log(`🆕 Layette créée: #${result.insertId}`);
      return result.insertId;
    } catch (error) {
      console.error('❌ Erreur create layette:', error);
      throw error;
    }
  }

  static async update(id, data) {
    try {
      // Vérif existence pour éviter dupli/update fantôme
      const existing = await this.getById(id);
      if (!existing) throw new Error('Layette non trouvée');

      const [result] = await db.execute(
        'UPDATE produits SET nom = ?, prix_achat = ?, prix = ?, image_url = ?, age = ?, type = ?, stock = ?, description = ?, matiere = ?, entretien = ? WHERE id = ?',
        [
          data.nom,
          data.prix_achat,
          data.prix,
          data.image_url || null,
          data.age,
          data.type,
          data.stock,
          data.description || '',
          data.matiere || '',
          data.entretien || '',
          id  // Clé WHERE pour cibler l'ID exact (pas de dupli)
        ]
      );
      
      if (result.affectedRows === 0) throw new Error('Aucune modification appliquée');
      console.log(`✏️ Layette mise à jour: #${id}`);
      return true;
    } catch (error) {
      console.error('❌ Erreur update layette:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const produit = await this.getById(id);
      if (!produit) throw new Error('Layette non trouvée');
      
      // Supprimer image si existe
      if (produit.image_url) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '..', produit.image_url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Image layette supprimée: ${filePath}`);
        }
      }
      
      const [result] = await db.execute('DELETE FROM produits WHERE id = ?', [id]);
      console.log(`🗑️ Layette supprimée: #${id}`);
      return result.affectedRows;
    } catch (error) {
      console.error('❌ Erreur delete layette:', error);
      throw error;
    }
  }
}

module.exports = Produit;