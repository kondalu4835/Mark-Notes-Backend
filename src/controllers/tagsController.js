const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db');

const listTags = async (req, res) => {
  try {
    const tags = await all('SELECT * FROM tags WHERE user_id = ? ORDER BY name', [req.user.id]);
    return res.json({ tags });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

const createTag = async (req, res) => {
  try {
    const { name, color = '#6366f1' } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ error: 'Tag name is required' });

    const existing = await get(
      'SELECT id FROM tags WHERE user_id = ? AND name = ?',
      [req.user.id, name.trim()]
    );
    if (existing) return res.status(409).json({ error: 'Tag already exists' });

    const id = uuidv4();
    await run('INSERT INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)',
      [id, req.user.id, name.trim(), color]);

    const tag = await get('SELECT * FROM tags WHERE id = ?', [id]);
    return res.status(201).json({ tag });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};

const deleteTag = async (req, res) => {
  try {
    const tag = await get('SELECT id FROM tags WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!tag) return res.status(404).json({ error: 'Tag not found' });

    await run('DELETE FROM tags WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Tag deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { listTags, createTag, deleteTag };
