const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db');

// Save a version snapshot (keeps last 20)
const saveVersion = async (noteId, title, content) => {
  await run(
    'INSERT INTO note_versions (id, note_id, title, content) VALUES (?, ?, ?, ?)',
    [uuidv4(), noteId, title, content]
  );
  const versions = await all(
    'SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC',
    [noteId]
  );
  if (versions.length > 20) {
    const toDelete = versions.slice(20).map(v => v.id);
    for (const id of toDelete) {
      await run('DELETE FROM note_versions WHERE id = ?', [id]);
    }
  }
};

// Attach tags to a list of notes
const attachTags = async (noteIds) => {
  if (!noteIds.length) return {};
  const placeholders = noteIds.map(() => '?').join(',');
  const tagRows = await all(
    `SELECT nt.note_id, t.id, t.name, t.color
     FROM note_tags nt
     JOIN tags t ON t.id = nt.tag_id
     WHERE nt.note_id IN (${placeholders})`,
    noteIds
  );
  const map = {};
  tagRows.forEach(row => {
    if (!map[row.note_id]) map[row.note_id] = [];
    map[row.note_id].push({ id: row.id, name: row.name, color: row.color });
  });
  return map;
};

// GET /api/notes
const listNotes = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', tag = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;

    let whereClauses = ['n.user_id = ?', 'n.is_deleted = 0'];
    const params = [userId];

    if (search) {
      whereClauses.push('(n.title LIKE ? OR n.content LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (tag) {
      whereClauses.push(`n.id IN (
        SELECT nt.note_id FROM note_tags nt
        JOIN tags t ON t.id = nt.tag_id
        WHERE t.name = ? AND t.user_id = ?
      )`);
      params.push(tag, userId);
    }

    const where = whereClauses.join(' AND ');

    const countRow = await get(
      `SELECT COUNT(*) as total FROM notes n WHERE ${where}`,
      params
    );

    const notes = await all(
      `SELECT n.id, n.title, n.content, n.created_at, n.updated_at
       FROM notes n
       WHERE ${where}
       ORDER BY n.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const tagsMap = await attachTags(notes.map(n => n.id));

    const result = notes.map(n => ({
      ...n,
      content_preview: n.content.slice(0, 200),
      tags: tagsMap[n.id] || []
    }));

    return res.json({
      notes: result,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/notes/:id
const getNote = async (req, res) => {
  try {
    const note = await get(
      'SELECT * FROM notes WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [req.params.id, req.user.id]
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const tags = await all(
      `SELECT t.id, t.name, t.color FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?`,
      [note.id]
    );
    return res.json({ ...note, tags });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/notes
const createNote = async (req, res) => {
  try {
    const { title = 'Untitled Note', content = '', tagIds = [] } = req.body;
    const id = uuidv4();

    await run(
      'INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)',
      [id, req.user.id, title, content]
    );

    for (const tid of tagIds) {
      await run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [id, tid]);
    }

    await saveVersion(id, title, content);

    const note = await get('SELECT * FROM notes WHERE id = ?', [id]);
    const tags = await all(
      `SELECT t.id, t.name, t.color FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?`,
      [id]
    );
    return res.status(201).json({ ...note, tags });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// PUT /api/notes/:id
const updateNote = async (req, res) => {
  try {
    const { title, content, tagIds } = req.body;

    const existing = await get(
      'SELECT * FROM notes WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const newTitle = title !== undefined ? title : existing.title;
    const newContent = content !== undefined ? content : existing.content;

    await run(
      'UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newTitle, newContent, req.params.id]
    );

    if (newTitle !== existing.title || newContent !== existing.content) {
      await saveVersion(req.params.id, newTitle, newContent);
    }

    if (tagIds !== undefined) {
      await run('DELETE FROM note_tags WHERE note_id = ?', [req.params.id]);
      for (const tid of tagIds) {
        await run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [req.params.id, tid]);
      }
    }

    const note = await get('SELECT * FROM notes WHERE id = ?', [req.params.id]);
    const tags = await all(
      `SELECT t.id, t.name, t.color FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?`,
      [req.params.id]
    );
    return res.json({ ...note, tags });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /api/notes/:id
const deleteNote = async (req, res) => {
  try {
    const existing = await get(
      'SELECT id FROM notes WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    await run(
      'UPDATE notes SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.params.id]
    );
    return res.json({ message: 'Note deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/notes/:id/versions
const getNoteVersions = async (req, res) => {
  try {
    const note = await get(
      'SELECT id FROM notes WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [req.params.id, req.user.id]
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const versions = await all(
      'SELECT id, title, content, created_at FROM note_versions WHERE note_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    return res.json({ versions });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/notes/:id/restore/:versionId
const restoreVersion = async (req, res) => {
  try {
    const note = await get(
      'SELECT * FROM notes WHERE id = ? AND user_id = ? AND is_deleted = 0',
      [req.params.id, req.user.id]
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const version = await get(
      'SELECT * FROM note_versions WHERE id = ? AND note_id = ?',
      [req.params.versionId, req.params.id]
    );
    if (!version) return res.status(404).json({ error: 'Version not found' });

    await saveVersion(note.id, note.title, note.content);

    await run(
      'UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [version.title, version.content, note.id]
    );

    const updated = await get('SELECT * FROM notes WHERE id = ?', [note.id]);
    const tags = await all(
      `SELECT t.id, t.name, t.color FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?`,
      [note.id]
    );
    return res.json({ ...updated, tags });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  listNotes, getNote, createNote, updateNote,
  deleteNote, getNoteVersions, restoreVersion
};
