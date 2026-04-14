const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  getNoteVersions,
  restoreVersion
} = require('../controllers/notesController');

router.use(authenticate);

router.get('/', listNotes);
router.post('/', createNote);
router.get('/:id', getNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);
router.get('/:id/versions', getNoteVersions);
router.post('/:id/restore/:versionId', restoreVersion);

module.exports = router;
