import PostCard from './PostCard.jsx';
import styles from './PostList.module.css';

// The masonry container. Posts render in the order given (App prepends new ones).
export default function PostList({ posts }) {
  return (
    <div className={styles.posts}>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
