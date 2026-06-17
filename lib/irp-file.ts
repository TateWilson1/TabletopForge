export async function extractIrpTextFromFile(file: File) {
  const extension = getExtension(file.name);

  if (extension === "pdf") {
    return extractPdfText(file);
  }

  if (extension === "docx") {
    return extractDocxText(file);
  }

  return file.text();
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

async function extractDocxText(file: File) {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value.trim();

  if (!text) {
    throw new Error("No readable text was found in this Word document.");
  }

  return text;
}

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(pageText);
  }

  const text = pages.join("\n\n").trim();
  if (!text) {
    throw new Error("No readable text was found in this PDF. If it is scanned, paste the OCR text instead.");
  }

  return text;
}
