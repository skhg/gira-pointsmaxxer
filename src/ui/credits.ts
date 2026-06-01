import type { CreditsRichTextPart, CreditsSection } from "../types.js";

export function createCreditsRenderer({ container }: { container: HTMLElement }) {
  function appendCreditsRichText(parentElement: HTMLElement, parts: CreditsRichTextPart[] = []) {
    for (const part of parts) {
      if (part && typeof part === "object" && part.type === "link") {
        const link = document.createElement("a");
        link.href = part.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = part.label;
        parentElement.appendChild(link);
        continue;
      }

      parentElement.appendChild(document.createTextNode(String(part ?? "")));
    }
  }

  function renderSections(sections: CreditsSection[]) {
    container.innerHTML = "";

    for (const section of sections) {
      const sectionElement = document.createElement("section");
      sectionElement.className = "credits-section";

      const heading = document.createElement("h3");
      heading.textContent = section.title;
      sectionElement.appendChild(heading);

      for (const paragraph of section.paragraphs || []) {
        const paragraphElement = document.createElement("p");
        paragraphElement.textContent = paragraph;
        sectionElement.appendChild(paragraphElement);
      }

      for (const richParagraph of section.richParagraphs || []) {
        const paragraphElement = document.createElement("p");
        appendCreditsRichText(paragraphElement, richParagraph);
        sectionElement.appendChild(paragraphElement);
      }

      if (Array.isArray(section.list) && section.list.length > 0) {
        const listElement = document.createElement("ul");
        listElement.className = "credits-list";
        for (const item of section.list) {
          const listItem = document.createElement("li");
          listItem.textContent = item;
          listElement.appendChild(listItem);
        }
        sectionElement.appendChild(listElement);
      }

      if (section.note) {
        const noteElement = document.createElement("p");
        noteElement.className = "credits-note";
        noteElement.textContent = section.note;
        sectionElement.appendChild(noteElement);
      }

      if (section.placeholder) {
        const placeholderElement = document.createElement("p");
        placeholderElement.className = "credits-placeholder";
        placeholderElement.textContent = section.placeholder;
        sectionElement.appendChild(placeholderElement);
      }

      container.appendChild(sectionElement);
    }
  }

  return {
    renderSections,
  };
}
