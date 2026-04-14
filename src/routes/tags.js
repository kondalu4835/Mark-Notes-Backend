const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { listTags, createTag, deleteTag } = require('../controllers/tagsController');

router.use(authenticate);
router.get('/', listTags);
router.post('/', createTag);
router.delete('/:id', deleteTag);

module.exports = router;
