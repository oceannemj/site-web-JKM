// models/commande.js - Modèle corrigé pour commandes layettes (update items/stock, bénéfices)

const db = require('../config/database');

class Commande {
  static async getAll(userId = null) {
    try {
      let query = `
        SELECT c.*, cl.nom as client_nom, cl.prenom as client_prenom, cl.email as client_email
        FROM commandes c
        LEFT JOIN clients cl ON c.client_id = cl.id OR c.client_id = cl.email
      `;
      let params = [];
      if (userId) {
        query += ' WHERE c.client_id = ?';
        params.push(userId);
      }
      query += ' ORDER BY c.created_at DESC';
      const [rows] = await db.execute(query, params);
      
      // Ajouter items avec prix_achat pour bénéfices (fallback si table vide)
      for (let commande of rows) {
        let items = [];
        try {
          const [itemRows] = await db.execute(`
            SELECT oi.*, p.nom as produit_nom, p.prix_achat, p.prix as prix_vente
            FROM orderitems oi
            JOIN produits p ON oi.produit_id = p.id
            WHERE oi.commande_id = ?
          `, [commande.id]);
          items = itemRows;
        } catch (itemErr) {
          console.warn('⚠️ Erreur items commande:', itemErr); // Fallback vide
        }
        commande.items = items;
        commande.remise = commande.remise || 0;
      }
      console.log('📦 Commandes layettes récupérées:', rows.length);
      return rows;
    } catch (error) {
      console.error('❌ Erreur getAll commandes layettes:', error);
      return []; // Fallback vide pour frontend
    }
  }

  static async getById(id) {
    try {
      const [rows] = await db.execute(`
        SELECT c.*, cl.nom as client_nom, cl.prenom as client_prenom, cl.email as client_email
        FROM commandes c
        LEFT JOIN clients cl ON c.client_id = cl.id OR c.client_id = cl.email
        WHERE c.id = ?
      `, [id]);
      if (rows.length === 0) return null;
      
      const commande = rows[0];
      let items = [];
      try {
        const [itemRows] = await db.execute(`
          SELECT oi.*, p.nom as produit_nom, p.prix_achat, p.prix as prix_vente
          FROM orderitems oi
          JOIN produits p ON oi.produit_id = p.id
          WHERE oi.commande_id = ?
        `, [id]);
        items = itemRows;
      } catch (itemErr) {
        console.warn('⚠️ Erreur items commande ID', id, itemErr);
      }
      commande.items = items;
      commande.remise = commande.remise || 0;
      return commande;
    } catch (error) {
      console.error('❌ Erreur getById commande layette:', error);
      return null; // Fallback null
    }
  }

  static async create(data) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      
      const status = data.status || 'en_attente';
      
      // Insert commande (avec status, adresse, remise)
      const [resCmd] = await connection.execute(
        'INSERT INTO commandes (client_id, status, total, adresse, remise, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [data.client_id, status, parseFloat(data.total), data.adresse || null, parseFloat(data.remise) || 0]
      );
      const commandeId = resCmd.insertId;
      
      // Insert items layettes
      if (data.items && data.items.length > 0) {
        for (let item of data.items) {
          await connection.execute(
            'INSERT INTO orderitems (commande_id, produit_id, quantite, prix_unitaire) VALUES (?, ?, ?, ?)',
            [commandeId, item.produit_id, parseInt(item.quantite), parseFloat(item.prix_unitaire)]
          );
        }
      }
      
      // ✅ LOGIQUE STOCK selon status:
      // en_attente/annulee = PAS de changement stock
      // livree = stock change SEULEMENT
      // expediee/payee = stock ET montant d'entrée changent
      
      if (status === 'livree') {
        // Livrée: Déduire stock seulement
        for (let item of data.items) {
          await connection.execute(
            'UPDATE produits SET stock = stock - ? WHERE id = ?',
            [item.quantite, item.produit_id]
          );
        }
      } else if (status === 'expediee' || status === 'payee') {
        // Expédiée/Payée: Déduire stock ET enregistrer montant d'entrée
        for (let item of data.items) {
          await connection.execute(
            'UPDATE produits SET stock = stock - ? WHERE id = ?',
            [item.quantite, item.produit_id]
          );
          
          // Enregistrer montant d'entrée (revenu)
          const montantEntree = parseFloat(item.prix_unitaire) * parseInt(item.quantite);
          await connection.execute(
            'INSERT INTO montants_entree (commande_id, produit_id, montant, created_at) VALUES (?, ?, ?, NOW())',
            [commandeId, item.produit_id, montantEntree]
          );
        }
      }
      // Si en_attente ou annulee: RIEN ne change
      
