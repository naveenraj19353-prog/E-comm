import { Plus, Trash2 } from "lucide-react";
import type { FooterContent, FooterLink, FooterSection } from "../../components/Footer/types";
import styles from "./FooterContentEditor.module.css";

interface FooterContentEditorProps {
    value: FooterContent;
    onChange: (value: FooterContent) => void;
}

const cloneSections = (sections: FooterSection[]) =>
    sections.map((section) => ({
        title: section.title,
        links: section.links.map((link) => ({ ...link })),
    }));

const FooterContentEditor = ({ value, onChange }: FooterContentEditorProps) => {
    const updateRoot = (field: keyof FooterContent, fieldValue: string) => {
        onChange({
            ...value,
            [field]: fieldValue,
        });
    };

    const updateSection = (sectionIndex: number, title: string) => {
        const sections = cloneSections(value.sections);
        sections[sectionIndex] = {
            ...sections[sectionIndex],
            title,
        };
        onChange({ ...value, sections });
    };

    const updateLink = (
        sectionIndex: number,
        linkIndex: number,
        field: keyof FooterLink,
        fieldValue: string,
    ) => {
        const sections = cloneSections(value.sections);
        const links = [...sections[sectionIndex].links];
        links[linkIndex] = {
            ...links[linkIndex],
            [field]: fieldValue,
        };
        sections[sectionIndex] = {
            ...sections[sectionIndex],
            links,
        };
        onChange({ ...value, sections });
    };

    const addSection = () => {
        onChange({
            ...value,
            sections: [
                ...cloneSections(value.sections),
                {
                    title: "New section",
                    links: [{ label: "Link", href: "#" }],
                },
            ],
        });
    };

    const removeSection = (sectionIndex: number) => {
        onChange({
            ...value,
            sections: value.sections.filter((_, index) => index !== sectionIndex),
        });
    };

    const addLink = (sectionIndex: number) => {
        const sections = cloneSections(value.sections);
        sections[sectionIndex] = {
            ...sections[sectionIndex],
            links: [...sections[sectionIndex].links, { label: "New link", href: "#" }],
        };
        onChange({ ...value, sections });
    };

    const removeLink = (sectionIndex: number, linkIndex: number) => {
        const sections = cloneSections(value.sections);
        sections[sectionIndex] = {
            ...sections[sectionIndex],
            links: sections[sectionIndex].links.filter((_, index) => index !== linkIndex),
        };
        onChange({ ...value, sections });
    };

    return (
        <div className={styles.editor}>
            <label className={styles.field}>
                <span>Company name</span>
                <input
                    type="text"
                    value={value.companyName}
                    onChange={(event) => updateRoot("companyName", event.target.value)}
                    placeholder="Your store name"
                />
            </label>

            <label className={styles.field}>
                <span>Description</span>
                <textarea
                    value={value.description}
                    onChange={(event) => updateRoot("description", event.target.value)}
                    rows={3}
                    placeholder="Short store description shown in the footer"
                />
            </label>

            <div className={styles.sectionHeader}>
                <strong>Link columns</strong>
                <button type="button" className={styles.addButton} onClick={addSection}>
                    <Plus size={14} />
                    Add column
                </button>
            </div>

            {value.sections.map((section, sectionIndex) => (
                <div key={`section-${sectionIndex}`} className={styles.sectionCard}>
                    <div className={styles.sectionTop}>
                        <label className={styles.field}>
                            <span>Column title</span>
                            <input
                                type="text"
                                value={section.title}
                                onChange={(event) => updateSection(sectionIndex, event.target.value)}
                            />
                        </label>
                        <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => removeSection(sectionIndex)}
                            aria-label="Remove section"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>

                    <div className={styles.links}>
                        {section.links.map((link, linkIndex) => (
                            <div key={`link-${sectionIndex}-${linkIndex}`} className={styles.linkRow}>
                                <input
                                    type="text"
                                    value={link.label}
                                    onChange={(event) => updateLink(sectionIndex, linkIndex, "label", event.target.value)}
                                    placeholder="Label"
                                />
                                <input
                                    type="text"
                                    value={link.href}
                                    onChange={(event) => updateLink(sectionIndex, linkIndex, "href", event.target.value)}
                                    placeholder="URL"
                                />
                                <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() => removeLink(sectionIndex, linkIndex)}
                                    aria-label="Remove link"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button type="button" className={styles.linkAddButton} onClick={() => addLink(sectionIndex)}>
                        <Plus size={14} />
                        Add link
                    </button>
                </div>
            ))}
        </div>
    );
};

export default FooterContentEditor;
