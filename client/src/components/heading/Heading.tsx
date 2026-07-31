import styles from "./Heading.module.css"

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionText?: string;
  onActionClick?: () => void;
}

const SectionHeader = ({
  title,
  subtitle,
  actionText = "View All",
  onActionClick,
}: SectionHeaderProps) => {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2 className={styles.title}>{title}</h2>

        {subtitle && (
          <p className={styles.subtitle}>
            {subtitle}
          </p>
        )}
      </div>

      {actionText && (
        <button
          className={styles.action}
          onClick={onActionClick}
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

export default SectionHeader;