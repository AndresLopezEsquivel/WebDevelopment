import { useEffect, useState } from 'react';
import { getPosts, createPost } from './api.js';
import PostForm from './components/PostForm.jsx';
import PostList from './components/PostList.jsx';

export default function App() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    getPosts()
      .then(setPosts)
      .catch((err) => console.error('Failed to load posts:', err));
  }, []);

  // Persist the new post, then prepend it so the newest shows on top.
  async function handleCreate(data) {
    const saved = await createPost(data);
    setPosts((prev) => [saved, ...prev]);
  }

  return (
    <>
      <PostForm onCreate={handleCreate} />
      <PostList posts={posts} />
    </>
  );
}
