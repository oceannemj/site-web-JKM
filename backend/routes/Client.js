const express = require('express');
const router = express.Router();
const clientCtrl = require('../controllers/clientController');
const auth = require('../middleware/auth');

router.get('/', auth, clientCtrl.getAll);  // Admin
router.get('/:id', auth, clientCtrl.getById);
router.post('/', auth, clientCtrl.create);
router.put('/:id', auth, clientCtrl.update);
router.delete('/:id', auth, clientCtrl.delete);

module.exports = router;