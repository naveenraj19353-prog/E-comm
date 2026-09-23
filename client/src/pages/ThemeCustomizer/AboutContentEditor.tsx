import type { AboutContent } from "../../pages/Legal/aboutDefaults";
import styles from "./FooterContentEditor.module.css";

interface AboutContentEditorProps {
    value: AboutContent;
    onChange: (value: AboutContent) => void;
}

const AboutContentEditor = ({ value, onChange }: AboutContentEditorProps) => {
    const updateSection = (index: 0 | 1 | 2, field: "heading" | "body", fieldValue: string) => {
        const sections = value.sections.map((section, sectionIndex) =>
            sectionIndex === index ? { ...section, [field]: fieldValue } : section,
        ) as AboutContent["sections"];
        onChange({ sections });
    };

    return (
        <div className={styles.editor}>
            <p className={styles.field}>
                These three blocks appear on the store About page. Blank lines in the body start a new paragraph.
            </p>
            {value.sections.map((section, index) => (
                <div key={`about-section-${index}`} className={styles.sectionCard}>
                    <label className={styles.field}>
                        <span>Section {index + 1} heading</span>
                        <input
                            type="text"
                            maxLength={120}
                            value={section.heading}
                            onChange={(event) =>
                                updateSection(index as 0 | 1 | 2, "heading", event.target.value)
                            }
                        />
                    </label>
                    <label className={styles.field}>
                        <span>Section {index + 1} text</span>
                        <textarea
                            rows={6}
                            maxLength={4000}
                            value={section.body}
                            onChange={(event) =>
                                updateSection(index as 0 | 1 | 2, "body", event.target.value)
                            }
                        />
                    </label>
                </div>
            ))}
        </div>
    );
};

export default AboutContentEditor;
