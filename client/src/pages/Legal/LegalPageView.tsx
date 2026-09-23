import type { ReactNode } from "react";
import { useEffect } from "react";
import AppLink from "../../components/AppLink";
import type { LegalDocument } from "./legalContent";
import styles from "./LegalPage.module.css";

type LegalPageViewProps = {
    content: LegalDocument;
    backTo?: { href: string; label: string };
    children?: ReactNode;
};

const LegalPageView = ({ content, backTo, children }: LegalPageViewProps) => {
    useEffect(() => {
        const previous = window.document.title;
        window.document.title = `${content.title}`;
        return () => {
            window.document.title = previous;
        };
    }, [content.title]);

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                {backTo ? (
                    <AppLink className={styles.backLink} to={backTo.href}>
                        ← {backTo.label}
                    </AppLink>
                ) : null}
                <header className={styles.header}>
                    <span className={styles.eyebrow}>{content.eyebrow}</span>
                    <h1>{content.title}</h1>
                    <p>{content.intro}</p>
                    <p className={styles.updated}>Last updated {content.updated}</p>
                </header>
                {content.sections.map((section) => (
                    <section key={section.heading} className={styles.section}>
                        <h2>{section.heading}</h2>
                        {section.paragraphs.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                        ))}
                    </section>
                ))}
                {children}
            </div>
        </div>
    );
};

export default LegalPageView;
