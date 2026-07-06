import { useState } from 'react';
import styles from './PostForm.module.css';

const EMPTY = { title: '', author: '', content: '' };

// Controlled create-post form. `onCreate` receives the form values and should
// resolve once the post is persisted; the fields are cleared afterward.
export default function PostForm({ onCreate }) {
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreate(values);
      setValues(EMPTY);
    } catch (err) {
      console.error('Failed to publish post:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.postForm} onSubmit={handleSubmit}>
      <input
        type="text"
        name="title"
        placeholder="Post title"
        value={values.title}
        onChange={handleChange}
        required
      />
      <input
        type="text"
        name="author"
        placeholder="Author name"
        value={values.author}
        onChange={handleChange}
        required
      />
      <textarea
        name="content"
        placeholder="Write your post..."
        rows="4"
        value={values.content}
        onChange={handleChange}
        required
      />
      <button type="submit" disabled={submitting}>Publish</button>
    </form>
  );
}