      await connection.commit();
      console.log(`🆕 Commande layette créée: #${commandeId} (status: ${status}, items: ${data.items?.length || 0})`);
      return commandeId;
    } catch (err) {
      await connection.rollback();
      console.error('❌ Erreur create commande layette:', err);
      throw err;
    } finally {
      connection.release();
    }
  }

  static async update(id, data) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      
      // Récupérer ancien status
      const [oldCommande] = await connection.execute('SELECT status FROM commandes WHERE id = ?', [id]);
      if (oldCommande.length === 0) {
        throw new Error('Commande non trouvée');
      }
      const oldStatus = oldCommande[0].status;
      const newStatus = data.status;
      
      // Update commande principale
      await connection.execute(
        'UPDATE commandes SET status = ?, total = ?, remise = ?, adresse = ? WHERE id = ?',
        [newStatus, parseFloat(data.total), parseFloat(data.remise) || 0, data.adresse || null, id]
      );
      
      // ✅ RÉTABLIR STOCKS/MONTANTS de l'ancien status
      const [oldItems] = await connection.execute('SELECT produit_id, quantite, prix_unitaire FROM orderitems WHERE commande_id = ?', [id]);
      
      if (oldStatus === 'livree') {
        // Rétablir stock seulement
        for (let oldItem of oldItems) {
          await connection.execute(
            'UPDATE produits SET stock = stock + ? WHERE id = ?',
            [oldItem.quantite, oldItem.produit_id]
          );
        }
      } else if (oldStatus === 'expediee' || oldStatus === 'payee') {
        // Rétablir stock ET supprimer montants entrée
        for (let oldItem of oldItems) {
          await connection.execute(
            'UPDATE produits SET stock = stock + ? WHERE id = ?',
            [oldItem.quantite, oldItem.produit_id]
          );
        }
        await connection.execute('DELETE FROM montants_entree WHERE commande_id = ?', [id]);
      }
      // Si ancien status était en_attente/annulee: rien à rétablir
      
      // Supprimer anciens items
      await connection.execute('DELETE FROM orderitems WHERE commande_id = ?', [id]);
      
      // ✅ APPLIQUER NOUVEAUX ITEMS selon nouveau status
      if (data.items && data.items.length > 0) {
        // Insérer nouveaux items
        for (let item of data.items) {
          await connection.execute(
            'INSERT INTO orderitems (commande_id, produit_id, quantite, prix_unitaire) VALUES (?, ?, ?, ?)',
            [id, item.produit_id, parseInt(item.quantite), parseFloat(item.prix_unitaire)]
          );
        }
        
        // Appliquer changements selon nouveau status
        if (newStatus === 'livree') {
          // Livrée: Déduire stock seulement
          for (let item of data.items) {
            await connection.execute(
              'UPDATE produits SET stock = stock - ? WHERE id = ?',
              [item.quantite, item.produit_id]
            );
          }
        } else if (newStatus === 'expediee' || newStatus === 'payee') {
          // Expédiée/Payée: Déduire stock ET enregistrer montants
          for (let item of data.items) {
            await connection.execute(
              'UPDATE produits SET stock = stock - ? WHERE id = ?',
              [item.quantite, item.produit_id]
            );
            
            const montantEntree = parseFloat(item.prix_unitaire) * parseInt(item.quantite);
            await connection.execute(
              'INSERT INTO montants_entree (commande_id, produit_id, montant, created_at) VALUES (?, ?, ?, NOW())',
              [id, item.produit_id, montantEntree]
            );
          }
        }
        // Si en_attente/annulee: RIEN ne change
      }
      
      await connection.commit();
      console.log(`✏️ Commande modifiée: #${id} (${oldStatus} → ${newStatus})`);
      return true;
    } catch (err) {
      await connection.rollback();
      console.error('❌ Erreur update commande layette:', err);
      throw err;
    } finally {
      connection.release();
    }
  }

  static async delete(id) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      
      // Récup + restaurer stock anciens items
      const [items] = await connection.execute('SELECT produit_id, quantite FROM orderitems WHERE commande_id = ?', [id]);
      for (let item of items) {
        await connection.execute(
          'UPDATE produits SET stock = stock + ? WHERE id = ?',
          [item.quantite, item.produit_id]
        );
      }
      
      // Supprimer items + commande
      await connection.execute('DELETE FROM orderitems WHERE commande_id = ?', [id]);
      await connection.execute('DELETE FROM commandes WHERE id = ?', [id]);
      
      await connection.commit();
      console.log(`🗑️ Commande layette supprimée: #${id} (stock restauré)`);
      return true;
    } catch (err) {
      await connection.rollback();
      console.error('❌ Erreur delete commande layette:', err);
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = Commande;