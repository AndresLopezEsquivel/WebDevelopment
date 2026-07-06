import { useState } from 'react';
import styles from './Card.module.css';

export default function PostCard({ post }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`${styles.card} ${expanded ? styles.expanded : ''}`}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderAvatar} />
        <div className={styles.cardHeaderInfo}>
          <p>{post.title}</p>
          <p>{post.author}</p>
        </div>
      </div>

      <div className={styles.cardContent}>{post.content}</div>

      <div className={styles.cardResize} onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Show Less' : 'Show More'}
      </div>
    </div>
  );
}
